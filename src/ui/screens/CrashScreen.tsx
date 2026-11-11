import { type JSX, useEffect, useId, useRef } from 'react'
import { type Key, money, percent } from '../../i18n'
import { MONTHS, START_AGE } from '../../sim/constants'
import type { CrashChoice, Decision, Pending, Timeline } from '../../sim/types'
import { Chart } from '../components/Chart'
import { Appear, ChatBubble, Headline } from '../components/ChatBubble'
import { Header } from '../components/Header'
import { useLang } from '../lang'
import { fallStart, yearOnScreen } from '../useReveal'

const HEADLINES: readonly Key[] = ['crash.headline.1', 'crash.headline.2', 'crash.headline.3', 'crash.headline.4']
const VOICES: readonly { from: Key; text: Key }[] = [
  { from: 'crash.werner.from', text: 'crash.werner' },
  { from: 'crash.keller.from', text: 'crash.keller' },
  { from: 'crash.lena.from', text: 'crash.lena' },
]
const CHOICES: readonly { choice: CrashChoice; label: Key; hint: Key }[] = [
  { choice: 'sell', label: 'crash.sell', hint: 'crash.sell.hint' },
  { choice: 'hold', label: 'crash.hold', hint: 'crash.hold.hint' },
  { choice: 'buyMore', label: 'crash.buyMore', hint: 'crash.buyMore.hint' },
]

/**
 * The takeover. While the market falls into it, the chart shows the ETF's price (green up to the
 * high, red after it) and the header shows the money invested, with the fall from the high and what
 * it has cost that money; with nothing invested the header keeps the total and says so. Once `shown`
 * reaches the takeover month a doom headline and the cast pile in one after another, then Sell /
 * Hold / Buy more. "Buy more" is disabled, with the reason, when the savings account holds nothing
 * above the emergency fund.
 */
export function CrashScreen(p: {
  timeline: Timeline
  pending: Extract<Pending, { kind: 'crash' }>
  shown: number
  decide(d: Decision): void
}): JSX.Element {
  const { timeline, pending, shown, decide } = p
  const { lang, t } = useLang()
  const ids = useId()
  const { snapshots } = timeline

  const now = Math.min(shown, pending.at)
  const high = fallStart(snapshots, pending.at)
  // The ETF's fall from its running high at the month on screen (pending.drawdown at the takeover).
  const fall = Math.max(0, 1 - snapshots[now].index / snapshots[fallStart(snapshots, now)].index)
  const { holdings } = snapshots[now]
  const invested = holdings.etf + holdings.fund + holdings.stock
  const anyInvested = Math.round(invested) > 0
  // What the fall has cost the money invested: it stood at invested / (1 - fall) at the high.
  const loss = (invested * fall) / (1 - fall)
  const pct = percent(fall, lang)

  const arrived = shown >= pending.at
  const year = yearOnScreen(now, pending)
  const atTakeover = snapshots[pending.at]
  const canBuyMore = atTakeover.holdings.cash > atTakeover.emergencyTarget

  // When the screen before took the focus with it, a neutral spot above the choices gets it once
  // they are there, so one Tab reaches Sell and no choice is pre-selected.
  const feed = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (arrived && document.activeElement === document.body) feed.current?.focus()
  }, [arrived])

  return (
    <main className="screen play crash" data-arrived={arrived || undefined}>
      {anyInvested ? (
        <Header
          year={year}
          age={START_AGE + year}
          total={invested}
          totalLabel={t('crash.investedLabel')}
          change={-loss}
          changeText={t('crash.fall', { pct, loss: money(loss, lang) })}
          mood="crash"
        />
      ) : (
        // The market is down; the line carries the arrow and the colour of a fall.
        <Header year={year} age={START_AGE + year} total={snapshots[now].total} change={-1} changeText={t('crash.fall.none', { pct })} mood="crash" />
      )}
      <p className="chart-caption" aria-hidden="true">
        {t('crash.chartLabel')}
      </p>
      <Chart
        series={[{ id: 'etf', values: snapshots.map((s) => s.index), emphasis: 'main' }]}
        length={MONTHS + 1}
        shown={now}
        mood="crash"
        lossFrom={high}
        label={t('crash.chartLabel')}
      />
      {arrived && (
        // One after another: the headline, each voice, then the choices (all at once when instant).
        <div className="crash-feed" ref={feed} tabIndex={-1}>
          <Appear>
            <Headline text={t(HEADLINES[pending.at % HEADLINES.length])} />
          </Appear>
          {VOICES.map((voice, i) => (
            <Appear key={voice.from} step={i + 1} follow>
              <ChatBubble from={t(voice.from)} texts={[t(voice.text)]} />
            </Appear>
          ))}
          <Appear className="crash-choices" step={VOICES.length + 1} follow>
            <p className="crash-question">{t('crash.question')}</p>
            {CHOICES.map((c) => {
              const disabled = c.choice === 'buyMore' && !canBuyMore
              const hintId = `${ids}-${c.choice}`
              return (
                <div key={c.choice} className="crash-choice">
                  <button
                    type="button"
                    className={c.choice === 'sell' ? 'btn btn-hot' : 'btn'}
                    disabled={disabled}
                    aria-describedby={hintId}
                    onClick={() => decide({ kind: 'crash', at: pending.at, choice: c.choice })}
                  >
                    {t(c.label)}
                  </button>
                  <p id={hintId} className="crash-hint">
                    {t(disabled ? 'crash.buyMore.disabled' : c.hint)}
                  </p>
                </div>
              )
            })}
          </Appear>
        </div>
      )}
    </main>
  )
}
