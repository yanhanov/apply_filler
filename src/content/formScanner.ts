import { detectIntent, intentNeedsLlm } from '../shared/fieldMapper'
import type { FileUploadKind, ScannedFileField } from '../shared/cvTypes'
import type { ScannedField } from '../shared/types'

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
  const h = hint.toLowerCase()
  if (/cover\s*letter|motivation|сопровод|мотивац|letter\s*of\s*interest/i.test(h)) {
    return 'cover_letter'
  }
  if (
    /\bcv\b|resume|curriculum|résumé|rezume|резюме|lebenslauf|attach.*(cv|resume)/i.test(h)
  ) {
    return 'resume'
  }
  return 'unknown'
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

  const intent = detectIntent(base)
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
    if (/submit|apply|next|continue|add language/i.test(text)) continue
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
      const hint = [label, name, ariaLabel, accept, el.id].join(' ')
      const id = stableId(el, fileIndex, 'file:')
      el.dataset.applyFillerId = id
      fileFields.push({
        id,
        name,
        label: label || ariaLabel || name || 'File upload',
        accept,
        kind: classifyFileField(hint),
      })
      fileIndex += 1
      return
    }
    if (SKIP_TYPES.has(type)) return
    if (!isVisible(el)) return

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

  if (fileFields.length === 1 && fileFields[0].kind === 'unknown') {
    fileFields[0].kind = 'resume'
  }

  scanCustomButtons(fields, index)

  return { fields, fileUploadCount, fileFields }
}
