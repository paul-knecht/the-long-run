import { market } from '../data'
import { CRASH_TRIGGER, EMERGENCY_MONTHS, FUND_ENTRY_FEE, MAX_SAVE_RATE, START_DIALS, WINDFALL } from './constants'
import { etfReturn } from './market'
import { total } from './portfolio'
import { createSetup } from './setup'
import { decisionKey, simulate } from './simulate'
import { yearly } from './testHelpers'
import type { ActionId, CrashChoice, Decision, EventChoice, EventId, RunSetup, Timeline } from './types'

const setup = createSetup(market, 3)

test('empty log waits for year 1', () => {
  const t = simulate(setup, [])
  expect(t.snapshots.length).toBe(1)
  expect(t.pending).toMatchObject({ kind: 'year', at: 0 })
})

test('one year of saving', () => {
  const t = simulate(setup, [{ kind: 'year', at: 0, saveRate: 0.1, etfShare: 0 }])
  expect(t.snapshots.length).toBeGreaterThan(1)
  expect(t.flows.slice(1, 13).every((f) => Math.abs(f - 220) < 1e-9)).toBe(true)
  expect(t.snapshots[12]?.holdings.etf ?? 0).toBe(0)
})

test('auto mode always finishes', () => {
  for (let s = 0; s < 50; s++) {
    const t = simulate(createSetup(market, s), [], 'auto')
    expect(t.pending).toBeNull()
    expect(t.snapshots.length).toBe(241)
  }
})

test('interactive stops at every event and at the takeover', () => {
  const seen = new Set<string>()
  let log: Decision[] = []
  let t = simulate(setup, log)
  while (t.pending) {
    const p = t.pending
    seen.add(p.kind === 'event' ? p.event : p.kind)
    log = [
      ...log,
      p.kind === 'year'
        ? { kind: 'year', at: p.at, saveRate: 0.15, etfShare: 0.7 }
        : p.kind === 'crash'
          ? { kind: 'crash', at: p.at, choice: 'hold' }
          : {
              kind: 'event',
              at: p.at,
              event: p.event,
              choice: p.event === 'windfall' ? 'lump' : p.event === 'bill' || p.event === 'raise' ? 'ok' : 'decline',
            },
    ]
    t = simulate(setup, log)
  }
  for (const k of ['year', 'crash', 'werner', 'keller', 'jonas', 'bill', 'raise', 'windfall']) {
    expect(seen.has(k)).toBe(true)
  }
  expect(log.filter((d) => d.kind === 'year').length).toBe(20)
})

test('selling parks the money and getBackIn restores it', () => {
  const at = setup.takeovers[0]
  const base = yearly(20, 0.15, 0.7)
  const sold = simulate(setup, [...base, { kind: 'crash', at, choice: 'sell' }], 'auto')
  expect(sold.snapshots[at + 1].holdings.etf).toBeLessThan(sold.snapshots[at + 1].holdings.cash)
  const yearAfter = Math.ceil((at + 1) / 12) * 12
  const back = simulate(
    setup,
    [...base, { kind: 'crash', at, choice: 'sell' }, { kind: 'action', at: yearAfter, action: 'getBackIn' }],
    'auto',
  )
  expect(back.parked).toBeNull()
  expect(back.dials.etfShare).toBeCloseTo(0.7)
})

test('keller redirects new money into the fund with the fee', () => {
  const at = setup.schedule.keller
  const t = simulate(setup, [...yearly(20, 0.15, 1), { kind: 'event', at, event: 'keller', choice: 'follow' }], 'auto')
  expect(t.riskyTarget).toBe('fund')
  expect(t.snapshots[at + 12].holdings.etf).toBe(0)
  expect(t.snapshots[at + 12].holdings.fund).toBeGreaterThan(0)
})

test('zero savings never produces NaN', () => {
  const t = simulate(setup, yearly(20, 0, 0.5), 'auto')
  expect(t.snapshots.every((s) => Number.isFinite(s.total) && s.total >= 0)).toBe(true)
})

// The rules below are not pinned down by the tests above.

