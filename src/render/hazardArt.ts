/**
 * Procedural pixel art for the hazards (docs/02): the live parts drawn over the static tile layer
 * every frame. Render-only, so the odd Math.cos here is fine; nothing in the sim depends on it.
 */
import { PAL, rgba } from '../art/palette.ts'
import { hash2, hashInt, mulberry32 } from '../util/rng.ts'
import type { Phase } from '../demo/hazards.ts'
import type { Pt } from '../demo/hazards.ts'
import { SPIKE_HOLES, TILE } from './tiles.ts'

type G = CanvasRenderingContext2D

function px(g: G, x: number, y: number, color: string) {
  g.fillStyle = color
  g.fillRect(Math.round(x), Math.round(y), 1, 1)
}

function fillEllipse(g: G, cx: number, cy: number, rx: number, ry: number, color: string) {
  g.fillStyle = color
  for (let dy = -ry; dy <= ry; dy++) {
    const w = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry || 1))))
    g.fillRect(Math.round(cx - w), Math.round(cy + dy), 2 * w + 1, 1)
  }
}

function ringEllipse(g: G, cx: number, cy: number, rx: number, ry: number, color: string) {
  g.fillStyle = color
  const n = Math.max(12, Math.round((rx + ry) * 2))
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    g.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1)
  }
}

/** Dotted 1 px line, a dot every `step` px. */
function dotted(g: G, x0: number, y0: number, x1: number, y1: number, step: number, color: string) {
  const l = Math.abs(x1 - x0) + Math.abs(y1 - y0)
  const n = Math.max(1, Math.floor(l / step))
  g.fillStyle = color
  for (let i = 0; i <= n; i++) {
    const f = i / n
    g.fillRect(Math.round(x0 + (x1 - x0) * f), Math.round(y0 + (y1 - y0) * f), 1, 1)
  }
}

// ---------------------------------------------------------------- periodic tiles

/** Spikes rising out of the grate: tips showing in the warn phase, full height when on. */
export function drawSpikes(g: G, x: number, y: number, phase: Phase, t: number, onLen: number) {
  if (phase === 'off') return
  if (phase === 'warn') {
    // the tips peek out and blink
    if ((t >> 2) & 1) return
    g.fillStyle = PAL.boneDark
    for (const hy of SPIKE_HOLES) for (const hx of SPIKE_HOLES) g.fillRect(x + hx, y + hy, 2, 1)
    return
  }
  const rise = Math.min(1, (t + 1) / 3, (onLen - t) / 3)
  const h = Math.max(1, Math.round(6 * rise))
  for (const hy of SPIKE_HOLES) {
    for (const hx of SPIKE_HOLES) {
      g.fillStyle = PAL.outline
      g.fillRect(x + hx - 1, y + hy - h + 1, 4, h + 1)
      g.fillStyle = PAL.bone
      g.fillRect(x + hx, y + hy - h + 1, 2, h)
      g.fillStyle = PAL.boneDark
      g.fillRect(x + hx + 1, y + hy - h + 2, 1, Math.max(0, h - 1))
      if (h >= 4) px(g, x + hx, y + hy - h + 1, PAL.white)
    }
  }
}

/** Embers glowing in the vent's slots during the warn phase. */
export function drawVentEmbers(g: G, x: number, y: number, t: number, salt: number) {
  for (let k = 0; k < 4; k++) {
    const h = hash2(t >> 1, k, salt)
    if (h < 0.3) continue
    const sx = 3 + Math.floor(h * 10)
    const slot = Math.floor(hash2(k, t >> 2, salt + 1) * 3)
    px(g, x + sx, y + 4 + slot * 4, h > 0.75 ? PAL.flameY : PAL.flameO)
  }
}

