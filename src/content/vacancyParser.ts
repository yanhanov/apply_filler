import type { VacancyInfo } from '../shared/types'

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

function pickMainRoot(): Element {
  const candidates = [
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
  const fromMeta =
    metaContent('og:site_name') ||
    metaContent('application-name') ||
    metaContent('author')
  if (fromMeta) return fromMeta

  const heading = document.querySelector(
    'h1 + p, h1 ~ .company, [class*="company"], [data-company]',
  )
  const text = heading?.textContent?.trim()
  if (text && text.length < 80) return text

  const host = location.hostname.replace(/^www\./, '')
  return host.split('.')[0] || ''
}

export function parseVacancy(): VacancyInfo {
  const title =
    document.querySelector('h1')?.textContent?.trim() ||
    metaContent('og:title') ||
    document.title

  const descriptionMeta = metaContent('description') || metaContent('og:description')
  const mainText = cleanText(pickMainRoot().textContent ?? '')
  const description = cleanText(
    [descriptionMeta, mainText].filter(Boolean).join('\n\n'),
  ).slice(0, MAX_CHARS)

  return {
    title: cleanText(title).slice(0, 300),
    company: cleanText(guessCompany()).slice(0, 120),
    description,
    pageUrl: location.href,
  }
}
