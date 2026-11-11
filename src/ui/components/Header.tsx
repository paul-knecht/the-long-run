import type { JSX } from 'react'
import { type Lang, money, signed } from '../../i18n'
import { YEARS } from '../../sim/constants'
import { useLang } from '../lang'

const LANGS: { lang: Lang; label: string }[] = [
  { lang: 'en', label: 'EN' },
  { lang: 'de', label: 'DE' },
]

/** Two buttons, EN and DE; the one in use is pressed. Switching changes only the words, never the run. */
export function LanguageSwitch(): JSX.Element {
  const { lang, setLang, t } = useLang()
  return (
    <div className="lang-switch" role="group" aria-label={t('header.language')}>
      {LANGS.map((l) => (
        <button key={l.lang} type="button" className="lang-button" lang={l.lang} aria-pressed={lang === l.lang} onClick={() => setLang(l.lang)}>
          {l.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Year and age, the total, and this year's change with an arrow; plus the language switch.
 * `changeText` replaces the "this year" line (the crash shows the fall instead); `change` still sets its colour.
 */
export function Header(props: { year: number; age: number; total: number; change: number; mood: 'calm' | 'crash'; changeText?: string }): JSX.Element {
  const { year, age, total, change, mood, changeText } = props
  const { lang, t } = useLang()
  const direction = Math.round(change) > 0 ? 'up' : Math.round(change) < 0 ? 'down' : 'flat'
  return (
    <header className="header" data-mood={mood}>
      <div className="header-bar">
        <p className="header-when">
          <span>{t('header.year', { n: year, of: YEARS })}</span>
          <span>{t('header.age', { age })}</span>
        </p>
        <LanguageSwitch />
      </div>
      <p className="header-label">{t('header.total')}</p>
      <p className="header-total">{money(total, lang)}</p>
      <p className="header-change" data-direction={direction}>
        {changeText ?? t('header.change', { amount: signed(change, lang) })}
      </p>
    </header>
  )
}
