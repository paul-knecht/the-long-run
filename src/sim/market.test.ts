import { market } from '../data'
import { crashEpisodes, eligibleStartYears, etfReturn, takeoverMonths, windowReturns } from './market'

test('synthetic crash is found', () => {
  const r = [...Array(40).fill(0.01), -0.15, -0.15, -0.1, ...Array(197).fill(0.01)] // net returns passed directly
  const [e] = crashEpisodes(r).filter((e) => e.depth >= 0.25)
  expect(e.peakMonth).toBe(40)
  expect(e.triggerMonth).toBe(42)
  expect(e.troughMonth).toBe(43)
  expect(e.depth).toBeCloseTo(1 - 0.85 * 0.85 * 0.9, 5)
  expect(takeoverMonths(crashEpisodes(r))).toEqual([42])
})

test('real history has variety', () => {
  expect(eligibleStartYears(market).length).toBeGreaterThanOrEqual(30)
  const w29 = windowReturns(market, 1929)!.map((m) => etfReturn(m.stock))
  expect(Math.max(...crashEpisodes(w29).map((e) => e.depth))).toBeGreaterThan(0.6)
  const w00 = windowReturns(market, 2000)!.map((m) => etfReturn(m.stock))
  expect(Math.max(...crashEpisodes(w00).map((e) => e.depth))).toBeGreaterThan(0.4)
})

test('incomplete window is rejected', () => {
  expect(windowReturns(market, 2020)).toBeNull()
})