/** A still market (no returns), a flat salary of 1000, no takeovers, and one event a year from year 1. */
const Q: Record<EventId, number> = { werner: 12, keller: 24, jonas: 36, bill: 48, raise: 60, windfall: 72 }
const quiet = (over: Partial<RunSetup> = {}): RunSetup => ({
  ...setup,
  returns: Array.from({ length: 240 }, () => ({ stock: 0, cash: 0 })),
  salary: Array<number>(240).fill(1000),
  stockAlpha: 0,
  stockNoise: Array<number>(240).fill(0),
  takeovers: [],
  schedule: Q,
  ...over,
})
const year = (at: number, saveRate: number, etfShare: number): Decision => ({ kind: 'year', at, saveRate, etfShare })
const ev = (event: EventId, choice: EventChoice): Decision => ({ kind: 'event', at: Q[event], event, choice })
const crash = (at: number, choice: CrashChoice): Decision => ({ kind: 'crash', at, choice })
const act = (at: number, action: ActionId): Decision => ({ kind: 'action', at, action })

test('snapshots carry the net index, the month’s salary and its emergency target', () => {
  const t = simulate(setup, yearly(20, 0.15, 0.7), 'auto')
  expect(t.snapshots[0]).toMatchObject({ month: 0, total: 0, index: 1, salary: setup.salary[0] })
  expect(t.flows.length).toBe(241)
  expect(t.flows[0]).toBe(0)
  let index = 1
  for (let m = 1; m <= 240; m++) {
    index *= 1 + etfReturn(setup.returns[m - 1].stock)
    const s = t.snapshots[m]
    expect(s.month).toBe(m)
    expect(s.index).toBeCloseTo(index, 9)
    expect(s.salary).toBe(setup.salary[m - 1])
    expect(s.emergencyTarget).toBe(EMERGENCY_MONTHS * setup.salary[m - 1])
    expect(s.total).toBe(total(s.holdings))
  }
})

test('flows hold each month’s saving, plus event money at the event’s month', () => {
  const t = simulate(quiet(), yearly(20, 0.1, 0.5), 'auto')
  for (let m = 1; m <= 240; m++) if (m !== Q.bill && m !== Q.windfall) expect(t.flows[m]).toBeCloseTo(100)
  expect(t.flows[Q.windfall]).toBeCloseTo(100 + WINDFALL)
  expect(t.bill).toMatchObject({ unpaid: 0 })
  expect(t.bill!.fromCash).toBeCloseTo(48 * 50)
  expect(t.bill!.sold).toBeCloseTo(3000 - 48 * 50)
  expect(t.flows[Q.bill]).toBeCloseTo(100 - 3000)
})

test('auto mode fills in each missing decision with its default', () => {
  const explicit: Decision[] = [
    ...yearly(20, START_DIALS.saveRate, START_DIALS.etfShare),
    ...(['werner', 'keller', 'jonas'] as const).map(
      (event): Decision => ({ kind: 'event', at: setup.schedule[event], event, choice: 'decline' }),
    ),
    { kind: 'event', at: setup.schedule.windfall, event: 'windfall', choice: 'lump' },
    { kind: 'event', at: setup.schedule.bill, event: 'bill', choice: 'ok' },
    { kind: 'event', at: setup.schedule.raise, event: 'raise', choice: 'ok' },
    ...setup.takeovers.map((at) => crash(at, 'hold')),
  ]
  const played = simulate(setup, explicit)
  expect(played.pending).toBeNull()
  expect(simulate(setup, [], 'auto')).toEqual(played)
  // A missing year keeps the dials in force.
  expect(simulate(setup, [year(0, 0.2, 0.3)], 'auto')).toEqual(simulate(setup, yearly(20, 0.2, 0.3), 'auto'))
})

test('a decision’s key names its kind, month and, for events and actions, which one', () => {
  const log = [year(24, 0.1, 0.5), ev('keller', 'follow'), crash(30, 'sell'), act(36, 'getBackIn')]
  expect(log.map(decisionKey)).toEqual(['year:24', 'event:24:keller', 'crash:30', 'action:36:getBackIn'])
})

