import { market } from '../data'
import { buildEnding } from './ending'
import { BILL, WINDFALL } from './constants'
import { createSetup } from './setup'
import { simulate } from './simulate'
import { historyStats } from './stats'
import { yearly } from './testHelpers'
import type { Decision, EventChoice, EventId } from './types'

const setup = createSetup(market, 3)

test('ending for an ordinary run is complete and finite', () => {
  const log = yearly(20, 0.15, 0.7); const e = buildEnding(market, setup, log);
  expect(e.you.length).toBe(241); expect(e.final).toBeCloseTo(e.you[240]);
  expect(e.reveal.toYear - e.reveal.fromYear).toBe(20); expect(e.reveal.region).toBe('us');
  expect(e.reveal.crashes.length).toBeGreaterThanOrEqual(1);
  expect(e.cards.savingsRate.averageRate).toBeCloseTo(0.15); expect(e.cards.savingsRate.finalAt15).toBeCloseTo(e.final, 0);
  expect(e.cards.costs.fundOnlyFinal).toBeLessThan(e.cards.costs.etfOnlyFinal);
  expect(e.cards.stock.beatInHundred).toBeGreaterThanOrEqual(0); expect(e.cards.stock.beatInHundred).toBeLessThanOrEqual(100);
});
test('zero-savings run has no NaN or Infinity anywhere', () => {   // Review Focus 2
  const e = buildEnding(market, setup, yearly(20, 0, 0.5));
  const walk = (v: unknown): void => { if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(e);
});
test('selling in the crash produces a "held" line', () => {
  const log: Decision[] = [...yearly(20, 0.15, 0.7), { kind: 'crash', at: setup.takeovers[0], choice: 'sell' }];
  expect(buildEnding(market, setup, log).lines.some(l => l.id === 'held' && l.emphasised)).toBe(true);
});

const windfall = (choice: 'lump' | 'spread' | 'cash' | 'decline'): Decision => ({
  kind: 'event',
  at: setup.schedule.windfall,
  event: 'windfall',
  choice,
})

const finiteEverywhere = (v: unknown, path = 'model'): string[] => {
  if (typeof v === 'number') return Number.isFinite(v) ? [] : [`${path} = ${v}`]
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => finiteEverywhere(x, `${path}.${k}`))
  return []
}

test("the result is the player's own run, with the money paid in", () => {
  const log = yearly(20, 0.15, 0.7)
  const run = simulate(setup, log, 'auto')
  const e = buildEnding(market, setup, log)
  expect(e.you).toEqual(run.snapshots.map((s) => s.total))
  expect(e.final).toBe(run.snapshots[240].total)
  expect(e.paidIn).toBeCloseTo(run.flows.reduce((a, b) => a + b, 0), 6)
  expect(e.lines.map((l) => l.id)).toEqual(['sold', 'etfOnly', 'fundOnly', 'cashOnly'])
})

test('saved from income counts the monthly savings only; paid in also has the gift and the car bill', () => {
  // 30% for five years, then 5%: the gift goes in, the bill is paid in full.
  const log: Decision[] = Array.from({ length: 20 }, (_, i): Decision => ({ kind: 'year', at: 12 * i, saveRate: i < 5 ? 0.3 : 0.05, etfShare: 0.7 }))
  const e = buildEnding(market, setup, log)
  const saved = setup.salary.reduce((sum, pay, m) => sum + pay * (m < 60 ? 0.3 : 0.05), 0)
  expect(e.savedFromIncome).toBeCloseTo(saved, 6)
  expect(e.cards.savingsRate.savedFromIncome).toBe(e.savedFromIncome)
  expect(e.cards.emergency.unpaid).toBe(0)
  expect(e.paidIn).toBeCloseTo(saved + WINDFALL - BILL, 6)

  // Nothing saved and the bill before the gift: it goes unpaid, and only the gift went in.
  const broke = buildEnding(market, setup, yearly(20, 0, 0.5))
  expect(broke.savedFromIncome).toBe(0)
  expect(broke.cards.emergency).toMatchObject({ covered: false, sold: 0, unpaid: BILL })
  expect(broke.paidIn).toBe(WINDFALL)
})

