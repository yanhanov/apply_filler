import { mapFieldsWithProfile } from '../shared/fieldMapper'
import { tabsSendMessage } from '../shared/messaging'
import { loadProfile, saveProfile } from '../shared/storage'
import {
  clearStoredCv,
  loadCvMeta,
  loadStoredCv,
  saveStoredCv,
} from '../shared/cvStorage'
import type { StoredCvFile } from '../shared/cvTypes'
import type {
  CandidateProfile,
  FieldAnswer,
  FillResponse,
  ScanPageResult,
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

/** Local-only fill (no AI) — for debugging field mapping. */
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

  const { fields, fileUploadCount, fileFields } = scan.result
  const storedCv = await loadStoredCv()
  const hasCv = Boolean(storedCv)

  if (fields.length === 0 && !(hasCv && fileFields.length > 0)) {
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

  const { answered, unmatched } = mapFieldsWithProfile(fields, profile)
  const answers: FieldAnswer[] = answered
  const coverLetter = profile.bio || ''

  if (answers.length === 0 && !(hasCv && fileFields.length > 0)) {
    return {
      ok: false,
      answers: [],
      coverLetter,
      fileUploadHint: fileUploadCount > 0,
      error: `Scanned ${fields.length} fields, matched 0 to profile.`,
      debug: {
        scanned: fields.length,
        matched: 0,
        filled: 0,
        skipped: 0,
        unmatched: unmatched.slice(0, 20).map((f) => ({
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
      error: fill.error || 'Failed to fill fields on the page.',
      debug: {
        scanned: fields.length,
        matched: answers.length,
        filled: 0,
        skipped: 0,
        filesFilled: 0,
        unmatched: unmatched.slice(0, 20).map((f) => ({
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
    debug: {
      scanned: fields.length,
      matched: answers.length,
      filled: fill.result?.filled ?? answers.length,
      skipped: fill.result?.skipped ?? 0,
      filesFilled,
      unmatched: unmatched.slice(0, 20).map((f) => ({
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

  if (message.type === 'RUN_FILL') {
    runFill()
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

  return false
})
