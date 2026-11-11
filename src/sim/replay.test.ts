import { market } from '../data'
import { START_DIALS } from './constants'
import { createSetup } from './setup'
import { alternatives, flip, singleBucket } from './replay'
import { simulate } from './simulate'
import { yearly } from './testHelpers'
import type { Decision } from './types'

const setup = createSetup(market, 3)

/** Ten years at one setting, then ten at another. */
const twoHalves = (first: { saveRate: number; etfShare: number }, second: { saveRate: number; etfShare: number }): Decision[] =>
  Array.from({ length: 20 }, (_, i): Decision => ({ kind: 'year', at: 12 * i, ...(i < 10 ? first : second) }))

test('a flipped crash keeps every later save rate and freezes the split in force before it', () => {
  const at = 101
  const log: Decision[] = [...twoHalves({ saveRate: 0.1, etfShare: 0.7 }, { saveRate: 0.25, etfShare: 0.2 }), { kind: 'crash', at, choice: 'sell' }]
  const out = flip(log, { kind: 'crash', at }, 'hold')
  const years = out.filter((d) => d.kind === 'year')
  expect(years.map((d) => d.at)).toEqual(log.filter((d) => d.kind === 'year').map((d) => d.at))
  for (const y of years) {
    // Before the crash nothing changes; from the crash on the save rate is the player's and the split is the one before it.
    expect(y).toEqual({ kind: 'year', at: y.at, saveRate: y.at < 120 ? 0.1 : 0.25, etfShare: 0.7 })
  }
  expect(out.filter((d) => d.kind === 'crash')).toEqual([{ kind: 'crash', at, choice: 'hold' }])
})

test('a flipped crash at a year end treats that boundary as later, and drops the actions from the crash on', () => {
  const log: Decision[] = [
    ...yearly(4, 0.15, 0.7),
    { kind: 'year', at: 48, saveRate: 0.2, etfShare: 0 },
    { kind: 'year', at: 60, saveRate: 0.3, etfShare: 0.4 },
    { kind: 'year', at: 72, saveRate: 0.05, etfShare: 1 },
    { kind: 'action', at: 48, action: 'getBackIn' },
    { kind: 'action', at: 60, action: 'sellStock' },
    { kind: 'action', at: 72, action: 'getBackIn' },
    { kind: 'event', at: 72, event: 'werner', choice: 'follow' },
    { kind: 'crash', at: 90, choice: 'sell' },
    { kind: 'crash', at: 60, choice: 'sell' },
  ]
  const out = flip(log, { kind: 'crash', at: 60 }, 'hold')
  // The crash at month 60 is decided before the year that starts there: the split in force is the one set at 48.
  expect(out.filter((d) => d.kind === 'year' && d.at >= 60)).toEqual([
    { kind: 'year', at: 60, saveRate: 0.3, etfShare: 0 },
    { kind: 'year', at: 72, saveRate: 0.05, etfShare: 0 },
  ])
  expect(out.filter((d) => d.kind === 'year' && d.at < 60)).toEqual(log.filter((d) => d.kind === 'year' && d.at < 60))
  expect(out.filter((d) => d.kind === 'action')).toEqual([{ kind: 'action', at: 48, action: 'getBackIn' }])
  // Other choices, later crashes included, stay.
  expect(out).toContainEqual({ kind: 'event', at: 72, event: 'werner', choice: 'follow' })
  expect(out.filter((d) => d.kind === 'crash')).toEqual([
    { kind: 'crash', at: 90, choice: 'sell' },
    { kind: 'crash', at: 60, choice: 'hold' },
  ])
})

test('a flipped crash with no earlier year takes the starting split; one with no later year adds none', () => {
  const late: Decision[] = [{ kind: 'year', at: 120, saveRate: 0.2, etfShare: 0.9 }]
  expect(flip(late, { kind: 'crash', at: 50 }, 'sell').filter((d) => d.kind === 'year')).toEqual([
    { kind: 'year', at: 120, saveRate: 0.2, etfShare: START_DIALS.etfShare },
  ])
  expect(flip([], { kind: 'crash', at: 50 }, 'sell')).toEqual([{ kind: 'crash', at: 50, choice: 'sell' }])
})

test('a flipped event changes only that choice: every later dial and action stays', () => {
  const log: Decision[] = [
    ...twoHalves({ saveRate: 0.1, etfShare: 0.7 }, { saveRate: 0.25, etfShare: 0.2 }),
    { kind: 'action', at: 108, action: 'getBackIn' },
    { kind: 'action', at: 132, action: 'sellStock' },
    { kind: 'crash', at: 140, choice: 'sell' },
    { kind: 'event', at: 108, event: 'windfall', choice: 'lump' },
  ]
  const out = flip(log, { kind: 'event', at: 108, event: 'windfall' }, 'spread')
  expect(out).toEqual([...log.slice(0, -1), { kind: 'event', at: 108, event: 'windfall', choice: 'spread' }])
})

