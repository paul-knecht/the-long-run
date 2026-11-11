import type { Lang } from './index'

/** en-IE writes "€18,420", de-DE writes "18.420 €". */
const LOCALE: Record<Lang, string> = { en: 'en-IE', de: 'de-DE' }

const euroFormats: Record<Lang, Intl.NumberFormat> = {
  en: new Intl.NumberFormat(LOCALE.en, { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  de: new Intl.NumberFormat(LOCALE.de, { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }),
}

const percentFormats = new Map<string, Intl.NumberFormat>()

function percentFormat(lang: Lang, digits: number): Intl.NumberFormat {
  const key = `${lang}:${digits}`
  let format = percentFormats.get(key)
  if (!format) {
    format = new Intl.NumberFormat(LOCALE[lang], { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits })
    percentFormats.set(key, format)
  }
  return format
}

/** Rounded to `digits` decimals, with a minus zero turned into zero so it never prints as "-0". */
function rounded(x: number, digits: number): number {
  const scale = 10 ** digits
  return Math.round(x * scale) / scale || 0
}

/** Whole euros in the language's format: "€18,420" / "18.420 €". */
export function money(n: number, lang: Lang): string {
  return euroFormats[lang].format(rounded(n, 0))
}

/** A fraction as a percentage: 0.34 is "34%" / "34 %". */
export function percent(x: number, lang: Lang, digits = 0): string {
  return percentFormat(lang, digits).format(rounded(x, digits + 2))
}

/** An amount of change with an arrow for its direction: "▲ €2,310" / "▼ €9,480"; no arrow when it rounds to nothing. */
export function signed(n: number, lang: Lang): string {
  const whole = rounded(n, 0)
  if (whole === 0) return money(0, lang)
  return `${whole > 0 ? '▲' : '▼'} ${money(Math.abs(whole), lang)}`
}
