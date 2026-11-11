import { BILL, EMERGENCY_MONTHS, MAX_SAVE_RATE, MONTHS, SPREAD_MONTHS, START_DIALS, WINDFALL } from './constants'
import { etfReturn } from './market'
import { deposit, empty, grow, move, payBill, total } from './portfolio'
import type {
  ActionId,
  CrashChoice,
  Decision,
  EventChoice,
  EventId,
  Holdings,
  Pending,
  RunSetup,
  Snapshot,
  Timeline,
} from './types'

/** What auto mode chooses when the log has no decision for an event. */
const AUTO_EVENT_CHOICE: Record<EventId, EventChoice> = {
  werner: 'decline',
  keller: 'decline',
  jonas: 'decline',
  windfall: 'lump',
  bill: 'ok',
  raise: 'ok',
}
const AUTO_CRASH_CHOICE: CrashChoice = 'hold'

/** Two decisions with the same key are the same choice; the first one in the log counts. */
export function decisionKey(d: Decision): string {
  switch (d.kind) {
    case 'year':
      return `year:${d.at}`
    case 'event':
      return `event:${d.at}:${d.event}`
    case 'crash':
      return `crash:${d.at}`
    case 'action':
      return `action:${d.at}:${d.action}`
  }
}

/** Clamps to [lo, hi]; anything that is not above `lo` (NaN included) becomes `lo`. */
const clamp = (v: number, lo: number, hi: number): number => (v > lo ? Math.min(v, hi) : lo)

/**
 * Replays the decision log month by month from the empty start and stops at the first point
 * that needs a decision the log does not hold. In 'auto' mode such a decision is filled in with
 * its default instead, so the run always reaches month 240.
 */
