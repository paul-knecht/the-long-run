import { useEffect, useState } from 'react'
import { MONTHS } from '../sim/constants'
import type { Pending, Snapshot } from '../sim/types'

/** How long one month takes to draw in a normal year. */
export const MONTH_MS = 150
/** How long one month takes to draw while the market falls into a takeover. */
export const FALL_MS = 500

/**
 * Animates `shown` (the number of completed months on screen) up to `target`, one month per step;
 * `busy` is true until it gets there. `msPerMonth` is the time a step takes, or a function giving it
 * for the month about to be drawn. `instant` jumps straight to `target`, and so does any target
 * below `shown` (a new run).
 */
export function useReveal(
  target: number,
  opts: { instant: boolean; msPerMonth: number | ((month: number) => number) },
): { shown: number; busy: boolean } {
  const { instant, msPerMonth } = opts
  const [drawn, setDrawn] = useState(target)
  const shown = instant || drawn > target ? target : drawn
  // Keep the state in step with a jump, so a later animation starts from where the screen is.
  if (shown !== drawn) setDrawn(shown)

  const delay = typeof msPerMonth === 'function' ? msPerMonth(shown + 1) : msPerMonth
  useEffect(() => {
    if (shown >= target) return
    const timer = setTimeout(() => setDrawn((d) => Math.min(d + 1, target)), delay)
    return () => clearTimeout(timer)
  }, [shown, target, delay])

  return { shown, busy: shown < target }
}

/**
 * The year to show after `month` completed months. A year boundary belongs to the year that starts
 * there (whether the run waits there or is about to draw it), except a takeover in a year's last
 * month and the very end; any other month belongs to the year being drawn.
 */
export function yearOnScreen(month: number, pending: Pending): number {
  const takeoverHere = pending?.kind === 'crash' && pending.at === month
  if (month % 12 === 0 && month < MONTHS && !takeoverHere) return month / 12 + 1
  return Math.max(1, Math.ceil(month / 12))
}

/**
 * The month the fall into a takeover at `at` began: the last month up to `at` at which the index
 * stood at its running high (0 is the start). The engine measures a crash from the same high.
 */
export function fallStart(snapshots: Snapshot[], at: number): number {
  let high = 0
  for (let m = 1; m <= at && m < snapshots.length; m++) if (snapshots[m].index >= snapshots[high].index) high = m
  return high
}
