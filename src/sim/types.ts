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
