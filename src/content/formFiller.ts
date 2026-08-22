import type { FieldAnswer } from '../shared/types'
import { expandPreferenceAliases } from '../shared/preferenceValues'
import { base64ToUint8Array } from '../shared/cvStorage'
import type { ScannedFileField } from '../shared/cvTypes'
import {
  findHhRuContentEditableLetter,
  findHhRuCoverLetterTextarea,
  isHhRuHost,
  prepareHhRuForm,
} from './sites/hhRu'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
  descriptor?.set?.call(el, value)
}

function dispatchInputEvents(el: HTMLElement) {
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  el.dispatchEvent(
    new InputEvent('input', { bubbles: true, data: undefined, inputType: 'insertText' }),
  )
}

function findByFieldId(id: string): HTMLElement | null {
  const marked = document.querySelector<HTMLElement>(
    `[data-apply-filler-id="${CSS.escape(id)}"]`,
  )
  if (marked) return marked

  if (id.startsWith('btn:id:') || id.startsWith('file:id:')) {
    const raw = id.replace(/^(btn|file):/, '')
    return document.getElementById(raw.slice('id:'.length))
  }
  if (id.startsWith('id:')) return document.getElementById(id.slice(3))
  if (id.startsWith('name:') || id.startsWith('btn:name:') || id.startsWith('file:name:')) {
    const raw = id.replace(/^(btn|file):/, '')
    const without = raw.slice('name:'.length)
    const lastColon = without.lastIndexOf(':')
    const name = lastColon >= 0 ? without.slice(0, lastColon) : without
    return document.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`)
  }
  return null
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function rawScore(candidate: string, wanted: string): number {
  const a = normalize(candidate)
  const b = normalize(wanted)
  if (!a || !b) return 0
  if (a === b) return 100
  if (a.includes(b) || b.includes(a)) return 80
  const at = new Set(a.split(/[\s,/|()–—-]+/).filter(Boolean))
  const bt = b.split(/[\s,/|()–—-]+/).filter(Boolean)
  const hit = bt.filter((t) => at.has(t) || [...at].some((x) => x.includes(t) || t.includes(x)))
  if (hit.length && hit.length === bt.length) return 70
  if (hit.length) return 40 + hit.length * 5
  return 0
}

function scoreMatch(candidate: string, wanted: string): number {
  let best = rawScore(candidate, wanted)
  for (const w of expandPreferenceAliases(wanted)) {
    best = Math.max(best, rawScore(candidate, w))
  }
  for (const c of expandPreferenceAliases(candidate)) {
    best = Math.max(best, rawScore(c, wanted))
  }
  return best
}

function fillSelect(el: HTMLSelectElement, value: string): boolean {
  const options = Array.from(el.options)
  let best: HTMLOptionElement | undefined
  let bestScore = 0
  for (const o of options) {
    const label = (o.textContent ?? '').trim()
    const score = Math.max(scoreMatch(label, value), scoreMatch(o.value, value))
    if (score > bestScore) {
      bestScore = score
      best = o
    }
  }

  if (!best && options.length) {
    if (/^(yes|y|true|да)$/i.test(value)) {
      best = options.find((o) => /yes|true|да/i.test(o.textContent ?? ''))
      bestScore = best ? 60 : 0
    } else if (/^(no|n|false|нет)$/i.test(value)) {
      best = options.find((o) => /no|false|нет/i.test(o.textContent ?? ''))
      bestScore = best ? 60 : 0
    }
  }

  if (!best || bestScore < 40) return false
  el.value = best.value
  dispatchInputEvents(el)
  return true
}

function fillCheckboxOrRadio(el: HTMLInputElement, value: string): boolean {
  const truthy = /^(yes|y|true|1|on|да)$/i.test(value.trim())
  const falsy = /^(no|n|false|0|off|нет)$/i.test(value.trim())

  if (el.type === 'checkbox') {
    el.checked = truthy || (!falsy && value.trim().length > 0 && value !== 'false')
    dispatchInputEvents(el)
    return true
  }

  if (el.type === 'radio') {
    const name = el.name
    if (!name) {
      el.checked = truthy
      dispatchInputEvents(el)
      return true
    }
    const group = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        `input[type="radio"][name="${CSS.escape(name)}"]`,
      ),
    )
    let best: HTMLInputElement | undefined
    let bestScore = 0
    for (const r of group) {
      const lab =
        r.labels?.[0]?.textContent?.trim() ||
        r.getAttribute('aria-label') ||
        r.value ||
        ''
      const score = scoreMatch(lab, value)
      if (score > bestScore) {
        bestScore = score
        best = r
      }
    }
    if (!best) {
      if (truthy) {
        best = group.find((r) => /yes|true|да/i.test(r.value + (r.labels?.[0]?.textContent ?? '')))
      } else if (falsy) {
        best = group.find((r) => /no|false|нет/i.test(r.value + (r.labels?.[0]?.textContent ?? '')))
      }
    }
    if (!best) return false
    best.checked = true
    dispatchInputEvents(best)
    return true
  }

  return false
}

async function fillCustomButton(btn: HTMLElement, value: string): Promise<boolean> {
  btn.click()
  await sleep(180)

  const selectors = [
    '[role="option"]',
    '[role="listbox"] [role="option"]',
    '[data-radix-collection-item]',
    'li[role="option"]',
    '[class*="option"]',
    '[class*="Option"]',
    '[class*="menu"] button',
    '[class*="Menu"] button',
    '[class*="dropdown"] button',
    '[class*="listbox"] div',
    'ul li button',
    'ul li',
  ]

  const candidates: HTMLElement[] = []
  for (const sel of selectors) {
    document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      if (isVisibleLoose(el)) candidates.push(el)
    })
  }

  let best: HTMLElement | undefined
  let bestScore = 0
  for (const el of candidates) {
    const text = (el.textContent ?? '').trim()
    if (!text || text.length > 80) continue
    const score = scoreMatch(text, value)
    if (score > bestScore) {
      bestScore = score
      best = el
    }
  }

  if (!best || bestScore < 40) {
    // close by Escape
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    return false
  }

  best.click()
  await sleep(80)
  return true
}

function isVisibleLoose(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function fillContentEditable(el: HTMLElement, value: string): boolean {
  if (!value) return false
  el.focus()
  el.textContent = value
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

export async function fillFields(
  answers: FieldAnswer[],
  coverLetter: string,
  cvFile?: { name: string; mimeType: string; dataBase64: string } | null,
  fileFields: ScannedFileField[] = [],
): Promise<{ filled: number; skipped: number; filesFilled: number }> {
  let filled = 0
  let skipped = 0
  let filesFilled = 0

  if (isHhRuHost()) {
    await prepareHhRuForm()
  }

  const withCover = [...answers]
  if (coverLetter) {
    const hasCover = answers.some((a) => {
      const el = findByFieldId(a.id)
      if (!el) return false
      const hint = [
        el.getAttribute('name'),
        el.getAttribute('placeholder'),
        el.getAttribute('aria-label'),
        el.getAttribute('data-qa'),
        el.id,
      ]
        .filter(Boolean)
        .join(' ')
      return /cover|motivation|сопровод|мотивац|письм|letter|^text$/i.test(hint)
    })
    if (!hasCover) {
      const textarea =
        findHhRuCoverLetterTextarea() ||
        document.querySelector<HTMLTextAreaElement>(
          [
            'textarea[name*="cover" i]',
            'textarea[id*="cover" i]',
            'textarea[placeholder*="cover" i]',
            'textarea[aria-label*="cover" i]',
            'textarea[placeholder*="сопровод" i]',
            'textarea[placeholder*="письм" i]',
            'textarea[name="text"]',
          ].join(', '),
        )
      if (textarea) {
        if (!textarea.dataset.applyFillerId) textarea.dataset.applyFillerId = 'cover-fallback'
        withCover.push({ id: textarea.dataset.applyFillerId, value: coverLetter })
      } else {
        const editable = findHhRuContentEditableLetter()
        if (editable) {
          if (!editable.dataset.applyFillerId) editable.dataset.applyFillerId = 'cover-editable'
          withCover.push({ id: editable.dataset.applyFillerId, value: coverLetter })
        }
      }
    }
  }

  for (const answer of withCover) {
    const el = findByFieldId(answer.id)
    if (!el) {
      skipped += 1
      continue
    }

    try {
      if (el.tagName === 'BUTTON' || el.dataset.applyFillerId?.startsWith('btn:')) {
        if (await fillCustomButton(el, answer.value)) filled += 1
        else skipped += 1
        continue
      }

      if (el instanceof HTMLSelectElement) {
        if (fillSelect(el, answer.value)) filled += 1
        else skipped += 1
        continue
      }

      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
        if (fillCheckboxOrRadio(el, answer.value)) filled += 1
        else skipped += 1
        continue
      }

      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.focus()
        let value = answer.value
        if (el instanceof HTMLInputElement && el.type === 'number') {
          value = value.replace(/[^\d.]/g, '')
        }
        if (!value) {
          skipped += 1
          continue
        }
        setNativeValue(el, value)
        dispatchInputEvents(el)
        filled += 1
        continue
      }

      if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
        if (fillContentEditable(el, answer.value)) filled += 1
        else skipped += 1
        continue
      }

      skipped += 1
    } catch {
      skipped += 1
    }
  }

  if (cvFile?.dataBase64) {
    filesFilled = await fillResumeFileInputs(cvFile, fileFields)
  }

  return { filled, skipped, filesFilled }
}

function acceptsFile(input: HTMLInputElement, mimeType: string, fileName: string): boolean {
  const accept = (input.getAttribute('accept') ?? '').trim()
  if (!accept) return true
  const tokens = accept.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
  if (tokens.length === 0) return true
  const mime = mimeType.toLowerCase()
  const name = fileName.toLowerCase()
  const ext = name.includes('.') ? `.${name.split('.').pop()}` : ''

  return tokens.some((t) => {
    if (t === '*/*' || t === 'application/*') return true
    if (t.startsWith('.')) return ext === t
    if (t.endsWith('/*')) return mime.startsWith(t.slice(0, -1))
    return mime === t
  })
}

async function fillResumeFileInputs(
  cvFile: { name: string; mimeType: string; dataBase64: string },
  fileFields: ScannedFileField[],
): Promise<number> {
  const bytes = base64ToUint8Array(cvFile.dataBase64)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const blob = new Blob([copy], {
    type: cvFile.mimeType || 'application/pdf',
  })
  const file = new File([blob], cvFile.name, {
    type: cvFile.mimeType || 'application/pdf',
    lastModified: Date.now(),
  })

  // Strict: only explicit resume slots. Fallback only when a single non-cover field exists.
  const resumes = fileFields.filter((f) => f.kind === 'resume')
  const coverLetters = fileFields.filter((f) => f.kind === 'cover_letter')
  let targets = resumes
  if (targets.length === 0) {
    const nonCover = fileFields.filter((f) => f.kind !== 'cover_letter')
    if (nonCover.length === 1 && coverLetters.length >= 0) {
      targets = nonCover
    }
  }

  let attached = 0
  for (const field of targets) {
    if (field.kind === 'cover_letter') continue
    const el = findByFieldId(field.id)
    if (!(el instanceof HTMLInputElement) || el.type !== 'file') continue
    // Re-check live DOM labels in case scan missed cover-letter wording
    const liveHint = [
      field.label,
      field.name,
      el.getAttribute('name'),
      el.getAttribute('aria-label'),
      el.id,
      el.closest('label')?.textContent,
    ]
      .filter(Boolean)
      .join(' ')
    if (/cover\s*letter|coverletter|motivation\s*letter|сопровод|мотивац/i.test(liveHint)) {
      continue
    }
    if (!acceptsFile(el, file.type, file.name)) continue
    try {
      const dt = new DataTransfer()
      dt.items.add(file)
      el.files = dt.files
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      attached += 1
    } catch {
      // Some sites harden file inputs
    }
  }
  return attached
}
