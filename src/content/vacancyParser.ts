import type { VacancyInfo } from '../shared/types'
import { isHhRuHost, isHhVacancyResponsePage } from './sites/hhRu'

const MAX_CHARS = 10000

function metaContent(name: string): string {
  const el =
    document.querySelector(`meta[name="${name}"]`) ||
    document.querySelector(`meta[property="${name}"]`) ||
    document.querySelector(`meta[property="og:${name}"]`)
  return el?.getAttribute('content')?.trim() ?? ''
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function parseJsonLdJobPosting(): { title?: string; company?: string; description?: string } {
  const scripts = Array.from(
    document.querySelectorAll('script[type="application/ld+json"]'),
  )
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || '')
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        const graph = item?.['@graph']
        const candidates = Array.isArray(graph) ? [...items, ...graph] : items
        for (const node of candidates) {
          const type = node?.['@type']
          const types = Array.isArray(type) ? type : [type]
          if (!types.some((t) => String(t).toLowerCase() === 'jobposting')) continue
          const company =
            node.hiringOrganization?.name ||
            (typeof node.hiringOrganization === 'string' ? node.hiringOrganization : '') ||
            ''
          return {
            title: typeof node.title === 'string' ? node.title : undefined,
            company: typeof company === 'string' ? company : undefined,
            description:
              typeof node.description === 'string'
                ? cleanText(node.description.replace(/<[^>]+>/g, ' '))
                : undefined,
          }
        }
      }
    } catch {
      // ignore invalid JSON-LD
    }
  }
  return {}
}

function pickMainRoot(): Element {
  const hhSelectors = isHhRuHost()
    ? [
        document.querySelector('[data-qa="vacancy-description"]'),
        document.querySelector('[data-qa="vacancy-view-description"]'),
        document.querySelector('[data-qa*="vacancy-description" i]'),
        document.querySelector('.vacancy-description'),
        document.querySelector('[class*="vacancy-description"]'),
      ]
    : []

  const candidates = [
    ...hhSelectors,
    document.querySelector('article'),
    document.querySelector('[role="main"]'),
    document.querySelector('main'),
    document.querySelector('#content'),
    document.querySelector('.job-description'),
    document.querySelector('[class*="jobDescription"]'),
    document.querySelector('[class*="job-description"]'),
    document.querySelector('[data-testid*="job"]'),
  ].filter(Boolean) as Element[]

  if (candidates.length > 0) {
    return candidates.sort(
      (a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0),
    )[0]
  }

  let best: Element = document.body
  let bestScore = 0
  const walk = document.body.querySelectorAll('div, section, article')
  for (const el of walk) {
    if (el.querySelector('input, textarea, select')) continue
    const len = el.textContent?.length ?? 0
    if (len > bestScore && len < 80000) {
      bestScore = len
      best = el
    }
  }
  return best
}

function guessCompany(): string {
  if (isHhRuHost()) {
    const hhCompany =
      document.querySelector('[data-qa="vacancy-company-name"]')?.textContent?.trim() ||
      document.querySelector('[data-qa*="company-name" i]')?.textContent?.trim() ||
      document.querySelector('[data-qa="bloko-header-2"] a')?.textContent?.trim()
    if (hhCompany && hhCompany.length < 120) return hhCompany
  }

  const fromMeta =
    metaContent('og:site_name') ||
    metaContent('application-name') ||
    metaContent('author')
  if (fromMeta && !/^hh(\.|$)/i.test(fromMeta)) return fromMeta

  const heading = document.querySelector(
    'h1 + p, h1 ~ .company, [class*="company"], [data-company]',
  )
  const text = heading?.textContent?.trim()
  if (text && text.length < 80) return text

  const host = location.hostname.replace(/^www\./, '')
  return host.split('.')[0] || ''
}

function hhResponsePageTitle(): string {
  if (!isHhVacancyResponsePage()) return ''
  const fromHeading =
    document.querySelector('h1')?.textContent?.trim() ||
    document.querySelector('[data-qa*="vacancy-title" i]')?.textContent?.trim() ||
    ''
  if (fromHeading && !/регистрац|вход|логин/i.test(fromHeading)) return fromHeading

  // Title often: "Отклик на вакансию «X»" or document.title
  const raw = document.title
  const m =
    raw.match(/«([^»]+)»/) ||
    raw.match(/"([^"]+)"/) ||
    raw.match(/отклик.*?ваканси[юя]\s*(.+)$/i)
  return m?.[1]?.trim() || ''
}

export function parseVacancy(): VacancyInfo {
  const ld = parseJsonLdJobPosting()

  const title =
    ld.title ||
    document.querySelector('[data-qa="vacancy-title"]')?.textContent?.trim() ||
    document.querySelector('h1[data-qa="bloko-header-1"]')?.textContent?.trim() ||
    document.querySelector('h1')?.textContent?.trim() ||
    hhResponsePageTitle() ||
    metaContent('og:title') ||
    document.title

  const descriptionMeta = metaContent('description') || metaContent('og:description')
  const mainText = cleanText(pickMainRoot().textContent ?? '')
  const description = cleanText(
    [ld.description, descriptionMeta, mainText].filter(Boolean).join('\n\n'),
  ).slice(0, MAX_CHARS)

  return {
    title: cleanText(title).slice(0, 300),
    company: cleanText(ld.company || guessCompany()).slice(0, 120),
    description,
    pageUrl: location.href,
  }
}
