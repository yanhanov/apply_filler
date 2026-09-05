import type { FillResponse } from '../shared/types'

export type FillSessionStatus = 'idle' | 'running' | 'done'

export type FillSession = {
  status: FillSessionStatus
  startedAt: number
  result: FillResponse | null
}

let session: FillSession = { status: 'idle', startedAt: 0, result: null }
let active: Promise<FillResponse> | null = null

export function getFillSession(): FillSession {
  // Service worker restarted while a job was marked running — treat as interrupted.
  if (session.status === 'running' && !active) {
    session = { status: 'idle', startedAt: 0, result: null }
  }
  return session
}

export function runFillJob(task: () => Promise<FillResponse>): Promise<FillResponse> {
  if (active) return active

  session = { status: 'running', startedAt: Date.now(), result: null }
  active = task()
    .then((result) => {
      session = { status: 'done', startedAt: session.startedAt, result }
      return result
    })
    .catch((err): FillResponse => {
      const result: FillResponse = {
        ok: false,
        answers: [],
        coverLetter: '',
        fileUploadHint: false,
        error: err instanceof Error ? err.message : 'Unexpected error',
      }
      session = { status: 'done', startedAt: session.startedAt, result }
      return result
    })
    .finally(() => {
      active = null
    })

  return active
}
