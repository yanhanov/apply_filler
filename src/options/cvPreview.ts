import mammoth from 'mammoth'
import {
  loadStoredCv,
  storedCvToObjectUrl,
} from '../shared/cvStorage'
import type { StoredCvFile } from '../shared/cvTypes'

function isPdf(cv: StoredCvFile): boolean {
  return cv.mimeType === 'application/pdf' || cv.name.toLowerCase().endsWith('.pdf')
}

function isDocx(cv: StoredCvFile): boolean {
  return (
    cv.mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    cv.name.toLowerCase().endsWith('.docx')
  )
}

async function docxPreviewHtml(cv: StoredCvFile): Promise<string> {
  const bytes = Uint8Array.from(atob(cv.dataBase64), (c) => c.charCodeAt(0))
  const result = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer })
  return result.value
}

export type CvPreview =
  | { kind: 'pdf'; objectUrl: string }
  | { kind: 'html'; html: string }
  | { kind: 'text'; text: string }

export async function buildCvPreview(cv: StoredCvFile): Promise<CvPreview> {
  if (isPdf(cv)) {
    return { kind: 'pdf', objectUrl: storedCvToObjectUrl(cv) }
  }

  if (isDocx(cv)) {
    try {
      const html = await docxPreviewHtml(cv)
      if (html.trim()) return { kind: 'html', html }
    } catch {
      // fall through to extracted text
    }
  }

  const text = cv.extractedText?.trim()
  if (text) return { kind: 'text', text }

  throw new Error('Could not preview this file. Re-import your resume.')
}

export async function loadCvPreview(): Promise<{ cv: StoredCvFile; preview: CvPreview }> {
  const cv = await loadStoredCv()
  if (!cv) throw new Error('No resume saved. Import a PDF or DOCX first.')
  const preview = await buildCvPreview(cv)
  return { cv, preview }
}

export function revokeCvPreview(preview: CvPreview | null): void {
  if (preview?.kind === 'pdf') URL.revokeObjectURL(preview.objectUrl)
}
