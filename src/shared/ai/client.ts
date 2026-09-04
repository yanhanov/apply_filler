import { buildFillPrompt, buildSelectionAnswerPrompt, extractJsonObject } from '../prompts'
import type {
  AiProvider,
  CandidateProfile,
  FieldAnswer,
  ScannedField,
  VacancyInfo,
} from '../types'
import {
  hasAiConfigured,
  profileApiKey,
  providerMeta,
  resolveOpenRouterModel,
} from './providers'

export type LlmFillResult = {
  coverLetter: string
  answers: FieldAnswer[]
}

function friendlyError(provider: AiProvider, status: number, body: string): string {
  const name = providerMeta(provider).label
  if (status === 401 || status === 403) return `Invalid ${name} API key.`
  if (status === 429) return `${name} rate limit exceeded. Try again later.`
  if (status === 400) return `Invalid ${name} request. Check your API key and settings.`
  if (status >= 500) return `${name} service error. Try again later.`
  const snippet = body.slice(0, 180).replace(/\s+/g, ' ').trim()
  return snippet ? `${name} error (${status}): ${snippet}` : `${name} error (${status}).`
}

function requireConfigured(profile: CandidateProfile): { provider: AiProvider; apiKey: string } {
  const provider = profile.aiProvider
  const apiKey = profileApiKey(profile)
  if (!apiKey) {
    throw new Error(`Add your ${providerMeta(provider).label} API key in Options → AI.`)
  }
  return { provider, apiKey }
}

async function completeText(params: {
  provider: AiProvider
  apiKey: string
  prompt: string
  jsonMode?: boolean
  maxTokens?: number
  profile?: CandidateProfile
}): Promise<string> {
  const { provider, apiKey, prompt, jsonMode, maxTokens = 4096, profile } = params

  if (provider === 'gemini') {
    const model = providerMeta('gemini').model
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: maxTokens,
          ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    })
    const raw = await res.text()
    if (!res.ok) throw new Error(friendlyError(provider, res.status, raw))
    const data = JSON.parse(raw) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      error?: { message?: string }
    }
    if (data.error?.message) throw new Error(data.error.message)
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    if (!text.trim()) throw new Error(`Empty response from ${providerMeta(provider).label}.`)
    return text.trim()
  }

  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: providerMeta('claude').model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const raw = await res.text()
    if (!res.ok) throw new Error(friendlyError(provider, res.status, raw))
    const data = JSON.parse(raw) as {
      content?: Array<{ type?: string; text?: string }>
      error?: { message?: string }
    }
    if (data.error?.message) throw new Error(data.error.message)
    const text = data.content?.find((c) => c.type === 'text')?.text ?? ''
    if (!text.trim()) throw new Error(`Empty response from ${providerMeta(provider).label}.`)
    return text.trim()
  }

  // OpenAI-compatible: OpenAI, Grok, OpenRouter
  let url = 'https://api.openai.com/v1/chat/completions'
  let model = providerMeta('openai').model
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }

  if (provider === 'grok') {
    url = 'https://api.x.ai/v1/chat/completions'
    model = providerMeta('grok').model
  } else if (provider === 'openrouter') {
    url = 'https://openrouter.ai/api/v1/chat/completions'
    model = profile ? resolveOpenRouterModel(profile) : providerMeta('openrouter').model
    headers['HTTP-Referer'] = 'https://github.com/apply-filler'
    headers['X-Title'] = 'Apply Filler'
  } else {
    model = providerMeta('openai').model
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: maxTokens,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(friendlyError(provider, res.status, raw))
  const data = JSON.parse(raw) as {
    choices?: Array<{ message?: { content?: string } }>
    error?: { message?: string }
  }
  if (data.error?.message) throw new Error(data.error.message)
  const text = data.choices?.[0]?.message?.content ?? ''
  if (!text.trim()) throw new Error(`Empty response from ${providerMeta(provider).label}.`)
  return text.trim()
}

function parseFillResponse(text: string, allowedIds: Set<string>): LlmFillResult {
  const parsed = extractJsonObject(text) as {
    coverLetter?: unknown
    answers?: unknown
  }

  const coverLetter =
    typeof parsed.coverLetter === 'string' ? parsed.coverLetter.trim() : ''

  const answers: FieldAnswer[] = []
  if (Array.isArray(parsed.answers)) {
    for (const item of parsed.answers) {
      if (!item || typeof item !== 'object' || !('id' in item) || !('value' in item)) continue
      const id = (item as FieldAnswer).id
      const value = (item as FieldAnswer).value
      if (typeof id !== 'string' || typeof value !== 'string') continue
      if (!allowedIds.has(id)) continue
      const trimmed = value.trim()
      if (!trimmed) continue
      answers.push({ id, value: trimmed })
    }
  }

  return { coverLetter, answers }
}

export async function generateFill(params: {
  profile: CandidateProfile
  vacancy: VacancyInfo
  fields: ScannedField[]
  resumeText?: string
}): Promise<LlmFillResult> {
  const { profile, vacancy, fields, resumeText = '' } = params
  const { provider, apiKey } = requireConfigured(profile)
  const allowedIds = new Set(fields.map((f) => f.id))
  const prompt = buildFillPrompt({ profile, vacancy, fields, resumeText })
  const text = await completeText({
    provider,
    apiKey,
    prompt,
    jsonMode: true,
    maxTokens: 4096,
    profile,
  })
  return parseFillResponse(text, allowedIds)
}

export async function generateSelectionAnswer(params: {
  profile: CandidateProfile
  vacancy: VacancyInfo
  question: string
  resumeText?: string
}): Promise<string> {
  const { profile, vacancy, question, resumeText = '' } = params
  if (!question.trim()) {
    throw new Error('Select question text on the page first.')
  }
  const { provider, apiKey } = requireConfigured(profile)
  const prompt = buildSelectionAnswerPrompt({ profile, vacancy, question, resumeText })
  const text = await completeText({
    provider,
    apiKey,
    prompt,
    maxTokens: 2048,
    profile,
  })
  return text.replace(/^["']|["']$/g, '')
}

export { hasAiConfigured, profileApiKey, providerMeta }
