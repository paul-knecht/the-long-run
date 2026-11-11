import { type JSX, useEffect, useId, useRef, useState } from 'react'
import { type Key, money, percent } from '../../i18n'
import { LanguageSwitch } from '../components/Header'
import { useLang } from '../lang'

type Product = 'world' | 'theme' | 'fund'
type Day = '1' | '15'
type Payout = 'reinvest' | 'payOut'

const PRODUCTS: readonly Product[] = ['world', 'theme', 'fund']
const DAYS: readonly Day[] = ['1', '15']
const PAYOUTS: readonly Payout[] = ['reinvest', 'payOut']

const PRODUCT_NAME: Record<Product, Key> = {
  world: 'practice.option.world',
  theme: 'practice.option.theme',
  fund: 'practice.option.fund',
}
const PRODUCT_NOTE: Record<Product, Key> = {
  world: 'practice.option.world.note',
  theme: 'practice.option.theme.note',
  fund: 'practice.option.fund.note',
}
/** Why a wrong product is wrong; the right one has no reason. */
const WRONG_REASON: Record<Exclude<Product, 'world'>, Key> = {
  theme: 'practice.reason.theme',
  fund: 'practice.reason.fund',
}
const DAY_NAME: Record<Day, Key> = { '1': 'practice.when.1', '15': 'practice.when.15' }
const PAYOUT_NAME: Record<Payout, Key> = { reinvest: 'practice.payouts.reinvest', payOut: 'practice.payouts.payOut' }

const SMALLPRINT: readonly Key[] = [
  'smallprint.advice',
  'smallprint.past',
  'smallprint.data',
  'smallprint.crash',
  'smallprint.monthly',
  'smallprint.savings',
  'smallprint.costs',
  'smallprint.inflation',
  'smallprint.taxes',
  'smallprint.credit',
]

const CHECKLIST: readonly Key[] = ['practice.check.first', 'practice.check.1', 'practice.check.2', 'practice.check.3', 'practice.check.4']

/**
 * The top bar of the pretend broker app: its title, and the badge that says it is only practice.
 * Each view has its own bar, and the title takes the focus when the bar appears: the screen or
 * the button before took the focus with it.
 */
function BrokerBar(p: { title: string }): JSX.Element {
  const { t } = useLang()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [])
  return (
    <header className="broker-bar">
      <h1 className="broker-title" ref={heading} tabIndex={-1}>
        {p.title}
      </h1>
      <span className="practice-badge">{t('practice.badge')}</span>
    </header>
  )
}

/** One choice of a radio group: a card with the name, and an optional note read out with it. */
function Choice(p: { group: string; id: string; label: string; note?: string; checked: boolean; onChoose(): void }): JSX.Element {
  const { group, id, label, note, checked, onChoose } = p
  return (
    <label className="broker-choice" data-checked={checked || undefined}>
      <input type="radio" name={group} checked={checked} onChange={onChoose} aria-labelledby={`${id}-name`} aria-describedby={note ? `${id}-note` : undefined} />
      <span className="broker-choice-text">
        <span id={`${id}-name`} className="broker-choice-name">
          {label}
        </span>
        {note && (
          <span id={`${id}-note`} className="broker-choice-note">
            {note}
          </span>
        )}
      </span>
    </label>
  )
}

/**
 * A pretend broker app, marked as practice, in which the player sets up a savings plan on the
 * worldwide stock index ETF; then the checklist for doing it for real. Nothing is stored or sent.
 * `saveRate` is the player's average rate in the game and `salary` the last monthly salary; the
 * amount starts at their product and can be edited.
 */
