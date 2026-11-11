import { market } from '../data'
import { MONTHS } from './constants'
import { buildEnding } from './ending'
import { alternatives, flip } from './replay'
import { createRng, type Rng } from './rng'
import { createSetup } from './setup'
import { simulate } from './simulate'
import type { CrashChoice, Decision, EventChoice, EventId, Pending, RunSetup, Timeline } from './types'

const RUNS = 200
const MAX_STOPS = 60

/** The replies the message screen offers for each event. */
const REPLIES: Record<EventId, readonly EventChoice[]> = {
  werner: ['follow', 'decline'],
  keller: ['follow', 'decline'],
  jonas: ['follow', 'decline'],
  windfall: ['lump', 'spread', 'cash'],
  bill: ['ok'],
  raise: ['ok'],
}

type Stop = NonNullable<Pending>

/** A stop as the player meets it; an action taken on the year screen leaves a different one (fewer actions on offer). */
const stopKey = (p: Stop): string => (p.kind === 'event' ? `event:${p.at}:${p.event}` : p.kind === 'year' ? `year:${p.at}:${p.actions.join('+')}` : `crash:${p.at}`)

/**
 * A choice the screens allow at this stop, drawn at random: a reply to a message; sell, hold or (with
 * cash above the emergency fund) buy more in a crash; on the year screen, now and then one of the
 * actions on offer, else "Next year" with the save dial in whole percent and the split in tens.
 */
function choose(rng: Rng, timeline: Timeline, stop: Stop): Decision {
  if (stop.kind === 'event') return { kind: 'event', at: stop.at, event: stop.event, choice: rng.pick(REPLIES[stop.event]) }
  if (stop.kind === 'crash') {
    const { holdings, emergencyTarget } = timeline.snapshots[stop.at]
    const choices: CrashChoice[] = holdings.cash > emergencyTarget ? ['sell', 'hold', 'buyMore'] : ['sell', 'hold']
    return { kind: 'crash', at: stop.at, choice: rng.pick(choices) }
  }
  if (stop.actions.length > 0 && rng.next() < 0.5) return { kind: 'action', at: stop.at, action: rng.pick(stop.actions) }
  return { kind: 'year', at: stop.at, saveRate: rng.int(0, 30) / 100, etfShare: rng.int(0, 10) / 10 }
}

/** Plays a run in interactive mode, one stop at a time, as the app does. */
function play(setup: RunSetup, rng: Rng): { decisions: Decision[]; stops: string[]; timeline: Timeline } {
  const decisions: Decision[] = []
  const stops: string[] = []
  let timeline = simulate(setup, decisions)
  while (timeline.pending && stops.length <= MAX_STOPS) {
    stops.push(stopKey(timeline.pending))
    decisions.push(choose(rng, timeline, timeline.pending))
    timeline = simulate(setup, decisions)
  }
  return { decisions, stops, timeline }
}

/** Every number in a value that is NaN or infinite, by its path. */
const notFinite = (v: unknown, path = 'ending'): string[] => {
  if (typeof v === 'number') return Number.isFinite(v) ? [] : [`${path} = ${v}`]
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => notFinite(x, `${path}.${k}`))
  return []
}

test(`${RUNS} runs with random choices: each stop moves on, every amount is sound, and the lump-sum card agrees with the run`, () => {
  const windfallChoices = new Map<string, number>()
  for (let seed = 0; seed < RUNS; seed++) {
    const setup = createSetup(market, seed)
    const { decisions, stops, timeline } = play(setup, createRng(seed + 1_000_003))
    const run = `seed ${seed}`

    expect(new Set(stops).size, run).toBe(stops.length)
    expect(stops.length, run).toBeLessThanOrEqual(MAX_STOPS)
    expect(timeline.pending, run).toBeNull()
    expect(timeline.snapshots, run).toHaveLength(MONTHS + 1)
    for (const s of timeline.snapshots) {
      expect(Number.isFinite(s.total) && s.total >= 0, `${run}, month ${s.month}: total ${s.total}`).toBe(true)
      for (const [bucket, amount] of Object.entries(s.holdings)) expect(amount >= 0, `${run}, month ${s.month}: ${bucket} ${amount}`).toBe(true)
    }

    const ending = buildEnding(market, setup, decisions)
    expect(notFinite(ending), run).toEqual([])
    expect(ending.final, run).toBe(timeline.snapshots[MONTHS].total)
    const { choice, lumpFinal, spreadFinal } = ending.cards.lumpSum
    if (choice === 'lump') expect(lumpFinal, run).toBe(ending.final)
    if (choice === 'spread') expect(spreadFinal, run).toBe(ending.final)
    windfallChoices.set(choice, (windfallChoices.get(choice) ?? 0) + 1)
  }
  // Every reply to Grandma was met often enough to count.
  for (const choice of REPLIES.windfall) expect(windfallChoices.get(choice), choice).toBeGreaterThan(RUNS / 10)
}, 60_000)

test('on random runs the sold line puts nothing into the market from the sale to the end', () => {
  let checked = 0
  for (let seed = 0; seed < 150; seed++) {
    const setup = createSetup(market, seed)
    const { decisions } = play(setup, createRng(seed + 2_000_003))
    // A player who sold at the first takeover is shown the held line instead.
    const sold = alternatives(setup, decisions).find((a) => a.id === 'sold')
    if (!sold) continue
    const at = setup.takeovers[0]
    const run = simulate(setup, flip(setup, decisions, { kind: 'crash', at }, 'sell'), 'auto')
    expect(sold.totals, `seed ${seed}`).toEqual(run.snapshots.map((s) => s.total))
    // The sale takes everything invested to the savings account, Jonas's stock included, and nothing goes back.
    for (const s of run.snapshots.slice(at)) {
      const { etf, fund, stock } = s.holdings
      expect(etf + fund + stock, `seed ${seed}, month ${s.month}: ETF ${etf}, fund ${fund}, stock ${stock}`).toBe(0)
    }
    checked++
  }
  expect(checked).toBeGreaterThanOrEqual(100)
}, 60_000)
