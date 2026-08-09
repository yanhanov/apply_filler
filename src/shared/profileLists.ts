import type {
  CandidateProfile,
  EducationEntry,
  ExperienceEntry,
  LanguageEntry,
} from './types'

const LANGUAGE_LEVELS = [
  'Native',
  'C2',
  'C1',
  'B2',
  'B1',
  'A2',
  'A1',
  'Fluent',
  'Professional',
  'Conversational',
  'Basic',
] as const

export { LANGUAGE_LEVELS }

export function formatLanguages(list: LanguageEntry[]): string {
  return list
    .filter((l) => l.name.trim())
    .map((l) => {
      const name = l.name.trim()
      const level = l.level.trim()
      return level ? `${name} (${level})` : name
    })
    .join(', ')
}

export function formatEducation(list: EducationEntry[]): string {
  return list
    .filter((e) => e.school.trim() || e.degree.trim())
    .map((e) => {
      const parts = [e.degree.trim(), e.school.trim()].filter(Boolean)
      const head = parts.join(' — ')
      return e.years.trim() ? `${head} (${e.years.trim()})` : head
    })
    .join('\n')
}

export function formatExperience(list: ExperienceEntry[]): string {
  return list
    .filter((e) => e.title.trim() || e.company.trim() || e.description.trim())
    .map((e) => {
      const role = [e.title.trim(), e.company.trim()].filter(Boolean).join(' @ ')
      const dates = [e.start.trim(), e.end.trim()].filter(Boolean).join(' – ')
      const header = [role, dates].filter(Boolean).join(' · ')
      const body = e.description.trim()
      return [header, body].filter(Boolean).join('\n')
    })
    .join('\n\n')
}

export function syncProfileListStrings(profile: CandidateProfile): CandidateProfile {
  return {
    ...profile,
    skills: profile.skillsList.map((s) => s.trim()).filter(Boolean).join(', '),
    languages: formatLanguages(profile.languagesList),
    education: formatEducation(profile.educationList),
    workExperience: formatExperience(profile.experienceList),
  }
}

export function parseSkills(text: string): string[] {
  return text
    .split(/[,;\n|•·]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function parseLanguages(text: string): LanguageEntry[] {
  if (!text.trim()) return []
  return text
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.+?)\s*[—(]\s*([^)]+)\s*\)?$/)
      if (m) return { name: m[1].trim(), level: m[2].trim() }
      const spaced = part.match(/^(.+?)\s*[-–:]\s*(.+)$/)
      if (spaced) return { name: spaced[1].trim(), level: spaced[2].trim() }
      return { name: part, level: '' }
    })
}

export function parseEducation(text: string): EducationEntry[] {
  if (!text.trim()) return []
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const years = line.match(/\(([^)]+)\)\s*$/)
      const rest = years ? line.slice(0, years.index).trim() : line
      const [degree, school] = rest.includes(' — ')
        ? rest.split(/\s*—\s*/, 2)
        : rest.includes(' - ')
          ? rest.split(/\s+-\s+/, 2)
          : [rest, '']
      return {
        degree: (degree ?? '').trim(),
        school: (school ?? '').trim(),
        years: years?.[1]?.trim() ?? '',
      }
    })
}