test('decisions are found by key: order does not matter, the first of a key wins, strays are ignored', () => {
  const log: Decision[] = [...yearly(20, 0.15, 0.7), crash(setup.takeovers[0], 'sell'), act(24, 'getBackIn')]
  const t = simulate(setup, log, 'auto')
  expect(simulate(setup, [...log].reverse(), 'auto')).toEqual(t)
  expect(simulate(setup, [...log, year(0, 0.3, 0), crash(setup.takeovers[0], 'buyMore')], 'auto')).toEqual(t)
  const strays: Decision[] = [
    year(5, 0.3, 0),
    { kind: 'event', at: 24, event: 'werner', choice: 'follow' }, // werner is scheduled at 12 in this run
    crash(18, 'sell'), // not a takeover month
    act(13, 'sellStock'), // not a year boundary
  ]
  expect(simulate(setup, [...log, ...strays], 'auto')).toEqual(t)
})

test('year dials are clamped to the dials’ ranges', () => {
  const high = simulate(setup, [year(0, 0.9, 1.5)])
  expect(high.dials).toEqual({ saveRate: MAX_SAVE_RATE, etfShare: 1 })
  expect(high.flows[1]).toBeCloseTo(setup.salary[0] * MAX_SAVE_RATE)
  expect(high.snapshots[1].holdings.cash).toBe(0)
  const low = simulate(setup, [year(0, -0.2, -1)])
  expect(low.dials).toEqual({ saveRate: 0, etfShare: 0 })
  expect(low.flows[1]).toBe(0)
})

test('a takeover waits with the fall from the peak, then the year plays on without a new year decision', () => {
  // In this run the first takeover falls in year 2 and no event is scheduled at the end of that year.
  const at = setup.takeovers[0]
  const next = Math.ceil(at / 12) * 12
  expect(Object.values(setup.schedule)).not.toContain(next)
  const log: Decision[] = [
    ...yearly(next / 12, 0.15, 0.7),
    { kind: 'event', at: setup.schedule.werner, event: 'werner', choice: 'decline' },
  ]
  const t = simulate(setup, log)
  expect(t.snapshots.length).toBe(at + 1)
  expect(t.pending).toMatchObject({ kind: 'crash', at })
  const peak = Math.max(...t.snapshots.map((s) => s.index))
  const drawdown = t.pending?.kind === 'crash' ? t.pending.drawdown : NaN
  expect(drawdown).toBeCloseTo(1 - t.snapshots[at].index / peak, 12)
  expect(drawdown).toBeGreaterThanOrEqual(CRASH_TRIGGER)
  const after = simulate(setup, [...log, crash(at, 'hold')])
  expect(after.pending).toMatchObject({ kind: 'year', at: next })
  expect(after.snapshots.length).toBe(next + 1)
})

test('a takeover at a year end comes before that month’s event and year', () => {
  const s = quiet({ takeovers: [24] })
  let log: Decision[] = [...yearly(2, 0.1, 0.5), ev('werner', 'decline')]
  expect(simulate(s, log).pending).toMatchObject({ kind: 'crash', at: 24 })
  log = [...log, crash(24, 'hold')]
  expect(simulate(s, log).pending).toEqual({ kind: 'event', at: 24, event: 'keller' })
  log = [...log, ev('keller', 'decline')]
  expect(simulate(s, log).pending).toEqual({ kind: 'year', at: 24, actions: [] })
})

test('two takeovers in one year each stop the run; one in the last month is ignored', () => {
  const s = quiet({ takeovers: [26, 29, 240] })
  let log: Decision[] = [...yearly(20, 0.1, 0.5), ev('werner', 'decline'), ev('keller', 'decline')]
  expect(simulate(s, log).pending).toMatchObject({ kind: 'crash', at: 26 })
  log = [...log, crash(26, 'hold')]
  expect(simulate(s, log).pending).toMatchObject({ kind: 'crash', at: 29 })
  log = [...log, crash(29, 'hold')]
  expect(simulate(s, log).pending).toEqual({ kind: 'event', at: 36, event: 'jonas' })
  log = [...log, ev('jonas', 'decline'), ev('bill', 'ok'), ev('raise', 'ok'), ev('windfall', 'lump')]
  const end = simulate(s, log)
  expect(end.pending).toBeNull()
  expect(end.snapshots.length).toBe(241)
})