/** The flame column: a tile wide, up to 20 px above the tile, drawn in the y-sorted layer. */
export function drawVentFlame(g: G, x: number, y: number, t: number, onLen: number, tick: number, salt: number) {
  const grow = Math.min(1, (t + 1) / 3, (onLen - t) / 5)
  const rows = Math.round(30 * grow)
  const cx = x + 8
  for (let i = 0; i < rows; i++) {
    const f = i / 30
    const n = hash2(tick >> 1, i, salt)
    if (f > 0.7 && n < (f - 0.7) * 2.5) continue
    const w = Math.max(1, Math.round(6 * (1 - f * 0.85) + (n - 0.5) * 2))
    const color = f < 0.25 ? PAL.flameY : f < 0.6 ? PAL.flameO : PAL.flameR
    g.fillStyle = color
    g.fillRect(cx - w, y + 13 - i, 2 * w, 1)
    if (f < 0.2 && w > 2) {
      g.fillStyle = PAL.white
      g.fillRect(cx - w + 2, y + 13 - i, 2 * w - 4, 1)
    }
  }
}

/** What the renderer needs to know about a portal mouth: where its oval goes, which way it faces, its colours. */
export interface MouthLook {
  gx: number // centre of the oval
  gy: number
  nx: number // unit normal out of the wall into the room
  ny: number
  tall: boolean // on a wall face with a cap above: the oval reaches up into it
  col: string // rim
  lit: string // sparks, flare
  dark: string // the void inside
}

/**
 * A portal mouth set into a wall, Portal-2 style: an oval with a bright rim in the mouth's colour
 * (blue or orange) around a dark void, sparks riding the rim, motes falling in. On a wall face
 * (south-facing) the oval stands on the ground line and, if `tall`, reaches up into the cap above;
 * on a wall seen from above it lies along the wall at its open edge. Flares for a dozen ticks after
 * something went through (`since`).
 */
export function drawPortalMouth(g: G, m: MouthLook, tick: number, since: number) {
  const onFace = m.ny === 1
  const rx = onFace ? 6 : m.nx !== 0 ? 4 : 7
  const ry = onFace ? (m.tall ? 13 : 7) : m.nx !== 0 ? 7 : 4
  const hot = since >= 0 && since < 4
  fillEllipse(g, m.gx, m.gy, rx + 1, ry + 1, hot ? m.lit : m.col)
  fillEllipse(g, m.gx, m.gy, rx, ry, m.dark)
  // the void pulls: motes drift from the rim to the centre and brighten as they go
  for (let k = 0; k < 4; k++) {
    const life = ((tick * 2 + k * 9) % 32) / 32 // 0 at the rim, 1 at the centre
    const a = tick * 0.09 + k * 1.571 + life * 2.5
    px(g, m.gx + Math.cos(a) * (rx - 1.5) * (1 - life), m.gy + Math.sin(a) * (ry - 1.5) * (1 - life), life > 0.55 ? m.lit : m.col)
  }
  // sparks riding the rim
  for (let k = 0; k < 3; k++) {
    const a = tick * 0.13 + k * 2.094
    px(g, m.gx + Math.cos(a) * (rx + 0.6), m.gy + Math.sin(a) * (ry + 0.6), m.lit)
  }
  if (since >= 0 && since < 12) {
    const f = since / 12
    ringEllipse(g, m.gx, m.gy, rx + 1 + since * 0.9, ry + 1 + since * 0.9, rgba(m.lit, 1 - f))
  }
}

/** Scrolling chevrons on a belt. */
export function drawBeltStripes(g: G, x: number, y: number, dx: number, dy: number, tick: number, speed: number) {
  const off = Math.floor(tick * speed) % 8
  g.fillStyle = PAL.ironLight
  if (dx !== 0) {
    for (let k = -1; k < 3; k++) {
      const sx = dx > 0 ? k * 8 + off : k * 8 + (8 - off)
      for (let i = 0; i < 3; i++) {
        const cx = dx > 0 ? sx + i : sx + 2 - i
        for (const cy of [5 + i, 9 - i]) if (cx >= 0 && cx < TILE) g.fillRect(x + cx, y + cy, 1, 1)
      }
    }
  } else {
    for (let k = -1; k < 3; k++) {
      const sy = dy > 0 ? k * 8 + off : k * 8 + (8 - off)
      for (let i = 0; i < 3; i++) {
        const cy = dy > 0 ? sy + i : sy + 2 - i
        for (const cx of [5 + i, 9 - i]) if (cy >= 0 && cy < TILE) g.fillRect(x + cx, y + cy, 1, 1)
      }
    }
  }
}

