/** HeadHunter (hh.ru) form helpers — Magritte UI, letter toggle, response page. */

const HH_HOST =
  /(^|\.)(hh\.(ru|kz|uz|ge|az)|headhunter\.(kz|kg|ge)|rabota\.by|jobs\.tut\.by)$/i

export function isHhRuHost(hostname = location.hostname): boolean {
  return HH_HOST.test(hostname.replace(/^www\./, ''))
}

export function isHhVacancyResponsePage(href = location.href): boolean {
  return /\/applicant\/vacancy_response\b/i.test(href) || /[?&]vacancyId=/i.test(href)
}

function visibleEnough(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  const rect = el.getBoundingClientRect()
  return rect.width > 0 || rect.height > 0 || el.offsetParent !== null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Expand collapsed “сопроводительное письмо” before scan/fill. */
export async function prepareHhRuForm(): Promise<void> {
  if (!isHhRuHost()) return

  const toggles = Array.from(
    document.querySelectorAll<HTMLElement>(
      [
        '[data-qa="vacancy-response-letter-toggle"]',
        '[data-qa*="letter-toggle" i]',
        '[data-qa*="response-letter" i]',
        'button[data-qa*="letter" i]',
      ].join(', '),
    ),
  )

  for (const btn of toggles) {
    if (!visibleEnough(btn)) continue
    const text = (btn.textContent ?? '').replace(/\s+/g, ' ').trim()
    const qa = btn.getAttribute('data-qa') ?? ''
    const looksToggle =
      /letter-toggle/i.test(qa) ||
      /сопровод/i.test(text) ||
      (/письм/i.test(text) && /добав|прикреп|написать|открыть/i.test(text))
    if (!looksToggle) continue
    // Already expanded → button often says “Удалить” / hide
    if (/удал|скрыть|убрать/i.test(text) && !/добав|прикреп|написать/i.test(text)) continue
    btn.click()
    await sleep(350)
    break
  }

  // Fallback: text buttons without data-qa
  if (!findHhRuCoverLetterTextarea()) {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
    for (const btn of buttons) {
      if (!visibleEnough(btn)) continue
      const text = (btn.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (
        /сопровод/i.test(text) &&
        /добав|прикреп|написать/i.test(text) &&
        !/удал|скрыть/i.test(text)
      ) {
        btn.click()
        await sleep(350)
        break
      }
    }
  }
}

export function hhFieldHint(el: HTMLElement): string {
  const chunks = [
    el.getAttribute('data-qa') ?? '',
    el.getAttribute('name') ?? '',
    el.getAttribute('placeholder') ?? '',
    el.getAttribute('aria-label') ?? '',
    el.id,
  ]

  const labeled = el.closest('[data-qa]')
  if (labeled && labeled !== el) {
    chunks.push(labeled.getAttribute('data-qa') ?? '')
  }

  // Magritte often puts the question title in a sibling / parent block
  const block = el.closest(
    '[data-qa*="response" i], [data-qa*="question" i], [data-qa*="task" i], [class*="magritte"], form, fieldset, li, section, div',
  )
  if (block) {
    const title = block.querySelector(
      '[data-qa*="title" i], [data-qa*="label" i], legend, h1, h2, h3, h4, label, p, span',
    )
    const t = (title?.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (t && t.length < 220) chunks.push(t)
  }

  return chunks.filter(Boolean).join(' ')
}

export function looksLikeHhCoverLetter(hint: string, el?: HTMLElement): boolean {
  const h = hint.toLowerCase()
  if (/сопровод|cover\s*letter|motivation\s*letter|covering\s*letter/i.test(h)) return true
  if (/письм/.test(h) && /отклик|вакан|сопровод|cover|letter|напиш/i.test(h)) return true
  if (el?.getAttribute('name') === 'text' && (isHhVacancyResponsePage() || /letter|response/i.test(h))) {
    return true
  }
  const qa = el?.getAttribute('data-qa') ?? ''
  if (/letter/i.test(qa) && !/delete|remove|toggle/i.test(qa)) return true
  return false
}

export function findHhRuCoverLetterTextarea(): HTMLTextAreaElement | null {
  const selectors = [
    'textarea[data-qa*="letter" i]',
    'textarea[name="text"]',
    'textarea[placeholder*="сопровод" i]',
    'textarea[placeholder*="письм" i]',
    'textarea[aria-label*="сопровод" i]',
    'textarea[aria-label*="письм" i]',
    '[data-qa="vacancy-response-popup-form"] textarea',
    '[data-qa*="vacancy-response" i] textarea',
  ]

  for (const sel of selectors) {
    const nodes = Array.from(document.querySelectorAll<HTMLTextAreaElement>(sel))
    for (const el of nodes) {
      const hint = hhFieldHint(el)
      if (looksLikeHhCoverLetter(hint, el) || sel.includes('letter') || el.name === 'text') {
        return el
      }
    }
  }

  // Last resort on response page: single large textarea
  if (isHhVacancyResponsePage()) {
    const areas = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea')).filter(
      (el) => !el.disabled,
    )
    if (areas.length === 1) return areas[0]
    const letterish = areas.find((el) => looksLikeHhCoverLetter(hhFieldHint(el), el))
    if (letterish) return letterish
  }

  return null
}

export function findHhRuContentEditableLetter(): HTMLElement | null {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>('[contenteditable="true"]'),
  )
  for (const el of nodes) {
    if (!visibleEnough(el) && !isHhVacancyResponsePage()) continue
    if (looksLikeHhCoverLetter(hhFieldHint(el), el)) return el
  }
  return null
}
