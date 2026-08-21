import type { SupportedLocale } from './types.js'

const repeatedWhitespace = /\s+/gu

export function normalizeAnswer(value: string, locale: SupportedLocale): string {
  return value
    .normalize('NFC')
    .trim()
    .replace(repeatedWhitespace, ' ')
    .toLocaleLowerCase(locale)
}

export function answersMatch(
  actual: string,
  expected: string,
  locale: SupportedLocale,
): boolean {
  return normalizeAnswer(actual, locale) === normalizeAnswer(expected, locale)
}