/** Cracks spreading across a crumbling tile, t in (0, 1]. */
export function drawCrumbleCracks(g: G, x: number, y: number, t: number, c: number, r: number) {
  const rng = mulberry32(hashInt(c, r, 77))
  const n = Math.round(t * 26)
  let cx = 8
  let cy = 8
  g.fillStyle = PAL.crack
  for (let i = 0; i < n; i++) {
    g.fillRect(x + cx, y + cy, 1, 1)
    const d = rng()
    if (d < 0.3) cx++
    else if (d < 0.6) cx--
    else if (d < 0.8) cy++
    else cy--
    if (cx < 1 || cx > 14 || cy < 1 || cy > 14) {
      cx = 2 + Math.floor(rng() * 12)
      cy = 2 + Math.floor(rng() * 12)
    }
  }
}

// ---------------------------------------------------------------- movers

/** A stone slab, top-left corner at (x, y). */
export function drawPlatform(g: G, x: number, y: number, w: number, h: number) {
  g.fillStyle = PAL.ironDark
  g.fillRect(x, y, w, h)
  g.fillStyle = PAL.stone
  g.fillRect(x + 1, y + 1, w - 2, h - 2)
  g.fillStyle = PAL.stoneLight
  g.fillRect(x + 1, y + 1, w - 2, 1)
  g.fillRect(x + 1, y + 1, 1, h - 2)
  g.fillStyle = PAL.stoneDark
  g.fillRect(x + 1, y + h - 3, w - 2, 2)
  g.fillRect(x + w - 2, y + 1, 1, h - 2)
  if (w >= 32) g.fillRect(x + (w >> 1), y + 2, 1, h - 4)
  if (h >= 32) g.fillRect(x + 2, y + (h >> 1), w - 4, 1)
  g.fillStyle = PAL.metal
  for (const [bx, by] of [[3, 3], [w - 5, 3], [3, h - 5], [w - 5, h - 5]] as const) g.fillRect(x + bx, y + by, 2, 2)
}

/** The groove a gate drops into, across the tile along the gate line. */
export function drawGateTrack(g: G, x: number, y: number, vertical: boolean) {
  g.fillStyle = PAL.ironDark
  if (vertical) g.fillRect(x + 7, y, 2, TILE)
  else g.fillRect(x, y + 7, TILE, 2)
}

/** Portcullis bars on one gate tile, dropped `closed` of the way (0 open, 1 closed). */
export function drawGateBars(g: G, x: number, y: number, closed: number, jitter: number) {
  const h = Math.round(TILE * closed)
  if (h <= 0) return
  const jx = jitter
  for (const bx of [2, 7, 12]) {
    g.fillStyle = PAL.outline
    g.fillRect(x + jx + bx - 1, y, 4, h + 1)
    g.fillStyle = PAL.metal
    g.fillRect(x + jx + bx, y, 2, h)
    g.fillStyle = PAL.metalLight
    g.fillRect(x + jx + bx, y, 1, h)
  }
  for (const cy of [3, 11]) {
    if (cy >= h) continue
    g.fillStyle = PAL.outline
    g.fillRect(x + jx, y + cy - 1, TILE, 3)
    g.fillStyle = PAL.metal
    g.fillRect(x + jx, y + cy, TILE, 1)
  }
  if (h >= TILE) {
    g.fillStyle = PAL.metalLight
    for (const bx of [2, 7, 12]) g.fillRect(x + jx + bx, y + TILE - 2, 1, 1)
  }
}

/** A slot in the floor along the saw's rail. */
export function drawSawGroove(g: G, pts: Pt[]) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const x0 = Math.min(a.x, b.x)
    const x1 = Math.max(a.x, b.x)
    const y0 = Math.min(a.y, b.y)
    const y1 = Math.max(a.y, b.y)
    g.fillStyle = PAL.iron
    if (y0 === y1) g.fillRect(x0 - 8, y0 - 2, x1 - x0 + 16, 5)
    else g.fillRect(x0 - 2, y0 - 8, 5, y1 - y0 + 16)
    g.fillStyle = PAL.pit
    if (y0 === y1) g.fillRect(x0 - 7, y0 - 1, x1 - x0 + 14, 3)
    else g.fillRect(x0 - 1, y0 - 7, 3, y1 - y0 + 14)
  }
}

