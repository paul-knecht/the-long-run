import { CRASH_MIN_DEPTH, MONTHS, START_DIALS, YEARS } from './constants'
import { etfReturn } from './market'
import { alternatives, flip, type Alternative, type FlipTarget } from './replay'
import { createRng } from './rng'
import { drawStock } from './setup'
import { dialsOf, simulate } from './simulate'
import { historyStats } from './stats'
import type { Decision, EventChoice, EventId, MarketSeries, RunSetup, Timeline } from './types'

export interface EndingModel {
  final: number
  paidIn: number
  /** The player's total after each month, 0 to 240. */
  you: number[]
  lines: Alternative[]
  /** crashes: the takeover episodes only, in order. */
  reveal: { region: 'us' | 'world'; fromYear: number; toYear: number; crashes: { peakYear: number; depth: number }[] }
  cards: {
    time: { lowestDrawdown: number; monthsToRecover: number | null; longestLosingYears: number }
    lumpSum: { choice: 'lump' | 'spread' | 'cash'; lumpFinal: number; spreadFinal: number; winRate: number }
    savingsRate: { averageRate: number; paidIn: number; finalAt15: number }
    split: {
      averageEtfShare: number
      yourMaxDrawdown: number
      etfOnlyMaxDrawdown: number
      etfOnlyFinal: number
      cashOnlyFinal: number
    }
    costs: { followed: boolean; etfOnlyFinal: number; fundOnlyFinal: number }
    stock: { followed: boolean; stockMultiple: number; indexMultiple: number; beatInHundred: number }
    emergency: { covered: boolean; sold: number; drawdownAtSale: number }
  }
  /** vsCashOnly: final / cashOnly - 1; 0 when cashOnly is 0. */
  share: { final: number; vsCashOnly: number }
}

/** The save rate the savings card replays the run at. */
const REFERENCE_SAVE_RATE = 0.15
/** How many other lives with the single stock the stock card draws. */
const STOCK_LIVES = 100

const lastTotal = (t: Timeline): number => t.snapshots[MONTHS].total

