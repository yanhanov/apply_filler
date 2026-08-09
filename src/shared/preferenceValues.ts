/** Canonical preference values + aliases for universal ATS select matching. */

export const NOTICE_PERIOD_OPTIONS = [
  'Immediately',
  'Less than 2 weeks',
  '2 weeks',
  '1 month',
  '2 months',
  '3 months',
  '3 months or more',
] as const

export const WORK_ARRANGEMENT_OPTIONS = [
  'Remote',
  'Hybrid',
  'On-site',
  'Flexible / No preference',
] as const

export const EMPLOYMENT_TYPE_OPTIONS = [
  'Full-time',
  'Part-time',
  'Contract',
  'Freelance',
  'Internship',
] as const

export const AVAILABILITY_OPTIONS = [
  'Immediately',
  'In 2 weeks',
  'In 1 month',
  'In 2 months',
  'In 3 months',
] as const

export const TIMEZONE_OPTIONS = [
  'UTC+0 / GMT',
  'UTC+1 / CET',
  'UTC+2 / EET',
  'UTC+3 / MSK',
  'UTC+4',
  'UTC+5',
  'Flexible / any timezone with overlap',
  'US East (ET)',
  'US West (PT)',
] as const

export const REMOTE_EXPERIENCE_OPTIONS = [
  'Yes',
  'No',
  'Less than 1 year',
  '1–2 years',
  '3+ years',
] as const

export const WORK_AUTHORIZATION_OPTIONS = [
  'Authorized to work',
  'No sponsorship required',
  'Citizen / permanent resident',
  'Need visa sponsorship',
  'Open to relocation with sponsorship',
] as const

export const YES_NO_OPTIONS = ['Yes', 'No'] as const

export const HOME_OFFICE_OPTIONS = [
  'Yes',
  'Yes — dedicated workspace',
  'Yes — quiet home setup',
  'No',
] as const

export const REFERRAL_OPTIONS = [
  'LinkedIn',
  'Company website',
  'Job board',
  'Recruiter',
  'Employee referral',
  'Other',
] as const

export const SALARY_CURRENCIES = [
  { code: 'USD', label: 'USD ($)', symbol: '$' },
  { code: 'EUR', label: 'EUR (€)', symbol: '€' },
  { code: 'GBP', label: 'GBP (£)', symbol: '£' },
  { code: 'RUB', label: 'RUB (₽)', symbol: '₽' },
  { code: 'TMT', label: 'TMT', symbol: '' },
  { code: 'KZT', label: 'KZT (₸)', symbol: '₸' },
  { code: 'UAH', label: 'UAH (₴)', symbol: '₴' },
  { code: 'PLN', label: 'PLN (zł)', symbol: 'zł' },
  { code: 'TRY', label: 'TRY (₺)', symbol: '₺' },
  { code: 'CAD', label: 'CAD (C$)', symbol: 'C$' },
  { code: 'AUD', label: 'AUD (A$)', symbol: 'A$' },
  { code: 'CHF', label: 'CHF', symbol: 'CHF' },
  { code: 'JPY', label: 'JPY (¥)', symbol: '¥' },
  { code: 'INR', label: 'INR (₹)', symbol: '₹' },
] as const

export const SALARY_PERIODS = [
  { value: 'month', label: '/ month' },
  { value: 'year', label: '/ year' },
  { value: 'hour', label: '/ hour' },
  { value: 'day', label: '/ day' },
] as const

const CURRENCY_BY_CODE = Object.fromEntries(
  SALARY_CURRENCIES.map((c) => [c.code, c]),
) as Record<string, (typeof SALARY_CURRENCIES)[number]>

export function formatPreferredSalary(parts: {
  salaryAmount: string
  salaryCurrency: string
  salaryPeriod: string
}): string {
  const amount = parts.salaryAmount.trim()
  if (!amount) return ''
  if (/^(negotiable|market rate|open to discuss|competitive)$/i.test(amount)) {
    return amount
  }

  const code = (parts.salaryCurrency || 'USD').toUpperCase()
  const meta = CURRENCY_BY_CODE[code]
  const symbol = meta?.symbol ?? ''
  const period = parts.salaryPeriod || 'month'
  const cleaned = amount.replace(/[^\d.,\s]/g, '').trim() || amount

  if (symbol && symbol.length <= 2) {
    return `${symbol}${cleaned} ${code} / ${period}`
  }
  return `${cleaned} ${code} / ${period}`
}

/** Split legacy preferredSalary strings into amount / currency / period. */
export function parsePreferredSalary(text: string): {
  salaryAmount: string
  salaryCurrency: string
  salaryPeriod: string
} {
  const raw = text.trim()
  if (!raw) {
    return { salaryAmount: '', salaryCurrency: 'USD', salaryPeriod: 'month' }
  }
  if (/negotiable|market rate|open to discuss|competitive/i.test(raw) && !/\d/.test(raw)) {
    return { salaryAmount: raw, salaryCurrency: 'USD', salaryPeriod: 'month' }
  }

  let salaryCurrency = 'USD'
  let salaryPeriod = 'month'

  const codeHit = raw.match(/\b(USD|EUR|GBP|RUB|TMT|KZT|UAH|PLN|TRY|CAD|AUD|CHF|JPY|INR)\b/i)
  if (codeHit) salaryCurrency = codeHit[1].toUpperCase()
  else if (/€/.test(raw)) salaryCurrency = 'EUR'
  else if (/£/.test(raw)) salaryCurrency = 'GBP'
  else if (/₽/.test(raw)) salaryCurrency = 'RUB'
  else if (/\$/.test(raw)) salaryCurrency = 'USD'

  if (/\b(year|yearly|annual|\/\s*y(r|ear)?)\b/i.test(raw)) salaryPeriod = 'year'
  else if (/\b(hour|hourly|\/\s*h(r|our)?)\b/i.test(raw)) salaryPeriod = 'hour'
  else if (/\b(day|daily|\/\s*d(ay)?)\b/i.test(raw)) salaryPeriod = 'day'
  else if (/\b(month|monthly|\/\s*mo(nth)?)\b/i.test(raw)) salaryPeriod = 'month'

  const num = raw.match(/(\d[\d\s.,]*)/)
  const salaryAmount = num?.[1]?.replace(/\s+/g, '').trim() ?? raw

  return { salaryAmount, salaryCurrency, salaryPeriod }
}

