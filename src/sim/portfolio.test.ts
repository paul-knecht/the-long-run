import { deposit, empty, grow, move, payBill, total } from './portfolio'

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