/** The dials in force from each of the 20 year boundaries: the logged ones, else the previous year's. */
function dialsByYear(decisions: Decision[]): Timeline['dials'][] {
  let dials = { ...START_DIALS }
  return Array.from({ length: YEARS }, (_, i) => {
    const y = decisions.find((d) => d.kind === 'year' && d.at === i * 12)
    if (y?.kind === 'year') dials = dialsOf(y)
    return dials
  })
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

/** The choice logged for an event at its scheduled month (the one the engine uses), if any. */
function loggedChoice(setup: RunSetup, decisions: Decision[], event: EventId): EventChoice | undefined {
  const d = decisions.find((x) => x.kind === 'event' && x.event === event && x.at === setup.schedule[event])
  return d?.kind === 'event' ? d.choice : undefined
}

/**
 * How the player's money did with what was paid in or taken out removed: 1 at the start, then
 * each month's change from the previous total, net of that month's flow (no change while the
 * previous total is 0).
 */
function performanceIndex(totals: number[], flows: number[]): number[] {
  const index = [1]
  for (let m = 1; m < totals.length; m++) {
    const r = totals[m - 1] > 0 ? (totals[m] - flows[m]) / totals[m - 1] - 1 : 0
    index.push(index[m - 1] * (1 + r))
  }
  return index
}

/**
 * The largest fall from an earlier peak, and the months from its low until the index is back at
 * that peak: null if it never gets back, 0 if it never falls.
 */
function worstFall(index: number[]): { depth: number; monthsToRecover: number | null } {
  let peak = index[0]
  let depth = 0
  let low = 0
  let lowPeak = peak
  for (let m = 1; m < index.length; m++) {
    peak = Math.max(peak, index[m])
    const fall = 1 - index[m] / peak
    if (fall > depth) {
      depth = fall
      low = m
      lowPeak = peak
    }
  }
  if (depth === 0) return { depth: 0, monthsToRecover: 0 }
  for (let m = low + 1; m < index.length; m++) if (index[m] >= lowPeak) return { depth, monthsToRecover: m - low }
  return { depth, monthsToRecover: null }
}

/** Growth of a single stock with this drift and noise over months from + 1 to 240 of the window. */
function stockGrowth(setup: RunSetup, alpha: number, noise: number[], from: number): number {
  let multiple = 1
  for (let m = from + 1; m <= MONTHS; m++) {
    multiple *= Math.max(0.05, 1 + setup.returns[m - 1].stock + alpha / 12 + noise[m - 1])
  }
  return multiple
}

/** Growth of the ETF over months from + 1 to 240 of the window. */
function indexGrowth(setup: RunSetup, from: number): number {
  let multiple = 1
  for (let m = from + 1; m <= MONTHS; m++) multiple *= 1 + etfReturn(setup.returns[m - 1].stock)
  return multiple
}

/**
 * Everything the ending shows, from the player's log: their result and the paths not taken, the
 * reveal of the years they lived through, and the numbers behind each lesson card. All replays run
 * in 'auto' mode, so a partial log is valid.
 */
export function buildEnding(series: MarketSeries, setup: RunSetup, decisions: Decision[]): EndingModel {
  const run = simulate(setup, decisions, 'auto')
  const you = run.snapshots.map((s) => s.total)
  const final = you[MONTHS]
  const paidIn = run.flows.reduce((a, b) => a + b, 0)
  const lines = alternatives(setup, decisions)
  const lineFinal = (id: Alternative['id']): number => lines.find((l) => l.id === id)?.final ?? 0
  const etfOnlyFinal = lineFinal('etfOnly')
  const cashOnlyFinal = lineFinal('cashOnly')
  const stats = historyStats(series)

  const crashes = setup.episodes
    .filter((e) => e.depth >= CRASH_MIN_DEPTH && e.triggerMonth !== null && e.triggerMonth < MONTHS)
    .map((e) => ({ peakYear: setup.startYear + Math.floor(Math.max(0, e.peakMonth - 1) / 12), depth: e.depth }))

  const fall = worstFall(performanceIndex(you, run.flows))

  const windfallAt: FlipTarget = { kind: 'event', at: setup.schedule.windfall, event: 'windfall' }
  const windfall = loggedChoice(setup, decisions, 'windfall')
  const lumpChoice = windfall === 'spread' || windfall === 'cash' ? windfall : 'lump'

  const dials = dialsByYear(decisions)
  const at15: Decision[] = [
    ...decisions.filter((d) => d.kind !== 'year'),
    ...dials.map((d, i): Decision => ({ kind: 'year', at: i * 12, saveRate: REFERENCE_SAVE_RATE, etfShare: d.etfShare })),
  ]

  const jonas = setup.schedule.jonas
  const indexMultiple = indexGrowth(setup, jonas)
  let beatInHundred = 0
  for (let k = 0; k < STOCK_LIVES; k++) {
    const life = drawStock(createRng(setup.seed * 1000 + k))
    if (stockGrowth(setup, life.alpha, life.noise, jonas) > indexMultiple) beatInHundred++
  }

  const bill = run.bill ?? { sold: 0, unpaid: 0, drawdownAtSale: 0 }

  return {
    final,
    paidIn,
    you,
    lines,
    reveal: { region: series.meta.region, fromYear: setup.startYear, toYear: setup.startYear + YEARS, crashes },
    cards: {
      time: { lowestDrawdown: fall.depth, monthsToRecover: fall.monthsToRecover, longestLosingYears: stats.longestLosingYears },
      lumpSum: {
        choice: lumpChoice,
        lumpFinal: lastTotal(simulate(setup, flip(decisions, windfallAt, 'lump'), 'auto')),
        spreadFinal: lastTotal(simulate(setup, flip(decisions, windfallAt, 'spread'), 'auto')),
        winRate: stats.lump.total > 0 ? stats.lump.wins / stats.lump.total : 0,
      },
      savingsRate: {
        averageRate: mean(dials.map((d) => d.saveRate)),
        paidIn,
        finalAt15: lastTotal(simulate(setup, at15, 'auto')),
      },
      split: {
        averageEtfShare: mean(dials.map((d) => d.etfShare)),
        yourMaxDrawdown: fall.depth,
        etfOnlyMaxDrawdown: setup.episodes.reduce((deepest, e) => Math.max(deepest, e.depth), 0),
        etfOnlyFinal,
        cashOnlyFinal,
      },
      costs: { followed: loggedChoice(setup, decisions, 'keller') === 'follow', etfOnlyFinal, fundOnlyFinal: lineFinal('fundOnly') },
      stock: {
        followed: loggedChoice(setup, decisions, 'jonas') === 'follow',
        stockMultiple: stockGrowth(setup, setup.stockAlpha, setup.stockNoise, jonas),
        indexMultiple,
        beatInHundred,
      },
      emergency: { covered: bill.sold === 0 && bill.unpaid === 0, sold: bill.sold, drawdownAtSale: bill.drawdownAtSale },
    },
    share: { final, vsCashOnly: cashOnlyFinal > 0 ? final / cashOnlyFinal - 1 : 0 },
  }
}
