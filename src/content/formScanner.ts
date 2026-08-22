import { detectIntent, intentNeedsLlm } from '../shared/fieldMapper'
import type { FileUploadKind, ScannedFileField } from '../shared/cvTypes'
import type { FieldIntent, ScannedField } from '../shared/types'
import {
  hhFieldHint,
  isHhRuHost,
  looksLikeHhCoverLetter,
  prepareHhRuForm,
} from './sites/hhRu'

const SKIP_TYPES = new Set([
  'hidden',
  'password',
  'submit',
  'button',
  'image',
  'reset',
  'file',
  'color',
  'range',
])

function isVisible(el: HTMLElement): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return false
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  if (style.opacity === '0' && el.tagName !== 'BUTTON') return false
  const rect = el.getBoundingClientRect()
  return rect.width > 0 || rect.height > 0 || el.offsetParent !== null
}

function labelFor(el: HTMLElement): string {
  const id = el.id
  if (id) {
    const byFor = document.querySelector(`label[for="${CSS.escape(id)}"]`)
    if (byFor?.textContent) return byFor.textContent.trim()
  }
  const parentLabel = el.closest('label')
  if (parentLabel?.textContent) {
    const clone = parentLabel.cloneNode(true) as HTMLElement
    clone.querySelectorAll('input, textarea, select, button').forEach((n) => n.remove())
    return clone.textContent?.trim() ?? ''
  }
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    return labelledBy
      .split(/\s+/)
      .map((lid) => document.getElementById(lid)?.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ')
  }

  // Magritte / hh.ru: question title near the control
  if (isHhRuHost()) {
    const hhHint = hhFieldHint(el)
    const block = el.closest(
      '[data-qa*="question" i], [data-qa*="task" i], [data-qa*="response" i], fieldset, li, section',
    )
    if (block) {
      const clone = block.cloneNode(true) as HTMLElement
      clone.querySelectorAll('input, textarea, select, button, svg, script, style').forEach((n) =>
        n.remove(),
      )
      const text = (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (text && text.length >= 3 && text.length < 280) return text
    }
    if (hhHint && /сопровод|письм|вопрос/i.test(hhHint)) {
      const short = hhHint.replace(/\s+/g, ' ').trim().slice(0, 200)
      if (short) return short
    }
  }

  const group = el.closest('div, fieldset, section, li')
  const nearby = group?.querySelector('label')
  if (nearby?.textContent) {
    const clone = nearby.cloneNode(true) as HTMLElement
    clone.querySelectorAll('input, textarea, select, button').forEach((n) => n.remove())
    return clone.textContent?.trim() ?? ''
  }
  return ''
}

function optionTexts(el: HTMLElement): string[] {
  if (!(el instanceof HTMLSelectElement)) return []
  return Array.from(el.options)
    .map((o) => o.textContent?.trim() ?? '')
    .filter(Boolean)
    .slice(0, 60)
}

function stableId(el: HTMLElement, index: number, prefix = ''): string {
  if (el.dataset.applyFillerId) return el.dataset.applyFillerId
  if (el.id) return `${prefix}id:${el.id}`
  const name = el.getAttribute('name')
  if (name) return `${prefix}name:${name}:${index}`
  return `${prefix}idx:${index}`
}

function classifyFileField(hint: string): FileUploadKind {
  const h = hint.toLowerCase().replace(/[_-]+/g, ' ')

  // Cover letter first — never treat these as CV
  if (
    /cover\s*letter|coverletter|motivation\s*letter|letter\s*of\s*interest|сопровод|мотивац|covering\s*letter/i.test(
      h,
    )
  ) {
    return 'cover_letter'
  }
  // name/id shortcuts common in ATS
  if (/\b(cover|motivation|covering)(\s|$)/i.test(h) && /file|upload|attach|document|pdf/i.test(h)) {
    return 'cover_letter'
  }

  if (
    /\bcv\b|\bresume\b|curriculum|résumé|rezume|резюме|lebenslauf|resume\s*file|cv\s*file|upload\s*(your\s*)?(cv|resume)/i.test(
      h,
    )
  ) {
    return 'resume'
  }

  return 'unknown'
}

/** Nearby dropzone / heading text helps when the file input itself is unlabeled. */
function fileFieldContext(el: HTMLInputElement): string {
  const chunks: string[] = []
  const label = labelFor(el)
  if (label) chunks.push(label)

  const group = el.closest(
    'label, div, fieldset, section, li, [class*="upload"], [class*="drop"], [class*="file"]',
  )
  if (group) {
    const clone = group.cloneNode(true) as HTMLElement
    clone.querySelectorAll('input, textarea, select, button, svg').forEach((n) => n.remove())
    const text = (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (text) chunks.push(text.slice(0, 240))
  }

  // Previous sibling heading/label
  let prev = el.previousElementSibling
  for (let i = 0; i < 3 && prev; i += 1) {
    const t = (prev.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (t) chunks.push(t.slice(0, 120))
    prev = prev.previousElementSibling
  }

  return chunks.join(' ')
}

function refineIntent(
  el: HTMLElement,
  base: Pick<
    ScannedField,
    'id' | 'name' | 'placeholder' | 'label' | 'ariaLabel' | 'autocomplete' | 'type' | 'tagName'
  >,
  detected: FieldIntent,
): FieldIntent {
  if (!isHhRuHost()) return detected

  const hint = [base.label, base.placeholder, base.name, base.ariaLabel, hhFieldHint(el)].join(' ')
  if (looksLikeHhCoverLetter(hint, el)) return 'cover_letter'

  // Employer screening questions on vacancy_response
  if (
    (el instanceof HTMLTextAreaElement || base.type === 'text') &&
    detected === 'unknown' &&
    /(вопрос|расскажите|опишите|почему|ваш опыт|готовы ли)/i.test(hint)
  ) {
    return 'custom_question'
  }

  return detected
}

function pushField(
  fields: ScannedField[],
  el: HTMLElement,
  index: number,
  extras: Partial<ScannedField> & { type: string; tagName: string },
) {
  const name = el.getAttribute('name') ?? ''
  const placeholder = el.getAttribute('placeholder') ?? ''
  const ariaLabel = el.getAttribute('aria-label') ?? ''
  const autocomplete = el.getAttribute('autocomplete') ?? ''
  const label = extras.label ?? labelFor(el)
  const id = extras.id ?? stableId(el, index)

  const base = {
    id,
    tagName: extras.tagName,
    type: extras.type,
    name,
    placeholder,
    label,
    ariaLabel,
    autocomplete,
  }

  const intent = refineIntent(el, base, detectIntent(base))
  fields.push({
    ...base,
    options: extras.options ?? optionTexts(el),
    intent,
    needsLlm: intentNeedsLlm(intent),
    currentValue: extras.currentValue ?? '',
    control: extras.control ?? 'native',
  })
  el.dataset.applyFillerId = id
}

function scanCustomButtons(fields: ScannedField[], startIndex: number): number {
  let index = startIndex
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))

  for (const btn of buttons) {
    if (!isVisible(btn)) continue
    const text = (btn.textContent ?? '').trim()
    const aria = btn.getAttribute('aria-label') ?? ''
    const hasPopup = btn.getAttribute('aria-haspopup')
    const looksLikeSelect =
      /select\s+(your\s+)?(country|option|one)|choose\s|pick\s/i.test(text) ||
      hasPopup === 'listbox' ||
      hasPopup === 'true' ||
      btn.getAttribute('role') === 'combobox'

    if (!looksLikeSelect && !/country/i.test(text + aria)) continue
    if (/submit|apply|next|continue|add language|отклик|сопровод/i.test(text)) continue
    if (btn.dataset.applyFillerId) continue

    const label = labelFor(btn) || text
    pushField(fields, btn, index, {
      tagName: 'button',
      type: 'custom_select',
      label,
      currentValue: /select|choose|pick/i.test(text) ? '' : text,
      options: [],
      control: 'custom_button',
      id: stableId(btn, index, 'btn:'),
    })
    index += 1
  }
  return index
}

function isFileInputPresent(el: HTMLInputElement): boolean {
  if (el.disabled) return false
  if (el.getAttribute('aria-hidden') === 'true') return false
  const style = window.getComputedStyle(el)
  if (style.display === 'none') return false
  return true
}

function shouldScanControl(el: HTMLElement, type: string): boolean {
  if (isVisible(el)) return true
  // After prepare, HH letter textarea can still briefly report 0×0 — keep it if letter-like
  if (isHhRuHost() && (type === 'textarea' || el instanceof HTMLTextAreaElement)) {
    return looksLikeHhCoverLetter(hhFieldHint(el), el)
  }
  return false
}

export async function prepareFormForScan(): Promise<void> {
  await prepareHhRuForm()
}

export function scanFormFields(): {
  fields: ScannedField[]
  fileUploadCount: number
  fileFields: ScannedFileField[]
} {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>('input, textarea, select'),
  )

  let fileUploadCount = 0
  const fields: ScannedField[] = []
  const fileFields: ScannedFileField[] = []
  let index = 0
  let fileIndex = 0

  nodes.forEach((el) => {
    const tagName = el.tagName.toLowerCase()
    const type =
      (el instanceof HTMLInputElement ? el.type : tagName === 'textarea' ? 'textarea' : 'select') ||
      'text'

    if (type === 'file' && el instanceof HTMLInputElement) {
      fileUploadCount += 1
      if (!isFileInputPresent(el)) return

      const name = el.getAttribute('name') ?? ''
      const label = labelFor(el)
      const ariaLabel = el.getAttribute('aria-label') ?? ''
      const accept = el.getAttribute('accept') ?? ''
      const context = fileFieldContext(el)
      const hint = [label, name, ariaLabel, accept, el.id, context].join(' ')
      const id = stableId(el, fileIndex, 'file:')
      el.dataset.applyFillerId = id
      fileFields.push({
        id,
        name,
        label: label || ariaLabel || name || context.slice(0, 80) || 'File upload',
        accept,
        kind: classifyFileField(hint),
      })
      fileIndex += 1
      return
    }
    if (SKIP_TYPES.has(type)) return
    if (!shouldScanControl(el, type)) return

    const currentValue =
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        ? el.value
        : el instanceof HTMLSelectElement
          ? el.value
          : ''

    pushField(fields, el, index, {
      tagName,
      type,
      currentValue,
      control: 'native',
    })
    index += 1
  })

  // Single unlabeled file slot → treat as resume. Never guess across multiple unknowns.
  if (fileFields.length === 1 && fileFields[0].kind === 'unknown') {
    fileFields[0].kind = 'resume'
  }

  scanCustomButtons(fields, index)

  return { fields, fileUploadCount, fileFields }
}
