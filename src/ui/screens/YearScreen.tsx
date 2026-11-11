import { type JSX, useEffect, useId, useRef, useState } from 'react'
import { type Key, money, percent } from '../../i18n'
import { EMERGENCY_MONTHS, MAX_SAVE_RATE, SENSIBLE_SAVE } from '../../sim/constants'
import type { ActionId, Bucket, Decision, Pending, Timeline } from '../../sim/types'
import { Appear, Headline } from '../components/ChatBubble'
import { Dial } from '../components/Dial'
import { useLang } from '../lang'

const BUCKETS: readonly Bucket[] = ['cash', 'etf', 'fund', 'stock']
const BUCKET_KEY: Record<Bucket, Key> = {
  cash: 'year.bucket.cash',
  etf: 'year.bucket.etf',
  fund: 'year.bucket.fund',
  stock: 'year.bucket.stock',
}
const ACTION_KEY: Record<ActionId, Key> = {
  getBackIn: 'action.getBackIn',
  switchBackToEtf: 'action.switchBackToEtf',
  sellStock: 'action.sellStock',
}

/** The save dial works in whole percent: 0 to 30, with 10 to 20 marked. */
const SAVE_MAX = Math.round(MAX_SAVE_RATE * 100)
const SAVE_ZONE = [Math.round(SENSIBLE_SAVE[0] * 100), Math.round(SENSIBLE_SAVE[1] * 100)] as const

/** A year in which the index moved more than this either way gets an "up" or a "down" headline. */
const BIG_MOVE = 0.1
const HEADLINES: Record<'up' | 'flat' | 'down', readonly Key[]> = {
  up: ['headline.up.1', 'headline.up.2', 'headline.up.3'],
  flat: ['headline.flat.1', 'headline.flat.2', 'headline.flat.3'],
  down: ['headline.down.1', 'headline.down.2', 'headline.down.3'],
}

/** The headline for the year that ended at month `at`: picked by the index's change, varied by the year's number. */
function headlineFor(timeline: Timeline, at: number): Key {
  const change = timeline.snapshots[at].index / timeline.snapshots[at - 12].index - 1
  const way = change > BIG_MOVE ? 'up' : change < -BIG_MOVE ? 'down' : 'flat'
  const year = at / 12
  return HEADLINES[way][(year - 1) % HEADLINES[way].length]
}

/**
 * A year's choices: how much to put aside, where new money goes, any action on offer, and "Next
 * year". It also shows the emergency fund, where the money is and, once a year has played, one
 * headline about it. `salary` is the monthly pay of the year ahead. While `busy` (the chart is still
 * drawing) every control is disabled.
 */
export function YearScreen(p: {
  timeline: Timeline
  pending: Extract<Pending, { kind: 'year' }>
  busy: boolean
  salary: number
  decide(d: Decision): void
}): JSX.Element {
  const { timeline, pending, busy, salary, decide } = p
  const { lang, t } = useLang()
  const [save, setSave] = useState(() => Math.round(timeline.dials.saveRate * 100))
  const [split, setSplit] = useState(() => Math.round(timeline.dials.etfShare * 100))
  const holdingsTitle = useId()

  // When the screen before took the focus with it, "Next year" gets it once the year is drawn.
  const next = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!busy && document.activeElement === document.body) next.current?.focus()
  }, [busy])

  const now = timeline.snapshots[pending.at]
  const { holdings } = now
  const risky = timeline.riskyTarget
  const pct = (whole: number): string => percent(whole / 100, lang)
  // Months of income in the savings account, never rounded up to a full emergency fund.
  const months = Math.floor(Math.min(EMERGENCY_MONTHS, holdings.cash / now.salary) * 10) / 10
  const filled = Math.min(1, holdings.cash / now.emergencyTarget)
  const headline = pending.at >= 12 && !busy ? headlineFor(timeline, pending.at) : null

  return (
    <section className="year">
      {headline && (
        <Appear>
          <Headline text={t(headline)} />
        </Appear>
      )}

      <div className="panel">
        <p className="panel-row">
          <span>{t('year.salary')}</span>
          <b>{t('year.perMonth', { amount: money(salary, lang) })}</b>
        </p>
        <Dial
          label={t('dial.save.label')}
          value={save}
          min={0}
          max={SAVE_MAX}
          step={1}
          marks={SAVE_ZONE}
          format={(v) => t('dial.save.value', { pct: pct(v), amount: money((salary * v) / 100, lang) })}
          onChange={setSave}
          disabled={busy}
        />
        <div className="split" data-risky={risky}>
          <Dial
            label={t('dial.split.label')}
            value={split}
            min={0}
            max={100}
            step={10}
            format={(v) => `${t(risky === 'fund' ? 'dial.split.fund' : 'dial.split.etf', { pct: pct(v) })} · ${t('dial.split.cash', { pct: pct(100 - v) })}`}
            onChange={setSplit}
            disabled={busy}
          />
          <p className="dial-ends" data-testid="split-ends">
            <span>{t(BUCKET_KEY[risky])}</span>
            <span>{t('year.bucket.cash')}</span>
          </p>
        </div>
      </div>

      <div className="panel">
        <p className="panel-row">
          <span>{t('year.emergency')}</span>
          <b>{t('year.emergencyMonths', { n: new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(months), of: EMERGENCY_MONTHS })}</b>
        </p>
        <div className="meter" aria-hidden="true">
          <span style={{ width: `${filled * 100}%` }} />
        </div>
      </div>

      <section className="panel" aria-labelledby={holdingsTitle}>
        <p id={holdingsTitle} className="panel-title">
          {t('year.holdings')}
        </p>
        <dl className="holdings">
          {BUCKETS.filter((b) => b === 'cash' || b === 'etf' || holdings[b] > 0).map((b) => (
            <div key={b} className="holdings-row">
              <dt>
                <i className="dot" data-bucket={b} aria-hidden="true" />
                {t(BUCKET_KEY[b])}
              </dt>
              <dd>{money(holdings[b], lang)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="year-foot">
        {pending.actions.map((action) => (
          <button key={action} type="button" className="btn btn-wide" disabled={busy} onClick={() => decide({ kind: 'action', at: pending.at, action })}>
            {t(ACTION_KEY[action])}
          </button>
        ))}
        <button
          ref={next}
          type="button"
          className="btn btn-primary btn-wide"
          disabled={busy}
          onClick={() => decide({ kind: 'year', at: pending.at, saveRate: save / 100, etfShare: split / 100 })}
        >
          {t('year.next')} <span aria-hidden="true">▶</span>
        </button>
      </div>
    </section>
  )
}