test('the reveal names the window and its takeover crashes by peak year', () => {
  // Seed 3 lives through 1973 to 1993: the 1973-74 bear market (peak at month 1) and 1987 (peak at month 176).
  const e = buildEnding(market, setup, yearly(20, 0.15, 0.7))
  expect(e.reveal.fromYear).toBe(1973)
  expect(e.reveal.toYear).toBe(1993)
  expect(e.reveal.crashes.map((c) => c.peakYear)).toEqual([1973, 1987])
  expect(e.reveal.crashes[0].depth).toBeCloseTo(0.3939, 4)
  expect(e.reveal.crashes[1].depth).toBeCloseTo(0.2609, 4)
})

test('an all-ETF run falls and recovers with the index, whatever is paid in or taken out', () => {
  // Everything sits in the ETF (savings, the lump-sum windfall), and the bill sells ETF; flows must not count as gains or losses.
  const e = buildEnding(market, setup, yearly(20, 0.15, 1))
  const deepest = setup.episodes.reduce((a, b) => (b.depth > a.depth ? b : a))
  expect(e.cards.time.lowestDrawdown).toBeCloseTo(deepest.depth, 6)
  expect(e.cards.time.monthsToRecover).toBe(deepest.recoveryMonth! - deepest.troughMonth)
  expect(e.cards.split.yourMaxDrawdown).toBe(e.cards.time.lowestDrawdown)
  expect(e.cards.split.etfOnlyMaxDrawdown).toBe(deepest.depth)
  expect(e.cards.time.longestLosingMonths).toBe(historyStats(market).longestLosingMonths)
})

test('a run that never falls has no low and nothing to recover from', () => {
  const e = buildEnding(market, setup, [...yearly(20, 0.15, 0), windfall('cash')])
  expect(e.cards.time.lowestDrawdown).toBe(0)
  expect(e.cards.time.monthsToRecover).toBe(0)
})

test("the fund's entry fee on new money is not a fall", () => {
  // Tiny savings in cash, Keller followed: the bill empties the cash, then the lump-sum windfall pays the
  // fund's 5% entry fee on 10,000 against a balance of a few hundred euros.
  const six = createSetup(market, 6)
  const keller: Decision = { kind: 'event', at: six.schedule.keller, event: 'keller', choice: 'follow' }
  const e = buildEnding(market, six, [...yearly(20, 0.01, 0), keller])
  expect(e.cards.time.lowestDrawdown).toBeGreaterThan(0)
  expect(e.cards.time.lowestDrawdown).toBeLessThan(1)
})

test('the lowest point is a share between 0 and 1 for fund-heavy and tiny-savings runs', () => {
  let runs = 0
  for (let s = 0; s < 9; s++) {
    const st = createSetup(market, s)
    const ev = (event: EventId, choice: EventChoice): Decision => ({ kind: 'event', at: st.schedule[event], event, choice })
    // Nothing saved until the year before the windfall, then 1% into cash: the smallest balance a lump into the fund can meet.
    const beforeWindfall = yearly(20, 0, 0.5).map((d) => (d.kind === 'year' && d.at === st.schedule.windfall - 12 ? { ...d, saveRate: 0.01 } : d))
    const logs: Decision[][] = [[...beforeWindfall, ev('keller', 'follow')]]
    for (const rate of [0, 0.01, 0.3]) {
      for (const share of [0, 1]) {
        const base = yearly(20, rate, share)
        logs.push(base, [...base, ev('keller', 'follow')], [...base, ev('keller', 'follow'), ev('windfall', 'spread')], [...base, ev('jonas', 'follow')])
      }
    }
    for (const log of logs) {
      const { lowestDrawdown, monthsToRecover } = buildEnding(market, st, log).cards.time
      runs++
      expect(lowestDrawdown, `seed ${s}`).toBeGreaterThanOrEqual(0)
      expect(lowestDrawdown, `seed ${s}`).toBeLessThanOrEqual(1)
      if (monthsToRecover !== null) expect(Number.isInteger(monthsToRecover) && monthsToRecover >= 0).toBe(true)
    }
  }
  expect(runs).toBeGreaterThanOrEqual(200)
})

test('a fall still under water at month 240 has no recovery', () => {
  // The same history, but the market loses 3% every month from month 201: the deepest fall comes last and never ends.
  const sinking = { ...setup, returns: setup.returns.map((r, i) => (i >= 200 ? { ...r, stock: -0.03 } : r)) }
  const e = buildEnding(market, sinking, yearly(20, 0.15, 1))
  const run = simulate(sinking, yearly(20, 0.15, 1), 'auto')
  const peak = Math.max(...run.snapshots.slice(1, 201).map((s) => s.index))
  expect(e.cards.time.lowestDrawdown).toBeCloseTo(1 - run.snapshots[240].index / peak, 9)
  expect(e.cards.time.monthsToRecover).toBeNull()
})

