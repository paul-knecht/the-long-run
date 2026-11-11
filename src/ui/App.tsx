import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { market } from '../data'
import { type Key, type Lang, detectLang, t as translate } from '../i18n'
import { MONTHS, START_AGE } from '../sim/constants'
import { createSetup } from '../sim/setup'
import { decisionKey, simulate } from '../sim/simulate'
import type { Decision, Pending, Timeline } from '../sim/types'
import { Chart } from './components/Chart'
import { Header } from './components/Header'
import { StartScreen } from './screens/StartScreen'

type Phase = 'start' | 'play' | 'ending' | 'practice'
type Mood = 'calm' | 'crash'

interface LangContextValue {
  lang: Lang
  setLang(l: Lang): void
  t(key: Key, params?: Record<string, string | number>): string
}

/** English with a switch that does nothing, so a screen rendered on its own (in a test) still has words. */
const LangContext = createContext<LangContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key, params) => translate('en', key, params),
})

/** The current language, a way to change it, and `t` bound to it. */
// oxlint-disable-next-line react/only-export-components -- the plan puts useLang next to App; Fast Refresh reloads this file fully
export function useLang(): LangContextValue {
  return useContext(LangContext)
}

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

  // Task 11 animates `shown` up to the newest month (useReveal, honouring `instant`) and is busy meanwhile.
  const shown = timeline.snapshots.length - 1
  const busy = false

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
  const view: Phase = phase === 'play' && timeline.pending === null && !busy ? 'ending' : phase
  const mood: Mood = view === 'play' && timeline.pending?.kind === 'crash' ? 'crash' : 'calm'

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
        {view === 'play' && <PlayScreen timeline={timeline} pending={timeline.pending} shown={shown} busy={busy} mood={mood} decide={decide} />}
        {(view === 'ending' || view === 'practice') && <div data-testid="ending" />}
      </div>
    </LangContext.Provider>
  )
}

interface PlayScreenProps {
  timeline: Timeline
  pending: Pending
  /** Completed months drawn so far. */
  shown: number
  busy: boolean
  mood: Mood
  decide(d: Decision): void
}

/**
 * The seam for the playing screens. Task 11 swaps in YearScreen, MessageScreen and CrashScreen here,
 * chosen by `pending.kind`, and hands them `timeline`, `pending` and `decide`. Until then every stop
 * shows the header and the chart.
 */
function PlayScreen({ timeline, pending, shown, mood }: PlayScreenProps): JSX.Element {
  const year = yearOnScreen(shown, pending)
  // "This year" is the year being drawn, or the one just finished at a year boundary.
  const yearStart = shown === 0 ? 0 : Math.floor((shown - 1) / 12) * 12
  const total = timeline.snapshots[shown].total
  return (
    <main className="screen play">
      <Header year={year} age={START_AGE + year} total={total} change={total - timeline.snapshots[yearStart].total} mood={mood} />
      <Chart series={[{ id: 'you', values: timeline.snapshots.map((s) => s.total), emphasis: 'main' }]} length={MONTHS + 1} shown={shown} mood={mood} />
    </main>
  )
}

/**
 * The year to show after `month` completed months: a stop at a year boundary belongs to the year
 * about to start, any other month to the year being drawn.
 */
function yearOnScreen(month: number, pending: Pending): number {
  if (pending && pending.kind !== 'crash' && pending.at === month) return month / 12 + 1
  return Math.max(1, Math.ceil(month / 12))
}
