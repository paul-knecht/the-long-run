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
