import type { CandidateProfile, ScannedField, VacancyInfo } from './types'

export function buildFillPrompt(params: {
  profile: CandidateProfile
  vacancy: VacancyInfo
  fields: ScannedField[]
}): string {
  const { profile, vacancy, fields } = params

  const profileBlock = [
    `Full name: ${profile.fullName}`,
    `Email: ${profile.email}`,
    `Phone: ${profile.phone}`,
    `Location: ${profile.location}`,
    `LinkedIn: ${profile.linkedin}`,
    `GitHub: ${profile.github}`,
    `Portfolio: ${profile.portfolio}`,
    `Current title: ${profile.currentTitle}`,
    `Years of experience: ${profile.yearsExperience}`,
    `Skills: ${profile.skills}`,
    `Work experience:\n${profile.workExperience}`,
    `Bio / achievements: ${profile.bio}`,
    `Preferred salary: ${profile.preferredSalary || 'not specified'}`,
    `Cover letter tone: ${profile.coverLetterTone}`,
  ].join('\n')

  const fieldsBlock = fields
    .map((f, i) => {
      const label =
        f.label || f.placeholder || f.ariaLabel || f.name || f.id || `field_${i}`
      const opts =
        f.options.length > 0 ? ` | options: ${f.options.join(' | ')}` : ''
      return `- id: ${f.id} | type: ${f.tagName}/${f.type || 'text'} | intent: ${f.intent} | label: ${label}${opts}`
    })
    .join('\n')

  return `You help fill a job application form.

Return ONLY valid JSON (no markdown fences) with this shape:
{
  "coverLetter": "string",
  "answers": [{ "id": "field-id", "value": "string" }]
}

Rules:
- Write the cover letter in the language of the vacancy (detect from vacancy text).
- Tone for cover letter: ${profile.coverLetterTone}.
- Keep cover letter concise (150-280 words unless tone is "short", then under 120 words).
- Base answers ONLY on the candidate profile and vacancy. Do not invent employers or degrees not present in the bio.
- For select/radio fields, pick the closest matching option text from the provided options.
- For yes/no or boolean-like questions, answer briefly and honestly based on the profile.
- Include an answer for EVERY listed field id.
- If a field is clearly a cover letter / motivation letter, put the same coverLetter text as its value.

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
