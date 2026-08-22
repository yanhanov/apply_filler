import type { CandidateProfile, ScannedField, VacancyInfo } from './types'

function fieldLabel(f: ScannedField, index: number): string {
  return f.label || f.placeholder || f.ariaLabel || f.name || f.id || `field_${index}`
}

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
    `Country: ${profile.country}`,
    `City: ${profile.city}`,
    `Location: ${profile.location}`,
    `LinkedIn: ${profile.linkedin}`,
    `GitHub: ${profile.github}`,
    `Portfolio: ${profile.portfolio}`,
    `Twitter: ${profile.twitter}`,
    `Telegram: ${profile.telegram}`,
    `Current title: ${profile.currentTitle}`,
    `Current company: ${profile.currentCompany}`,
    `Years of experience: ${profile.yearsExperience}`,
    `Skills: ${profile.skills}`,
    `Languages: ${profile.languages}`,
    `Education:\n${profile.education}`,
    `Work experience:\n${profile.workExperience}`,
    `Bio / achievements: ${profile.bio}`,
    `Preferred salary: ${profile.preferredSalary || 'not specified'}`,
    `Notice period: ${profile.noticePeriod}`,
    `Work arrangement: ${profile.workArrangement}`,
    `Employment type: ${profile.employmentType}`,
    `Availability: ${profile.availability}`,
    `Timezone: ${profile.timezone}`,
    `Remote experience: ${profile.remoteExperience}`,
    `Work authorization: ${profile.workAuthorization}`,
    `Tax residency matches employer: ${profile.taxResidencyMatches}`,
    `Willing to relocate: ${profile.willingToRelocate}`,
    `Self-employed: ${profile.selfEmployed}`,
    `Home office: ${profile.homeOffice}`,
    `Async / distributed experience: ${profile.asyncExperience}`,
    `Referral source: ${profile.referralSource}`,
    `Cover letter tone: ${profile.coverLetterTone}`,
  ].join('\n')

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