test('the lump-sum card compares the windfall at once with spreading it', () => {
  const stats = historyStats(market)
  const auto = buildEnding(market, setup, yearly(20, 0.15, 0.7))
  expect(auto.cards.lumpSum.choice).toBe('lump')
  expect(auto.cards.lumpSum.lumpFinal).toBe(auto.final) // the player's own choice replays their own run
  expect(auto.cards.lumpSum.spreadFinal).not.toBeCloseTo(auto.final, 0)
  expect(auto.cards.lumpSum.winRate).toBe(stats.lump.wins / stats.lump.total)

  const spread = buildEnding(market, setup, [...yearly(20, 0.15, 0.7), windfall('spread')])
  expect(spread.cards.lumpSum.choice).toBe('spread')
  expect(spread.cards.lumpSum.spreadFinal).toBe(spread.final)
  expect(spread.cards.lumpSum.lumpFinal).toBe(auto.final)
  expect(buildEnding(market, setup, [...yearly(20, 0.15, 0.7), windfall('cash')]).cards.lumpSum.choice).toBe('cash')
})

/** Seed 1 takes over at month 101; seed 2 sends Grandma's money at month 108. */
const one = createSetup(market, 1)
const two = createSetup(market, 2)

test("the paths not taken keep the player's later savings: the seed-1 example", () => {
  // Saves 10% with 70% to the ETF, sells at month 101, gets back in at the next year and saves 25% from then on.
  expect(one.takeovers[0]).toBe(101)
  const log: Decision[] = [
    ...Array.from({ length: 20 }, (_, i): Decision => ({ kind: 'year', at: 12 * i, saveRate: 12 * i < 101 ? 0.1 : 0.25, etfShare: 0.7 })),
    { kind: 'crash', at: 101, choice: 'sell' },
    { kind: 'action', at: 108, action: 'getBackIn' },
  ]
  const e = buildEnding(market, one, log)
  const held = e.lines.find((l) => l.id === 'held')!
  expect(Math.round(e.final)).toBe(277502)
  // Holding with the same savings ends above what the player got; the old replay froze the 10% and showed €164,535.
  expect(Math.round(held.final)).toBe(284491)
  expect(held.final).toBeGreaterThan(e.final)
})

test("the lump-sum card's figure for the player's own choice is their final amount, whatever they did afterwards", () => {
  // 10% with 70% to the ETF; from month 168 on, 25%.
  const dials = (rate: number, share: number): Decision[] =>
    Array.from({ length: 20 }, (_, i): Decision => ({ kind: 'year', at: 12 * i, saveRate: 12 * i < 168 ? 0.1 : rate, etfShare: 12 * i < 168 ? 0.7 : share }))
  const at = two.schedule.windfall
  expect(at).toBe(108)
  const lump = buildEnding(market, two, [...dials(0.25, 0.7), { kind: 'event', at, event: 'windfall', choice: 'lump' }])
  expect(Math.round(lump.final)).toBe(386816)
  // The old replay froze the 10% and showed €325,542 for investing at once.
  expect(lump.cards.lumpSum.lumpFinal).toBe(lump.final)

  const later: Decision[] = [
    ...dials(0.3, 0.2),
    { kind: 'event', at, event: 'windfall', choice: 'spread' },
    { kind: 'action', at: 168, action: 'switchBackToEtf' },
    { kind: 'event', at: two.schedule.keller, event: 'keller', choice: 'follow' },
    ...two.takeovers.map((m): Decision => ({ kind: 'crash', at: m, choice: 'sell' })),
    { kind: 'action', at: 180, action: 'getBackIn' },
  ]
  const spread = buildEnding(market, two, later)
  expect(spread.cards.lumpSum.choice).toBe('spread')
  expect(spread.cards.lumpSum.spreadFinal).toBe(spread.final)
  expect(spread.cards.lumpSum.lumpFinal).not.toBe(spread.final)
})

