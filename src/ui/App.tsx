import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { market } from '../data'
import { type Lang, detectLang, t as translate } from '../i18n'
import { MONTHS, START_AGE } from '../sim/constants'
import { createSetup } from '../sim/setup'
import { decisionKey, simulate } from '../sim/simulate'
import type { Decision, Timeline } from '../sim/types'
import { Chart } from './components/Chart'
import { Header } from './components/Header'
import { LangContext, type LangContextValue } from './lang'
import { CrashScreen } from './screens/CrashScreen'
import { MessageScreen, Reaction } from './screens/MessageScreen'
import { StartScreen } from './screens/StartScreen'
import { YearScreen } from './screens/YearScreen'
import { FALL_MS, MONTH_MS, fallStart, useReveal, yearOnScreen } from './useReveal'

type Phase = 'start' | 'play' | 'ending' | 'practice'
type Mood = 'calm' | 'crash'
type EventDecision = Extract<Decision, { kind: 'event' }>

// oxlint-disable-next-line react/only-export-components -- the plan promised useLang from App; it lives in ./lang
export { useLang } from './lang'

const randomSeed = (): number => Math.floor(Math.random() * 2 ** 32)

/** jsdom has no matchMedia, so a missing one counts as "no preference". */
const prefersReducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * The whole game. It keeps only the seed, the decision log, the language and the phase; everything
 * on screen is re-simulated from the seed and the log. The props exist for tests.
 * - `seed` fixes the seed of every run (otherwise each run draws a random one).
 * - `instant` turns all animation off; it is also on when the system asks for reduced motion.
 * - `cooldownMs` is how long after a recorded decision further decisions are ignored.
 */
export function App(props: { seed?: number; instant?: boolean; cooldownMs?: number }): JSX.Element {
  const { seed: fixedSeed, cooldownMs = 400 } = props
  const [instant] = useState(() => props.instant === true || prefersReducedMotion())
  const [lang, setLang] = useState<Lang>(() => detectLang(navigator.language))
  const [phase, setPhase] = useState<Phase>('start')
  const [seed, setSeed] = useState(() => fixedSeed ?? randomSeed())
  const [decisions, setDecisions] = useState<Decision[]>([])

  const setup = useMemo(() => createSetup(market, seed), [seed])
  const timeline = useMemo(() => simulate(setup, decisions), [setup, decisions])
  const { pending } = timeline

  // The chart draws up to the newest month, slowly through a fall that ends in a takeover.
  const fallFrom = pending?.kind === 'crash' ? fallStart(timeline.snapshots, pending.at) : null
  const { shown, busy } = useReveal(timeline.snapshots.length - 1, {
    instant,
    msPerMonth: (month) => (fallFrom !== null && month > fallFrom ? FALL_MS : MONTH_MS),
  })

  const lastRecordedAt = useRef(-Infinity)
  /** Records a decision unless the chart is still drawing, one was just recorded, or the log already holds it. */
  const decide = useCallback(
    (d: Decision): void => {
      const now = Date.now()
      const key = decisionKey(d)
      if (busy || now - lastRecordedAt.current < cooldownMs || decisions.some((x) => decisionKey(x) === key)) return
      lastRecordedAt.current = now
      setDecisions((log) => (log.some((x) => decisionKey(x) === key) ? log : [...log, d]))
    },
    [busy, cooldownMs, decisions],
  )

  /** A new run: a fresh seed, an empty log, straight into year 1. "Play again" (Task 12) calls this too. */
  const startRun = (): void => {
    setSeed(fixedSeed ?? randomSeed())
    setDecisions([])
    setPhase('play')
  }

  // The ending follows once nothing is pending and the last months have been drawn.
  const view: Phase = phase === 'play' && pending === null && !busy ? 'ending' : phase
  // The screen turns once the line starts falling into a takeover.
  const mood: Mood = view === 'play' && fallFrom !== null && shown > fallFrom ? 'crash' : 'calm'
  // The pay of the month after the one on screen: the year being drawn, or the year ahead at a stop
  // (which the year screen and the raise show).
  const salary = setup.salary[Math.min(shown, MONTHS - 1)]
  // A reply given at this year boundary, whose sender may answer on the year screen.
  const reaction = pending?.kind === 'year' ? decisions.find((d): d is EventDecision => d.kind === 'event' && d.at === pending.at) : undefined

  const langValue = useMemo<LangContextValue>(
    () => ({ lang, setLang, t: (key, params) => translate(lang, key, params) }),
    [lang],
  )
  useEffect(() => {
    document.documentElement.lang = lang
    document.title = translate(lang, 'start.title')
  }, [lang])

  return (
    <LangContext.Provider value={langValue}>
      <div className="app" data-mood={mood} data-instant={instant || undefined}>
        {view === 'start' && <StartScreen onStart={startRun} />}
        {view === 'play' && (
          <PlayScreen timeline={timeline} shown={shown} busy={busy} mood={mood} salary={salary} reaction={reaction} decide={decide} />
        )}
        {(view === 'ending' || view === 'practice') && <div data-testid="ending" />}
      </div>
    </LangContext.Provider>
  )
}

interface PlayScreenProps {
  timeline: Timeline
  /** Completed months drawn so far. */
  shown: number
  busy: boolean
  mood: Mood
  /** Monthly pay of the month after the one on screen. */
  salary: number
  reaction?: EventDecision
  decide(d: Decision): void
}

/**
 * The playing screens, chosen by what the run waits for. Once the line falls into a takeover the
 * crash screen has the whole screen. Otherwise the header and the chart sit on top; below them the
 * year's choices (disabled while the year is drawn), or a message once the year is drawn.
 */
function PlayScreen({ timeline, shown, busy, mood, salary, reaction, decide }: PlayScreenProps): JSX.Element {
  const { pending } = timeline
  if (mood === 'crash' && pending?.kind === 'crash') return <CrashScreen timeline={timeline} pending={pending} shown={shown} decide={decide} />

  const year = yearOnScreen(shown, pending)
  // "This year" is the year being drawn, or the one just finished at a year boundary.
  const yearStart = shown === 0 ? 0 : Math.floor((shown - 1) / 12) * 12
  const total = timeline.snapshots[shown].total
  const { dials } = timeline
  return (
    <main className="screen play">
      <Header year={year} age={START_AGE + year} total={total} change={total - timeline.snapshots[yearStart].total} mood={mood} />
      <Chart series={[{ id: 'you', values: timeline.snapshots.map((s) => s.total), emphasis: 'main' }]} length={MONTHS + 1} shown={shown} mood={mood} />
      {pending?.kind === 'year' && (
        <>
          {reaction && <Reaction event={reaction.event} choice={reaction.choice} />}
          {/* A new year, or an action that changed the dials in force, starts the dials afresh. */}
          <YearScreen
            key={`${pending.at}:${dials.saveRate}:${dials.etfShare}`}
            timeline={timeline}
            pending={pending}
            shown={shown}
            busy={busy}
            salary={salary}
            decide={decide}
          />
        </>
      )}
      {pending?.kind === 'event' && !busy && <MessageScreen key={pending.at} timeline={timeline} pending={pending} salary={salary} decide={decide} />}
    </main>
  )
}
