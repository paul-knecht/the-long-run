import { de } from './de'
import { en } from './en'

export type Lang = 'en' | 'de'
export type Key = keyof typeof en

const dictionaries: Record<Lang, Record<Key, string>> = { en, de }

/** The text for a key, with each {name} replaced by params.name. A placeholder without a param stays visible. */
export function t(lang: Lang, key: Key, params?: Record<string, string | number>): string {
  const text = dictionaries[lang][key]
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => (Object.hasOwn(params, name) ? String(params[name]) : placeholder))
}

/** German for any German browser language ("de", "de-AT", ...), English for everything else. */
export function detectLang(navigatorLanguage: string | undefined): Lang {
  return navigatorLanguage?.toLowerCase().startsWith('de') ? 'de' : 'en'
}

export { money, percent, signed } from './format'
