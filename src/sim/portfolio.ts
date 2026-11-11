import { FUND_COST, FUND_ENTRY_FEE } from './constants'
import { etfReturn } from './market'
import type { Bucket, Holdings } from './types'

/** Order in which a bill is paid: cash first, then the rest from safest to riskiest. */
const SELL_ORDER: Bucket[] = ['etf', 'fund', 'stock']

export const empty = (): Holdings => ({ cash: 0, etf: 0, fund: 0, stock: 0 })

export const total = (h: Holdings): number => h.cash + h.etf + h.fund + h.stock

/** One month of growth. `stock` is the market return, `stockExtra` the single stock's own move on top of it. */
export function grow(h: Holdings, r: { stock: number; cash: number; stockExtra: number }): Holdings {
  return {
    cash: h.cash * (1 + r.cash),
    etf: h.etf * (1 + etfReturn(r.stock)),
    fund: h.fund * (1 + r.stock) * (1 - FUND_COST / 12),
    stock: h.stock * Math.max(0.05, 1 + r.stock + r.stockExtra),
  }
}

/** Amount that actually lands in a bucket: the fund keeps back its entry fee. */
const arriving = (to: Bucket, amount: number): number => (to === 'fund' ? amount * (1 - FUND_ENTRY_FEE) : amount)

export function deposit(h: Holdings, to: Bucket, amount: number): Holdings {
  if (!(amount > 0)) return { ...h }
  return { ...h, [to]: h[to] + arriving(to, amount) }
}

/** Moves up to `amount` (clamped to what `from` holds); entering the fund costs the entry fee, leaving it is free. */
export function move(h: Holdings, from: Bucket, to: Bucket, amount: number): Holdings {
  const moved = Math.min(amount, h[from])
  if (!(moved > 0) || from === to) return { ...h }
  return { ...h, [from]: h[from] - moved, [to]: h[to] + arriving(to, moved) }
}

/** Pays a bill from cash, then ETF, fund and stock. No bucket goes below zero; what cannot be covered is `unpaid`. */
export function payBill(
  h: Holdings,
  amount: number,
): { holdings: Holdings; fromCash: number; sold: number; unpaid: number } {
  const holdings = { ...h }
  const due = Math.max(0, amount)
  const fromCash = Math.min(due, holdings.cash)
  holdings.cash -= fromCash
  let remaining = due - fromCash
  let sold = 0
  for (const bucket of SELL_ORDER) {
    const take = Math.min(remaining, holdings[bucket])
    holdings[bucket] -= take
    remaining -= take
    sold += take
  }
  return { holdings, fromCash, sold, unpaid: remaining }
}
