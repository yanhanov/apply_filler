import type { CandidateProfile } from './types'

function asHttpsUrl(value: string): string {
  const v = value.trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  if (/^(linkedin\.com|github\.com|t\.me|www\.)/i.test(v)) return `https://${v}`
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/?#].*)?$/i.test(v)) return `https://${v}`
  return v
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const SECTION_HEADERS =
  /^(summary|skills|experience|work experience|education|projects|languages|certifications|achievements|profile|about|experti[sz]e)\b/i

function linesOf(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function sectionBody(text: string, names: RegExp): string {
  const lines = text.split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim()
    if (names.test(t) && t.length < 40) {
      start = i + 1
      break
    }
  }
  if (start < 0) return ''

  const body: string[] = []
  for (let i = start; i < lines.length; i += 1) {
    const t = lines[i].trim()
    if (SECTION_HEADERS.test(t) && t.length < 40 && !names.test(t)) break
    if (t) body.push(t)
  }
  return body.join('\n').trim()
}

function looksLikeName(line: string): boolean {
  if (line.length < 3 || line.length > 60) return false
  if (/@|http|linkedin|github|\d{5,}|∙|\|/.test(line)) return false
  if (SECTION_HEADERS.test(line)) return false
  const words = line.split(/\s+/).filter(Boolean)
  if (words.length < 2 || words.length > 5) return false
  return words.every((w) => /^[\p{L}'’-]+$/u.test(w))
}

function extractContacts(text: string): Partial<CandidateProfile> {
  const out: Partial<CandidateProfile> = {}

  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]
  if (email) out.email = email

  const phone = text.match(/(?:\+|00)?\d[\d\s().-]{7,}\d/)?.[0]
  if (phone) out.phone = phone.replace(/\s+/g, ' ').trim()

  const linkedin = text.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/i,
  )?.[0]
  if (linkedin) out.linkedin = asHttpsUrl(linkedin)

  const github = text.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_-]+\/?/i,
  )?.[0]
  if (github) out.github = asHttpsUrl(github)

  const portfolioMatches = [
    ...text.matchAll(
      /(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)/gi,
    ),
  ]
  for (const m of portfolioMatches) {
    const host = m[1] ?? m[0]
    if (/linkedin\.com|github\.com|t\.me|gmail|mail\.ru|yahoo|outlook|google/i.test(host)) {
      continue
    }
    out.portfolio = asHttpsUrl(m[0])
    break
  }

  return out
}

