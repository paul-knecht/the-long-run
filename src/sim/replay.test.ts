import { market } from '../data'
import { createSetup } from './setup'
import { alternatives, flip, singleBucket } from './replay'
import { simulate } from './simulate'
import { yearly } from './testHelpers'
import type { Decision } from './types'

const setup = createSetup(market, 3)

test('flip freezes later dials', () => {
  const log = [...yearly(20, 0.15, 0.7)]
  const at = 60
  const out = flip([...log, { kind: 'crash', at, choice: 'sell' }], { kind: 'crash', at }, 'hold')
  expect(out.filter((d) => d.kind === 'year').every((d) => d.at <= at)).toBe(true)
  expect(out.find((d) => d.kind === 'crash')).toMatchObject({ choice: 'hold' })
})

test('flip keeps the year taken at the target boundary and drops later actions', () => {
  const log: Decision[] = [
    ...yearly(20, 0.15, 0.7),
    { kind: 'action', at: 48, action: 'getBackIn' },
    { kind: 'action', at: 60, action: 'sellStock' },
    { kind: 'event', at: 72, event: 'werner', choice: 'follow' },
    { kind: 'crash', at: 60, choice: 'sell' },
  ]
  const out = flip(log, { kind: 'crash', at: 60 }, 'hold')
  expect(out.some((d) => d.kind === 'year' && d.at === 60)).toBe(true)
  expect(out.some((d) => d.kind === 'action' && d.at === 48)).toBe(true)
  expect(out.some((d) => d.kind === 'action' && d.at === 60)).toBe(false)
  expect(out.some((d) => d.kind === 'event')).toBe(true)
  expect(out.filter((d) => d.kind === 'crash')).toEqual([{ kind: 'crash', at: 60, choice: 'hold' }])
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
