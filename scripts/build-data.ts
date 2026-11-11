// Builds src/data/market.json from data/raw/data.csv (Shiller's US data, as packaged by DataHub).
// The CSV is untrusted input: it is parsed as text only, never executed.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { MarketSeries, MonthData } from '../src/sim/types.ts'

/** Savings accounts pay a little less than long-term bonds; the documented approximation (spec 7.3). */
const CASH_RATE_SPREAD = 0.01
const DECIMALS = 6

const inputPath = fileURLToPath(new URL('../data/raw/data.csv', import.meta.url))
const outputPath = fileURLToPath(new URL('../src/data/market.json', import.meta.url))

const round = (x: number): number => Number(x.toFixed(DECIMALS))

function parseRows(csv: string): Record<'date' | 'price' | 'dividend' | 'longRate', string>[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== '')
  const header = lines[0].split(',').map((h) => h.trim())
  const column = (name: string): number => {
    const index = header.indexOf(name)
    if (index === -1) throw new Error(`Column "${name}" missing in data.csv (found: ${header.join(', ')})`)
    return index
  }
  const [iDate, iPrice, iDividend, iRate] = ['Date', 'SP500', 'Dividend', 'Long Interest Rate'].map(column)
  return lines.slice(1).map((line) => {
    const cells = line.split(',')
    return { date: cells[iDate], price: cells[iPrice], dividend: cells[iDividend], longRate: cells[iRate] }
  })
}

function build(csv: string): MarketSeries {
  // Keep rows up to the last one that has both a price and a dividend (later rows are price-only).
  const rows = parseRows(csv).map((r) => ({
    ym: r.date.slice(0, 7),
    price: Number(r.price),
    dividend: Number(r.dividend),
    longRate: Number(r.longRate),
  }))
  let last = -1
  rows.forEach((r, i) => {
    if (r.price > 0 && r.dividend > 0) last = i
  })
  if (last < 1) throw new Error('No rows with both price and dividend')

  const months: MonthData[] = []
  for (let t = 1; t <= last; t++) {
    const prev = rows[t - 1]
    const cur = rows[t]
    if (![prev.price, cur.price, cur.dividend, cur.longRate].every(Number.isFinite)) {
      throw new Error(`Non-numeric value at ${cur.ym}`)
    }
    // Shiller's dividend is an annual rate, so one month pays a twelfth of it.
    const stock = (cur.price + cur.dividend / 12) / prev.price - 1
    const cash = Math.max(0, cur.longRate / 100 - CASH_RATE_SPREAD) / 12
    months.push({ ym: cur.ym, stock: round(stock), cash: round(cash) })
  }

  return {
    meta: {
      region: 'us',
      source: "Robert Shiller's US stock market data (S&P 500 composite, from 1871), monthly, as packaged by DataHub (https://datahub.io/core/s-and-p-500)",
      licence: 'ODC Public Domain Dedication and License (PDDL), as stated by DataHub',
      note: "Returns include dividends, are in the index's own currency and are shown as euros. Monthly prices are averages of daily closes, so crashes are slightly smoothed. Cash is approximated as the long-term interest rate minus 1 percentage point, as a savings account would pay.",
    },
    months,
  }
}

const series = build(readFileSync(inputPath, 'utf8'))
writeFileSync(outputPath, JSON.stringify(series, null, 1) + '\n')
const first = series.months[0].ym
const final = series.months[series.months.length - 1].ym
console.log(`Wrote ${series.months.length} months (${first} to ${final}) to src/data/market.json`)
