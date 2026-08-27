import {
  buildProfileTextBlock,
  buildResumeTextBlock,
  buildUserPromptBlock,
} from './profileText'
import type { CandidateProfile, ScannedField, VacancyInfo } from './types'

function fieldLabel(f: ScannedField, index: number): string {
  return f.label || f.placeholder || f.ariaLabel || f.name || f.id || `field_${index}`
}

function toneRule(profile: CandidateProfile): string {
  return profile.coverLetterTone === 'short'
    ? 'Keep cover letter under 120 words.'
    : profile.coverLetterTone === 'enthusiastic'
      ? 'Keep cover letter 150-220 words, warm and energetic but still professional.'
      : 'Keep cover letter 150-280 words, clear and professional.'
}

function sharedSourceRules(hasResume: boolean): string {
  const sources = hasResume
    ? 'candidate profile, imported resume/CV, and vacancy'
    : 'candidate profile and vacancy'
  return `- Base every answer ONLY on the ${sources}.
- Do not invent employers, degrees, skills, dates, projects, or achievements.
- When profile and resume disagree, prefer the resume for work history and skills.`
}

export function buildSelectionAnswerPrompt(params: {
  profile: CandidateProfile
  vacancy: VacancyInfo
  question: string
  resumeText?: string
}): string {
  const { profile, vacancy, question, resumeText = '' } = params
  const profileBlock = buildProfileTextBlock(profile)
  const resumeBlock = buildResumeTextBlock(resumeText)
  const userPromptBlock = buildUserPromptBlock(profile)
  const hasResume = Boolean(resumeText.trim())

  const sections = [
    'You help a job applicant answer one application question.',
    '',
    'Write ONLY the answer text — no quotes, labels, markdown, or JSON.',
    '',
    'Rules:',
    '- Answer in the same language as the question.',
    sharedSourceRules(hasResume),
    '- For yes/no questions: one short sentence.',
    '- For open questions: 2–6 sentences, clear and professional.',
    `- Tone: ${profile.coverLetterTone}.`,
    userPromptBlock ? `\n${userPromptBlock}\n` : '',
    '',
    `QUESTION:\n${question.trim()}`,
    '',
    `CANDIDATE PROFILE:\n${profileBlock}`,
    resumeBlock ? `\n${resumeBlock}` : '',
    '',
    `VACANCY:\nTitle: ${vacancy.title || '(unknown)'}\nCompany: ${vacancy.company || '(unknown)'}\nURL: ${vacancy.pageUrl}\nDescription:\n${vacancy.description.slice(0, 6000)}`,
  ]

  return sections.filter((line) => line !== '').join('\n')
}

export function buildFillPrompt(params: {
  profile: CandidateProfile
  vacancy: VacancyInfo
  fields: ScannedField[]
  resumeText?: string
}): string {
  const { profile, vacancy, fields, resumeText = '' } = params
  const profileBlock = buildProfileTextBlock(profile)
  const resumeBlock = buildResumeTextBlock(resumeText)
  const userPromptBlock = buildUserPromptBlock(profile)
  const hasResume = Boolean(resumeText.trim())

  const fieldsBlock = fields
    .map((f, i) => {
      const opts =
        f.options.length > 0 ? ` | options: ${f.options.join(' | ')}` : ''
      return `- id: ${f.id} | type: ${f.tagName}/${f.type || 'text'} | intent: ${f.intent} | label: ${fieldLabel(f, i)}${opts}`
    })
    .join('\n')

  const sections = [
    'You help fill open / free-text job application fields.',
    '',
    'Return ONLY valid JSON (no markdown fences) with this shape:',
    '{',
    '  "coverLetter": "string",',
    '  "answers": [{ "id": "field-id", "value": "string" }]',
    '}',
    '',
    'Rules:',
    '- Write the cover letter in the language of the vacancy (detect from vacancy text).',
    `- Tone for cover letter: ${profile.coverLetterTone}.`,
    `- ${toneRule(profile)}`,
    sharedSourceRules(hasResume),
    '- Tailor the cover letter to THIS vacancy using profile + resume facts.',
    '- For select/radio fields, pick the closest matching option text from the provided options (use the option wording exactly when possible).',
    '- For yes/no questions, answer briefly and honestly from the profile/resume.',
    '- Include an answer for EVERY listed field id. Do not invent extra ids.',
    '- If a field intent is cover_letter (or the label is a cover/motivation letter), set its value to the same text as coverLetter.',
    '- Leave value empty only if the profile/resume truly has no basis to answer.',
    userPromptBlock
      ? `\n${userPromptBlock}\n`
      : '',
    '',
    `CANDIDATE PROFILE:\n${profileBlock}`,
    resumeBlock ? `\n${resumeBlock}` : '',
    '',
    `VACANCY:\nTitle: ${vacancy.title || '(unknown)'}\nCompany: ${vacancy.company || '(unknown)'}\nURL: ${vacancy.pageUrl}\nDescription:\n${vacancy.description}`,
    '',
    `FIELDS TO ANSWER:\n${fieldsBlock || '(none — still generate coverLetter)'}`,
  ]

  return sections.join('\n')
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
