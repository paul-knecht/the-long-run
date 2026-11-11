import { type JSX, useId } from 'react'
import { type Key, percent, signed } from '../../i18n'
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
 * The takeover: the chart fills the screen in the crash colours, the total ticks down with the fall
 * so far, and once `shown` reaches the takeover month a doom headline and the cast pile in one after
 * another, then Sell / Hold / Buy more. "Buy more" is disabled, with the reason, when the savings
 * account holds nothing above the emergency fund.
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
  const { snapshots, flows } = timeline

  const now = Math.min(shown, pending.at)
  const high = fallStart(snapshots, pending.at)
  const from = Math.min(high, now)
  // What the market took since the high: the change in the total, less the money paid in or out meanwhile.
  let paidIn = 0
  for (let m = from + 1; m <= now; m++) paidIn += flows[m]
  const lost = Math.min(0, snapshots[now].total - snapshots[from].total - paidIn)
  const drawdown = now >= pending.at ? pending.drawdown : Math.max(0, 1 - snapshots[now].index / snapshots[high].index)
  const fall = t('crash.fall', { amount: signed(lost, lang), pct: percent(-drawdown, lang) })

  const arrived = shown >= pending.at
  const year = yearOnScreen(now, pending)
  const atTakeover = snapshots[pending.at]
  const canBuyMore = atTakeover.holdings.cash > atTakeover.emergencyTarget

  return (
    <main className="screen play crash" data-arrived={arrived || undefined}>
      <Header year={year} age={START_AGE + year} total={snapshots[now].total} change={lost} changeText={fall} mood="crash" />
      <Chart series={[{ id: 'you', values: snapshots.map((s) => s.total), emphasis: 'main' }]} length={MONTHS + 1} shown={now} mood="crash" lossFrom={high} />
      {arrived && (
        // One after another: the headline, each voice, then the choices (all at once when instant).
        <div className="crash-feed">
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
                    data-testid="reply"
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