function extractLocation(text: string, lines: string[]): string {
  for (const line of lines.slice(0, 8)) {
    const beforeEmail = line.split(/@/)[0]
    const city = beforeEmail.match(
      /([A-ZА-ЯЁ][\p{L}.-]+(?:\s+[\p{L}.-]+){0,3})\s*[,–—-]\s*([A-ZА-ЯЁ][\p{L}.-]+(?:\s+[\p{L}.-]+){0,2})/u,
    )
    if (city && !/engineer|developer|remote|frontend|backend/i.test(city[0])) {
      return `${city[1]}, ${city[2]}`.replace(/\s+/g, ' ').trim()
    }
    const withCountry = line.match(
      /(Ashgabat|Almaty|Tashkent|Bishkek|Moscow|Berlin|London)[^|∙•]{0,40}/i,
    )
    if (withCountry) {
      return withCountry[0]
        .split(/[|∙•]/)[0]
        .replace(/\s*\(.*$/, '')
        .replace(/\s*[–—-].*$/, '')
        .trim()
    }
  }

  const loose = text.match(
    /\b([A-Z][a-zA-Z.-]+(?:\s+[A-Z][a-zA-Z.-]+)?),\s*([A-Z][a-zA-Z.-]+(?:\s+[A-Z][a-zA-Z.-]+)?)\b/,
  )
  if (loose && !/remote|engineer|developer/i.test(loose[0])) {
    return `${loose[1]}, ${loose[2]}`
  }
  return ''
}

function extractTitle(text: string, lines: string[]): string {
  for (const line of lines.slice(0, 6)) {
    if (looksLikeName(line)) continue
    const title = line.match(
      /\b((?:Senior|Middle|Junior|Lead|Staff)?\s*(?:Frontend|Backend|Full[\s-]?Stack|Software|Web)?\s*(?:Engineer|Developer|Designer))\b/i,
    )
    if (title) return title[1].replace(/\s+/g, ' ').trim()
    if (/^[A-Za-z].{5,50}$/.test(line) && /engineer|developer|designer/i.test(line) && !/@/.test(line)) {
      return line.split(/[·|∙•]/)[0].trim()
    }
  }

  const exp = sectionBody(text, /^(work\s+)?experience\b/i)
  const role = exp.match(
    /^((?:Senior|Middle|Junior|Lead|Staff)?\s*(?:Frontend|Backend|Full[\s-]?Stack|Software|Web)?\s*(?:Engineer|Developer)[^.\n]{0,40})/im,
  )
  return role?.[1]?.replace(/\s+/g, ' ').trim() ?? ''
}

function extractYears(text: string): string {
  const yoe = text.match(/(\d+)\s*\+?\s*(?:YoE|years?(?:\s+of)?(?:\s+experience)?)/i)
  if (yoe) return `${yoe[1]}+`
  return ''
}

function extractSkills(text: string): string {
  const body = sectionBody(text, /^skills\b/i)
  if (!body) {
    const known =
      text.match(
        /\b(JavaScript|TypeScript|Vue(?:\.?js| 3)?|React|Nuxt(?:\.js)?|Next\.js|Tailwind|HTML|CSS|Node\.js|Express|WebSockets?|Yjs|Flutter|Rust|Git)\b/gi,
      ) ?? []
    return [...new Set(known.map((s) => s.trim()))].join(', ')
  }

  const parts = body
    .split(/\n/)
    .map((p) => p.replace(/^(Languages|Frontend|Data\s*&\s*APIs|Engineering|Also)\s*:?\s*/i, '').trim())
    .flatMap((p) => p.split(/,(?![^(]*\))/))
    .map((p) => p.replace(/^[:;]\s*/, '').trim())
    .filter((p) => p.length > 1 && p.length < 50 && !/^(also|languages|frontend|data|engineering)$/i.test(p))

  const cleaned = parts.filter((p) => /[A-Za-zА-Яа-я0-9]/.test(p))
  return [...new Set(cleaned)].slice(0, 30).join(', ')
}

function extractBio(text: string): string {
  const summary = sectionBody(text, /^(summary|profile|about)\b/i)
  if (summary) {
    return summary.replace(/\s+/g, ' ').trim().slice(0, 1200)
  }
  // First long paragraph after name/contacts
  const paras = text.split(/\n\n+/).map((p) => p.replace(/\s+/g, ' ').trim())
  const para = paras.find((p) => p.length > 80 && !/@/.test(p) && !SECTION_HEADERS.test(p))
  return para?.slice(0, 1200) ?? ''
}

/** Pull WORK EXPERIENCE / EXPERIENCE block and keep role structure. */
const ROLE_DATE_RANGE =
  /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4})\s*[–—-]\s*((?:Present|Current|Now)|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4})\s*$/i

function isExperienceRoleHeader(line: string): boolean {
  const t = line.trim()
  if (t.length < 8 || t.length > 120) return false
  if (!ROLE_DATE_RANGE.test(t)) return false
  // Avoid treating long bullet sentences that happen to mention a year range
  if (/^[•●▪-]/.test(t)) return false
  if (/\b(supporting|through|via|from|with|across|used by)\b/i.test(t) && t.length > 70) {
    return false
  }
  return true
}

function parseRoleHeader(line: string): { title: string; start: string; end: string } | null {
  const m = line.trim().match(
    /^(.+?)\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4})\s*[–—-]\s*((?:Present|Current|Now)|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4})\s*$/i,
  )
  if (!m) return null
  return { title: m[1].trim(), start: m[2].trim(), end: m[3].trim() }
}

