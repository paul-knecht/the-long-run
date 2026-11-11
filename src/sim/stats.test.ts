import { market } from '../data'
import { eligibleStartYears } from './market'
import { historyStats, holdBeatsSellRate, longestLosingHold, lumpSumWinRate } from './stats'

const flatUp = { meta: market.meta, months: Array.from({ length: 60 }, (_, i) => ({ ym: `m${i}`, stock: 0.01, cash: 0 })) }

test('always-rising market: lump sum always wins, nothing ever loses', () => {
  const r = lumpSumWinRate(flatUp)
  expect(r.wins).toBe(r.total)
  expect(r.total).toBe(49)
  expect(longestLosingHold(flatUp)).toBe(0)
})

test('a market that only falls: lump sum loses to cash, and every hold length loses', () => {
  const falling = { meta: market.meta, months: Array.from({ length: 60 }, (_, i) => ({ ym: `m${i}`, stock: -0.01, cash: 0.001 })) }
  expect(lumpSumWinRate(falling).wins).toBe(0)
  expect(longestLosingHold(falling)).toBe(5)
})

test('a single crash only beats short holds', () => {
  // One -50% month among +5% months: any 1-year hold over it loses, any 2-year hold over it recovers.
  const months = [...Array(30).fill(0.05), -0.5, ...Array(29).fill(0.05)].map((stock, i) => ({ ym: `m${i}`, stock, cash: 0 }))
  expect(longestLosingHold({ meta: market.meta, months })).toBe(1)
})

test('real history is plausible', () => {
  const s = historyStats(market)
  expect(s.lump.wins / s.lump.total).toBeGreaterThan(0.55)
  expect(s.lump.wins / s.lump.total).toBeLessThan(0.85)
  expect(s.longestLosingYears).toBeGreaterThanOrEqual(1)
  expect(s.longestLosingYears).toBeLessThan(30)
  expect(s.hold.total).toBe(eligibleStartYears(market).length)
  expect(holdBeatsSellRate(market)).toEqual(s.hold)
})

test('historyStats is memoised per series', () => {
  expect(historyStats(market)).toBe(historyStats(market))
})
