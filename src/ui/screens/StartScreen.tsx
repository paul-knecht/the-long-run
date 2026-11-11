import type { JSX } from 'react'
import { money } from '../../i18n'
import { START_AGE, START_SALARY } from '../../sim/constants'
import { useLang } from '../App'
import { LanguageSwitch } from '../components/Header'

/** Title, a short pitch, the language switch and the start button. Says nothing about which market or years. */
export function StartScreen(props: { onStart(): void }): JSX.Element {
  const { lang, t } = useLang()
  return (
    <main className="screen start">
      <div className="start-bar">
        <LanguageSwitch />
      </div>
      <h1 className="start-title">{t('start.title')}</h1>
      <p className="start-tagline">{t('start.tagline')}</p>
      <p>
        {t('start.intro', { age: START_AGE, salary: money(START_SALARY, lang) })} {t('start.people')}
      </p>
      <p className="start-secret">{t('start.secret')}</p>
      <button type="button" className="btn btn-primary btn-wide" onClick={props.onStart}>
        {t('start.button')}
      </button>
      <p className="smallprint">
        {t('smallprint.advice')} {t('start.note')}
      </p>
    </main>
  )
}