function cleanCompanyLine(line: string): string {
  return line
    .replace(/\s+(Remote|Hybrid|On-?site|Onsite)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Split a raw experience section into structured roles. */
export function extractExperienceEntries(sectionText: string): Array<{
  title: string
  company: string
  start: string
  end: string
  description: string
}> {
  const lines = sectionText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const roles: Array<{
    title: string
    company: string
    start: string
    end: string
    bullets: string[]
  }> = []

  let current: (typeof roles)[number] | null = null

  for (const line of lines) {
    if (isExperienceRoleHeader(line)) {
      const parsed = parseRoleHeader(line)
      if (parsed) {
        current = {
          title: parsed.title,
          company: '',
          start: parsed.start,
          end: parsed.end,
          bullets: [],
        }
        roles.push(current)
        continue
      }
    }

    if (!current) continue

    if (!current.company && !/^[•●▪-]/.test(line) && line.length < 140) {
      // First non-header line under a role is usually company + location
      current.company = cleanCompanyLine(line)
      continue
    }

    current.bullets.push(line.replace(/^[•●▪\-\s]+/, '').trim())
  }

  // Merge wrapped bullet fragments: short continuation lines without sentence start
  return roles.map((role) => {
    const merged: string[] = []
    for (const bullet of role.bullets) {
      const prev = merged[merged.length - 1]
      const looksContinuation =
        prev &&
        !/^[A-ZА-Я]/.test(bullet) &&
        bullet.length < 80 &&
        !prev.endsWith('.') &&
        !prev.endsWith('!') &&
        !prev.endsWith('?')
      if (looksContinuation) {
        merged[merged.length - 1] = `${prev} ${bullet}`.replace(/\s+/g, ' ')
      } else {
        merged.push(bullet)
      }
    }
    return {
      title: role.title,
      company: role.company,
      start: role.start,
      end: role.end,
      description: merged.join('\n'),
    }
  })
}

function formatExperienceEntries(
  entries: ReturnType<typeof extractExperienceEntries>,
): string {
  return entries
    .map((e) => {
      const role = [e.title, e.company].filter(Boolean).join(' @ ')
      const dates = [e.start, e.end].filter(Boolean).join(' – ')
      const header = [role, dates].filter(Boolean).join(' · ')
      const body = e.description
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => (l.startsWith('•') ? l : `• ${l}`))
        .join('\n')
      return [header, body].filter(Boolean).join('\n')
    })
    .join('\n\n')
}

/**
 * Local resume → profile mapping (no AI).
 * Tuned for text PDFs/DOCX like one-page frontend CVs.
 */
export function parseResumeLocally(resumeText: string): Partial<CandidateProfile> {
  const text = normalizeWhitespace(resumeText)
  if (text.length < 40) {
    throw new Error('Could not read enough text from the resume file.')
  }

  const lines = linesOf(text)
  const out: Partial<CandidateProfile> = {
    ...extractContacts(text),
  }

  const nameLine = lines.find(looksLikeName)
  if (nameLine) out.fullName = nameLine

  const location = extractLocation(text, lines)
  if (location) {
    out.location = location
    const parts = location.split(',').map((p) => p.trim()).filter(Boolean)
    if (parts.length >= 2) {
      out.city = parts[0]
      out.country = parts.slice(1).join(', ')
    } else if (parts.length === 1) {
      out.city = parts[0]
    }
  }

  // Explicit country names often appear in headers
  if (!out.country) {
    const countryHit = text.match(
      /\b(Turkmenistan|Kazakhstan|Uzbekistan|Kyrgyzstan|Russia|Germany|Netherlands|Poland|Portugal|Spain|France|UK|United Kingdom|USA|United States|Canada|Remote)\b/i,
    )
    if (countryHit && !/^remote$/i.test(countryHit[1])) {
      out.country = countryHit[1]
    }
  }

  const title = extractTitle(text, lines)
  if (title) out.currentTitle = title

  const years = extractYears(text)
  if (years) out.yearsExperience = years

  const skills = extractSkills(text)
  if (skills) out.skills = skills

  const experienceSection = sectionBody(text, /^(work\s+)?experience\b/i)
  if (experienceSection) {
    const entries = extractExperienceEntries(experienceSection)
    if (entries.length > 0) {
      out.experienceList = entries
      out.workExperience = formatExperienceEntries(entries).slice(0, 6000)
    } else {
      out.workExperience = experienceSection.slice(0, 6000)
    }
  }

  const education = sectionBody(text, /^education\b/i)
  if (education) out.education = education.slice(0, 2000)

  const languagesSection = sectionBody(text, /^languages?\b/i)
  if (languagesSection) {
    out.languages = languagesSection
      .split(/\n/)
      .map((l) => l.replace(/^[•●▪\-\s]+/, '').trim())
      .filter(Boolean)
      .join(', ')
      .slice(0, 500)
  } else {
    // Often embedded in Skills: "Russian (Native), English (B2)"
    const embedded =
      text.match(
        /((?:Russian|English|Spanish|German|French|Chinese|Turkish|Arabic|Portuguese|Italian|Korean|Japanese)\s*\([^)]+\))(?:\s*,\s*((?:Russian|English|Spanish|German|French|Chinese|Turkish|Arabic|Portuguese|Italian|Korean|Japanese)\s*\([^)]+\)))+/gi,
      )?.[0] ??
      text.match(
        /Russian\s*\([^)]+\)\s*,\s*English\s*\([^)]+\)/i,
      )?.[0]
    if (embedded) out.languages = embedded
  }

  const bio = extractBio(text)
  if (bio) out.bio = bio

  if (out.linkedin) out.linkedin = asHttpsUrl(out.linkedin)
  if (out.github) out.github = asHttpsUrl(out.github)
  if (out.portfolio) out.portfolio = asHttpsUrl(out.portfolio)

  return out
}
