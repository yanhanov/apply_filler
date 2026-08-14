import { buildFillPrompt, extractJsonObject } from './prompts'
import type {
  CandidateProfile,
  FieldAnswer,
  ScannedField,
  VacancyInfo,
} from './types'

const GEMINI_MODEL = 'gemini-2.0-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    finishReason?: string
  }>
  error?: { message?: string; status?: string; code?: number }
}

export type LlmFillResult = {
  coverLetter: string
  answers: FieldAnswer[]
}

function friendlyGeminiError(status: number, body: string): string {
  if (status === 400) return 'Invalid Gemini request. Check your API key and try again.'
  if (status === 401 || status === 403) return 'Invalid Gemini API key.'
  if (status === 429) return 'Gemini free quota exceeded. Try again later.'
  if (status >= 500) return 'Gemini service error. Try again later.'
  return `Gemini error (${status}): ${body.slice(0, 200)}`
}

export async function generateWithGemini(params: {
  apiKey: string
  profile: CandidateProfile
  vacancy: VacancyInfo
  fields: ScannedField[]
}): Promise<LlmFillResult> {
  const { apiKey, profile, vacancy, fields } = params

  if (!apiKey.trim()) {
    throw new Error('Add your free Gemini API key in Options.')
  }

  const allowedIds = new Set(fields.map((f) => f.id))
  const prompt = buildFillPrompt({ profile, vacancy, fields })
  const url = `${GEMINI_URL}?key=${encodeURIComponent(apiKey.trim())}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }),
  })

  const raw = await res.text()
  if (!res.ok) {
    throw new Error(friendlyGeminiError(res.status, raw))
  }

  let data: GeminiResponse
  try {
    data = JSON.parse(raw) as GeminiResponse
  } catch {
    throw new Error('Unexpected Gemini response')
  }

  if (data.error?.message) {
    throw new Error(data.error.message)
  }

  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text) {
    throw new Error('Empty response from Gemini')
  }

  const parsed = extractJsonObject(text) as {
    coverLetter?: unknown
    answers?: unknown
  }

  const coverLetter =
    typeof parsed.coverLetter === 'string' ? parsed.coverLetter.trim() : ''

  const answers: FieldAnswer[] = []
  if (Array.isArray(parsed.answers)) {
    for (const item of parsed.answers) {
      if (
        !item ||
        typeof item !== 'object' ||
        !('id' in item) ||
        !('value' in item)
      ) {
        continue
      }
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
