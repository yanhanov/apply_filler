export interface StoredCvFile {
  name: string
  mimeType: string
  /** Base64 without data: URL prefix */
  dataBase64: string
  size: number
  updatedAt: number
  /** Plain text extracted on import — used by AI prompts */
  extractedText?: string
}

export interface CvFileMeta {
  name: string
  mimeType: string
  size: number
  updatedAt: number
}

export type FileUploadKind = 'resume' | 'cover_letter' | 'unknown'

export interface ScannedFileField {
  id: string
  name: string
  label: string
  accept: string
  kind: FileUploadKind
}
