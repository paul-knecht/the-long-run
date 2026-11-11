import { deposit, empty, grow, total } from './portfolio'
import { simulate } from './simulate'
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

/**
 * The log with one crash or event choice changed: the logged decision for the target is
 * replaced, or added when the log holds none (auto mode would have filled it in). Whatever
 * the player did after that point in their dials and actions is dropped, so the replay
 * (in 'auto' mode) carries the dials in force at the target forward. A `year` decision taken
 * at the target's own boundary stays.
 */
export function flip(decisions: Decision[], target: FlipTarget, choice: string): Decision[] {
  const isTarget = (d: Decision): boolean =>
    d.kind === target.kind &&
    d.at === target.at &&
    (d.kind !== 'event' || target.kind !== 'event' || d.event === target.event)
  const rest = decisions.filter(
    (d) => !isTarget(d) && !(d.kind === 'year' && d.at > target.at) && !(d.kind === 'action' && d.at >= target.at),
  )
  const flipped: Decision =
    target.kind === 'crash'
      ? { kind: 'crash', at: target.at, choice: choice as CrashChoice }
      : { kind: 'event', at: target.at, event: target.event, choice: choice as EventChoice }
  return [...rest, flipped]
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
