export const YEARS = 20,
  MONTHS = 240,
  START_AGE = 22
export const START_SALARY = 2200,
  SALARY_GROWTH = 0.03,
  RAISE_FACTOR = 1.15
export const MAX_SAVE_RATE = 0.3,
  SENSIBLE_SAVE = [0.1, 0.2] as const
export const START_DIALS = { saveRate: 0.1, etfShare: 0.5 }
export const EMERGENCY_MONTHS = 3
export const ETF_COST = 0.002,
  FUND_COST = 0.018,
  FUND_ENTRY_FEE = 0.05
export const CRASH_TRIGGER = 0.2,
  CRASH_MIN_DEPTH = 0.25,
  CRASH_EARLIEST_MONTH = 36,
  CRASH_LATEST_MONTH = 216
export const WINDFALL = 10000,
  BILL = 3000,
  SPREAD_MONTHS = 12
export const STOCK_FATES = [
  { p: 0.55, alpha: -0.08 },
  { p: 0.25, alpha: -0.02 },
  { p: 0.15, alpha: 0.05 },
  { p: 0.05, alpha: 0.2 },
] as const // alpha = yearly drift relative to the market
export const STOCK_NOISE_SD = 0.07 // monthly
