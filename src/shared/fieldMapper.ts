import type { CandidateProfile, FieldIntent, ScannedField } from './types'

type Rule = {
  intent: FieldIntent
  patterns: RegExp[]
}

/** Order matters: more specific rules first. */
const RULES: Rule[] = [
  { intent: 'email', patterns: [/\bemail\b/i, /\be-?mail\b/i, /mail\s*address/i] },
  { intent: 'phone', patterns: [/\bphone\b/i, /\bmobile\b/i, /\btel\b/i, /telephone/i, /whatsapp/i] },
  { intent: 'linkedin', patterns: [/linkedin/i, /linked\s*in/i] },
  { intent: 'github', patterns: [/github/i, /git\s*hub/i] },
  { intent: 'telegram', patterns: [/telegram/i, /\bt\.me\b/i] },
  { intent: 'twitter', patterns: [/twitter/i, /\bx\.com\b/i] },
  {
    intent: 'portfolio',
    patterns: [/portfolio/i, /personal\s*site/i, /website/i, /web\s*site/i, /homepage/i, /work\s*samples?/i],
  },
  {
    intent: 'cover_letter',
    patterns: [
      /cover\s*letter/i,
      /motivation\s*letter/i,
      /сопровод/i,
      /мотивац/i,
      /why\s*(do\s*)?you\s*(want|apply)/i,
    ],
  },
  {
    intent: 'salary',
    patterns: [
      /salary/i,
      /compensation/i,
      /expected\s*pay/i,
      /pay\s*expect/i,
      /desired\s*salary/i,
      /зарплат/i,
      /оклад/i,
    ],
  },
  {
    intent: 'notice_period',
    patterns: [/notice\s*period/i, /period\s*of\s*notice/i, /срок\s*уведомлен/i],
  },
  {
    intent: 'work_arrangement',
    patterns: [
      /work\s*arrangement/i,
      /preferred\s*work/i,
      /desired_work_arrangement/i,
      /remote\s*\/\s*hybrid/i,
      /onsite\s*or\s*remote/i,
      /work\s*mode/i,
      /workplace\s*type/i,
    ],
  },
  {
    intent: 'employment_type',
    patterns: [
      /employment\s*(type|preference)/i,
      /job\s*type/i,
      /contract\s*type/i,
      /full[\s-]?time|part[\s-]?time/i,
      /preferred\s*employment/i,
    ],
  },
  {
    intent: 'availability',
    patterns: [
      /\bavailability\b/i,
      /earliest\s*start/i,
      /start\s*date/i,
      /when\s*can\s*you\s*start/i,
      /date\s*available/i,
    ],
  },
  {
    intent: 'timezone',
    patterns: [/\btimezone\b/i, /time\s*zone/i, /utc\b/i, /overlap.*hours/i],
  },
  {
    intent: 'remote_experience',
    patterns: [/remote\s*work\s*experience/i, /worked\s*remotely/i, /remote\s*exp/i],
  },
  {
    intent: 'async_experience',
    patterns: [/async/i, /distributed\s*team/i, /asynchronous/i],
  },
  {
    intent: 'home_office',
    patterns: [/home\s*office/i, /office\s*setup/i, /workspace\s*setup/i],
  },
  {
    intent: 'self_employed',
    patterns: [/self[\s-]?employed/i, /freelancer/i, /own\s*company/i, /registered\s*as/i],
  },
  {
    intent: 'work_authorization',
    patterns: [
      /work\s*authori[sz]/i,
      /visa\s*status/i,
      /eligible\s*to\s*work/i,
      /right\s*to\s*work/i,
      /sponsorship/i,
      /tax\s*residenc/i,
    ],
  },
  {
    intent: 'willing_to_relocate',
    patterns: [/relocat/i, /willing\s*to\s*move/i, /open\s*to\s*relocation/i],
  },
  {
    intent: 'referral_source',
    patterns: [/how\s*did\s*you\s*hear/i, /referral\s*source/i, /source\s*of\s*hire/i, /found\s*this\s*job/i],
  },
  {
    intent: 'country',
    patterns: [
      /country\s*of\s*residence/i,
      /\bcountry\b/i,
      /citizenship/i,
      /nationality/i,
      /country[\s_-]*name/i,
      /страна/i,
      /гражданств/i,
    ],
  },
  {
    intent: 'city',
    patterns: [/current\s*city/i, /\bcity\b/i, /город/i, /address[\s_-]*level[\s_-]*2/i],
  },
  {
    intent: 'education',
    patterns: [/education/i, /degree/i, /university/i, /school/i, /образован/i],
  },
  {
    intent: 'languages',
    patterns: [/languages?/i, /языки/i, /spoken\s*language/i, /professional\s*languages?/i],
  },
  {
    intent: 'current_company',
    patterns: [/current\s*(company|employer)/i, /employer/i, /организация/i, /компания/i],
  },
  {
    intent: 'work_experience',
    patterns: [
      /(?<!remote\s)work\s+experience\b/i,
      /employment\s*history/i,
      /previous\s*(roles?|jobs?)\b/i,
      /job\s*history/i,
      /опыт\s*работы/i,
    ],
  },
  {
    intent: 'years_experience',
    patterns: [
      /years?\s*(of\s*)?exp/i,
      /experience\s*(years|yrs)/i,
      /total\s*experience/i,
      /стаж/i,
    ],
  },
  {
    intent: 'current_title',
    patterns: [/current\s*(job\s*)?title/i, /job\s*title/i, /position\s*title/i, /headline/i, /должность/i],
  },
  { intent: 'skills', patterns: [/\bskills?\b/i, /технолог/i, /competenc/i] },
  {
    intent: 'first_name',
    patterns: [/first\s*name/i, /given\s*name/i, /fname/i, /^first$/i, /имя(?!\s*фам)/i],
  },
  {
    intent: 'last_name',
    patterns: [/last\s*name/i, /family\s*name/i, /surname/i, /lname/i, /^last$/i, /фамил/i],
  },
  {
    intent: 'full_name',
    patterns: [/full\s*name/i, /your\s*name/i, /\bname\b/i, /applicant\s*name/i, /фио/i],
  },
  {
    intent: 'location',
    patterns: [/location/i, /address/i, /где\s*жив/i, /местополож/i, /region/i, /state\b/i],
  },
]

