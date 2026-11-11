import { CRASH_EARLIEST_MONTH, CRASH_LATEST_MONTH, MONTHS, RAISE_FACTOR, SALARY_GROWTH, START_SALARY, STOCK_FATES, STOCK_NOISE_SD } from './constants'
import { crashEpisodes, eligibleStartYears, etfReturn, takeoverMonths, windowReturns } from './market'
import { createRng, type Rng } from './rng'
import type { EventId, MarketSeries, RunSetup } from './types'

/** Allowed 0-based year index per event (inclusive), in the order they are drawn. */
const EVENT_YEARS: [EventId, number, number][] = [
  ['werner', 1, 3],
  ['keller', 2, 5],
  ['bill', 3, 9],
  ['jonas', 4, 8],
  ['raise', 5, 9],
  ['windfall', 6, 14],
]

/** One distinct year per event; redraws on collision. A free year always exists for each range. */
function drawSchedule(rng: Rng): Record<EventId, number> {
  const taken = new Set<number>()
  const schedule = {} as Record<EventId, number>
  for (const [id, first, last] of EVENT_YEARS) {
    let year = rng.int(first, last)
    while (taken.has(year)) year = rng.int(first, last)
    taken.add(year)
    schedule[id] = year * 12
  }
  return schedule
}

function drawStockAlpha(rng: Rng): number {
  const roll = rng.next()
  let cumulative = 0
  for (const fate of STOCK_FATES) {
    cumulative += fate.p
    if (roll < cumulative) return fate.alpha
  }
  return STOCK_FATES[STOCK_FATES.length - 1].alpha
}

/**
 * Everything about one run that is fixed before the player chooses. Draws happen in a
 * fixed order (start year, schedule, stock fate, noise) so a later draw never shifts an earlier one.
 */
export function createSetup(series: MarketSeries, seed: number): RunSetup {
  const rng = createRng(seed)
  const startYear = rng.pick(eligibleStartYears(series))
  const schedule = drawSchedule(rng)
  const stockAlpha = drawStockAlpha(rng)
  const stockNoise = Array.from({ length: MONTHS }, () => rng.normal() * STOCK_NOISE_SD)

  const window = windowReturns(series, startYear)
  if (!window) throw new Error(`No ${MONTHS}-month window from ${startYear}`)
  const returns = window.map((m) => ({ stock: m.stock, cash: m.cash }))
  const episodes = crashEpisodes(window.map((m) => etfReturn(m.stock)))
  const takeovers = takeoverMonths(episodes)
  if (!takeovers.some((m) => m >= CRASH_EARLIEST_MONTH && m <= CRASH_LATEST_MONTH)) {
    throw new Error(`Window from ${startYear} has no takeover crash in range`)
  }

  const salary = Array.from(
    { length: MONTHS },
    (_, i) => START_SALARY * (1 + SALARY_GROWTH) ** Math.floor(i / 12) * (i >= schedule.raise ? RAISE_FACTOR : 1),
  )

  return { seed, startYear, returns, episodes, takeovers, salary, schedule, stockAlpha, stockNoise }
}
