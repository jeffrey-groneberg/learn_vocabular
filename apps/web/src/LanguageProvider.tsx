import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getPreference, savePreference } from './data/database.js'
import {
  translations,
  UiLanguageContext,
  type UiLanguage,
} from './i18n.js'

const UI_LANGUAGE_PREFERENCE = 'ui-language'

function isUiLanguage(value: string | undefined): value is UiLanguage {
  return value === 'en' || value === 'de'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<UiLanguage>('en')
  const [preferenceLoadFailed, setPreferenceLoadFailed] = useState(false)

  useEffect(() => {
    let active = true
    void getPreference(UI_LANGUAGE_PREFERENCE)
      .then((storedLanguage) => {
        if (active && isUiLanguage(storedLanguage)) {
          setLanguage(storedLanguage)
        }
      })
      .catch(() => {
        if (active) {
          setPreferenceLoadFailed(true)
        }
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const changeLanguage = useCallback(async (nextLanguage: UiLanguage) => {
    await savePreference(UI_LANGUAGE_PREFERENCE, nextLanguage)
    setLanguage(nextLanguage)
    setPreferenceLoadFailed(false)
  }, [])

  const value = useMemo(
    () => ({
      language,
      copy: translations[language],
      preferenceLoadFailed,
      changeLanguage,
    }),
    [changeLanguage, language, preferenceLoadFailed],
  )

  return <UiLanguageContext.Provider value={value}>{children}</UiLanguageContext.Provider>
}
