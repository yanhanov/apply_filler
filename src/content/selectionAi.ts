import { runtimeSendMessage } from '../shared/messaging'
import type { AiAnswerResponse, VacancyInfo } from '../shared/types'
import { fillControlElement, findFillTargetNearSelection, markFillTarget } from './fillControl'
import { parseVacancy } from './vacancyParser'

const ROOT_ID = 'apply-filler-ai-root'
const MIN_SELECTION = 2
const MAX_SELECTION = 4000

type UiState = 'idle' | 'loading' | 'result' | 'error'

let host: HTMLElement | null = null
let shadow: ShadowRoot | null = null
let toolbarEl: HTMLButtonElement | null = null
let panelEl: HTMLDivElement | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null
let currentQuestion = ''
let currentAnswer = ''
let currentTarget: HTMLElement | null = null
let answerRun: Promise<void> | null = null

function isExtensionPage(): boolean {
  return /^(chrome-extension|moz-extension|about):/i.test(location.protocol)
}

function isInsideUi(node: Node | null): boolean {
  if (!node || !host) return false
  return host.contains(node)
}

function getSelectionInfo(): {
  text: string
  rect: DOMRect
  anchorNode: Node | null
  focusNode: Node | null
} | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null

  const text = sel.toString().replace(/\s+/g, ' ').trim()
  if (text.length < MIN_SELECTION || text.length > MAX_SELECTION) return null
  if (isInsideUi(sel.anchorNode) || isInsideUi(sel.focusNode)) return null

  const range = sel.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null

  return {
    text,
    rect,
    anchorNode: sel.anchorNode,
    focusNode: sel.focusNode,
  }
}

function styles(): string {
  return `
    :host, * { box-sizing: border-box; font-family: "Space Grotesk", system-ui, -apple-system, sans-serif; }

    @keyframes toolbar-in {
      from { opacity: 0; transform: translateY(4px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes toolbar-spin {
      to { transform: rotate(360deg); }
    }

    .toolbar {
      position: fixed;
      z-index: 2147483646;
      display: none;
      align-items: center;
      gap: 7px;
      padding: 8px 13px;
      border: 1px solid rgba(21, 94, 239, 0.18);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.96);
      color: #0b1220;
      font-size: 12.5px;
      font-weight: 700;
      letter-spacing: -0.025em;
      line-height: 1.2;
      cursor: pointer;
      backdrop-filter: blur(10px);
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.9) inset,
        0 4px 14px rgba(11, 18, 32, 0.1),
        0 0 0 1px rgba(11, 18, 32, 0.03);
      transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
      animation: toolbar-in 180ms ease-out both;
    }

    .toolbar:hover:not(:disabled) {
      transform: translateY(-2px);
      border-color: rgba(21, 94, 239, 0.34);
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.95) inset,
        0 10px 28px rgba(21, 94, 239, 0.22);
    }

    .toolbar:active:not(:disabled) {
      transform: translateY(0);
    }

    .toolbar:focus-visible {
      outline: none;
      box-shadow:
        0 0 0 3px rgba(21, 94, 239, 0.28),
        0 8px 22px rgba(21, 94, 239, 0.18);
    }

    .toolbar:disabled {
      opacity: 0.72;
      cursor: wait;
    }

    .toolbar-spinner {
      display: none;
      width: 12px;
      height: 12px;
      border: 2px solid rgba(21, 94, 239, 0.25);
      border-top-color: #155eef;
      border-radius: 50%;
      animation: toolbar-spin 700ms linear infinite;
      flex-shrink: 0;
    }

    .toolbar.is-busy .toolbar-spinner {
      display: block;
    }

    .toolbar-label {
      white-space: nowrap;
    }

    .panel {
      position: fixed;
      z-index: 2147483647;
      display: none;
      flex-direction: column;
      width: min(360px, calc(100vw - 24px));
      max-height: min(520px, calc(100vh - 24px));
      border: 1px solid #d5dae3;
      border-radius: 12px;
      background: #fff;
      color: #0b1220;
      box-shadow: 0 12px 40px rgba(11, 18, 32, 0.18);
      overflow: hidden;
    }
    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 12px 14px 8px;
      border-bottom: 1px solid #edf0f5;
    }
    .panel-title {
      margin: 0;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .close {
      border: 0;
      background: transparent;
      color: #5b6575;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 6px;
    }
    .close:hover { background: #f5f6f8; color: #0b1220; }
    .question {
      margin: 0;
      padding: 0 14px 8px;
      font-size: 11.5px;
      line-height: 1.45;
      color: #5b6575;
      font-weight: 500;
      max-height: 96px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .answer {
      margin: 0;
      padding: 10px 14px;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      overflow: auto;
      flex: 1;
      min-height: 80px;
      max-height: min(320px, calc(100vh - 220px));
    }
    .status {
      margin: 0;
      padding: 16px 14px;
      font-size: 12.5px;
      line-height: 1.45;
      color: #5b6575;
    }
    .status.error { color: #d92d20; }
    .actions {
      display: flex;
      gap: 8px;
      padding: 10px 14px 12px;
      border-top: 1px solid #edf0f5;
    }
    .btn {
      flex: 1;
      border: 0;
      border-radius: 8px;
      padding: 9px 12px;
      font: inherit;
      font-size: 12.5px;
      font-weight: 700;
      cursor: pointer;
    }
    .btn-primary {
      background: #155eef;
      color: #fff;
    }
    .btn-primary:disabled {
      opacity: 0.55;
      cursor: wait;
    }
    .btn-secondary {
      background: #f5f6f8;
      color: #0b1220;
      border: 1px solid #d5dae3;
    }
    .btn-secondary.copied {
      color: #067647;
      border-color: #abe2c0;
      background: #ecfdf3;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .spin {
      display: inline-block;
      width: 12px;
      height: 12px;
      margin-right: 6px;
      border: 2px solid rgba(255,255,255,0.35);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 700ms linear infinite;
      vertical-align: -2px;
    }
  `
}

