/**
 * Hazard timing (docs/02 §4–§5), pure functions of the tick so it is deterministic and
 * rollback-friendly: no state, no trig, nothing to snapshot. Periodic tiles run an off → warn → on
 * cycle; movers run along a polyline rail as a triangle wave with a dwell at each end.
 */

export interface Cycle {
  off: number
  warn: number
  on: number
}

export type Phase = 'off' | 'warn' | 'on'

export interface PhaseInfo {
  phase: Phase
  /** Ticks into the current phase. */
  t: number
  period: number
}

export function cyclePeriod(c: Cycle): number {
  return c.off + c.warn + c.on
}

export function cyclePhase(tick: number, offset: number, c: Cycle): PhaseInfo {
  const period = cyclePeriod(c)
  const s = (((tick + offset) % period) + period) % period
  if (s < c.off) return { phase: 'off', t: s, period }
  if (s < c.off + c.warn) return { phase: 'warn', t: s - c.off, period }
  return { phase: 'on', t: s - c.off - c.warn, period }
}

export interface Pt {
  x: number
  y: number
}

export interface Rail {
  pts: Pt[]
  /** px per tick while moving */
  speed: number
  /** ticks it waits at each end */
  dwell: number
  /** tick offset into the period */
  phase: number
}

export interface RailPos {
  x: number
  y: number
  /** Unit direction of travel (0,0 while dwelling). */
  dx: number
  dy: number
  moving: boolean
  /** Distance along the rail from its first point. */
  dist: number
  length: number
  /** Ticks until it moves again (0 while moving). */
  wait: number
  forward: boolean
}

export function railLength(pts: Pt[]): number {
  let l = 0
  for (let i = 1; i < pts.length; i++) l += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y)
  return l
}

export function railPeriod(rail: Rail): number {
  const travel = Math.ceil(railLength(rail.pts) / rail.speed)
  return 2 * (travel + rail.dwell)
}

/** Point at `dist` along an axis-aligned polyline, with the segment's direction. */
function pointAt(pts: Pt[], dist: number): { x: number; y: number; dx: number; dy: number } {
  let d = dist
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const seg = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
    const dx = Math.sign(b.x - a.x)
    const dy = Math.sign(b.y - a.y)
    if (d <= seg || i === pts.length - 1) {
      const f = seg > 0 ? Math.min(1, d / seg) : 0
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, dx, dy }
    }
    d -= seg
  }
  return { x: pts[0].x, y: pts[0].y, dx: 0, dy: 0 }
}

export function railPos(rail: Rail, tick: number): RailPos {
  const length = railLength(rail.pts)
  const travel = Math.ceil(length / rail.speed)
  const period = 2 * (travel + rail.dwell)
  const s = (((tick + rail.phase) % period) + period) % period
  let dist: number
  let moving = true
  let forward = true
  let wait = 0
  if (s < travel) dist = Math.min(length, s * rail.speed)
  else if (s < travel + rail.dwell) {
    dist = length
    moving = false
    wait = travel + rail.dwell - s
  } else if (s < 2 * travel + rail.dwell) {
    dist = length - Math.min(length, (s - travel - rail.dwell) * rail.speed)
    forward = false
  } else {
    dist = 0
    moving = false
    forward = false
    wait = period - s
  }
  const p = pointAt(rail.pts, dist)
  const sign = forward ? 1 : -1
  return {
    x: p.x,
    y: p.y,
    dx: moving ? p.dx * sign : 0,
    dy: moving ? p.dy * sign : 0,
    moving,
    dist,
    length,
    wait,
    forward,
  }
}
