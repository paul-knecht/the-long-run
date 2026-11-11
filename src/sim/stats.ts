import { MONTHS } from './constants'
import { crashEpisodes, eligibleStartYears, etfReturn, takeoverMonths, windowReturns } from './market'
import type { MarketSeries } from './types'

export interface Rate {
  wins: number
  total: number
}

export interface HistoryStats {
  lump: Rate
  longestLosingMonths: number
  hold: Rate
}

/**
 * Every start month with 12 months of data: 12 units at once in the ETF, against one unit a month
 * (the rest waiting in cash), compared after 12 months. Counts the starts where the lump sum is ahead.
 */
export function lumpSumWinRate(series: MarketSeries): Rate {
  const { months } = series
  let wins = 0
  let total = 0
  for (let i = 0; i + 12 <= months.length; i++) {
    let lump = 12
    for (let k = i; k < i + 12; k++) lump *= 1 + etfReturn(months[k].stock)

    let spread = 0
    let waiting = 1 // growth of one unit held in cash from month i
    for (let k = i; k < i + 12; k++) {
      let grown = waiting
      for (let j = k; j < i + 12; j++) grown *= 1 + etfReturn(months[j].stock)
      spread += grown
      waiting *= 1 + months[k].cash
    }
    total++
    if (lump > spread) wins++
  }
  return { wins, total }
}

/** The longest ETF hold, in whole months, that ended below where it started; 0 if none did. */
export function longestLosingMonths(series: MarketSeries): number {
  const { months } = series
  const logIndex = [0] // log of the cumulative ETF index, so any hold's log growth is a difference
  for (const m of months) logIndex.push(logIndex[logIndex.length - 1] + Math.log1p(etfReturn(m.stock)))

  for (let length = months.length; length > 0; length--) {
    for (let i = 0; i + length <= months.length; i++) if (logIndex[i + length] - logIndex[i] < 0) return length
  }
  return 0
}

/**
 * Per eligible start year: one unit in the ETF at the first takeover crash month; counts the years where
 * holding to month 240 ends ahead of selling then and staying in cash.
 */
export function holdBeatsSellRate(series: MarketSeries): Rate {
  const years = eligibleStartYears(series)
  let wins = 0
  for (const year of years) {
    const window = windowReturns(series, year)!
    const [t] = takeoverMonths(crashEpisodes(window.map((m) => etfReturn(m.stock))))
    let hold = 1
    let sell = 1
    for (let k = t; k < MONTHS; k++) {
      hold *= 1 + etfReturn(window[k].stock)
      sell *= 1 + window[k].cash
    }
    if (hold > sell) wins++
  }
  return { wins, total: years.length }
}

const cache = new WeakMap<MarketSeries, HistoryStats>()

/** All the history statistics for the ending, computed once per series. */
export function historyStats(series: MarketSeries): HistoryStats {
  let stats = cache.get(series)
  if (!stats) {
    stats = { lump: lumpSumWinRate(series), longestLosingMonths: longestLosingMonths(series), hold: holdBeatsSellRate(series) }
    cache.set(series, stats)
  }
  return stats
}
