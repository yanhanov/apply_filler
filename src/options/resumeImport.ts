import mammoth from 'mammoth'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorker

const MAX_PDF_PAGES = 12

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  const type = file.type

  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    return extractPdfText(await file.arrayBuffer())
  }

  if (
    type ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    return extractDocxText(await file.arrayBuffer())
  }

  if (name.endsWith('.doc')) {
    throw new Error('Old .doc format is not supported. Save as .docx or PDF.')
  }

  throw new Error('Unsupported file. Use PDF or DOCX.')
}

function isTextItem(item: unknown): item is TextItem {
  return Boolean(item && typeof item === 'object' && 'str' in item)
}

/** Rebuild readable lines from PDF text items (works for modern one-page CVs). */
function pageItemsToText(items: unknown[]): string {
  const textItems = items.filter(isTextItem)
  if (textItems.length === 0) return ''

  let lastY: number | null = null
  let line = ''
  const lines: string[] = []

  for (const item of textItems) {
    const y = item.transform?.[5]
    const str = item.str

    if (lastY !== null && y !== undefined && Math.abs(lastY - y) > 2.5) {
      lines.push(line.replace(/[ \t]+$/g, ''))
      line = ''
    }

    line += str
    if (item.hasEOL) {
      lines.push(line.replace(/[ \t]+$/g, ''))
      line = ''
      lastY = null
      continue
    }

    // Add space between runs on the same line when needed
    if (str && !str.endsWith(' ') && !str.endsWith('-')) {
      line += ' '
    }
    lastY = y ?? lastY
  }

  if (line.trim()) lines.push(line.replace(/[ \t]+$/g, ''))
  return lines.join('\n').replace(/[ \t]+\n/g, '\n').trim()
}

async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdf = await getDocument({
    data,
    useSystemFonts: true,
  }).promise
  const pages = Math.min(pdf.numPages, MAX_PDF_PAGES)
  const chunks: string[] = []

  for (let i = 1; i <= pages; i += 1) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    chunks.push(pageItemsToText(content.items))
  }

  const text = chunks.filter(Boolean).join('\n\n').trim()
  if (text.length < 40) {
    throw new Error(
      'PDF has almost no extractable text (may be a scanned image). Try a text-based PDF or DOCX.',
    )
  }
  return text
}

async function extractDocxText(data: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: data })
  const text = result.value.trim()
  if (text.length < 40) {
    throw new Error('Could not read enough text from the DOCX file.')
  }
  return text
}
