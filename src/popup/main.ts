import { runtimeSendMessage } from '../shared/messaging'
import type { FillResponse } from '../shared/types'

const fillBtn = document.getElementById('fill-btn') as HTMLButtonElement
const statusEl = document.getElementById('status') as HTMLParagraphElement
const debugEl = document.getElementById('debug') as HTMLPreElement
const resultEl = document.getElementById('result') as HTMLDivElement
const openOptions = document.getElementById('open-options') as HTMLAnchorElement

function setStatus(text: string, kind: 'ok' | 'error' | '' = '') {
  statusEl.textContent = text
  resultEl.hidden = !text
  resultEl.classList.toggle('is-ok', kind === 'ok')
  resultEl.classList.toggle('is-error', kind === 'error')
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
  if (d.unmatched.length) {
    lines.push('unmatched:')
    for (const u of d.unmatched) {
      lines.push(`  - [${u.intent}] ${u.label || u.id}`)
    }
  }
  debugEl.textContent = lines.join('\n')
  debugEl.hidden = false
}

openOptions.addEventListener('click', (e) => {
  e.preventDefault()
  chrome.runtime.openOptionsPage()
})

fillBtn.addEventListener('click', async () => {
  fillBtn.disabled = true
  debugEl.hidden = true
  setStatus('Scanning page…')
  try {
    const result = await runtimeSendMessage<FillResponse>({ type: 'RUN_FILL' })

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
    if (result.cvAttached || (result.debug?.filesFilled ?? 0) > 0) {
      parts.push(`CV attached`)
    } else if (result.fileUploadHint) {
      parts.push('attach CV manually if needed')
    }

    const unmatchedSalary = result.debug?.unmatched?.some((u) => u.intent === 'salary')
    if (unmatchedSalary) {
      parts.push('set Salary in Profile to fill salary field')
    }

    setStatus(`${parts.join(' · ')}.`, 'ok')
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Unexpected error', 'error')
  } finally {
    fillBtn.disabled = false
  }
})
