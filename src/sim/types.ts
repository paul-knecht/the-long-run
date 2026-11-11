import type { CrashEpisode } from './market'

export interface MonthData {
  /** Month as "1871-02". */
  ym: string
  /** Stock market return for the month, as a decimal (0.01 = 1%). */
  stock: number
  /** Cash (savings account) return for the month, as a decimal. */
  cash: number
}

export interface MarketSeries {
  meta: { region: 'us' | 'world'; source: string; licence: string; note: string }
  months: MonthData[]
}

export type Bucket = 'cash' | 'etf' | 'fund' | 'stock'
export type Holdings = Record<Bucket, number>

export type EventId = 'werner' | 'keller' | 'jonas' | 'bill' | 'raise' | 'windfall'

/** Everything about one playthrough that is fixed before the player makes a choice. */
export interface RunSetup {
  seed: number
  startYear: number
  returns: { stock: number; cash: number }[] // 240 months
  episodes: CrashEpisode[]
  takeovers: number[]
  /** Monthly net salary, one entry per month, raise included. */
  salary: number[]
  /** Month count at which each event fires; always a multiple of 12. */
  schedule: Record<EventId, number>
  stockAlpha: number
  stockNoise: number[] // 240
}

export type ActionId = 'getBackIn' | 'switchBackToEtf' | 'sellStock'
export type CrashChoice = 'sell' | 'hold' | 'buyMore'
export type EventChoice = 'follow' | 'decline' | 'lump' | 'spread' | 'cash' | 'ok'

/** One choice by the player. `at` is the number of completed months when it was taken. */
export type Decision =
  | { kind: 'year'; at: number; saveRate: number; etfShare: number }
  | { kind: 'event'; at: number; event: EventId; choice: EventChoice }
  | { kind: 'crash'; at: number; choice: CrashChoice }
  | { kind: 'action'; at: number; action: ActionId }

/** The point where the run waits for the player; null when all 240 months are played. */
export type Pending =
  | { kind: 'event'; at: number; event: EventId; billCovered?: boolean }
  | { kind: 'year'; at: number; actions: ActionId[] }
  | { kind: 'crash'; at: number; drawdown: number }
  | null

/** The state after `month` completed months, including every decision taken at that month. */
export interface Snapshot {
  month: number
  holdings: Holdings
  total: number
  /** Cumulative ETF index net of its cost, 1 at the start. */
  index: number
  /** Monthly net salary of this month. */
  salary: number
  emergencyTarget: number
}

export interface Timeline {
  /** snapshots[0] is the empty start; one more per completed month. */
  snapshots: Snapshot[]
  /** Money entering (+) or leaving (-) from outside, per month; same length as snapshots. */
  flows: number[]
  pending: Pending
  /** The rest of these describe the state at the end of what was simulated. */
  dials: { saveRate: number; etfShare: number }
  riskyTarget: 'etf' | 'fund'
  parked: { amount: number; etfShare: number } | null
  bill: { fromCash: number; sold: number; unpaid: number; drawdownAtSale: number } | null
}