test('the savings-rate card averages the dials in force at each year boundary', () => {
  const log: Decision[] = [
    { kind: 'year', at: 0, saveRate: 0.3, etfShare: 1 },
    { kind: 'year', at: 120, saveRate: 0.1, etfShare: 0 },
  ]
  const e = buildEnding(market, setup, log)
  expect(e.cards.savingsRate.averageRate).toBeCloseTo(0.2, 12)
  expect(e.cards.split.averageEtfShare).toBeCloseTo(0.5, 12)

  const none = buildEnding(market, setup, [])
  expect(none.cards.savingsRate.averageRate).toBeCloseTo(0.1, 12) // START_DIALS throughout
  expect(none.cards.split.averageEtfShare).toBeCloseTo(0.5, 12)

  const late = buildEnding(market, setup, [{ kind: 'year', at: 60, saveRate: 0.2, etfShare: 0.9 }])
  expect(late.cards.savingsRate.averageRate).toBeCloseTo((5 * 0.1 + 15 * 0.2) / 20, 12)
  expect(late.cards.split.averageEtfShare).toBeCloseTo((5 * 0.5 + 15 * 0.9) / 20, 12)
})

test('finalAt15 replays the same split and choices at 15%', () => {
  const high = buildEnding(market, setup, yearly(20, 0.3, 0.7))
  const low = buildEnding(market, setup, yearly(20, 0.05, 0.7))
  const at15 = buildEnding(market, setup, yearly(20, 0.15, 0.7)).final
  expect(high.cards.savingsRate.finalAt15).toBeCloseTo(at15, 6)
  expect(low.cards.savingsRate.finalAt15).toBeCloseTo(at15, 6)
  expect(high.final).toBeGreaterThan(at15)

  // Every non-year choice is kept: a run that followed Keller is replayed at 15% in the fund.
  const keller: Decision = { kind: 'event', at: setup.schedule.keller, event: 'keller', choice: 'follow' }
  const followed = buildEnding(market, setup, [...yearly(20, 0.25, 0.7), keller])
  expect(followed.cards.savingsRate.finalAt15).toBeCloseTo(buildEnding(market, setup, [...yearly(20, 0.15, 0.7), keller]).final, 6)
})

test('the costs card says whether Keller was followed and shows the ETF and fund lines', () => {
  const e = buildEnding(market, setup, yearly(20, 0.15, 0.7))
  expect(e.cards.costs.followed).toBe(false)
  expect(e.cards.costs.etfOnlyFinal).toBe(e.lines.find((l) => l.id === 'etfOnly')!.final)
  expect(e.cards.costs.fundOnlyFinal).toBe(e.lines.find((l) => l.id === 'fundOnly')!.final)
  expect(e.cards.split.etfOnlyFinal).toBe(e.cards.costs.etfOnlyFinal)
  expect(e.cards.split.cashOnlyFinal).toBe(e.lines.find((l) => l.id === 'cashOnly')!.final)
  const keller: Decision = { kind: 'event', at: setup.schedule.keller, event: 'keller', choice: 'follow' }
  expect(buildEnding(market, setup, [...yearly(20, 0.15, 0.7), keller]).cards.costs.followed).toBe(true)
})

test('the stock card measures the stock and the index from the Jonas month to the end', () => {
  const jonas: Decision = { kind: 'event', at: setup.schedule.jonas, event: 'jonas', choice: 'follow' }
  const log = [...yearly(20, 0.15, 0.7), jonas]
  const run = simulate(setup, log, 'auto')
  const e = buildEnding(market, setup, log)
  const J = setup.schedule.jonas
  expect(e.cards.stock.followed).toBe(true)
  expect(e.cards.stock.moved).toBeGreaterThan(0)
  expect(e.cards.stock.moved).toBe(run.snapshots[J].holdings.stock)
  expect(e.cards.stock.indexMultiple).toBeCloseTo(run.snapshots[240].index / run.snapshots[J].index, 9)
  // The stock bucket is never touched after Jonas in this run (the bill is paid from cash), so it grew by exactly the multiple.
  expect(run.bill?.sold).toBe(0)
  expect(e.cards.stock.stockMultiple).toBeCloseTo(run.snapshots[240].holdings.stock / run.snapshots[J].holdings.stock, 9)

  const declined = buildEnding(market, setup, yearly(20, 0.15, 0.7)).cards.stock
  expect(declined.followed).toBe(false)
  expect(declined.moved).toBe(0)
  expect(declined.stockMultiple).toBe(e.cards.stock.stockMultiple)
  expect(declined.beatInHundred).toBe(e.cards.stock.beatInHundred)
})