export function PracticeScreen(p: { saveRate: number; salary: number; onDone(): void }): JSX.Element {
  const { saveRate, salary, onDone } = p
  const { lang, t } = useLang()
  const ids = useId()
  const [product, setProduct] = useState<Product | null>(null)
  const [amountText, setAmountText] = useState(() => String(Math.round(saveRate * salary)))
  const [day, setDay] = useState<Day>('1')
  const [payout, setPayout] = useState<Payout>('reinvest')
  const [done, setDone] = useState(false)

  const amount = Number(amountText)
  const amountOk = amountText.trim() !== '' && Number.isFinite(amount) && amount > 0
  const wrong = product !== null && product !== 'world' ? product : null
  // What still stands in the way of "Start savings plan", in the order of the form.
  const blocked: Key | null =
    product === null ? 'practice.start.needProduct' : wrong ? 'practice.start.needOther' : !amountOk ? 'practice.start.needAmount' : null
  const ready = blocked === null

  return (
    <main className="screen practice" data-testid="practice">
      <div className="header-bar practice-lang">
        <LanguageSwitch />
      </div>
      <div className="broker">
        {done ? (
          <PracticeDone
            plan={[t('practice.option.world'), `${money(amount, lang)} ${t('practice.amount.perMonth')}`, t(DAY_NAME[day]), t(PAYOUT_NAME[payout])].join(' · ')}
            onDone={onDone}
          />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (ready) setDone(true)
            }}
          >
            <BrokerBar title={t('practice.title')} />
            <p className="broker-intro">{t('practice.intro')}</p>

            <fieldset className="broker-field">
              <legend>{t('practice.what')}</legend>
              {PRODUCTS.map((value) => (
                <Choice
                  key={value}
                  group={`${ids}-product`}
                  id={`${ids}-product-${value}`}
                  label={t(PRODUCT_NAME[value])}
                  note={t(PRODUCT_NOTE[value])}
                  checked={product === value}
                  onChoose={() => setProduct(value)}
                />
              ))}
              {wrong && (
                <p className="broker-reason" role="alert">
                  <span aria-hidden="true">✕ </span>
                  {t(WRONG_REASON[wrong])}
                </p>
              )}
            </fieldset>

            <div className="broker-field">
              <label className="broker-label" htmlFor={`${ids}-amount`}>
                {t('practice.amount')}
              </label>
              <div className="broker-amount">
                {lang === 'en' && <span aria-hidden="true">€</span>}
                <input
                  id={`${ids}-amount`}
                  className="broker-input"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step="any"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  aria-describedby={`${ids}-amount-note`}
                />
                {lang === 'de' && <span aria-hidden="true">€</span>}
                <span className="broker-every">{t('practice.amount.perMonth')}</span>
              </div>
              <p id={`${ids}-amount-note`} className="broker-hint" aria-live="polite">
                {amountOk && salary > 0 ? t('practice.amount.note', { pct: percent(amount / salary, lang) }) : ''}
              </p>
            </div>

            <fieldset className="broker-field">
              <legend>{t('practice.when')}</legend>
              {DAYS.map((value) => (
                <Choice key={value} group={`${ids}-day`} id={`${ids}-day-${value}`} label={t(DAY_NAME[value])} checked={day === value} onChoose={() => setDay(value)} />
              ))}
            </fieldset>

            <fieldset className="broker-field">
              <legend>{t('practice.payouts')}</legend>
              {PAYOUTS.map((value) => (
                <Choice
                  key={value}
                  group={`${ids}-payout`}
                  id={`${ids}-payout-${value}`}
                  label={t(PAYOUT_NAME[value])}
                  checked={payout === value}
                  onChoose={() => setPayout(value)}
                />
              ))}
            </fieldset>

            <button type="submit" className="btn btn-wide broker-btn" disabled={!ready} aria-describedby={blocked ? `${ids}-blocked` : undefined}>
              {t('practice.start')}
            </button>
            {blocked && (
              <p id={`${ids}-blocked`} className="broker-blocked">
                {t(blocked)}
              </p>
            )}
          </form>
        )}
      </div>
      {done && (
        <div className="smallprint practice-smallprint">
          {SMALLPRINT.map((key) => (
            <p key={key}>{t(key)}</p>
          ))}
        </div>
      )}
    </main>
  )
}

/** After the plan is set up: it in one line, the checklist for the real thing, and the way back to the start. */
function PracticeDone(p: { plan: string; onDone(): void }): JSX.Element {
  const { t } = useLang()
  const ids = useId()
  return (
    <div>
      <BrokerBar title={t('practice.done.title')} />
      <p className="broker-plan" data-testid="practice-plan">
        {p.plan}
      </p>
      <p id={`${ids}-lead`} className="broker-intro">
        {t('practice.done.text')}
      </p>
      <ol className="broker-checklist" aria-labelledby={`${ids}-lead`}>
        {CHECKLIST.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ol>
      <button type="button" className="btn btn-wide broker-btn" onClick={p.onDone}>
        {t('practice.back')}
      </button>
    </div>
  )
}
