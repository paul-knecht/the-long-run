import { START_DIALS } from './constants'
import { deposit, empty, grow, total } from './portfolio'
import { dialsOf, simulate } from './simulate'
import type { CrashChoice, Decision, EventChoice, EventId, Holdings, RunSetup } from './types'

export type AltId = 'held' | 'sold' | 'etfOnly' | 'fundOnly' | 'cashOnly'

export interface Alternative {
  id: AltId
  /** Value after each month, 0 to 240. */
  totals: number[]
  final: number
  emphasised: boolean
}

/** The choice to turn around: the crash at a month, or one named event at a year boundary. */
export type FlipTarget = { kind: 'crash'; at: number } | { kind: 'event'; at: number; event: EventId }

type YearDecision = Extract<Decision, { kind: 'year' }>

/** The answers of a seller who stays out: every offer turned down, Grandma's money left in savings. */
const STAY_OUT: readonly { event: EventId; choice: EventChoice }[] = [
  { event: 'werner', choice: 'decline' },
  { event: 'keller', choice: 'decline' },
  { event: 'jonas', choice: 'decline' },
  { event: 'windfall', choice: 'cash' },
]

/**
 * The log with one choice changed: the logged decision for the target is replaced, or added when
 * the log holds none (auto mode would have filled it in). The player's save rate in every year is
 * kept, so the money going in is theirs.
 *
 * A crash at month `at`. What comes after it is everything from `at` on, except a crash at `at`
 * itself; a crash in a year's last month comes before that boundary's event and year.
 * - Every later `year` decision keeps its save rate and takes a frozen split.
 * - Every later action is dropped and every later crash is held.
 * - Flipped to hold: the frozen split is the one in force just before the crash, the split of the
 *   last `year` decision before it (the starting split if there is none). Later events stay.
 * - Flipped to sell, the seller stays out: the frozen split is 0, so new money goes to the savings
 *   account. Every later offer from Uncle Werner, Mr. Keller and Jonas is declined, and Grandma's
 *   money is left in the savings account, whether those events were logged or not. The sale takes
 *   everything invested (ETF, fund and Jonas's stock) to the savings account, so from the sale to
 *   the end nothing is invested.
 *
 * An event: only that choice changes; the rest of the log stays as it is.
 */
export function flip(setup: RunSetup, decisions: Decision[], target: Extract<FlipTarget, { kind: 'crash' }>, choice: CrashChoice): Decision[]
export function flip(setup: RunSetup, decisions: Decision[], target: Extract<FlipTarget, { kind: 'event' }>, choice: EventChoice): Decision[]
export function flip(setup: RunSetup, decisions: Decision[], target: FlipTarget, choice: CrashChoice | EventChoice): Decision[] {
  const isEvent = (d: Decision, event: EventId, at: number): boolean => d.kind === 'event' && d.event === event && d.at === at
  if (target.kind === 'event') {
    return [...decisions.filter((d) => !isEvent(d, target.event, target.at)), { kind: 'event', at: target.at, event: target.event, choice: choice as EventChoice }]
  }

  const sell = choice === 'sell'
  // The first year decision logged for a boundary is the one the engine uses.
  const before = decisions.reduce<YearDecision | undefined>(
    (last, d) => (d.kind === 'year' && d.at < target.at && (!last || d.at > last.at) ? d : last),
    undefined,
  )
  const etfShare = sell ? 0 : dialsOf(before ?? START_DIALS).etfShare
  const stayOut = sell ? STAY_OUT.filter(({ event }) => setup.schedule[event] >= target.at) : []

  const rest = decisions.flatMap((d): Decision[] => {
    if (d.kind === 'crash') return d.at < target.at ? [d] : d.at > target.at ? [{ ...d, choice: 'hold' }] : []
    if (d.kind === 'action' && d.at >= target.at) return []
    if (d.kind === 'year' && d.at >= target.at) return [{ ...d, etfShare }]
    if (stayOut.some(({ event }) => isEvent(d, event, setup.schedule[event]))) return []
    return [d]
  })
  return [
    ...rest,
    ...stayOut.map(({ event, choice: answer }): Decision => ({ kind: 'event', at: setup.schedule[event], event, choice: answer })),
    { kind: 'crash', at: target.at, choice: choice as CrashChoice },
  ]
}

/**
 * The same outside money, month by month, into one place. A positive flow is deposited (the
 * fund keeps back its entry fee); a negative one is withdrawn, never below zero.
 */
export function singleBucket(setup: RunSetup, flows: number[], bucket: 'cash' | 'etf' | 'fund'): number[] {
  let h: Holdings = { ...empty(), [bucket]: Math.max(0, flows[0] ?? 0) }
  const totals = [total(h)]
  for (let m = 1; m < flows.length; m++) {
    const r = setup.returns[m - 1]
    h = grow(h, { stock: r.stock, cash: r.cash, stockExtra: 0 })
    const flow = flows[m]
    if (flow > 0) h = deposit(h, bucket, flow)
    else if (flow < 0) h = { ...h, [bucket]: Math.max(0, h[bucket] + flow) }
    totals.push(total(h))
  }
  return totals
}

const alt = (id: AltId, totals: number[], emphasised: boolean): Alternative => ({
  id,
  totals,
  final: totals[totals.length - 1],
  emphasised,
})

/**
 * What else the player's run could have been: the first crash choice turned around, then the
 * same savings in the ETF only, the bank's fund only, and a savings account only.
 */
export function alternatives(setup: RunSetup, decisions: Decision[]): Alternative[] {
  const own = simulate(setup, decisions, 'auto')
  const out: Alternative[] = []
  const at = setup.takeovers[0]
  if (at !== undefined) {
    const logged = decisions.find((d) => d.kind === 'crash' && d.at === at)
    const sold = logged?.kind === 'crash' && logged.choice === 'sell'
    const flipped = simulate(setup, flip(setup, decisions, { kind: 'crash', at }, sold ? 'hold' : 'sell'), 'auto')
    out.push(
      alt(
        sold ? 'held' : 'sold',
        flipped.snapshots.map((s) => s.total),
        true,
      ),
    )
  }
  out.push(alt('etfOnly', singleBucket(setup, own.flows, 'etf'), false))
  out.push(alt('fundOnly', singleBucket(setup, own.flows, 'fund'), true))
  out.push(alt('cashOnly', singleBucket(setup, own.flows, 'cash'), true))
  return out
}