function haystack(
  field: Pick<
    ScannedField,
    'id' | 'name' | 'placeholder' | 'label' | 'ariaLabel' | 'autocomplete' | 'type'
  >,
): string {
  return [field.id, field.name, field.placeholder, field.label, field.ariaLabel, field.autocomplete, field.type]
    .filter(Boolean)
    .join(' ')
}

export function detectIntent(
  field: Pick<
    ScannedField,
    'id' | 'name' | 'placeholder' | 'label' | 'ariaLabel' | 'autocomplete' | 'type' | 'tagName'
  >,
): FieldIntent {
  const text = haystack(field)

  if (field.type === 'email' || field.autocomplete === 'email') return 'email'
  if (field.type === 'tel' || field.autocomplete === 'tel') return 'phone'
  if (field.autocomplete === 'name') return 'full_name'
  if (field.autocomplete === 'given-name') return 'first_name'
  if (field.autocomplete === 'family-name') return 'last_name'
  if (field.autocomplete === 'country' || field.autocomplete === 'country-name') return 'country'
  if (field.autocomplete === 'address-level2') return 'city'
  if (field.autocomplete === 'street-address') return 'location'

  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) return rule.intent
  }

  if (field.tagName === 'textarea' || field.type === 'text') {
    if ((field.label || field.placeholder).trim().length > 12) return 'custom_question'
  }

  return 'unknown'
}

export function intentNeedsLlm(intent: FieldIntent): boolean {
  return intent === 'cover_letter' || intent === 'custom_question' || intent === 'unknown'
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: '', last: '' }
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

function cityFromProfile(profile: CandidateProfile): string {
  if (profile.city.trim()) return profile.city.trim()
  const loc = profile.location.trim()
  if (!loc) return ''
  return loc.split(',')[0]?.trim() || loc
}

function countryFromProfile(profile: CandidateProfile): string {
  if (profile.country.trim()) return profile.country.trim()
  const loc = profile.location.trim()
  if (!loc.includes(',')) return ''
  return loc.split(',').slice(1).join(',').trim()
}

export function valueFromProfile(
  intent: FieldIntent,
  profile: CandidateProfile,
): string | null {
  const { first, last } = splitName(profile.fullName)

  switch (intent) {
    case 'full_name':
      return profile.fullName || null
    case 'first_name':
      return first || null
    case 'last_name':
      return last || null
    case 'email':
      return profile.email || null
    case 'phone':
      return profile.phone || null
    case 'country':
      return countryFromProfile(profile) || null
    case 'city':
      return cityFromProfile(profile) || null
    case 'location':
      return profile.location || cityFromProfile(profile) || null
    case 'linkedin':
      return profile.linkedin || null
    case 'github':
      return profile.github || null
    case 'portfolio':
      return profile.portfolio || null
    case 'twitter':
      return profile.twitter || null
    case 'telegram':
      return profile.telegram || null
    case 'current_title':
      return profile.currentTitle || null
    case 'current_company':
      return profile.currentCompany || null
    case 'years_experience':
      return profile.yearsExperience || null
    case 'skills':
      return profile.skills || null
    case 'work_experience':
      return profile.workExperience || null
    case 'education':
      return profile.education || null
    case 'languages':
      return profile.languages || null
    case 'salary':
      return profile.preferredSalary || null
    case 'notice_period':
      return profile.noticePeriod || null
    case 'work_arrangement':
      return profile.workArrangement || null
    case 'employment_type':
      return profile.employmentType || null
    case 'availability':
      return profile.availability || profile.noticePeriod || null
    case 'timezone':
      return profile.timezone || null
    case 'remote_experience':
      return profile.remoteExperience || null
    case 'work_authorization':
      return profile.workAuthorization || null
    case 'willing_to_relocate':
      return profile.willingToRelocate || null
    case 'self_employed':
      return profile.selfEmployed || null
    case 'home_office':
      return profile.homeOffice || null
    case 'async_experience':
      return profile.asyncExperience || null
    case 'referral_source':
      return profile.referralSource || null
    default:
      return null
  }
}

export function mapFieldsWithProfile(
  fields: ScannedField[],
  profile: CandidateProfile,
): {
  answered: { id: string; value: string }[]
  unmatched: ScannedField[]
} {
  const answered: { id: string; value: string }[] = []
  const unmatched: ScannedField[] = []

  for (const field of fields) {
    if (field.intent === 'cover_letter') {
      const letter = profile.bio || profile.workExperience
      if (letter) answered.push({ id: field.id, value: letter })
      else unmatched.push(field)
      continue
    }

    const value = valueFromProfile(field.intent, profile)
    if (value) {
      answered.push({ id: field.id, value })
      continue
    }

    unmatched.push(field)
  }

  return { answered, unmatched }
}
