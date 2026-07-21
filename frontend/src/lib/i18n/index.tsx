import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react"

import { en } from "./en"
import type { TranslationKey } from "./zh-CN"
import { zhCN } from "./zh-CN"

export type Language = "en" | "zh-CN"

const storageKey = "gitview-language"

type Variables = Record<string, string | number>

type I18nValue = {
  language: Language
  locale: string
  setLanguage: (language: Language) => void
  t: (key: TranslationKey, variables?: Variables) => string
  formatNumber: (value: number) => string
  formatDate: (value: string | Date) => string
}

const I18nContext = createContext<I18nValue | null>(null)

function initialLanguage(): Language {
  const stored = localStorage.getItem(storageKey)
  if (stored === "en" || stored === "zh-CN") return stored
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en"
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(initialLanguage)
  const locale = language === "zh-CN" ? "zh-CN" : "en-US"

  useEffect(() => {
    localStorage.setItem(storageKey, language)
    document.documentElement.lang = language
  }, [language])

  const value = useMemo<I18nValue>(
    () => ({
      language,
      locale,
      setLanguage,
      t: (key, variables = {}) => {
        const template = language === "zh-CN" ? zhCN[key] : en[key]
        return Object.entries(variables).reduce(
          (result, [name, replacement]) => result.replaceAll(`{${name}}`, String(replacement)),
          template,
        )
      },
      formatNumber: (number) => new Intl.NumberFormat(locale).format(number),
      formatDate: (value) =>
        value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value)) : "—",
    }),
    [language, locale],
  )

  return <I18nContext value={value}>{children}</I18nContext>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error("useI18n must be used within I18nProvider")
  return value
}
