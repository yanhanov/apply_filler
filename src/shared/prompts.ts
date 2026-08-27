import { buildProfileTextBlock } from './profileText'
import type { CandidateProfile, ScannedField, VacancyInfo } from './types'

function fieldLabel(f: ScannedField, index: number): string {
  return f.label || f.placeholder || f.ariaLabel || f.name || f.id || `field_${index}`
}

export function buildSelectionAnswerPrompt(params: {
  profile: CandidateProfile
  vacancy: VacancyInfo
  question: string
}): string {
  const { profile, vacancy, question } = params
  const profileBlock = buildProfileTextBlock(profile)
  const custom = profile.coverLetterPrompt.trim()

  return `You help a job applicant answer one application question.

Write ONLY the answer text — no quotes, labels, markdown, or JSON.

Rules:
- Answer in the same language as the question.
- Use ONLY facts from the candidate profile and vacancy context below.
- Do not invent employers, degrees, skills, dates, or achievements.
- For yes/no questions: one short sentence.
- For open questions: 2–6 sentences, clear and professional.
- Tone: ${profile.coverLetterTone}.
${custom ? `- Extra instructions from the candidate:\n${custom}` : ''}

QUESTION:
${question.trim()}

CANDIDATE PROFILE:
${profileBlock}

VACANCY:
Title: ${vacancy.title || '(unknown)'}
Company: ${vacancy.company || '(unknown)'}
URL: ${vacancy.pageUrl}
Description:
${vacancy.description.slice(0, 6000)}
`
}

export function buildFillPrompt(params: {
  profile: CandidateProfile
  vacancy: VacancyInfo
  fields: ScannedField[]
}): string {
  const { profile, vacancy, fields } = params

  const profileBlock = buildProfileTextBlock(profile)

  const fieldsBlock = fields
    .map((f, i) => {
      const opts =
        f.options.length > 0 ? ` | options: ${f.options.join(' | ')}` : ''
      return `- id: ${f.id} | type: ${f.tagName}/${f.type || 'text'} | intent: ${f.intent} | label: ${fieldLabel(f, i)}${opts}`
    })
    .join('\n')

  const toneRule =
    profile.coverLetterTone === 'short'
      ? 'Keep cover letter under 120 words.'
      : profile.coverLetterTone === 'enthusiastic'
        ? 'Keep cover letter 150-220 words, warm and energetic but still professional.'
        : 'Keep cover letter 150-280 words, clear and professional.'

  const customCoverPrompt = profile.coverLetterPrompt.trim()
  const customCoverBlock = customCoverPrompt
    ? `
USER COVER LETTER INSTRUCTIONS (follow closely; when they conflict with tone defaults below, prefer these):
${customCoverPrompt}
`
    : ''

  return `You help fill open / free-text job application fields.

Return ONLY valid JSON (no markdown fences) with this shape:
{
  "coverLetter": "string",
  "answers": [{ "id": "field-id", "value": "string" }]
}

Rules:
- Write the cover letter in the language of the vacancy (detect from vacancy text).
- Tone for cover letter: ${profile.coverLetterTone}.
- ${toneRule}
- Tailor the cover letter to THIS vacancy using the candidate profile. Do not invent employers, degrees, skills, or achievements not present in the profile.
- Base every answer ONLY on the candidate profile and vacancy.
- For select/radio fields, pick the closest matching option text from the provided options (use the option wording exactly when possible).
- For yes/no questions, answer briefly and honestly from the profile.
- Include an answer for EVERY listed field id. Do not invent extra ids.
- If a field intent is cover_letter (or the label is a cover/motivation letter), set its value to the same text as coverLetter.
- Leave value empty only if the profile truly has no basis to answer.
${customCoverBlock}

CANDIDATE PROFILE:
${profileBlock}

VACANCY:
Title: ${vacancy.title || '(unknown)'}
Company: ${vacancy.company || '(unknown)'}
URL: ${vacancy.pageUrl}
Description:
${vacancy.description}

FIELDS TO ANSWER:
${fieldsBlock || '(none — still generate coverLetter)'}
`
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim())
    }
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1))
    }
    throw new Error('Model did not return valid JSON')
  }
}
