import { runAiAnswerJob } from './aiAnswerSession'
import { getFillSession, runFillJob } from './fillSession'
import { mapFieldsWithProfile } from '../shared/fieldMapper'
import { generateFill, generateSelectionAnswer, hasAiConfigured } from '../shared/ai/client'
import { providerMeta } from '../shared/ai/providers'
import { tabsSendMessage } from '../shared/messaging'
import { loadProfile, saveProfile } from '../shared/storage'
import {
  clearStoredCv,
  loadCvMeta,
  loadCvText,
  loadStoredCv,
  saveStoredCv,
} from '../shared/cvStorage'
import type { StoredCvFile } from '../shared/cvTypes'
import type {
  AiAnswerResponse,
  CandidateProfile,
  FieldAnswer,
  FillResponse,
  ScannedField,
  ScanPageResult,
  VacancyInfo,
} from '../shared/types'

async function getActiveTabId(): Promise<number> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const tab = tabs[0]
  if (!tab?.id) throw new Error('No active tab')
  if (tab.url && /^(about|chrome|moz-extension|chrome-extension|devtools):/i.test(tab.url)) {
    throw new Error('Open a normal job apply page (http/https), then try again.')
  }
  return tab.id
}

async function injectContentScripts(tabId: number): Promise<void> {
  const manifest = chrome.runtime.getManifest()
  const scripts = manifest.content_scripts ?? []
  for (const entry of scripts) {
    if (!entry.js?.length) continue
    await chrome.scripting.executeScript({
      target: { tabId },
      files: entry.js,
    })
  }
}

async function sendToTab<T>(tabId: number, message: unknown): Promise<T> {
  try {
    return await tabsSendMessage<T>(tabId, message)
  } catch {
    try {
      await injectContentScripts(tabId)
      return await tabsSendMessage<T>(tabId, message)
    } catch {
      throw new Error(
        'Could not reach this page. Refresh the tab once after installing/reloading the add-on, then try Fill again.',
      )
    }
  }
}

function fieldLabel(f: {
  label: string
  placeholder: string
  ariaLabel: string
  name: string
  id: string
}): string {
  return f.label || f.placeholder || f.ariaLabel || f.name || f.id
}

function mergeAnswers(params: {
  local: FieldAnswer[]
  llm: FieldAnswer[]
  fields: ScannedField[]
  coverLetter: string
}): FieldAnswer[] {
  const { local, llm, fields, coverLetter } = params
  const byId = new Map<string, string>()

  for (const a of local) {
    if (a.value.trim()) byId.set(a.id, a.value)
  }

  const llmIds = new Set(fields.filter((f) => f.needsLlm).map((f) => f.id))
  for (const a of llm) {
    if (!llmIds.has(a.id)) continue
    if (!a.value.trim()) continue
    // Local profile values win except cover_letter (LLM is vacancy-aware).
    const intent = fields.find((f) => f.id === a.id)?.intent
    if (intent === 'cover_letter' || !byId.has(a.id)) {
      byId.set(a.id, a.value)
    }
  }

  if (coverLetter.trim()) {
    for (const f of fields) {
      if (f.intent === 'cover_letter') byId.set(f.id, coverLetter)
    }
  }

  return [...byId.entries()].map(([id, value]) => ({ id, value }))
}

function unmatchedAfter(
  fields: ScannedField[],
  answers: FieldAnswer[],
): ScannedField[] {
  const filled = new Set(answers.map((a) => a.id))
  return fields.filter((f) => !filled.has(f.id))
}

