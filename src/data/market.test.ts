import { market } from '.';
test('series is long, clean and monthly', () => {
  expect(market.meta.region).toBe('us');
  expect(market.months.length).toBeGreaterThanOrEqual(1800);
  expect(market.months[0].ym <= '1871-03').toBe(true);
  for (const m of market.months) {
    expect(Number.isFinite(m.stock) && Number.isFinite(m.cash)).toBe(true);
    expect(m.stock).toBeGreaterThan(-0.5); expect(m.stock).toBeLessThan(0.6);
    expect(m.cash).toBeGreaterThanOrEqual(0); expect(m.cash).toBeLessThan(0.02);
  }
  const yms = market.months.map(m => m.ym);
  expect(new Set(yms).size).toBe(yms.length);
});
