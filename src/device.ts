/**
 * Single definition of the device predicate (SPEC §8) — used by the panel variant,
 * setObstruction policy, and pill fade. No other module may guess device class.
 */
let cached: boolean | null = null

export function isMobile(): boolean {
  if (cached === null) {
    cached =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches
  }
  return cached
}
