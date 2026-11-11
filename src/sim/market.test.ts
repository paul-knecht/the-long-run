import { market } from '../data'
import { CRASH_EARLIEST_MONTH } from './constants'
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

test('a deep fall triggered before CRASH_EARLIEST_MONTH takes nothing over; the same fall later does', () => {
  // Down 15%, 15% and 10% in a row: the fall reaches the trigger on its second month.
  const fallAfter = (rising: number): number[] => [...Array(rising).fill(0.01), -0.15, -0.15, -0.1, ...Array(240 - rising - 3).fill(0.01)]
  const early = crashEpisodes(fallAfter(8))
  expect(early.find((e) => e.depth >= 0.25)!.triggerMonth).toBe(10)
  expect(takeoverMonths(early)).toEqual([])
  expect(takeoverMonths(crashEpisodes(fallAfter(40)))).toEqual([42])
  // The first month that may take over still does.
  expect(takeoverMonths(crashEpisodes(fallAfter(CRASH_EARLIEST_MONTH - 2)))).toEqual([CRASH_EARLIEST_MONTH])
})

test('no run is dealt a takeover in its first three years', () => {
  for (const year of eligibleStartYears(market)) {
    const months = takeoverMonths(crashEpisodes(windowReturns(market, year)!.map((m) => etfReturn(m.stock))))
    expect(months.every((m) => m >= CRASH_EARLIEST_MONTH), String(year)).toBe(true)
  }
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
