import type { Decision } from './types'

/** The `year` decisions for the first `n` years, all with the same dials. */
export function yearly(n: number, saveRate: number, etfShare: number): Decision[] {
  return Array.from({ length: n }, (_, i) => ({ kind: 'year', at: 12 * i, saveRate, etfShare }))
}