test("a flipped crash replays the player's own contributions, month by month", () => {
  // Seed 1 takes over at month 101 and sends the car bill at month 108.
  const one = createSetup(market, 1)
  const at = one.takeovers[0]
  expect(at).toBe(101)
  const sold: Decision[] = [...twoHalves({ saveRate: 0.1, etfShare: 0.7 }, { saveRate: 0.25, etfShare: 0.7 }), { kind: 'crash', at, choice: 'sell' }, { kind: 'action', at: 108, action: 'getBackIn' }]
  const held: Decision[] = [...twoHalves({ saveRate: 0.1, etfShare: 0.7 }, { saveRate: 0.3, etfShare: 0.2 }), { kind: 'crash', at, choice: 'hold' }]
  for (const [log, other] of [[sold, 'hold'], [held, 'sell']] as const) {
    const own = simulate(one, log, 'auto')
    const flipped = simulate(one, flip(log, { kind: 'crash', at }, other), 'auto')
    expect(flipped.flows).toEqual(own.flows)
    expect(flipped.snapshots[240].total).not.toBe(own.snapshots[240].total)
  }
})

test('flip types the choice by the kind of target', () => {
  const log = yearly(20, 0.1, 0.5)
  // @ts-expect-error a crash takes a crash choice
  expect(() => flip(log, { kind: 'crash', at: 60 }, 'lump')).not.toThrow()
  // @ts-expect-error an event takes an event choice
  expect(() => flip(log, { kind: 'event', at: 12, event: 'werner' }, 'hold')).not.toThrow()
})

test('flip adds a crash decision when none was logged, and replaces an event choice', () => {
  const added = flip(yearly(20, 0.1, 0.5), { kind: 'crash', at: 60 }, 'sell')
  expect(added.filter((d) => d.kind === 'crash')).toEqual([{ kind: 'crash', at: 60, choice: 'sell' }])
  const log: Decision[] = [...yearly(3, 0.1, 0.5), { kind: 'event', at: 12, event: 'werner', choice: 'follow' }]
  const out = flip(log, { kind: 'event', at: 12, event: 'werner' }, 'decline')
  expect(out.filter((d) => d.kind === 'event')).toEqual([{ kind: 'event', at: 12, event: 'werner', choice: 'decline' }])
})

test("alternatives share the player's contributions", () => {
  const log = yearly(20, 0.15, 0.7)
  const t = simulate(setup, log, 'auto')
  const alts = alternatives(setup, log)
  const by = Object.fromEntries(alts.map((a) => [a.id, a]))
  expect(alts.every((a) => a.totals.length === 241)).toBe(true)
  expect(by.fundOnly.final).toBeLessThan(by.etfOnly.final) // same market, higher costs: always true
  expect(by.sold).toBeDefined()
  expect(by.held).toBeUndefined() // the player held (auto default)
  const paidIn = t.flows.reduce((a, b) => a + b, 0)
  expect(singleBucket(setup, t.flows, 'cash')[240]).toBeGreaterThanOrEqual(paidIn * 0.99)
})

test('alternatives: order, emphasis and final match totals', () => {
  const alts = alternatives(setup, yearly(20, 0.15, 0.7))
  expect(alts.map((a) => a.id)).toEqual(['sold', 'etfOnly', 'fundOnly', 'cashOnly'])
  expect(alts.map((a) => a.emphasised)).toEqual([true, false, true, true])
  expect(alts.every((a) => a.final === a.totals[240])).toBe(true)
})

test('a player who sold at the first takeover is shown what holding would have done', () => {
  const at = setup.takeovers[0]
  const log: Decision[] = [...yearly(20, 0.15, 0.7), { kind: 'crash', at, choice: 'sell' }]
  const alts = alternatives(setup, log)
  expect(alts[0].id).toBe('held')
  expect(alts.some((a) => a.id === 'sold')).toBe(false)
  const held = simulate(setup, flip(log, { kind: 'crash', at }, 'hold'), 'auto')
  expect(alts[0].final).toBe(held.snapshots[240].total)
})

test('singleBucket: withdrawals never go below zero and the fund pays its entry fee', () => {
  const flows = new Array<number>(241).fill(0)
  flows[1] = 100
  flows[2] = -500
  flows[3] = 50
  const cash = singleBucket(setup, flows, 'cash')
  expect(cash[2]).toBe(0)
  expect(cash[3]).toBeCloseTo(50 * 1, 6)
  const fund = singleBucket(setup, flows, 'fund')
  expect(fund[1]).toBeCloseTo(95, 9)
  expect(fund.every((v) => v >= 0)).toBe(true)
})

test('zero savings stays finite and non-negative', () => {
  expect(alternatives(setup, yearly(20, 0, 0.5)).every((a) => Number.isFinite(a.final) && a.final >= 0)).toBe(true)
})

test('flip adds a missing event decision, so lump and spread differ; a logged one is replaced, not duplicated', () => {
  const at = setup.schedule.windfall
  const log = yearly(20, 0.15, 0.7)
  const target = { kind: 'event', at, event: 'windfall' } as const
  const lump = flip(log, target, 'lump')
  const spread = flip(log, target, 'spread')
  expect(spread.filter((d) => d.kind === 'event')).toEqual([{ kind: 'event', at, event: 'windfall', choice: 'spread' }])
  expect(simulate(setup, spread, 'auto').snapshots[240].total).not.toBe(
    simulate(setup, lump, 'auto').snapshots[240].total,
  )
  const again = flip(lump, target, 'spread')
  expect(again.filter((d) => d.kind === 'event')).toEqual([{ kind: 'event', at, event: 'windfall', choice: 'spread' }])
})
