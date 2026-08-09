import type { CvFileMeta, StoredCvFile } from './cvTypes'

const CV_KEY = 'applyFillerCv'
const MAX_CV_BYTES = 4.5 * 1024 * 1024

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function fileToStoredCv(file: File): Promise<StoredCvFile> {
  if (file.size > MAX_CV_BYTES) {
    throw new Error(
      `CV is too large (${Math.round(file.size / 1024 / 1024)}MB). Max ~4.5MB for local storage.`,
    )
  }
  const buf = await file.arrayBuffer()
  return {
    name: file.name,
    mimeType: file.type || guessMime(file.name),
    dataBase64: arrayBufferToBase64(buf),
    size: file.size,
    updatedAt: Date.now(),
  }
}

function guessMime(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (lower.endsWith('.doc')) return 'application/msword'
  return 'application/octet-stream'
}

export async function saveStoredCv(cv: StoredCvFile): Promise<void> {
  await chrome.storage.local.set({ [CV_KEY]: cv })
}

export async function loadStoredCv(): Promise<StoredCvFile | null> {
  const result = await chrome.storage.local.get(CV_KEY)
  const cv = result[CV_KEY] as StoredCvFile | undefined
  if (!cv?.dataBase64 || !cv.name) return null
  return cv
}

export async function clearStoredCv(): Promise<void> {
  await chrome.storage.local.remove(CV_KEY)
}

export async function loadCvMeta(): Promise<CvFileMeta | null> {
  const cv = await loadStoredCv()
  if (!cv) return null
  return {
    name: cv.name,
    mimeType: cv.mimeType,
    size: cv.size,
    updatedAt: cv.updatedAt,
  }
}

export function formatCvSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