/** Spinning saw blade, centre on the groove. */
export function drawSaw(g: G, x: number, y: number, tick: number) {
  fillEllipse(g, x, y - 1, 7, 7, PAL.outline)
  fillEllipse(g, x, y - 1, 6, 6, PAL.metal)
  const a0 = tick * 0.45
  for (let k = 0; k < 8; k++) {
    const a = a0 + (k * Math.PI) / 4
    const tx = x + Math.cos(a) * 7.5
    const ty = y - 1 + Math.sin(a) * 7.5
    g.fillStyle = PAL.metalLight
    g.fillRect(Math.round(tx) - 1, Math.round(ty) - 1, 2, 2)
    px(g, x + Math.cos(a) * 3.5, y - 1 + Math.sin(a) * 3.5, PAL.ironLight)
  }
  px(g, x, y - 1, PAL.outline)
  px(g, x - 2, y - 4, PAL.white)
}

/** A trench along the boulder's rail: darker floor between two lips. */
export function drawTrench(g: G, pts: Pt[]) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const x0 = Math.min(a.x, b.x)
    const x1 = Math.max(a.x, b.x)
    const y0 = Math.min(a.y, b.y)
    const y1 = Math.max(a.y, b.y)
    g.fillStyle = 'rgba(8,5,12,0.4)'
    if (y0 === y1) g.fillRect(x0 - 8, y0 - 6, x1 - x0 + 16, 12)
    else g.fillRect(x0 - 6, y0 - 8, 12, y1 - y0 + 16)
    g.fillStyle = PAL.floorLight
    if (y0 === y1) {
      g.fillRect(x0 - 8, y0 - 7, x1 - x0 + 16, 1)
      g.fillRect(x0 - 8, y0 + 6, x1 - x0 + 16, 1)
    } else {
      g.fillRect(x0 - 7, y0 - 8, 1, y1 - y0 + 16)
      g.fillRect(x0 + 6, y0 - 8, 1, y1 - y0 + 16)
    }
  }
}

/** Rolling boulder; `dist` along the rail turns its spots. */
export function drawBoulder(g: G, x: number, y: number, dist: number) {
  fillEllipse(g, x, y - 6, 7, 7, PAL.outline)
  fillEllipse(g, x, y - 6, 6, 6, PAL.stone)
  const a0 = dist / 6
  for (let k = 0; k < 3; k++) {
    const a = a0 + k * 2.1
    px(g, x + Math.cos(a) * 3.5, y - 6 + Math.sin(a) * 3.5, PAL.stoneDark)
    px(g, x + Math.cos(a) * 3.5 + 1, y - 6 + Math.sin(a) * 3.5, PAL.stoneDark)
  }
  g.fillStyle = PAL.stoneLight
  g.fillRect(x - 3, y - 10, 3, 1)
  g.fillRect(x - 4, y - 9, 1, 2)
}

/**
 * Pendulum axe: the blade hangs `lift` px above its ground point on a chain running straight up to
 * a runner in the ceiling at height `ay` (the swing reads as the blade riding along the ceiling).
 */
export function drawPendulum(g: G, x: number, y: number, lift: number, _ax: number, ay: number) {
  const by = y - lift - 8 // blade centre
  // chain and the runner it hangs from
  g.fillStyle = PAL.metal
  for (let cy = ay + 2; cy < by - 6; cy += 2) g.fillRect(x - 1, cy, 2, 1)
  g.fillStyle = PAL.outline
  g.fillRect(x - 3, ay - 1, 6, 4)
  g.fillStyle = PAL.metalLight
  g.fillRect(x - 2, ay, 4, 2)
  // haft, then a double-bitted head with a bright edge along the bottom
  g.fillStyle = PAL.outline
  g.fillRect(x - 2, by - 7, 4, 15)
  g.fillRect(x - 8, by - 5, 16, 11)
  g.fillStyle = PAL.woodDark
  g.fillRect(x - 1, by - 6, 2, 13)
  g.fillStyle = PAL.metal
  g.fillRect(x - 7, by - 4, 14, 9)
  g.fillStyle = PAL.metalLight
  g.fillRect(x - 7, by - 4, 14, 1)
  g.fillRect(x - 7, by - 3, 1, 7)
  g.fillRect(x + 6, by - 3, 1, 7)
  g.fillStyle = PAL.ironDark
  g.fillRect(x - 6, by - 2, 4, 5)
  g.fillRect(x + 2, by - 2, 4, 5)
  g.fillStyle = PAL.white
  g.fillRect(x - 7, by + 4, 6, 1)
  g.fillRect(x + 1, by + 4, 6, 1)
  g.fillStyle = PAL.woodDark
  g.fillRect(x - 1, by - 2, 2, 5)
  // ground shadow where it will land
  fillEllipse(g, x, y, 7, 2, 'rgba(8,5,12,0.35)')
}