/** Hybrid fill: local profile matching + Gemini for cover letter / open questions. */
async function runFill(): Promise<FillResponse> {
  const profile = await loadProfile()
  if (!profile.fullName.trim() && !profile.email.trim()) {
    return {
      ok: false,
      answers: [],
      coverLetter: '',
      fileUploadHint: false,
      error: 'Fill your profile in Options first (at least name or email).',
    }
  }

  const tabId = await getActiveTabId()
  const scan = await sendToTab<{
    ok: boolean
    result?: ScanPageResult
    error?: string
  }>(tabId, { type: 'SCAN_PAGE' })

  if (!scan.ok || !scan.result) {
    return {
      ok: false,
      answers: [],
      coverLetter: '',
      fileUploadHint: false,
      error: scan.error || 'Could not scan this page. Try refreshing.',
    }
  }

  const { vacancy, fields, fileUploadCount, fileFields } = scan.result
  const storedCv = await loadStoredCv()
  const hasCv = Boolean(storedCv)
  const hhCoverOnly =
    fields.length === 0 &&
    /hh\.(ru|kz|uz)|headhunter\.|rabota\.by|tut\.by/i.test(vacancy.pageUrl) &&
    /vacancy_response|vacancyId=/i.test(vacancy.pageUrl)

  if (fields.length === 0 && !(hasCv && fileFields.length > 0) && !hhCoverOnly) {
    return {
      ok: false,
      answers: [],
      coverLetter: '',
      fileUploadHint: fileUploadCount > 0,
      error:
        fileUploadCount > 0 && !hasCv
          ? 'File upload found, but no CV saved. Import your resume in Options first.'
          : fileUploadCount > 0
            ? 'Only file uploads found (CV/cover letter files). No text fields detected.'
            : 'No fillable form fields found on this page.',
      debug: {
        scanned: 0,
        matched: 0,
        filled: 0,
        skipped: 0,
        unmatched: [],
      },
    }
  }

  const { answered: localAnswers } = mapFieldsWithProfile(fields, profile)
  const llmFields = fields.filter((f) => f.needsLlm)
  const hasApiKey = hasAiConfigured(profile)
  const aiLabel = providerMeta(profile.aiProvider).label
  const resumeText = await loadCvText()

  let coverLetter = profile.bio.trim()
  let llmAnswers: FieldAnswer[] = []
  let usedLlm = false
  let warning: string | undefined

  const shouldDraftCover =
    (llmFields.length > 0 || hhCoverOnly) && hasApiKey

  if (shouldDraftCover) {
    try {
      const llm = await generateFill({
        profile,
        vacancy,
        fields: llmFields.length > 0 ? llmFields : [],
        resumeText,
      })
      usedLlm = true
      llmAnswers = llm.answers
      if (llm.coverLetter.trim()) coverLetter = llm.coverLetter.trim()
    } catch (err) {
      warning =
        err instanceof Error
          ? `${err.message} Filled profile fields only.`
          : 'Gemini failed. Filled profile fields only.'
      if (!coverLetter) {
        const localCover = localAnswers.find((a) => {
          const f = fields.find((x) => x.id === a.id)
          return f?.intent === 'cover_letter'
        })
        coverLetter = localCover?.value ?? ''
      }
    }
  } else if ((llmFields.length > 0 || hhCoverOnly) && !hasApiKey) {
    warning =
      `Add a ${aiLabel} API key in Options → AI to draft cover letters and open questions.`
  }

  const answers = mergeAnswers({
    local: localAnswers,
    llm: llmAnswers,
    fields,
    coverLetter,
  })

  const leftover = unmatchedAfter(fields, answers)

  if (
    answers.length === 0 &&
    !(hasCv && fileFields.length > 0) &&
    !(hhCoverOnly && coverLetter.trim())
  ) {
    return {
      ok: false,
      answers: [],
      coverLetter,
      fileUploadHint: fileUploadCount > 0,
      warning,
      error:
        llmFields.length > 0 && !hasApiKey
          ? `No profile fields matched. Add a ${aiLabel} API key in Options → AI for open questions / cover letter.`
          : `Scanned ${fields.length} fields, matched 0 to profile.`,
      debug: {
        scanned: fields.length,
        matched: 0,
        filled: 0,
        skipped: 0,
        usedLlm,
        unmatched: leftover.slice(0, 20).map((f) => ({
          id: f.id,
          intent: f.intent,
          label: fieldLabel(f),
        })),
      },
    }
  }

  const fill = await sendToTab<{
    ok: boolean
    result?: { filled: number; skipped: number; filesFilled: number }
    error?: string
  }>(tabId, {
    type: 'FILL_PAGE',
    answers,
    coverLetter,
    attachCv: hasCv,
    fileFields,
  })

  if (!fill.ok) {
    return {
      ok: false,
      answers,
      coverLetter,
      fileUploadHint: fileUploadCount > 0 && (fill.result?.filesFilled ?? 0) === 0,
      warning,
      error: fill.error || 'Failed to fill fields on the page.',
      debug: {
        scanned: fields.length,
        matched: answers.length,
        filled: 0,
        skipped: 0,
        filesFilled: 0,
        usedLlm,
        unmatched: leftover.slice(0, 20).map((f) => ({
          id: f.id,
          intent: f.intent,
          label: fieldLabel(f),
        })),
      },
    }
  }

  const filesFilled = fill.result?.filesFilled ?? 0
  const stillNeedManual = fileUploadCount > 0 && (!hasCv || filesFilled === 0)

  return {
    ok: true,
    answers,
    coverLetter,
    fileUploadHint: stillNeedManual,
    cvAttached: filesFilled > 0,
    warning,
    debug: {
      scanned: fields.length,
      matched: answers.length,
      filled: fill.result?.filled ?? answers.length,
      skipped: fill.result?.skipped ?? 0,
      filesFilled,
      usedLlm,
      unmatched: leftover.slice(0, 20).map((f) => ({
        id: f.id,
        intent: f.intent,
        label: fieldLabel(f),
      })),
    },
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object' || !('type' in message)) {
    return false
  }

  if (message.type === 'GET_PROFILE') {
    loadProfile()
      .then((profile) => sendResponse({ ok: true, profile }))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to load profile',
        }),
      )
    return true
  }

  if (message.type === 'SAVE_PROFILE') {
    const profile = message.profile as CandidateProfile
    saveProfile(profile)
      .then(() => sendResponse({ ok: true }))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to save profile',
        }),
      )
    return true
  }

  if (message.type === 'GET_CV_META') {
    loadCvMeta()
      .then((meta) => sendResponse({ ok: true, meta }))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to load CV',
        }),
      )
    return true
  }

  if (message.type === 'SAVE_CV') {
    const cv = message.cv as StoredCvFile
    saveStoredCv(cv)
      .then(() => sendResponse({ ok: true }))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to save CV',
        }),
      )
    return true
  }

  if (message.type === 'CLEAR_CV') {
    clearStoredCv()
      .then(() => sendResponse({ ok: true }))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to clear CV',
        }),
      )
    return true
  }

  if (message.type === 'GET_FILL_STATUS') {
    const { status, startedAt, result } = getFillSession()
    sendResponse({
      status,
      startedAt,
      ...(result ? { result } : {}),
    })
    return false
  }

  if (message.type === 'RUN_FILL') {
    runFillJob(runFill)
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({
          ok: false,
          answers: [],
          coverLetter: '',
          fileUploadHint: false,
          error: err instanceof Error ? err.message : 'Unexpected error',
        } satisfies FillResponse),
      )
    return true
  }

  if (message.type === 'RUN_AI_ANSWER') {
    const question = String(message.question ?? '')
    const vacancy = message.vacancy as VacancyInfo
    runAiAnswerJob(question, () =>
      loadProfile()
        .then(async (profile) => {
          if (!hasAiConfigured(profile)) {
            return {
              ok: false,
              error: `Add a ${providerMeta(profile.aiProvider).label} API key in Options → AI.`,
            } satisfies AiAnswerResponse
          }
          if (!profile.fullName.trim() && !profile.email.trim() && !profile.bio.trim()) {
            return {
              ok: false,
              error: 'Fill your profile in Options first.',
            } satisfies AiAnswerResponse
          }
          const resumeText = await loadCvText()
          const answer = await generateSelectionAnswer({
            profile,
            vacancy,
            question,
            resumeText,
          })
          return { ok: true, answer } satisfies AiAnswerResponse
        })
        .catch(
          (err): AiAnswerResponse => ({
            ok: false,
            error: err instanceof Error ? err.message : 'Unexpected error',
          }),
        ),
    )
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : 'Unexpected error',
        } satisfies AiAnswerResponse),
      )
    return true
  }

  return false
})
