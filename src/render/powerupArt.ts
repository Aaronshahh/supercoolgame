/**
 * Procedural art for the power-ups (docs/03): burning floor, iced floor, the shield ring, the
 * pickup's shadow and sparkle and the glow that announces one. Render-only.
 */
import { PAL, rgba } from '../art/palette.ts'
import { hash2 } from '../util/rng.ts'
import { TILE } from './tiles.ts'

type G = CanvasRenderingContext2D

function px(g: G, x: number, y: number, color: string) {
  g.fillStyle = color
  g.fillRect(Math.round(x), Math.round(y), 1, 1)
}

function ringEllipse(g: G, cx: number, cy: number, rx: number, ry: number, color: string, every = 1) {
  g.fillStyle = color
  const n = Math.max(12, Math.round((rx + ry) * 2))
  for (let i = 0; i < n; i += every) {
    const a = (i / n) * Math.PI * 2
    g.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1)
  }
}

/**
 * A tile on fire: a bed of embers with tongues of flame licking up out of it, flickering per tile.
 * `life` runs 1 → 0 over the fire's time; the tongues die down first and the embers last.
 */
export function drawFloorFire(g: G, x: number, y: number, life: number, tick: number, salt: number) {
  const bed = Math.min(1, life * 2.5)
  g.fillStyle = rgba(PAL.flameR, 0.35 * bed)
  g.fillRect(x + 1, y + 1, TILE - 2, TILE - 2)
  g.fillStyle = rgba(PAL.flameO, 0.3 * bed)
  g.fillRect(x + 3, y + 3, TILE - 6, TILE - 6)
  // embers: a few bright specks that wander
  for (let k = 0; k < 5; k++) {
    const h = hash2(tick >> 2, k, salt)
    if (h < 0.35 * (1 - bed) + 0.1) continue
    px(g, x + 2 + Math.floor(hash2(k, tick >> 3, salt + 3) * 12), y + 2 + Math.floor(h * 12), h > 0.7 ? PAL.flameY : PAL.flameO)
  }
  // tongues: columns of flame of varying height, tallest while the fire is young
  const tongues = life > 0.25 ? 4 : life > 0.1 ? 2 : 0
  for (let k = 0; k < tongues; k++) {
    const fx = x + 2 + k * 4 + Math.floor(hash2(k, tick >> 2, salt + 7) * 2)
    const hgt = 2 + Math.floor(hash2(tick >> 1, k, salt + 11) * 5 * Math.min(1, life * 1.5))
    const base = y + TILE - 2 - Math.floor(hash2(k, tick >> 3, salt + 13) * 6)
    for (let i = 0; i < hgt; i++) {
      const f = i / hgt
      px(g, fx, base - i, f < 0.3 ? PAL.flameR : f < 0.7 ? PAL.flameO : PAL.flameY)
      if (i === 0) px(g, fx + 1, base, PAL.flameR)
    }
  }
}

/**
 * A tile coated in ice by an ice boomerang: a translucent pale slab with a bright rim on the lit
 * side and a dark one on the other, two or three cracks fixed per tile, and a glint that drifts so
 * it reads as glassy. `life` runs 1 → 0; over the last quarter the slab draws in from its edges and
 * fades, so you can see it going before it goes.
 */
export function drawFloorIce(g: G, x: number, y: number, life: number, tick: number, salt: number) {
  const fade = Math.min(1, life * 4)
  const inset = 1 + Math.floor((1 - fade) * 4)
  const x0 = x + inset
  const y0 = y + inset
  const w = TILE - inset * 2
  const h = TILE - inset * 2
  if (w < 4) return
  g.fillStyle = rgba(PAL.iceLight, 0.42 * fade)
  g.fillRect(x0, y0, w, h)
  g.fillStyle = rgba(PAL.ice[1], 0.35 * fade)
  g.fillRect(x0 + 1, y0 + 1, w - 2, h - 2)
  g.fillStyle = rgba(PAL.iceCrack, 0.9 * fade)
  g.fillRect(x0, y0, w, 1)
  g.fillRect(x0, y0, 1, h)
  g.fillStyle = rgba(PAL.iceDark, 0.8 * fade)
  g.fillRect(x0, y0 + h - 1, w, 1)
  g.fillRect(x0 + w - 1, y0, 1, h)
  // cracks: short dark lines that wander one way, fixed per tile
  const crack = rgba(PAL.iceDark, 0.7 * fade)
  const n = 2 + Math.floor(hash2(salt, 1, 71) * 2)
  for (let k = 0; k < n; k++) {
    let cx = x0 + 2 + Math.floor(hash2(salt, k, 73) * (w - 4))
    let cy = y0 + 2 + Math.floor(hash2(k, salt, 79) * (h - 4))
    const run = 2 + Math.floor(hash2(salt, k, 83) * 3)
    const dx = hash2(k, salt, 89) < 0.5 ? 1 : -1
    for (let i = 0; i < run; i++) {
      if (cx > x0 && cx < x0 + w - 1 && cy > y0 && cy < y0 + h - 1) px(g, cx, cy, crack)
      cx += dx
      cy += hash2(i, k, salt) < 0.5 ? 1 : 0
    }
  }
  // the glint: a white pixel that drifts across the slab
  const gx = x0 + 2 + (((tick >> 3) + salt) % (w - 4))
  const gy = y0 + 2 + (((tick >> 4) + salt * 3) % (h - 4))
  px(g, gx, gy, rgba(PAL.white, 0.9 * fade))
}

/** The shield: a teal oval round the body, a dotted ring that rotates and breathes. */
export function drawShieldRing(g: G, cx: number, cy: number, tick: number) {
  const breathe = 0.5 + 0.5 * Math.sin(tick / 9)
  ringEllipse(g, cx, cy - 8, 9 + breathe, 11 + breathe, rgba(PAL.teal, 0.35), 1)
  g.fillStyle = rgba(PAL.white, 0.8)
  const n = 6
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + tick / 20
    g.fillRect(Math.round(cx + Math.cos(a) * (9 + breathe)), Math.round(cy - 8 + Math.sin(a) * (11 + breathe)), 1, 1)
  }
}

/** The shadow under a floating pickup, and a sparkle that circles it. */
export function drawPickupBase(g: G, x: number, y: number, tick: number, color: string) {
  g.fillStyle = 'rgba(8,5,12,0.45)'
  g.fillRect(Math.round(x) - 3, Math.round(y), 7, 1)
  g.fillRect(Math.round(x) - 2, Math.round(y) + 1, 5, 1)
  const a = tick / 14
  px(g, x + Math.cos(a) * 7, y - 7 + Math.sin(a) * 3, (tick >> 2) & 1 ? PAL.white : color)
}

/** The point a pickup is about to land on: a ring closing in on it and sparks rising, `t` 0 → 1. */
export function drawSpawnWarn(g: G, x: number, y: number, t: number, tick: number, color: string) {
  const r = 12 * (1 - t) + 3
  ringEllipse(g, x, y, r, r * 0.6, rgba(color, 0.3 + 0.6 * t), 2)
  for (let k = 0; k < 3; k++) {
    const h = hash2(k, tick >> 2, 53)
    px(g, x - 5 + Math.floor(hash2(k, tick >> 3, 59) * 11), y - 2 - Math.floor(h * 10 * t), h > 0.6 ? PAL.white : color)
  }
}