test('following Uncle Werner parks the money; getBackIn puts it back', () => {
  const s = quiet()
  const year0 = year(0, 0.2, 0.5)
  const before = simulate(s, [year0])
  expect(before.pending).toEqual({ kind: 'event', at: 12, event: 'werner' })
  const { etf, cash } = before.snapshots[12].holdings

  const parked = simulate(s, [year0, ev('werner', 'follow')])
  expect(parked.pending).toEqual({ kind: 'year', at: 12, actions: ['getBackIn'] })
  expect(parked.snapshots[12].holdings).toMatchObject({ etf: 0, cash: cash + etf })
  expect(parked.parked).toEqual({ amount: etf, etfShare: 0.5 })
  expect(parked.dials.etfShare).toBe(0)
  expect(parked.flows[12]).toBe(before.flows[12])

  const back = simulate(s, [year0, ev('werner', 'follow'), act(12, 'getBackIn')])
  expect(back.pending).toEqual({ kind: 'year', at: 12, actions: [] })
  expect(back.snapshots[12].holdings.etf).toBeCloseTo(etf)
  expect(back.parked).toBeNull()
  expect(back.dials.etfShare).toBe(0.5)

  // Without a later year decision, auto mode keeps the split at zero (until the windfall goes in at once).
  const stayed = simulate(s, [year0, ev('werner', 'follow')], 'auto')
  expect(stayed.snapshots[Q.windfall - 1].holdings.etf).toBe(0)
  expect(stayed.dials.etfShare).toBe(0)
  expect(stayed.parked).toEqual({ amount: etf, etfShare: 0.5 })
})

test('getBackIn with no cash left moves nothing but still restores the split', () => {
  // Saving 50 a month: 300 parked at month 12; by month 48 cash is about 2400 and the bill takes all of it.
  const t = simulate(quiet(), [year(0, 0.05, 0.5), ev('werner', 'follow'), act(Q.bill, 'getBackIn')], 'auto')
  expect(t.bill).toMatchObject({ sold: 0, drawdownAtSale: 0 })
  expect(t.bill!.unpaid).toBeGreaterThan(0)
  expect(t.bill!.fromCash + t.bill!.unpaid).toBeCloseTo(3000)
  expect(t.snapshots[Q.bill].total).toBe(0)
  expect(t.parked).toBeNull()
  expect(t.dials.etfShare).toBe(0.5)
})

test('getBackIn moves only the cash there is when it is less than the parked amount', () => {
  // About 1200 parked at month 12; saving 30 a month into cash, about 480 is left after the bill at month 48.
  const log = [year(0, 0.2, 0.5), ev('werner', 'follow'), year(12, 0.03, 0)]
  const before = simulate(quiet(), log, 'auto')
  const { cash } = before.snapshots[Q.bill].holdings
  const amount = before.parked!.amount
  expect(cash).toBeGreaterThan(0)
  expect(cash).toBeLessThan(amount)

  const back = simulate(quiet(), [...log, act(Q.bill, 'getBackIn')], 'auto')
  expect(back.snapshots[Q.bill].holdings).toMatchObject({ etf: cash, cash: 0 })
  expect(back.parked).toBeNull()
  expect(back.dials.etfShare).toBe(0.5)
})

test('two actions at one boundary run in the order they were taken', () => {
  // At month 24 the money is parked and new money goes to the fund.
  const s = quiet()
  const log = [year(0, 0.2, 0.5), ev('werner', 'follow'), year(12, 0.2, 0.3), ev('keller', 'follow')]
  const parked = simulate(s, log).parked!.amount
  const inFirst = simulate(s, [...log, act(24, 'getBackIn'), act(24, 'switchBackToEtf')])
  const switchFirst = simulate(s, [...log, act(24, 'switchBackToEtf'), act(24, 'getBackIn')])
  for (const t of [inFirst, switchFirst]) {
    expect(t.pending).toEqual({ kind: 'year', at: 24, actions: [] })
    expect(t.snapshots[24].holdings.fund).toBe(0)
    expect(t.riskyTarget).toBe('etf')
  }
  // Getting back in first passes the parked money through the fund and its entry fee.
  const etf = (t: Timeline) => t.snapshots[24].holdings.etf
  expect(etf(switchFirst) - etf(inFirst)).toBeCloseTo(parked * FUND_ENTRY_FEE)
})