/** Map normalized profile value → alternate labels commonly seen in ATS dropdowns. */
const ALIAS_GROUPS: string[][] = [
  [
    'yes',
    'y',
    'true',
    'да',
    'i do',
    'i have',
    'have',
    'available',
    'willing',
  ],
  ['no', 'n', 'false', 'нет', 'not', 'do not', "don't", 'unable', 'not willing'],
  [
    'remote',
    'fully remote',
    '100% remote',
    'remote only',
    'remote-only',
    'work from home',
    'wfh',
    'work-from-home',
    'distributed',
    'удалённо',
    'удаленно',
  ],
  ['hybrid', 'remote/hybrid', 'remote / hybrid', 'flexible hybrid', 'partly remote'],
  [
    'on-site',
    'onsite',
    'on site',
    'in-office',
    'in office',
    'office',
    'office-based',
  ],
  [
    'flexible / no preference',
    'no preference',
    'flexible',
    'any',
    'open',
    'does not matter',
  ],
  [
    'full-time',
    'full time',
    'fulltime',
    'permanent',
    'ft',
    'full-time employee',
  ],
  ['part-time', 'part time', 'parttime', 'pt'],
  ['contract', 'contractor', 'fixed-term', 'fixed term', 'temporary'],
  ['freelance', 'freelancer', 'self-employed', 'independent'],
  ['internship', 'intern', 'trainee'],
  ['immediately', 'asap', 'right away', 'now', 'available now', 'immediate'],
  [
    'less than 2 weeks',
    'under 2 weeks',
    '< 2 weeks',
    '1 week',
    'one week',
    'within 2 weeks',
  ],
  ['2 weeks', 'two weeks', '14 days', 'bi-weekly', 'in 2 weeks'],
  ['1 month', 'one month', '4 weeks', '30 days', 'in 1 month', 'within a month'],
  ['2 months', 'two months', '8 weeks', 'in 2 months'],
  ['3 months', 'three months', '12 weeks', 'in 3 months'],
  ['3 months or more', '3+ months', 'more than 3 months', '> 3 months'],
  ['less than 1 year', '< 1 year', 'under 1 year', '0-1 years', '0–1 years'],
  ['1–2 years', '1-2 years', '1 to 2 years', '1+ years'],
  ['3+ years', '3 years', '3 years or more', 'more than 3 years', '3-5 years'],
  [
    'authorized to work',
    'legally authorized',
    'eligible to work',
    'work authorized',
    'authorized',
  ],
  [
    'no sponsorship required',
    'do not require sponsorship',
    "don't require sponsorship",
    'no visa sponsorship needed',
    'no sponsorship needed',
  ],
  [
    'need visa sponsorship',
    'require sponsorship',
    'needs sponsorship',
    'visa required',
    'sponsorship required',
  ],
  [
    'citizen / permanent resident',
    'citizen',
    'permanent resident',
    'national',
  ],
  [
    'yes — dedicated workspace',
    'dedicated workspace',
    'dedicated home office',
    'home office ready',
  ],
  [
    'yes — quiet home setup',
    'quiet space',
    'quiet home setup',
    'suitable home office',
  ],
  ['linkedin', 'linkedin.com', 'via linkedin'],
  ['company website', 'career page', 'careers site', 'company site'],
  ['job board', 'indeed', 'glassdoor', 'hired', 'wellfound', 'angellist', 'hh.ru'],
  ['recruiter', 'recruiter outreach', 'agency', 'headhunter'],
  ['employee referral', 'referral', 'referred', 'friend', 'colleague'],
  ['other', 'somewhere else', 'internet'],
  ['negotiable', 'open to discuss', 'market rate', 'competitive', 'flexible'],
]

function normalizeKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
}

/** All labels that should count as the same answer for ATS matching. */
export function expandPreferenceAliases(value: string): string[] {
  const raw = value.trim()
  if (!raw) return []
  const key = normalizeKey(raw)
  const out = new Set<string>([raw, key])

  for (const group of ALIAS_GROUPS) {
    if (group.some((g) => normalizeKey(g) === key)) {
      for (const g of group) out.add(g)
    }
  }

  return [...out]
}

/** Prefer a canonical option if the stored free-text matches an alias group. */
export function canonicalizePreference(
  options: readonly string[],
  value: string,
): string {
  const raw = value.trim()
  if (!raw) return ''
  if ((options as readonly string[]).includes(raw)) return raw

  const aliases = expandPreferenceAliases(raw).map(normalizeKey)
  for (const opt of options) {
    if (aliases.includes(normalizeKey(opt))) return opt
    if (expandPreferenceAliases(opt).map(normalizeKey).includes(normalizeKey(raw))) {
      return opt
    }
  }
  return raw
}
