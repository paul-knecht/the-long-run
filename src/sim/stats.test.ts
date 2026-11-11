import { market } from '../data'
import { eligibleStartYears } from './market'
import { historyStats, holdBeatsSellRate, longestLosingMonths, lumpSumWinRate } from './stats'

const flatUp = { meta: market.meta, months: Array.from({ length: 60 }, (_, i) => ({ ym: `m${i}`, stock: 0.01, cash: 0 })) }

test('always-rising market: lump sum always wins, nothing ever loses', () => {
  const r = lumpSumWinRate(flatUp)
  expect(r.wins).toBe(r.total)
  expect(r.total).toBe(49)
  expect(longestLosingMonths(flatUp)).toBe(0)
})

test('a market that only falls: lump sum loses to cash, and every hold loses, the whole series too', () => {
  const falling = { meta: market.meta, months: Array.from({ length: 60 }, (_, i) => ({ ym: `m${i}`, stock: -0.01, cash: 0.001 })) }
  expect(lumpSumWinRate(falling).wins).toBe(0)
  expect(longestLosingMonths(falling)).toBe(60)
})

test('a single crash only beats short holds, counted in months', () => {
  // One -50% month among +5% months: a hold over it needs 15 months of +5% to make up the half it lost.
  // 14 of them (a 15-month hold) still fall short, 15 (a 16-month hold) are enough.
  const months = [...Array(30).fill(0.05), -0.5, ...Array(29).fill(0.05)].map((stock, i) => ({ ym: `m${i}`, stock, cash: 0 }))
  expect(longestLosingMonths({ meta: market.meta, months })).toBe(15)
})

test('the longest losing hold is the longest one, even when every shorter hold of some length ended ahead', () => {
  // The index goes 1, 0.5, 1.1, 0.9: both 2-month holds end ahead, the 3-month hold ends below.
  const months = [-0.5, 1.2, -2 / 11].map((stock, i) => ({ ym: `m${i}`, stock, cash: 0 }))
  expect(longestLosingMonths({ meta: market.meta, months: months.slice(0, 2) })).toBe(1)
  expect(longestLosingMonths({ meta: market.meta, months })).toBe(3)
})

test('real history, pinned', () => {
  const s = historyStats(market)
  expect(s.lump).toEqual({ wins: 1171, total: 1818 })
  // 15 years and 3 months: some holds of more than 15 years lost, none of 16 years or more.
  expect(s.longestLosingMonths).toBe(183)
  expect(s.hold).toEqual({ wins: 98, total: 110 })
  expect(s.hold.total).toBe(eligibleStartYears(market).length)
  expect(holdBeatsSellRate(market)).toEqual(s.hold)
})

test('historyStats is memoised per series', () => {
  expect(historyStats(market)).toBe(historyStats(market))
})