/** Iron bracket on the wall the pendulum hangs from. */
export function drawAnchor(g: G, ax: number, ay: number) {
  g.fillStyle = PAL.outline
  g.fillRect(ax - 3, ay - 2, 6, 4)
  g.fillStyle = PAL.metal
  g.fillRect(ax - 2, ay - 1, 4, 2)
  px(g, ax - 2, ay - 1, PAL.metalLight)
}

/** Two rails with sleepers along the cart's polyline. */
export function drawCartRails(g: G, pts: Pt[]) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const x0 = Math.min(a.x, b.x)
    const x1 = Math.max(a.x, b.x)
    const y0 = Math.min(a.y, b.y)
    const y1 = Math.max(a.y, b.y)
    if (y0 === y1) {
      g.fillStyle = PAL.woodDark
      for (let sx = x0 - 6; sx <= x1 + 6; sx += 6) g.fillRect(sx, y0 - 5, 2, 10)
      g.fillStyle = PAL.ironDark
      g.fillRect(x0 - 8, y0 - 3, x1 - x0 + 16, 1)
      g.fillRect(x0 - 8, y0 + 3, x1 - x0 + 16, 1)
      g.fillStyle = PAL.ironLight
      g.fillRect(x0 - 8, y0 - 4, x1 - x0 + 16, 1)
      g.fillRect(x0 - 8, y0 + 2, x1 - x0 + 16, 1)
    } else {
      g.fillStyle = PAL.woodDark
      for (let sy = y0 - 6; sy <= y1 + 6; sy += 6) g.fillRect(x0 - 5, sy, 10, 2)
      g.fillStyle = PAL.ironDark
      g.fillRect(x0 - 3, y0 - 8, 1, y1 - y0 + 16)
      g.fillRect(x0 + 3, y0 - 8, 1, y1 - y0 + 16)
      g.fillStyle = PAL.ironLight
      g.fillRect(x0 - 4, y0 - 8, 1, y1 - y0 + 16)
      g.fillRect(x0 + 2, y0 - 8, 1, y1 - y0 + 16)
    }
  }
}

/** Mine cart, 16×12, centred on its ground point; the lamp lights up while it waits to roll. */
export function drawCart(g: G, x: number, y: number, lamp: boolean) {
  const x0 = x - 8
  const y0 = y - 11
  g.fillStyle = PAL.outline
  g.fillRect(x0, y0, 16, 10)
  g.fillRect(x0 + 2, y0 + 10, 4, 3)
  g.fillRect(x0 + 10, y0 + 10, 4, 3)
  g.fillStyle = PAL.wood
  g.fillRect(x0 + 1, y0 + 1, 14, 8)
  g.fillStyle = PAL.woodDark
  g.fillRect(x0 + 1, y0 + 4, 14, 1)
  g.fillRect(x0 + 1, y0 + 7, 14, 1)
  g.fillStyle = PAL.metal
  g.fillRect(x0 + 1, y0 + 1, 14, 1)
  g.fillRect(x0 + 1, y0 + 1, 1, 8)
  g.fillRect(x0 + 14, y0 + 1, 1, 8)
  g.fillStyle = PAL.metalLight
  g.fillRect(x0 + 2, y0 + 1, 12, 1)
  g.fillStyle = PAL.ironLight
  g.fillRect(x0 + 3, y0 + 11, 2, 1)
  g.fillRect(x0 + 11, y0 + 11, 2, 1)
  if (lamp) {
    g.fillStyle = PAL.flameY
    g.fillRect(x0 + 7, y0 + 2, 2, 2)
  }
}

