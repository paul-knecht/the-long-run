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

/** The years that have a crash name of their own, read from the `crashName.<year>` keys. */
const CRASH_YEARS: number[] = Object.keys(en).flatMap((k) => {
  const year = /^crashName\.(\d{4})$/.exec(k)?.[1]
  return year ? [Number(year)] : []
})

/**
 * The name key for a crash that peaked in this year: the exact year if it has a name, else the
 * nearest named year within one year (the later one on a tie), else the generic name.
 */
export function crashNameKey(peakYear: number): Key {
  let best: number | undefined
  for (const year of CRASH_YEARS) {
    const distance = Math.abs(year - peakYear)
    if (distance > 1) continue
    const bestDistance = best === undefined ? Infinity : Math.abs(best - peakYear)
    if (distance < bestDistance || (distance === bestDistance && year > best!)) best = year
  }
  return best === undefined ? 'crashName.generic' : (`crashName.${best}` as Key)
}

export { money, percent, signed } from './format'
