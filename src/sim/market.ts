import { CRASH_EARLIEST_MONTH, CRASH_LATEST_MONTH, CRASH_MIN_DEPTH, CRASH_TRIGGER, ETF_COST, MONTHS, YEARS } from './constants'
import type { CrashEpisode, MarketSeries, MonthData } from './types'

export type { CrashEpisode } from './types'

/** Monthly return of the ETF after its yearly cost. */
export function etfReturn(stock: number): number {
  return (1 + stock) * (1 - ETF_COST / 12) - 1
}

/** The 240 months from January of startYear, or null if the series does not cover them. */
export function windowReturns(series: MarketSeries, startYear: number): MonthData[] | null {
  const start = series.months.findIndex((m) => m.ym === `${startYear}-01`)
  if (start < 0) return null
  const months = series.months.slice(start, start + MONTHS)
  if (months.length < MONTHS || months[MONTHS - 1].ym !== `${startYear + YEARS - 1}-12`) return null
  return months
}

/**
 * Falls from a running peak, from the peak until the index is back at it (or the
 * window ends). Takes net monthly returns; months are 1-based counts of completed months.
 */
export function crashEpisodes(etfReturns: number[]): CrashEpisode[] {
  const episodes: CrashEpisode[] = []
  let value = 1
  let peak = 1
  let peakMonth = 0
  let current: CrashEpisode | null = null

  etfReturns.forEach((r, i) => {
    const month = i + 1
    value *= 1 + r
    if (value >= peak) {
      if (current) {
        current.recoveryMonth = month
        episodes.push(current)
        current = null
      }
      peak = value
      peakMonth = month
      return
    }
    current ??= { peakMonth, triggerMonth: null, troughMonth: month, recoveryMonth: null, depth: 0 }
    const fall = 1 - value / peak
    if (fall > current.depth) {
      current.depth = fall
      current.troughMonth = month
    }
    if (current.triggerMonth === null && fall >= CRASH_TRIGGER) current.triggerMonth = month
  })

  if (current) episodes.push(current)
  return episodes
}

/** Trigger months of the episodes deep enough to take over the game. */
export function takeoverMonths(episodes: CrashEpisode[]): number[] {
  return episodes.flatMap((e) => (e.depth >= CRASH_MIN_DEPTH && e.triggerMonth !== null ? [e.triggerMonth] : []))
}

/** Start years whose window has a takeover crash in [CRASH_EARLIEST_MONTH, CRASH_LATEST_MONTH]. */
export function eligibleStartYears(series: MarketSeries): number[] {
  const firstYear = Number(series.months[0].ym.slice(0, 4))
  const lastYear = Number(series.months[series.months.length - 1].ym.slice(0, 4))
  const years: number[] = []
  for (let year = firstYear; year <= lastYear; year++) {
    const window = windowReturns(series, year)
    if (!window) continue
    const months = takeoverMonths(crashEpisodes(window.map((m) => etfReturn(m.stock))))
    if (months.some((m) => m >= CRASH_EARLIEST_MONTH && m <= CRASH_LATEST_MONTH)) years.push(year)
  }
  return years
}
