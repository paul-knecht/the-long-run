import { market } from '../data'
import { createSetup } from './setup'

test('deterministic', () => {
  expect(createSetup(market, 42)).toEqual(createSetup(market, 42))
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