test('selling in a crash while parked adds to the parked amount and keeps the split to return to', () => {
  const s = quiet({ takeovers: [30] })
  const upToKeller = [year(0, 0.2, 0.5), ev('werner', 'follow'), year(12, 0.2, 0.3), ev('keller', 'follow')]
  expect(simulate(s, upToKeller).pending).toEqual({ kind: 'year', at: 24, actions: ['getBackIn', 'switchBackToEtf'] })

  const log = [...upToKeller, year(24, 0.2, 0.3)]
  const pre = simulate(s, log)
  expect(pre.pending).toMatchObject({ kind: 'crash', at: 30 })
  const h = pre.snapshots[30].holdings
  expect(h.fund).toBeGreaterThan(0)

  const post = simulate(s, [...log, crash(30, 'sell')])
  expect(post.pending).toEqual({ kind: 'event', at: 36, event: 'jonas' })
  expect(post.snapshots[30].holdings).toMatchObject({ etf: 0, fund: 0 })
  expect(post.snapshots[30].holdings.cash).toBeCloseTo(h.cash + h.etf + h.fund)
  expect(post.parked!.amount).toBeCloseTo(pre.parked!.amount + h.etf + h.fund)
  expect(post.parked!.etfShare).toBe(0.5)
  expect(post.dials.etfShare).toBe(0)
  expect(post.riskyTarget).toBe('fund')

  // Getting back in goes to the fund, entry fee included.
  const back = simulate(s, [...log, crash(30, 'sell'), ev('jonas', 'decline'), act(36, 'getBackIn')])
  expect(back.pending).toEqual({ kind: 'year', at: 36, actions: ['switchBackToEtf'] })
  expect(back.snapshots[36].holdings.fund).toBeCloseTo(post.parked!.amount * (1 - FUND_ENTRY_FEE))
  expect(back.dials.etfShare).toBe(0.5)
})

test('following Mr. Keller moves the ETF into the fund; switchBackToEtf moves it back without a fee', () => {
  const s = quiet()
  const log = [year(0, 0.2, 1), ev('werner', 'decline'), year(12, 0.2, 1)]
  const etf = simulate(s, log).snapshots[24].holdings.etf

  const moved = simulate(s, [...log, ev('keller', 'follow')])
  expect(moved.pending).toEqual({ kind: 'year', at: 24, actions: ['switchBackToEtf'] })
  expect(moved.snapshots[24].holdings.etf).toBe(0)
  expect(moved.snapshots[24].holdings.fund).toBeCloseTo(etf * (1 - FUND_ENTRY_FEE))
  expect(moved.riskyTarget).toBe('fund')

  const switched = simulate(s, [...log, ev('keller', 'follow'), act(24, 'switchBackToEtf')])
  expect(switched.pending).toEqual({ kind: 'year', at: 24, actions: [] })
  expect(switched.snapshots[24].holdings).toMatchObject({ fund: 0, etf: moved.snapshots[24].holdings.fund })
  expect(switched.riskyTarget).toBe('etf')
})

test('following Jonas moves half the ETF into the stock; sellStock moves it back', () => {
  const s = quiet()
  const log = [year(0, 0.2, 1), ev('werner', 'decline'), year(12, 0.2, 1), ev('keller', 'decline'), year(24, 0.2, 1)]
  const etf = simulate(s, log).snapshots[36].holdings.etf

  const bought = simulate(s, [...log, ev('jonas', 'follow')])
  expect(bought.pending).toEqual({ kind: 'year', at: 36, actions: ['sellStock'] })
  expect(bought.snapshots[36].holdings).toMatchObject({ etf: etf / 2, stock: etf / 2 })

  const sold = simulate(s, [...log, ev('jonas', 'follow'), act(36, 'sellStock')])
  expect(sold.pending).toEqual({ kind: 'year', at: 36, actions: [] })
  expect(sold.snapshots[36].holdings).toMatchObject({ etf, stock: 0 })
})

