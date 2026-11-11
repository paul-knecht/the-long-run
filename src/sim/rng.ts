export interface Rng {
  /** Uniform in [0, 1). */
  next(): number
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number
  /** Standard normal (Box-Muller). */
  normal(): number
  pick<T>(xs: readonly T[]): T
}

/** Seeded generator (mulberry32): the same seed always gives the same sequence. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  function int(min: number, max: number): number {
    return min + Math.floor(next() * (max - min + 1))
  }

  function normal(): number {
    const u = 1 - next() // in (0, 1], so the log is finite
    const v = next()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  function pick<T>(xs: readonly T[]): T {
    return xs[int(0, xs.length - 1)]
  }

  return { next, int, normal, pick }
}
