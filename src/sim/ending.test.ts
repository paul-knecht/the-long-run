import { market } from '../data'
import { buildEnding } from './ending'
import { createSetup } from './setup'
import { simulate } from './simulate'
import { historyStats } from './stats'
import { yearly } from './testHelpers'
import type { Decision } from './types'

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
  expect(e.cards.savingsRate.paidIn).toBe(e.paidIn)
  expect(e.lines.map((l) => l.id)).toEqual(['sold', 'etfOnly', 'fundOnly', 'cashOnly'])
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
  expect(e.cards.time.longestLosingYears).toBe(historyStats(market).longestLosingYears)
})

test('a run that never falls has no low and nothing to recover from', () => {
  const e = buildEnding(market, setup, [...yearly(20, 0.15, 0), windfall('cash')])
  expect(e.cards.time.lowestDrawdown).toBe(0)
  expect(e.cards.time.monthsToRecover).toBe(0)
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
  expect(auto.cards.lumpSum.lumpFinal).toBeCloseTo(auto.final, 6) // same dials before and after, so the flip changes nothing
  expect(auto.cards.lumpSum.spreadFinal).not.toBeCloseTo(auto.final, 0)
  expect(auto.cards.lumpSum.winRate).toBe(stats.lump.wins / stats.lump.total)

  const spread = buildEnding(market, setup, [...yearly(20, 0.15, 0.7), windfall('spread')])
  expect(spread.cards.lumpSum.choice).toBe('spread')
  expect(spread.cards.lumpSum.spreadFinal).toBeCloseTo(spread.final, 6)
  expect(spread.cards.lumpSum.lumpFinal).toBeCloseTo(auto.final, 6)
  expect(buildEnding(market, setup, [...yearly(20, 0.15, 0.7), windfall('cash')]).cards.lumpSum.choice).toBe('cash')
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
  expect(e.cards.stock.indexMultiple).toBeCloseTo(run.snapshots[240].index / run.snapshots[J].index, 9)
  // The stock bucket is never touched after Jonas in this run (the bill is paid from cash), so it grew by exactly the multiple.
  expect(run.bill?.sold).toBe(0)
  expect(e.cards.stock.stockMultiple).toBeCloseTo(run.snapshots[240].holdings.stock / run.snapshots[J].holdings.stock, 9)

  const declined = buildEnding(market, setup, yearly(20, 0.15, 0.7)).cards.stock
  expect(declined.followed).toBe(false)
  expect(declined.stockMultiple).toBe(e.cards.stock.stockMultiple)
  expect(declined.beatInHundred).toBe(e.cards.stock.beatInHundred)
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
  expect(covered).toEqual({ covered: true, sold: 0, drawdownAtSale: 0 })

  const log = yearly(20, 0.15, 1) // no cash at all: the bill sells ETF
  const run = simulate(setup, log, 'auto')
  const sold = buildEnding(market, setup, log).cards.emergency
  expect(sold.covered).toBe(false)
  expect(sold.sold).toBe(3000)
  expect(sold.drawdownAtSale).toBe(run.bill!.drawdownAtSale)
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
