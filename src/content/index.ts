import { fillFields } from './formFiller'
import { scanFormFields } from './formScanner'
import { parseVacancy } from './vacancyParser'
import { loadStoredCv } from '../shared/cvStorage'
import type { FieldAnswer, FillPageResult, ScanPageResult } from '../shared/types'
import type { ScannedFileField } from '../shared/cvTypes'

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object' || !('type' in message)) {
    return false
  }

  if (message.type === 'PING') {
    sendResponse({ ok: true })
    return false
  }

  if (message.type === 'SCAN_PAGE') {
    try {
      const vacancy = parseVacancy()
      const { fields, fileUploadCount, fileFields } = scanFormFields()
      const result: ScanPageResult = { vacancy, fields, fileUploadCount, fileFields }
      sendResponse({ ok: true, result })
    } catch (err) {
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : 'Scan failed',
      })
    }
    return false
  }

  if (message.type === 'FILL_PAGE') {
    const answers = (message.answers ?? []) as FieldAnswer[]
    const coverLetter = String(message.coverLetter ?? '')
    const attachCv = Boolean(message.attachCv)
    const fileFields = (message.fileFields ?? []) as ScannedFileField[]

    ;(async () => {
      const cv = attachCv ? await loadStoredCv() : null
      const cvFile = cv
        ? { name: cv.name, mimeType: cv.mimeType, dataBase64: cv.dataBase64 }
        : null
      const result: FillPageResult = await fillFields(
        answers,
        coverLetter,
        cvFile,
        fileFields,
      )
      sendResponse({ ok: true, result })
    })().catch((err) =>
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : 'Fill failed',
      }),
    )
    return true
  }

  return false
})
