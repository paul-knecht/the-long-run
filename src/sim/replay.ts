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

/**
 * The log with one choice changed: the logged decision for the target is replaced, or added when
 * the log holds none (auto mode would have filled it in). The player's save rate in every year is
 * kept, so the money going in is theirs.
 * - A crash: every `year` decision from the crash's month on keeps its save rate but takes a frozen
 *   split. Selling means staying out, so after a sale that split is 0 (new money goes to the savings
 *   account, as the sale itself does); otherwise it is the split in force just before the crash, the
 *   one of the last `year` decision before it (the starting split if there is none). The actions from
 *   the crash's month on are dropped, so a seller never gets back in; every other event and crash
 *   choice stays. A crash in a year's last month comes before that boundary's year.
 * - An event: only that choice changes; the rest of the log stays as it is.
 */
export function flip(decisions: Decision[], target: Extract<FlipTarget, { kind: 'crash' }>, choice: CrashChoice): Decision[]
export function flip(decisions: Decision[], target: Extract<FlipTarget, { kind: 'event' }>, choice: EventChoice): Decision[]
export function flip(decisions: Decision[], target: FlipTarget, choice: CrashChoice | EventChoice): Decision[] {
  if (target.kind === 'event') {
    const rest = decisions.filter((d) => !(d.kind === 'event' && d.at === target.at && d.event === target.event))
    return [...rest, { kind: 'event', at: target.at, event: target.event, choice: choice as EventChoice }]
  }

  // The first year decision logged for a boundary is the one the engine uses.
  const before = decisions.reduce<YearDecision | undefined>(
    (last, d) => (d.kind === 'year' && d.at < target.at && (!last || d.at > last.at) ? d : last),
    undefined,
  )
  const etfShare = choice === 'sell' ? 0 : dialsOf(before ?? START_DIALS).etfShare
  const rest = decisions.flatMap((d): Decision[] => {
    if (d.kind === 'crash' && d.at === target.at) return []
    if (d.kind === 'action' && d.at >= target.at) return []
    if (d.kind === 'year' && d.at >= target.at) return [{ ...d, etfShare }]
    return [d]
  })
  return [...rest, { kind: 'crash', at: target.at, choice: choice as CrashChoice }]
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
    const flipped = simulate(setup, flip(decisions, { kind: 'crash', at }, sold ? 'hold' : 'sell'), 'auto')
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