test('the stock card says how much actually went into the stock', () => {
  const J = setup.schedule.jonas
  const jonas: Decision = { kind: 'event', at: J, event: 'jonas', choice: 'follow' }
  // Mr. Keller (month 36) took the whole ETF into his fund, so half of an empty ETF moved.
  const keller: Decision = { kind: 'event', at: setup.schedule.keller, event: 'keller', choice: 'follow' }
  expect(setup.schedule.keller).toBeLessThan(J)
  const empty = buildEnding(market, setup, [...yearly(20, 0.15, 0.7), keller, jonas]).cards.stock
  expect(empty).toMatchObject({ followed: true, moved: 0 })

  // Selling the stock at the same year boundary does not undo what moved.
  const plain = buildEnding(market, setup, [...yearly(20, 0.15, 0.7), jonas]).cards.stock
  const sellAtOnce = buildEnding(market, setup, [...yearly(20, 0.15, 0.7), jonas, { kind: 'action', at: J, action: 'sellStock' }]).cards.stock
  expect(sellAtOnce.moved).toBe(plain.moved)
  expect(plain.moved).toBeGreaterThan(0)
})

test('in 100 lives with the stock, most trail the index', () => {
  const counts = Array.from({ length: 8 }, (_, s) => buildEnding(market, createSetup(market, s), yearly(20, 0.15, 0.7)).cards.stock.beatInHundred)
  for (const n of counts) {
    expect(Number.isInteger(n)).toBe(true)
    expect(n).toBeGreaterThanOrEqual(0)
    expect(n).toBeLessThanOrEqual(100)
  }
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length
  expect(mean).toBeGreaterThan(5)
  expect(mean).toBeLessThan(50)
})

test('the emergency card reports how the bill was paid', () => {
  const covered = buildEnding(market, setup, yearly(20, 0.15, 0.7)).cards.emergency
  expect(covered).toEqual({ covered: true, sold: 0, unpaid: 0, drawdownAtSale: 0 })

  const log = yearly(20, 0.15, 1) // no cash at all: the bill sells ETF
  const run = simulate(setup, log, 'auto')
  const sold = buildEnding(market, setup, log).cards.emergency
  expect(sold.covered).toBe(false)
  expect(sold.sold).toBe(3000)
  expect(sold.drawdownAtSale).toBe(run.bill!.drawdownAtSale)
})

test('the crash history counts, across all eligible windows, how often holding beat selling', () => {
  const e = buildEnding(market, setup, yearly(20, 0.15, 0.7))
  expect(e.crashHistory).toEqual(historyStats(market).hold)
  expect(e.crashHistory.total).toBeGreaterThan(0)
  expect(e.crashHistory.wins).toBeLessThanOrEqual(e.crashHistory.total)
})

test('the share line compares the final amount with savings account only', () => {
  const e = buildEnding(market, setup, yearly(20, 0.15, 0.7))
  const cashOnly = e.lines.find((l) => l.id === 'cashOnly')!.final
  expect(e.share.final).toBe(e.final)
  expect(e.share.vsCashOnly).toBeCloseTo(e.final / cashOnly - 1, 12)
  expect(e.share.vsCashOnly).toBeGreaterThan(0)

  // No savings and the windfall turned down: nothing was ever paid in, so there is nothing to compare with.
  const nothing = buildEnding(market, setup, [...yearly(20, 0, 0.5), windfall('decline')])
  expect(nothing.final).toBe(0)
  expect(nothing.share.vsCashOnly).toBe(0)
})

test('every number is finite for edge-case logs', () => {
  const logs: Decision[][] = [
    [],
    [...yearly(20, 0, 0.5), windfall('decline')],
    [...yearly(20, 0, 1), windfall('spread')],
    [{ kind: 'year', at: 0, saveRate: Number.NaN, etfShare: Number.NaN }],
    [{ kind: 'year', at: 0, saveRate: 5, etfShare: -3 }],
    [
      ...yearly(20, 0.3, 1),
      { kind: 'event', at: setup.schedule.werner, event: 'werner', choice: 'follow' },
      { kind: 'event', at: setup.schedule.keller, event: 'keller', choice: 'follow' },
      { kind: 'event', at: setup.schedule.jonas, event: 'jonas', choice: 'follow' },
      windfall('spread'),
      ...setup.takeovers.map((at): Decision => ({ kind: 'crash', at, choice: 'sell' })),
    ],
  ]
  for (const log of logs) expect(finiteEverywhere(buildEnding(market, setup, log))).toEqual([])
})