test('the windfall goes in at once, over twelve months, or stays in cash', () => {
  const s = quiet()
  const base = yearly(20, 0, 0)
  const at = Q.windfall

  const lump = simulate(s, [...base, ev('windfall', 'lump')], 'auto')
  expect(lump.snapshots[at].holdings).toMatchObject({ etf: WINDFALL, cash: 0 })
  expect(lump.flows[at]).toBe(WINDFALL)

  const cash = simulate(s, [...base, ev('windfall', 'cash')], 'auto')
  expect(cash.snapshots[at].holdings).toMatchObject({ etf: 0, cash: WINDFALL })
  expect(cash.snapshots[240].holdings.cash).toBe(WINDFALL)
  expect(cash.flows[at]).toBe(WINDFALL)

  const spread = simulate(s, [...base, ev('windfall', 'spread')], 'auto')
  expect(spread.snapshots[at].holdings).toMatchObject({ etf: 0, cash: WINDFALL })
  expect(spread.snapshots[at + 1].holdings.etf).toBeCloseTo(WINDFALL / 12)
  expect(spread.snapshots[at + 1].holdings.cash).toBeCloseTo(WINDFALL - WINDFALL / 12)
  expect(spread.snapshots[at + 12].holdings.cash).toBeCloseTo(0)
  expect(spread.snapshots[at + 13].holdings.cash).toBe(spread.snapshots[at + 12].holdings.cash)
  expect(spread.flows.reduce((a, b) => a + b, 0)).toBe(WINDFALL)

  const intoFund = simulate(s, [...base, ev('keller', 'follow'), ev('windfall', 'lump')], 'auto')
  expect(intoFund.snapshots[at].holdings.fund).toBeCloseTo(WINDFALL * (1 - FUND_ENTRY_FEE))
})

test('selling cancels a running windfall spread; the rest stays in cash', () => {
  const sale = Q.windfall + 3
  const log = [...yearly(20, 0, 0), ev('windfall', 'spread'), crash(sale, 'sell')]
  const t = simulate(quiet({ takeovers: [sale] }), log, 'auto')
  expect(t.snapshots[sale].holdings.etf).toBe(0)
  for (let m = sale + 1; m <= Q.windfall + 12; m++) {
    expect(t.snapshots[m].holdings).toMatchObject({ etf: 0, cash: t.snapshots[sale].holdings.cash })
  }
})

test('the bill is paid from cash first and sells shares only for what cash cannot cover', () => {
  const upToBill = (saveRate: number, etfShare: number): Decision[] => [
    ...yearly(4, saveRate, etfShare),
    ev('werner', 'decline'),
    ev('keller', 'decline'),
    ev('jonas', 'decline'),
  ]
  const covered = quiet()
  expect(simulate(covered, upToBill(0.1, 0)).pending).toEqual({
    kind: 'event',
    at: Q.bill,
    event: 'bill',
    billCovered: true,
  })
  const paid = simulate(covered, [...upToBill(0.1, 0), ev('bill', 'ok')])
  expect(paid.pending).toEqual({ kind: 'year', at: Q.bill, actions: [] })
  expect(paid.bill).toEqual({ fromCash: 3000, sold: 0, unpaid: 0, drawdownAtSale: 0 })
  expect(paid.snapshots[Q.bill].holdings.cash).toBeCloseTo(48 * 100 - 3000)
  expect(paid.flows[Q.bill]).toBeCloseTo(100 - 3000)

  // Everything in the ETF, and the market fell 30% in month 40.
  const fallen = quiet({ returns: Array.from({ length: 240 }, (_, i) => ({ stock: i === 39 ? -0.3 : 0, cash: 0 })) })
  const before = simulate(fallen, upToBill(0.1, 1))
  expect(before.pending).toEqual({ kind: 'event', at: Q.bill, event: 'bill', billCovered: false })
  const sold = simulate(fallen, [...upToBill(0.1, 1), ev('bill', 'ok')])
  const peak = Math.max(...sold.snapshots.map((x) => x.index))
  expect(sold.bill).toEqual({
    fromCash: 0,
    sold: 3000,
    unpaid: 0,
    drawdownAtSale: expect.closeTo(1 - sold.snapshots[Q.bill].index / peak, 12),
  })
  expect(sold.bill!.drawdownAtSale).toBeGreaterThan(0.3)
  expect(sold.snapshots[Q.bill].holdings.etf).toBeCloseTo(before.snapshots[Q.bill].holdings.etf - 3000)
  expect(sold.flows[Q.bill]).toBeCloseTo(100 - 3000)
})

