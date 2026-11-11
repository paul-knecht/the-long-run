import { FUND_COST, FUND_ENTRY_FEE } from './constants'
import { etfReturn } from './market'
import type { Bucket, Holdings, RunSetup, Snapshot } from './types'

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

/**
 * What the market took from the money invested (ETF, fund and stock) over months from + 1 to `to`:
 * each month, the previous month's invested holdings times that month's return for each bucket.
 * Money paid in, taken out or moved in between is neither a gain nor a loss; the savings account is
 * left out. Negative when the investments gained.
 */
export function marketLoss(setup: RunSetup, snapshots: Snapshot[], from: number, to: number): number {
  let loss = 0
  for (let m = from + 1; m <= to; m++) {
    const { etf, fund, stock } = snapshots[m - 1].holdings
    const invested: Holdings = { cash: 0, etf, fund, stock }
    const r = setup.returns[m - 1]
    loss += total(invested) - total(grow(invested, { stock: r.stock, cash: r.cash, stockExtra: setup.stockAlpha / 12 + setup.stockNoise[m - 1] }))
  }
  return loss
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
