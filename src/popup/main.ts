import { runtimeSendMessage } from '../shared/messaging'
import type { FillResponse, FillStatusResponse } from '../shared/types'

const fillBtn = document.getElementById('fill-btn') as HTMLButtonElement
const statusEl = document.getElementById('status') as HTMLParagraphElement
const debugEl = document.getElementById('debug') as HTMLPreElement
const resultEl = document.getElementById('result') as HTMLDivElement
const openOptions = document.getElementById('open-options') as HTMLAnchorElement
let fillFlowActive = false

function setStatus(text: string, kind: 'ok' | 'error' | '' = '') {
  statusEl.textContent = text
  resultEl.hidden = !text
  resultEl.classList.toggle('is-ok', kind === 'ok')
  resultEl.classList.toggle('is-error', kind === 'error')
}

function setBusy(busy: boolean) {
  fillBtn.disabled = busy
  fillBtn.classList.toggle('is-busy', busy)
  if (busy) fillBtn.setAttribute('aria-busy', 'true')
  else fillBtn.removeAttribute('aria-busy')
}

function showDebug(result: FillResponse | undefined | null) {
  if (!result?.debug) {
    debugEl.hidden = true
    debugEl.textContent = ''
    return
  }
  const d = result.debug
  const lines = [
    `scanned: ${d.scanned}`,
    `matched: ${d.matched}`,
    `filled: ${d.filled}`,
    `skipped: ${d.skipped}`,
  ]
  if (typeof d.filesFilled === 'number') {
    lines.push(`cv files: ${d.filesFilled}`)
  }
  if (d.usedLlm) lines.push('AI used')
  if (d.unmatched.length) {
    lines.push('unmatched:')
    for (const u of d.unmatched) {
      lines.push(`  - [${u.intent}] ${u.label || u.id}`)
    }
  }
  debugEl.textContent = lines.join('\n')
  debugEl.hidden = false
}

function applyFillResult(result: FillResponse | undefined | null) {
  if (!result) {
    setStatus(
      'No response from background. Reload the add-on, refresh the page, try again.',
      'error',
    )
    return
  }

  showDebug(result)

  if (!result.ok) {
    setStatus(result.error || 'Fill failed.', 'error')
    return
  }

  const parts = [
    `Filled ${result.debug?.filled ?? result.answers.length} of ${result.debug?.scanned ?? '?'} fields`,
  ]
  if (result.debug?.usedLlm) parts.push('AI used')
  if (result.cvAttached || (result.debug?.filesFilled ?? 0) > 0) {
    parts.push('CV attached')
  } else if (result.fileUploadHint) {
    parts.push('attach CV manually if needed')
  }

  const unmatchedSalary = result.debug?.unmatched?.some((u) => u.intent === 'salary')
  if (unmatchedSalary) {
    parts.push('set Salary in Profile to fill salary field')
  }

  if (result.warning) parts.push(result.warning)

  setStatus(`${parts.join(' · ')}.`, 'ok')
}

async function runFillFlow(showLoadingMessage = true) {
  if (fillFlowActive) return
  fillFlowActive = true
  if (showLoadingMessage) {
    debugEl.hidden = true
    setStatus('Scanning page & generating answers…')
  }
  setBusy(true)
  try {
    const result = await runtimeSendMessage<FillResponse>({ type: 'RUN_FILL' })
    applyFillResult(result)
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Unexpected error', 'error')
  } finally {
    setBusy(false)
    fillFlowActive = false
  }
}

async function waitForFillCompletion() {
  fillFlowActive = true
  setStatus('Scanning page & generating answers…')
  setBusy(true)
  try {
    for (;;) {
      const state = await runtimeSendMessage<FillStatusResponse>({ type: 'GET_FILL_STATUS' })
      if (state.status === 'done' && state.result) {
        applyFillResult(state.result)
        return
      }
      if (state.status === 'idle') {
        setStatus('Fill was interrupted. Click Fill again.', 'error')
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Unexpected error', 'error')
  } finally {
    setBusy(false)
    fillFlowActive = false
  }
}

async function restoreFillState() {
  try {
    const state = await runtimeSendMessage<FillStatusResponse>({ type: 'GET_FILL_STATUS' })
    if (state.status === 'running') {
      await waitForFillCompletion()
      return
    }
    if (state.status === 'done' && state.result) {
      applyFillResult(state.result)
    }
  } catch {
    // Popup works without restore if background is unavailable.
  }
}

openOptions.addEventListener('click', (e) => {
  e.preventDefault()
  chrome.runtime.openOptionsPage()
})

fillBtn.addEventListener('click', () => {
  if (fillBtn.disabled || fillFlowActive) return
  void runFillFlow()
})

void restoreFillState()
