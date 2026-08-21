import { normalizeAnswer } from './normalization.js'
import type { SpellingOutcome, SupportedLocale } from './types.js'

export interface SpellingGrade {
  outcome: SpellingOutcome
  distance: number
  canonical: string
}

export function damerauLevenshtein(left: string, right: string): number {
  const source = [...left]
  const target = [...right]
  const rows = source.length + 1
  const columns = target.length + 1
  const matrix = Array.from({ length: rows }, () => Array<number>(columns).fill(0))

  for (let row = 0; row < rows; row += 1) {
    matrix[row]![0] = row
  }

  for (let column = 0; column < columns; column += 1) {
    matrix[0]![column] = column
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost = source[row - 1] === target[column - 1] ? 0 : 1
      const deletion = matrix[row - 1]![column]! + 1
      const insertion = matrix[row]![column - 1]! + 1
      const substitution = matrix[row - 1]![column - 1]! + substitutionCost
      let distance = Math.min(deletion, insertion, substitution)

      if (
        row > 1 &&
        column > 1 &&
        source[row - 1] === target[column - 2] &&
        source[row - 2] === target[column - 1]
      ) {
        distance = Math.min(distance, matrix[row - 2]![column - 2]! + 1)
      }

      matrix[row]![column] = distance
    }
  }

  return matrix[source.length]![target.length]!
}

export function gradeSpelling(
  actual: string,
  expected: string,
  locale: SupportedLocale,
): SpellingGrade {
  const distance = damerauLevenshtein(
    normalizeAnswer(actual, locale),
    normalizeAnswer(expected, locale),
  )

  return {
    outcome: distance === 0 ? 'correct' : distance === 1 ? 'minor-typo' : 'incorrect',
    distance,
    canonical: expected.normalize('NFC').trim(),
  }
}