export function simulate(
  setup: RunSetup,
  decisions: Decision[],
  mode: 'interactive' | 'auto' = 'interactive',
): Timeline {
  const byKey = new Map<string, Decision>()
  for (const d of decisions) {
    const key = decisionKey(d)
    if (!byKey.has(key)) byKey.set(key, d)
  }
  /** Actions per year boundary, in the order the player took them. */
  const actionsAt = new Map<number, ActionId[]>()
  for (const d of byKey.values()) {
    if (d.kind === 'action') actionsAt.set(d.at, [...(actionsAt.get(d.at) ?? []), d.action])
  }
  const eventAt = new Map<number, EventId>()
  for (const [event, at] of Object.entries(setup.schedule) as [EventId, number][]) eventAt.set(at, event)
  const takeovers = new Set(setup.takeovers)

  let holdings: Holdings = empty()
  let dials = { ...START_DIALS }
  let riskyTarget: Timeline['riskyTarget'] = 'etf'
  let parked: Timeline['parked'] = null
  let bill: Timeline['bill'] = null
  let spreadLeft = 0
  let index = 1
  let peak = 1
  const snapshots: Snapshot[] = []
  const flows: number[] = []

  const fallFromPeak = (): number => 1 - index / peak

  /** The state after `month` completed months; month m's salary is setup.salary[m - 1]. */
  const snapshot = (month: number): Snapshot => {
    const salary = setup.salary[Math.max(0, month - 1)]
    return { month, holdings, total: total(holdings), index, salary, emergencyTarget: EMERGENCY_MONTHS * salary }
  }
  /** Re-takes the snapshot of month `at` after a decision there changed the holdings. */
  const resnap = (at: number): void => {
    snapshots[at] = snapshot(at)
  }

  const finish = (pending: Pending): Timeline => ({
    snapshots,
    flows,
    pending,
    dials: { ...dials },
    riskyTarget,
    parked: parked && { ...parked },
    bill: bill && { ...bill },
  })

  /**
   * Moves the ETF and the fund to cash and remembers the split to return to (the first one, if already
   * parked). A windfall still being spread stops; what is left of it stays in cash.
   */
  const park = (): void => {
    const amount = holdings.etf + holdings.fund
    holdings = move(move(holdings, 'etf', 'cash', holdings.etf), 'fund', 'cash', holdings.fund)
    parked = { amount: (parked?.amount ?? 0) + amount, etfShare: parked ? parked.etfShare : dials.etfShare }
    dials = { ...dials, etfShare: 0 }
    spreadLeft = 0
  }

  const applyEvent = (event: EventId, choice: EventChoice, at: number): void => {
    if (event === 'werner' && choice === 'follow') park()
    if (event === 'keller' && choice === 'follow') {
      holdings = move(holdings, 'etf', 'fund', holdings.etf)
      riskyTarget = 'fund'
    }
    if (event === 'jonas' && choice === 'follow') holdings = move(holdings, 'etf', 'stock', holdings.etf / 2)
    if (event === 'windfall' && (choice === 'lump' || choice === 'spread' || choice === 'cash')) {
      holdings = deposit(holdings, choice === 'lump' ? riskyTarget : 'cash', WINDFALL)
      flows[at] += WINDFALL
      if (choice === 'spread') spreadLeft = SPREAD_MONTHS
    }
    if (event === 'bill' && choice === 'ok') {
      const paid = payBill(holdings, BILL)
      holdings = paid.holdings
      bill = {
        fromCash: paid.fromCash,
        sold: paid.sold,
        unpaid: paid.unpaid,
        drawdownAtSale: paid.sold > 0 ? fallFromPeak() : 0,
      }
      flows[at] -= paid.fromCash + paid.sold
    }
    // 'raise' needs nothing: the salary path already contains it.
  }

  const applyCrash = (choice: CrashChoice, at: number): void => {
    if (choice === 'sell') park()
    if (choice === 'buyMore') {
      const aboveEmergencyFund = holdings.cash - snapshots[at].emergencyTarget
      holdings = move(holdings, 'cash', riskyTarget, aboveEmergencyFund)
    }
  }

  const applyAction = (action: ActionId): void => {
    if (action === 'getBackIn' && parked) {
      holdings = move(holdings, 'cash', riskyTarget, Math.min(parked.amount, holdings.cash))
      dials = { ...dials, etfShare: parked.etfShare }
      parked = null
    }
    if (action === 'switchBackToEtf') {
      holdings = move(holdings, 'fund', 'etf', holdings.fund)
      riskyTarget = 'etf'
    }
    if (action === 'sellStock') holdings = move(holdings, 'stock', 'etf', holdings.stock)
  }

  const availableActions = (): ActionId[] => {
    const actions: ActionId[] = []
    if (parked) actions.push('getBackIn')
    if (holdings.fund > 0 || riskyTarget === 'fund') actions.push('switchBackToEtf')
    if (holdings.stock > 0) actions.push('sellStock')
    return actions
  }

  const playMonth = (m: number): void => {
    const r = setup.returns[m - 1]
    const stockExtra = setup.stockAlpha / 12 + setup.stockNoise[m - 1]
    holdings = grow(holdings, { stock: r.stock, cash: r.cash, stockExtra })
    index *= 1 + etfReturn(r.stock)
    peak = Math.max(peak, index)
    const saved = setup.salary[m - 1] * dials.saveRate
    holdings = deposit(holdings, riskyTarget, saved * dials.etfShare)
    holdings = deposit(holdings, 'cash', saved * (1 - dials.etfShare))
    if (spreadLeft > 0) {
      holdings = move(holdings, 'cash', riskyTarget, WINDFALL / SPREAD_MONTHS)
      spreadLeft--
    }
    snapshots.push(snapshot(m))
    flows.push(saved)
  }

  snapshots.push(snapshot(0))
  flows.push(0)

  for (let at = 0; at < MONTHS; at += 12) {
    const event = eventAt.get(at)
    if (event) {
      const d = byKey.get(`event:${at}:${event}`)
      const choice = d?.kind === 'event' ? d.choice : mode === 'auto' ? AUTO_EVENT_CHOICE[event] : null
      if (!choice) {
        const billCovered = event === 'bill' ? { billCovered: holdings.cash >= BILL } : {}
        return finish({ kind: 'event', at, event, ...billCovered })
      }
      applyEvent(event, choice, at)
    }
    for (const action of actionsAt.get(at) ?? []) applyAction(action)
    resnap(at)

    const y = byKey.get(`year:${at}`)
    if (y?.kind === 'year') {
      dials = { saveRate: clamp(y.saveRate, 0, MAX_SAVE_RATE), etfShare: clamp(y.etfShare, 0, 1) }
    } else if (mode === 'interactive') {
      return finish({ kind: 'year', at, actions: availableActions() })
    }
    // In auto mode a missing year keeps the dials in force.

    for (let m = at + 1; m <= at + 12; m++) {
      playMonth(m)
      // A takeover at a year's last month is decided here, before that month's event and year.
      if (m < MONTHS && takeovers.has(m)) {
        const d = byKey.get(`crash:${m}`)
        const choice = d?.kind === 'crash' ? d.choice : mode === 'auto' ? AUTO_CRASH_CHOICE : null
        if (!choice) return finish({ kind: 'crash', at: m, drawdown: fallFromPeak() })
        applyCrash(choice, m)
        resnap(m)
      }
    }
  }
  return finish(null)
}