test('an event choice with no listed effect counts as decided and does nothing', () => {
  const log = [...yearly(4, 0.1, 0), ev('werner', 'decline'), ev('keller', 'decline'), ev('jonas', 'decline')]
  const waiting = simulate(quiet(), log)
  expect(waiting.pending).toMatchObject({ kind: 'event', event: 'bill' })
  const declined = simulate(quiet(), [...log, ev('bill', 'decline')])
  expect(declined.pending).toEqual({ kind: 'year', at: Q.bill, actions: [] })
  expect(declined.bill).toBeNull()
  expect(declined.flows).toEqual(waiting.flows)
  expect(declined.snapshots).toEqual(waiting.snapshots)
})

test('buying more in a crash moves the cash above the emergency fund', () => {
  const s = quiet({ takeovers: [30] })
  const more = simulate(s, [...yearly(20, 0.2, 0), crash(30, 'buyMore')], 'auto')
  expect(more.snapshots[30].emergencyTarget).toBe(3000)
  expect(more.snapshots[30].holdings).toMatchObject({ cash: 3000, etf: 6000 - 3000 })
  const little = simulate(s, [...yearly(20, 0.05, 0), crash(30, 'buyMore')], 'auto')
  expect(little.snapshots[30].holdings).toMatchObject({ cash: 1500, etf: 0 })
})

test('buying more ends a running windfall spread, so the emergency fund stays put', () => {
  const buy = Q.windfall + 3
  const log = [...yearly(20, 0, 0), ev('windfall', 'spread'), crash(buy, 'buyMore')]
  const t = simulate(quiet({ takeovers: [buy] }), log, 'auto')
  expect(t.snapshots[buy].holdings.cash).toBeCloseTo(t.snapshots[buy].emergencyTarget)
  for (let m = buy + 1; m <= Q.windfall + 12; m++) {
    expect(t.snapshots[m].holdings.cash).toBe(t.snapshots[buy].holdings.cash)
  }
})

test('buying more while parked counts as getting back in', () => {
  const s = quiet({ takeovers: [30] })
  const log = [
    year(0, 0.2, 0.5),
    ev('werner', 'follow'),
    year(12, 0.2, 0),
    ev('keller', 'decline'),
    year(24, 0.2, 0),
  ]
  const before = simulate(s, log)
  expect(before.pending).toMatchObject({ kind: 'crash', at: 30 })
  expect(before.parked).toMatchObject({ etfShare: 0.5 })
  const { cash } = before.snapshots[30].holdings

  const t = simulate(s, [...log, crash(30, 'buyMore'), ev('jonas', 'decline')])
  expect(t.pending).toEqual({ kind: 'year', at: 36, actions: [] })
  expect(t.parked).toBeNull()
  expect(t.dials.etfShare).toBe(0.5)
  // Only the cash above the emergency fund goes in, not the parked amount on top.
  expect(t.snapshots[30].holdings.cash).toBeCloseTo(3000)
  expect(t.snapshots[30].holdings.etf).toBeCloseTo(cash - 3000)
})

test('simulate leaves its inputs untouched', () => {
  const log: Decision[] = [...yearly(20, 0.15, 0.7), crash(setup.takeovers[0], 'sell'), act(24, 'getBackIn')]
  const setupCopy = structuredClone(setup)
  const logCopy = structuredClone(log)
  simulate(setup, log, 'auto')
  expect(setup).toEqual(setupCopy)
  expect(log).toEqual(logCopy)
})
