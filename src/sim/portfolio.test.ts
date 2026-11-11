import { market } from '../data'
import { ETF_COST, FUND_COST, MONTHS } from './constants'
import { deposit, empty, grow, marketLoss, move, payBill, total } from './portfolio'
import { createSetup } from './setup'
import { simulate } from './simulate'
import type { Decision, Holdings, RunSetup, Snapshot } from './types'

const flat = { stock: 0, cash: 0, stockExtra: 0 }

test('fund charges entry fee and yearly cost', () => {
  const h = deposit(empty(), 'fund', 1000)
  expect(h.fund).toBeCloseTo(950)
  expect(grow(h, flat).fund).toBeCloseTo(950 * (1 - 0.018 / 12))
})

test('etf carries its yearly cost', () => {
  expect(grow({ ...empty(), etf: 1200 }, flat).etf).toBeCloseTo(1200 * (1 - 0.002 / 12))
})

test('grow applies each bucket its own return', () => {
  const g = grow({ cash: 1000, etf: 1000, fund: 1000, stock: 1000 }, { stock: 0.02, cash: 0.001, stockExtra: -0.03 })
  expect(g.cash).toBeCloseTo(1001)
  expect(g.etf).toBeCloseTo(1000 * 1.02 * (1 - 0.002 / 12))
  expect(g.fund).toBeCloseTo(1000 * 1.02 * (1 - 0.018 / 12))
  expect(g.stock).toBeCloseTo(990)
})

test('single stock cannot fall below 5% of its value in a month', () => {
  expect(grow({ ...empty(), stock: 1000 }, { stock: -0.5, cash: 0, stockExtra: -0.9 }).stock).toBeCloseTo(50)
})

test('deposit into a non-fund bucket arrives in full and ignores non-positive amounts', () => {
  expect(deposit(empty(), 'etf', 400).etf).toBe(400)
  const h = { ...empty(), cash: 10 }
  expect(deposit(h, 'etf', 0)).toEqual(h)
  expect(deposit(h, 'etf', -5)).toEqual(h)
})

test('move clamps', () => {
  const h = move({ ...empty(), etf: 100 }, 'etf', 'cash', 500)
  expect(h).toMatchObject({ etf: 0, cash: 100 })
})

test('move into the fund charges the entry fee on the amount actually moved; out of it is free', () => {
  const into = move({ ...empty(), cash: 100 }, 'cash', 'fund', 500)
  expect(into.cash).toBe(0)
  expect(into.fund).toBeCloseTo(95)
  const out = move({ ...empty(), fund: 200 }, 'fund', 'etf', 80)
  expect(out).toMatchObject({ fund: 120, etf: 80 })
})

test('move with zero, negative or same-bucket amounts changes nothing', () => {
  const h = { cash: 10, etf: 20, fund: 30, stock: 40 }
  expect(move(h, 'etf', 'cash', 0)).toEqual(h)
  expect(move(h, 'etf', 'cash', -5)).toEqual(h)
  expect(move(h, 'etf', 'etf', 5)).toEqual(h)
})

test('functions do not mutate their argument', () => {
  const h = { cash: 10, etf: 20, fund: 30, stock: 40 }
  const copy = { ...h }
  grow(h, { stock: 0.01, cash: 0.001, stockExtra: 0 })
  deposit(h, 'fund', 5)
  move(h, 'etf', 'cash', 5)
  payBill(h, 50)
  expect(h).toEqual(copy)
})

test('bill uses cash first, then sells', () => {
  const r = payBill({ cash: 1000, etf: 5000, fund: 0, stock: 0 }, 3000)
  expect(r).toMatchObject({ fromCash: 1000, sold: 2000, unpaid: 0 })
  expect(r.holdings.etf).toBe(3000)
})

test('bill sells etf, then fund, then stock', () => {
  const r = payBill({ cash: 0, etf: 100, fund: 100, stock: 100 }, 250)
  expect(r.holdings).toEqual({ cash: 0, etf: 0, fund: 0, stock: 50 })
  expect(r).toMatchObject({ fromCash: 0, sold: 250, unpaid: 0 })
})

