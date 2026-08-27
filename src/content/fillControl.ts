const SKIP_INPUT_TYPES = new Set([
  'hidden',
  'password',
  'submit',
  'button',
  'file',
  'checkbox',
  'radio',
  'color',
  'range',
])

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

function isVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function isEditableControl(el: HTMLElement): boolean {
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) {
    const type = (el.type || 'text').toLowerCase()
    return !SKIP_INPUT_TYPES.has(type)
  }
  return el.isContentEditable || el.getAttribute('contenteditable') === 'true'
}

function controlValue(el: HTMLElement): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value.trim()
  }
  if (el.isContentEditable) return (el.textContent ?? '').trim()
  return ''
}

function fillContentEditable(el: HTMLElement, value: string): boolean {
  if (!value) return false
  el.focus()
  el.textContent = value
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

export function fillControlElement(el: HTMLElement, value: string): boolean {
  if (!value.trim() || !isEditableControl(el)) return false

  try {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus()
      let v = value
      if (el instanceof HTMLInputElement && el.type === 'number') {
        v = v.replace(/[^\d.]/g, '')
      }
      setNativeValue(el, v)
      dispatchInputEvents(el)
      return true
    }

    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
      return fillContentEditable(el, value)
    }
  } catch {
    return false
  }

  return false
}

function editableAncestor(node: Node | null): HTMLElement | null {
  let cur: Node | null = node
  while (cur) {
    if (cur instanceof HTMLElement && isEditableControl(cur) && isVisible(cur)) {
      return cur
    }
    cur = cur.parentNode
  }
  return null
}

function rectCenter(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function fieldHint(el: HTMLElement): string {
  return [
    el.getAttribute('aria-label') ?? '',
    el.getAttribute('placeholder') ?? '',
    el.getAttribute('name') ?? '',
    el.id,
    el.closest('label')?.textContent ?? '',
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Pick the best input/textarea near a text selection. */
export function findFillTargetNearSelection(params: {
  anchorNode: Node | null
  focusNode: Node | null
  selectionRect: DOMRect
}): HTMLElement | null {
  const { anchorNode, focusNode, selectionRect } = params
  const anchor = rectCenter(selectionRect)

  const inside = editableAncestor(anchorNode) || editableAncestor(focusNode)
  if (inside) return inside

  const active = document.activeElement
  if (active instanceof HTMLElement && isEditableControl(active) && isVisible(active)) {
    if (!controlValue(active)) return active
  }

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      'textarea, input, [contenteditable="true"]',
    ),
  ).filter((el) => isVisible(el) && isEditableControl(el))

  let best: HTMLElement | null = null
  let bestScore = -Infinity

  for (const el of candidates) {
    const rect = el.getBoundingClientRect()
    const center = rectCenter(rect)
    let score = 0

    const dist = distance(anchor, center)
    score -= dist * 0.15

    // Prefer fields below or beside the question
    if (rect.top >= selectionRect.top - 40) score += 40
    if (rect.top >= selectionRect.bottom - 20) score += 30

    const empty = !controlValue(el)
    if (empty) score += 50

    if (el instanceof HTMLTextAreaElement) score += 25
    if (el.isContentEditable) score += 15

    const hint = fieldHint(el)
    if (/answer|response|comment|опис|ответ|коммент|письм|cover|motivation/i.test(hint)) {
      score += 20
    }

    if (score > bestScore) {
      bestScore = score
      best = el
    }
  }

  return bestScore > 0 ? best : null
}

export function markFillTarget(el: HTMLElement): void {
  el.dataset.applyFillerAiTarget = '1'
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  el.focus()
}
