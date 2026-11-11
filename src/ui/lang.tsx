import { createContext, useContext } from 'react'
import { type Key, type Lang, t as translate } from '../i18n'

export interface LangContextValue {
  lang: Lang
  setLang(l: Lang): void
  t(key: Key, params?: Record<string, string | number>): string
}

/** English with a switch that does nothing, so a screen rendered on its own (in a test) still has words. */
export const LangContext = createContext<LangContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key, params) => translate('en', key, params),
})

/** The current language, a way to change it, and `t` bound to it. */
export function useLang(): LangContextValue {
  return useContext(LangContext)
}