/** Round bumper, squashed by `squash` (0..1) when something just hit it. */
export function drawBumper(g: G, x: number, y: number, squash: number) {
  const ry = 6 - Math.round(squash * 2)
  const cy = y - 1 - ry + 6
  fillEllipse(g, x, y + 3, 7, 2, 'rgba(8,5,12,0.4)')
  fillEllipse(g, x, cy, 7, ry + 1, PAL.outline)
  fillEllipse(g, x, cy, 6, ry, PAL.metal)
  g.fillStyle = squash > 0 ? PAL.white : PAL.red
  g.fillRect(x - 4, cy, 9, 1)
  g.fillStyle = PAL.metalLight
  g.fillRect(x - 3, cy - ry + 1, 3, 1)
  g.fillRect(x - 4, cy - ry + 2, 1, 2)
}

/** Chandelier hanging `height` px over (x, y), chained up to `ay`; shakes with `jitter`. */
export function drawChandelier(g: G, x: number, y: number, height: number, ay: number, jitter: number, tick: number) {
  const cx = x + jitter
  const cy = y - height
  fillEllipse(g, x, y, 8, 3, 'rgba(8,5,12,0.35)')
  dotted(g, cx, cy - 2, x, ay, 2, PAL.metal)
  ringEllipse(g, cx, cy, 8, 3, PAL.outline)
  ringEllipse(g, cx, cy, 7, 2, PAL.metal)
  g.fillStyle = PAL.metal
  g.fillRect(cx - 1, cy - 3, 2, 4)
  for (const [dx, dy] of [[-7, 0], [7, 0], [-3, -2], [3, -2], [0, 2]] as const) {
    g.fillStyle = PAL.bone
    g.fillRect(cx + dx, cy + dy - 4, 1, 3)
    const flick = hash2(tick >> 1, dx + 10, dy) > 0.5
    px(g, cx + dx, cy + dy - 5, flick ? PAL.flameY : PAL.flameO)
  }
}

/** Mirror ball hanging `height` px over (x, y), chained up to `ay`; its facet grid creeps with tick. */
export function drawMirrorBall(g: G, x: number, y: number, height: number, ay: number, jitter: number, tick: number) {
  const cx = x + jitter
  const cy = y - height
  fillEllipse(g, x, y, 7, 3, 'rgba(4,3,8,0.4)')
  dotted(g, cx, cy - 6, x, ay, 2, PAL.metal)
  fillEllipse(g, cx, cy, 6, 6, PAL.outline)
  fillEllipse(g, cx, cy, 5, 5, PAL.metal)
  // the facet grid, slid sideways by the tick so the ball reads as turning
  const off = (tick >> 3) % 3
  g.fillStyle = PAL.metalLight
  for (let dy = -4; dy <= 4; dy += 2) {
    const hw = Math.round(Math.sqrt(Math.max(0, 23 - dy * dy)))
    for (let dx = -hw + ((dy >> 1) + off + 9) % 3; dx <= hw; dx += 3) g.fillRect(cx + dx, cy + dy, 1, 1)
  }
  // one hard glint, hopping facet to facet
  const gl = hash2(tick >> 3, 7, 3)
  px(g, cx - 3 + Math.floor(gl * 6), cy - 3 + Math.floor(hash2(tick >> 3, 11, 5) * 4), PAL.white)
  fillEllipse(g, cx - 2, cy - 2, 2, 2, 'rgba(255,255,255,0.25)')
}

/** What a chandelier leaves on the floor. */
export function drawRubble(g: G, x: number, y: number) {
  ringEllipse(g, x, y, 8, 3, PAL.ironLight)
  g.fillStyle = PAL.outline
  g.fillRect(x - 6, y - 1, 3, 1)
  g.fillRect(x + 4, y + 1, 2, 1)
  g.fillStyle = PAL.bone
  g.fillRect(x - 2, y + 2, 1, 2)
  g.fillRect(x + 3, y - 2, 1, 2)
  g.fillRect(x - 5, y + 1, 2, 1)
  g.fillStyle = PAL.metal
  g.fillRect(x - 1, y - 1, 2, 2)
}

/** Faint hatching under a lit barrel so the fuse reads even in the dark. */
export function drawFuseGlow(g: G, x: number, y: number, t: number) {
  const a = 0.25 + 0.25 * ((t >> 1) & 1)
  fillEllipse(g, x, y, 9, 4, rgba(PAL.flameO, a))
}