function ensureUi(): void {
  if (host && shadow) return

  host = document.createElement('div')
  host.id = ROOT_ID
  host.style.all = 'initial'
  document.documentElement.appendChild(host)
  shadow = host.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = styles()
  shadow.appendChild(style)

  toolbarEl = document.createElement('button')
  toolbarEl.type = 'button'
  toolbarEl.className = 'toolbar'
  toolbarEl.title = 'Сгенерировать ответ из вашего профиля'
  toolbarEl.innerHTML = `
    <span class="toolbar-spinner" aria-hidden="true"></span>
    <span class="toolbar-label">Ответить с AI</span>
  `
  toolbarEl.addEventListener('mousedown', (e) => e.preventDefault())
  toolbarEl.addEventListener('click', () => void runAiAnswer())
  shadow.appendChild(toolbarEl)

  panelEl = document.createElement('div')
  panelEl.className = 'panel'
  panelEl.setAttribute('role', 'dialog')
  panelEl.setAttribute('aria-label', 'Ответ AI')
  shadow.appendChild(panelEl)
}

function hideToolbar(): void {
  if (toolbarEl) toolbarEl.style.display = 'none'
}

function positionToolbar(rect: DOMRect): void {
  if (!toolbarEl) return
  const margin = 8
  const btnW = 132
  let top = rect.bottom + margin
  let left = rect.right - btnW

  const maxLeft = window.innerWidth - btnW - margin
  const maxTop = window.innerHeight - 48
  left = Math.max(margin, Math.min(left, maxLeft))
  top = Math.max(margin, Math.min(top, maxTop))

  toolbarEl.style.top = `${top}px`
  toolbarEl.style.left = `${left}px`
  toolbarEl.style.display = 'inline-flex'
}

function positionPanel(anchorRect: DOMRect): void {
  if (!panelEl) return
  const w = Math.min(360, window.innerWidth - 24)
  let left = anchorRect.left
  let top = anchorRect.bottom + 12

  if (left + w > window.innerWidth - 12) {
    left = window.innerWidth - w - 12
  }
  if (top + 300 > window.innerHeight - 12) {
    top = anchorRect.top - 300 - 12
  }
  left = Math.max(12, left)
  top = Math.max(12, top)

  panelEl.style.left = `${left}px`
  panelEl.style.top = `${top}px`
  panelEl.style.display = 'flex'
}

function hidePanel(): void {
  if (panelEl) {
    panelEl.style.display = 'none'
    panelEl.innerHTML = ''
  }
}

