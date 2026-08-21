import type { AttemptSummary } from './types.js'

export interface PracticePerformance {
  total: number
  firstTry: number
  retried: number
  skipped: number
  percentage: number
}

export function summarizePracticePerformance(
  attempts: readonly AttemptSummary[],
): PracticePerformance {
  const firstTry = attempts.filter((attempt) => attempt.completion === 'first-try').length
  const retried = attempts.filter((attempt) => attempt.completion === 'retried').length
  const skipped = attempts.filter((attempt) => attempt.completion === 'skipped').length

  return {
    total: attempts.length,
    firstTry,
    retried,
    skipped,
    percentage: attempts.length === 0 ? 0 : Math.round((firstTry / attempts.length) * 100),
  }
}