export function parseExperience(text: string): ExperienceEntry[] {
  if (!text.trim()) return []

  // Prefer splitting on title + date-range headers (CV style), even without blank lines
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const roleHeaderRe =
    /^(.+?)\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4})\s*[–—-]\s*((?:Present|Current|Now)|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4})\s*$/i

  const headerIndexes: number[] = []
  for (let i = 0; i < lines.length; i += 1) {
    if (roleHeaderRe.test(lines[i]) && lines[i].length <= 120) {
      headerIndexes.push(i)
    }
  }

  if (headerIndexes.length >= 2) {
    const entries: ExperienceEntry[] = []
    for (let h = 0; h < headerIndexes.length; h += 1) {
      const startIdx = headerIndexes[h]
      const endIdx = headerIndexes[h + 1] ?? lines.length
      const chunk = lines.slice(startIdx, endIdx)
      const header = chunk[0].match(roleHeaderRe)!
      let company = ''
      let descStart = 1
      if (chunk[1] && !/^[•●▪-]/.test(chunk[1]) && chunk[1].length < 140) {
        company = chunk[1]
          .replace(/\s+(Remote|Hybrid|On-?site|Onsite)\s*$/i, '')
          .replace(/\s{2,}/g, ' ')
          .trim()
        descStart = 2
      }
      // Also support "Title @ Company · dates" single-line format produced by sync
      entries.push({
        title: header[1].trim(),
        company,
        start: header[2].trim(),
        end: header[3].trim(),
        description: chunk
          .slice(descStart)
          .map((l) => l.replace(/^[•●▪\-\s]+/, '').trim())
          .filter(Boolean)
          .join('\n'),
      })
    }
    return entries
  }

  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)

  return blocks.map((block) => {
    const blockLines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    if (blockLines.length === 0) {
      return { title: '', company: '', start: '', end: '', description: '' }
    }

    let title = ''
    let company = ''
    let start = ''
    let end = ''
    let descStart = 1

    const header = blockLines[0]
    const atMatch = header.match(/^(.+?)\s+@\s+(.+?)(?:\s+·\s+(.+))?$/)
    if (atMatch) {
      title = atMatch[1].trim()
      company = atMatch[2].trim()
      if (atMatch[3]) {
        const [s, e] = atMatch[3].split(/\s*[–—-]\s*/)
        start = (s ?? '').trim()
        end = (e ?? '').trim()
      }
    } else {
      const dated = header.match(roleHeaderRe)
      if (dated) {
        title = dated[1].trim()
        start = dated[2].trim()
        end = dated[3].trim()
        if (blockLines[1] && !/^[•●▪-]/.test(blockLines[1])) {
          company = blockLines[1]
            .replace(/\s+(Remote|Hybrid|On-?site|Onsite)\s*$/i, '')
            .trim()
          descStart = 2
        }
      } else {
        title = header
        const second = blockLines[1] ?? ''
        const dateOnly = second.match(
          /^((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})\s*[–—-]\s*(.+)$/i,
        )
        const companyDate = second.match(/^(.+?)\s+·\s+(.+)$/)
        if (companyDate) {
          company = companyDate[1].trim()
          const [s, e] = companyDate[2].split(/\s*[–—-]\s*/)
          start = (s ?? '').trim()
          end = (e ?? '').trim()
          descStart = 2
        } else if (dateOnly) {
          start = dateOnly[1].trim()
          end = dateOnly[2].trim()
          descStart = 2
        } else {
          const inlineDates = header.match(
            /^(.+?)\s+·\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})\s*[–—-]\s*(.+)$/i,
          )
          if (inlineDates) {
            title = inlineDates[1].trim()
            start = inlineDates[2].trim()
            end = inlineDates[3].trim()
          }
        }
      }
    }

    const description = blockLines
      .slice(descStart)
      .map((l) => l.replace(/^[•●▪\-\s]+/, '').trim())
      .filter(Boolean)
      .join('\n')

    return { title, company, start, end, description }
  })
}

/** Prefer structured lists; fall back to parsing legacy string fields. */
export function hydrateProfileLists(profile: CandidateProfile): CandidateProfile {
  const skillsList =
    profile.skillsList?.length > 0 ? profile.skillsList : parseSkills(profile.skills)
  const languagesList =
    profile.languagesList?.length > 0
      ? profile.languagesList
      : parseLanguages(profile.languages)
  const educationList =
    profile.educationList?.length > 0
      ? profile.educationList
      : parseEducation(profile.education)
  const experienceList =
    profile.experienceList?.length > 0
      ? profile.experienceList
      : parseExperience(profile.workExperience)

  return syncProfileListStrings({
    ...profile,
    skillsList,
    languagesList,
    educationList,
    experienceList,
  })
}