function renderPanel(state: UiState, anchorRect: DOMRect): void {
  if (!panelEl) return
  positionPanel(anchorRect)

  if (state === 'loading') {
    panelEl.innerHTML = `
      <div class="panel-head">
        <p class="panel-title">Ответ AI</p>
        <button type="button" class="close" data-action="close" aria-label="Закрыть">×</button>
      </div>
      <p class="status">Генерирую ответ из вашего профиля…</p>
    `
    bindPanelActions()
    return
  }

  if (state === 'error') {
    panelEl.innerHTML = `
      <div class="panel-head">
        <p class="panel-title">Ответ AI</p>
        <button type="button" class="close" data-action="close" aria-label="Закрыть">×</button>
      </div>
      <p class="status error">${escapeHtml(currentAnswer)}</p>
    `
    bindPanelActions()
    return
  }

  const fillLabel = currentTarget ? 'Вставить в поле' : 'Поле не найдено'
  panelEl.innerHTML = `
    <div class="panel-head">
      <p class="panel-title">Ответ AI</p>
      <button type="button" class="close" data-action="close" aria-label="Закрыть">×</button>
    </div>
    <p class="question">${escapeHtml(currentQuestion)}</p>
    <p class="answer">${escapeHtml(currentAnswer)}</p>
    <div class="actions">
      <button type="button" class="btn btn-secondary" data-action="copy">Копировать</button>
      <button type="button" class="btn btn-primary" data-action="fill" ${currentTarget ? '' : 'disabled'}>${fillLabel}</button>
    </div>
  `
  bindPanelActions()
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function bindPanelActions(): void {
  if (!panelEl) return
  panelEl.querySelector('[data-action="close"]')?.addEventListener('click', () => {
    hidePanel()
    hideToolbar()
  })
  panelEl.querySelector('[data-action="copy"]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement
    try {
      await navigator.clipboard.writeText(currentAnswer)
      btn.textContent = 'Скопировано!'
      btn.classList.add('copied')
      setTimeout(() => {
        btn.textContent = 'Копировать'
        btn.classList.remove('copied')
      }, 1600)
    } catch {
      btn.textContent = 'Не удалось скопировать'
    }
  })
  panelEl.querySelector('[data-action="fill"]')?.addEventListener('click', () => {
    if (!currentTarget || !currentAnswer) return
    if (fillControlElement(currentTarget, currentAnswer)) {
      markFillTarget(currentTarget)
      hidePanel()
      hideToolbar()
      window.getSelection()?.removeAllRanges()
    }
  })
}

async function runAiAnswer(): Promise<void> {
  const info = getSelectionInfo()
  if (!info) return

  if (answerRun && currentQuestion === info.text) {
    renderPanel('loading', info.rect)
    await answerRun
    return
  }

  if (answerRun) return
  const questionForRun = info.text
  const rectForRun = info.rect
  currentQuestion = questionForRun
  currentTarget = findFillTargetNearSelection({
    anchorNode: info.anchorNode,
    focusNode: info.focusNode,
    selectionRect: rectForRun,
  })

  hideToolbar()
  renderPanel('loading', rectForRun)

  if (toolbarEl) {
    toolbarEl.disabled = true
    toolbarEl.classList.add('is-busy')
  }

  answerRun = (async () => {
    try {
      const vacancy: VacancyInfo = parseVacancy()
      const res = await runtimeSendMessage<AiAnswerResponse>({
        type: 'RUN_AI_ANSWER',
        question: questionForRun,
        vacancy,
      })

      if (currentQuestion !== questionForRun) return

      if (!res?.ok || !res.answer) {
        currentAnswer = res?.error || 'Не удалось сгенерировать ответ.'
        renderPanel('error', rectForRun)
        return
      }

      currentAnswer = res.answer
      renderPanel('result', rectForRun)
    } catch (err) {
      if (currentQuestion !== questionForRun) return
      currentAnswer = err instanceof Error ? err.message : 'Unexpected error'
      renderPanel('error', rectForRun)
    } finally {
      if (toolbarEl) {
        toolbarEl.disabled = false
        toolbarEl.classList.remove('is-busy')
      }
    }
  })()

  try {
    await answerRun
  } finally {
    answerRun = null
  }
}

function onSelectionChange(): void {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    const info = getSelectionInfo()
    if (!info) {
      hideToolbar()
      return
    }
    ensureUi()
    positionToolbar(info.rect)
  }, 120)
}

function onDocumentMouseDown(e: MouseEvent): void {
  const target = e.target as Node | null
  if (isInsideUi(target)) return
  if (panelEl?.style.display === 'flex' && !isInsideUi(target)) {
    // keep panel open until explicit close
  }
}

export function initSelectionAi(): void {
  if (isExtensionPage()) return
  if ((window as Window & { __applyFillerSelectionAi?: boolean }).__applyFillerSelectionAi) {
    return
  }
  ;(window as Window & { __applyFillerSelectionAi?: boolean }).__applyFillerSelectionAi = true

  document.addEventListener('mouseup', onSelectionChange)
  document.addEventListener('keyup', onSelectionChange)
  document.addEventListener('mousedown', onDocumentMouseDown)
  document.addEventListener('scroll', hideToolbar, true)
}
