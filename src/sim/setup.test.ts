import { market } from '../data'
import { createSetup } from './setup'

test('deterministic', () => {
  expect(createSetup(market, 42)).toEqual(createSetup(market, 42))
})

test('the draws for a seed stay as they were', () => {
  // Pinned from the code before drawStock was split out; any change to the order or number of draws moves these.
  const s = createSetup(market, 3)
  expect(s.startYear).toBe(1973)
  expect(s.schedule).toEqual({ werner: 12, keller: 36, bill: 96, jonas: 72, raise: 84, windfall: 120 })
  expect(s.stockAlpha).toBe(-0.08)
  expect(s.stockNoise[0]).toBe(-0.006597700193433542)
  expect(s.stockNoise[239]).toBe(-0.12444263444078016)
  expect(createSetup(market, 42).stockNoise[239]).toBe(0.07477863674146676)
})

test('different seeds reach different histories', () => {
  const years = new Set(Array.from({ length: 60 }, (_, i) => createSetup(market, i).startYear))
  expect(years.size).toBeGreaterThanOrEqual(15)
})

test('schedule is valid for many seeds', () => {
  for (let s = 0; s < 200; s++) {
    const { schedule, salary, takeovers, returns } = createSetup(market, s)
    const months = Object.values(schedule)
    expect(new Set(months).size).toBe(6)
    expect(months.every((m) => m % 12 === 0)).toBe(true)
    expect(schedule.windfall / 12).toBeGreaterThanOrEqual(6)
    expect(schedule.windfall / 12).toBeLessThanOrEqual(14)
    expect(returns.length).toBe(240)
    expect(salary[0]).toBe(2200)
    expect(salary[schedule.raise] / salary[schedule.raise - 1]).toBeGreaterThan(1.14)
    expect(takeovers.some((m) => m >= 36 && m <= 216)).toBe(true)
  }
})

test('most single stocks trail the market, a few win big', () => {
  let beat = 0
  const N = 1000
  for (let s = 0; s < N; s++) {
    const st = createSetup(market, s)
    let stock = 1
    let index = 1
    for (let m = 0; m < 180; m++) {
      stock *= Math.max(0.05, 1 + st.returns[m].stock + st.stockAlpha / 12 + st.stockNoise[m])
      index *= 1 + st.returns[m].stock
    }
    if (stock > index) beat++
  }
  expect(beat / N).toBeGreaterThan(0.08)
  expect(beat / N).toBeLessThan(0.4)
})