test('bill larger than everything leaves zero, not negative', () => {
  const r = payBill({ cash: 100, etf: 200, fund: 0, stock: 0 }, 3000)
  expect(total(r.holdings)).toBe(0)
  expect(r.unpaid).toBe(2700)
  expect(Object.values(r.holdings).every((v) => v >= 0)).toBe(true)
})

describe('marketLoss', () => {
  const base = createSetup(market, 3)
  /** A run whose months return `stock` (and `extra` on top for the single stock), cash nothing. */
  const withReturns = (stock: number[], extra: number[] = []): RunSetup => ({
    ...base,
    returns: Array.from({ length: MONTHS }, (_, i) => ({ stock: stock[i] ?? 0, cash: 0.01 })),
    stockAlpha: 0,
    stockNoise: Array.from({ length: MONTHS }, (_, i) => extra[i] ?? 0),
  })
  const at = (month: number, holdings: Holdings): Snapshot => ({ month, holdings, total: total(holdings), index: 1, salary: 0, emergencyTarget: 0 })
  const etfKeeps = 1 - ETF_COST / 12

  test('counts only what the market did to money already invested, not money paid in after the high', () => {
    // €1,000 in the ETF at the high; the market falls 10%, €400 goes in, then it falls 20%.
    const setup = withReturns([-0.1, -0.2])
    const afterOne = 1000 * 0.9 * etfKeeps
    const snapshots = [at(0, { ...empty(), etf: 1000 }), at(1, { ...empty(), etf: afterOne + 400 }), at(2, { ...empty(), etf: (afterOne + 400) * 0.8 * etfKeeps })]
    const exact = 1000 * (1 - 0.9 * etfKeeps) + (afterOne + 400) * (1 - 0.8 * etfKeeps)
    expect(marketLoss(setup, snapshots, 0, 2)).toBeCloseTo(exact, 9)
    expect(marketLoss(setup, snapshots, 0, 1)).toBeCloseTo(1000 * (1 - 0.9 * etfKeeps), 9)
    expect(marketLoss(setup, snapshots, 2, 2)).toBe(0)
    // Treating everything held now as if it had been in at the high says over 10% more.
    const invested = snapshots[2].holdings.etf
    const fall = 1 - 0.72 * etfKeeps ** 2
    expect((invested * fall) / (1 - fall)).toBeGreaterThan(exact * 1.1)
  })

  test("takes each bucket's own return and leaves the savings account out", () => {
    const setup = withReturns([0, -0.2], [0, 0.05])
    const held = { cash: 5000, etf: 1400, fund: 200, stock: 100 }
    const snapshots = [at(0, held), at(1, held), at(2, held)]
    const month2 = 1400 * (1 - 0.8 * etfKeeps) + 200 * (1 - 0.8 * (1 - FUND_COST / 12)) + 100 * 0.15
    const month1 = 1400 * (1 - etfKeeps) + 200 * (1 - (1 - FUND_COST / 12))
    expect(marketLoss(setup, snapshots, 0, 2)).toBeCloseTo(month1 + month2, 9)
  })

  test('with nothing paid in or moved, it is just the fall in value of the investments', () => {
    // Seed 3, everything into the ETF for five years, then nothing more: until the car bill at month 96
    // the ETF only grows or falls.
    const log: Decision[] = Array.from({ length: 20 }, (_, i): Decision => ({ kind: 'year', at: 12 * i, saveRate: i < 5 ? 0.3 : 0, etfShare: 1 }))
    log.push({ kind: 'event', at: base.schedule.windfall, event: 'windfall', choice: 'cash' })
    const run = simulate(base, log, 'auto')
    const from = 60
    const to = 95
    expect(run.snapshots.slice(from + 1, to + 1).every((s) => s.holdings.fund === 0 && s.holdings.stock === 0)).toBe(true)
    expect(run.flows.slice(from + 1, to + 1).every((f) => f === 0)).toBe(true)
    expect(marketLoss(base, run.snapshots, from, to)).toBeCloseTo(run.snapshots[from].holdings.etf - run.snapshots[to].holdings.etf, 6)
  })
})
