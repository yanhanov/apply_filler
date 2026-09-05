import type { AiAnswerResponse } from '../shared/types'

const active = new Map<string, Promise<AiAnswerResponse>>()

function normalizeQuestion(question: string): string {
  return question.replace(/\s+/g, ' ').trim()
}

export function runAiAnswerJob(
  question: string,
  vacancyPageUrl: string,
  task: () => Promise<AiAnswerResponse>,
): Promise<AiAnswerResponse> {
  const q = normalizeQuestion(question)
  if (!q) {
    return Promise.resolve({ ok: false, error: 'Select question text on the page first.' })
  }

  const key = `${q}::${vacancyPageUrl.trim()}`
  const existing = active.get(key)
  if (existing) return existing

  const promise = task().finally(() => {
    active.delete(key)
  })
  active.set(key, promise)
  return promise
}
