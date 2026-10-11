/**
 * Particles, floor decals and screen effects (docs/04). Render-only: everything in here is spawned
 * by something the simulation did and ticks on its own seeded RNG, so the sim's determinism is
 * never touched (docs/01 §1: effects are driven by the events the sim emits, and never write to
 * the sim) and a scripted still (?t=) shows the same puff every time. Nothing here reads sim state.
 *
 * One particle type, a dozen kinds. A particle lives on the floor plane at (x, y) and `z` px above
 * it, and is drawn at (x, y − z): sparks and chunks fall back to the floor under gravity, embers
 * and smoke rise, dust spreads flat, leaves and flakes drift down from the height of the walls.
 * Anything at rest on the floor (a chunk that stopped bouncing, a leaf that landed) is drawn in the
 * ground pass under the players; the rest is drawn over everything.
 */
import { PAL, darken, hexToRgb, lighten } from '../art/palette.ts'
import { hash2, mulberry32, type Rng } from '../util/rng.ts'

type G = CanvasRenderingContext2D

export type ParticleKind =
  | 'dust' // soft puff, spreads flat and fades; footsteps, dash, landings
  | 'spark' // bright 1 px, fast, falls, white → colour → dark; impacts and metal
  | 'ember' // rises and flickers, yellow → orange → red; fire, torches, the Forge floor
  | 'chunk' // 2–3 px debris that flies, bounces once and lies there; crates, rubble, ice
  | 'smoke' // dark growing blob that rises slowly and thins out; blasts, scorched floor
  | 'shard' // ice splinter: light, bounces, no colour ramp
  | 'leaf' // sways down from the canopy, lands and lies a while
  | 'drip' // water from a cave ceiling: falls, splashes into a ring on the floor
  | 'mote' // dust in the air: barely moves, twinkles
  | 'flake' // snow: drifts down, settles as a white dot
  | 'wisp' // steam or candle smoke: a thin thread rising and swaying
  | 'grit' // a pebble shaken loose from a wall: falls, lands with a tick of dust

export interface Particle {
  kind: ParticleKind
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  ttl: number
  max: number
  /** Base colour; each kind ramps it over its life its own way. */
  color: string
  /** Pixel size at birth. */
  size: number
  /** Per-particle salt for flicker and sway, so no two move alike. */
  seed: number
  /** True once it has come to rest on the floor (chunks, leaves, flakes). */
  rest: boolean
}

/** An expanding ring on the floor plane (ry < 1 flattens it into the ground perspective). */
export interface Ring {
  x: number
  y: number
  r0: number
  r1: number
  ttl: number
  max: number
  color: string
  ry: number
  /** Second, inner ring drawn in this colour a shade smaller (white edge on the blast). */
  inner?: string
}

export type DecalKind =
  | 'smear' // one row of slime, fades (the slime's trail)
  | 'scorch' // a blast's mark on the floor; stays until the room reloads
  | 'splat' // a few dots of a player's colour where they died
  | 'print' // a footprint in the snow
  | 'scratch' // a skate mark on the ice
  | 'dot' // a settled snowflake

export interface Decal {
  kind: DecalKind
  x: number
  y: number
  w: number
  h: number
  /** Direction for scratches; unused otherwise. */
  dx: number
  dy: number
  color: string
  /** −1: permanent (until the room reloads). */
  ttl: number
  max: number
  seed: number
}

interface Shake {
  mag: number
  ttl: number
  max: number
}

interface Flash {
  a: number
  ttl: number
  max: number
}

const MAX_PARTICLES = 900
const MAX_DECALS = 160
const GRAVITY = 0.16
/** Ticks between flashes: never more than three a second however many barrels go off (WCAG 2.3.1, docs/04 §9). */
const FLASH_GAP = 20

const rampCache = new Map<string, [string, string, string]>()
/** Light, base, dark versions of a colour: what a spark goes through as it cools. */
function ramp(color: string): [string, string, string] {
  let r = rampCache.get(color)
  if (!r) rampCache.set(color, (r = [lighten(color, 0.55), color, darken(color, 0.55)]))
  return r
}

const rgbCache = new Map<string, string>()
function rgba(color: string, a: number): string {
  let pre = rgbCache.get(color)
  if (!pre) {
    const [r, g, b] = hexToRgb(color)
    rgbCache.set(color, (pre = `rgba(${r},${g},${b},`))
  }
  return `${pre}${a.toFixed(3)})`
}

function fillEllipse(g: G, cx: number, cy: number, rx: number, ry: number) {
  for (let dy = -ry; dy <= ry; dy++) {
    const w = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry || 1))))
    g.fillRect(Math.round(cx - w), Math.round(cy + dy), 2 * w + 1, 1)
  }
}

function ringEllipse(g: G, cx: number, cy: number, rx: number, ry: number) {
  const n = Math.max(12, Math.round((rx + ry) * 2.2))
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    g.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1)
  }
}

export class Fx {
  rng: Rng
  particles: Particle[] = []
  rings: Ring[] = []
  decals: Decal[] = []
  private shakes: Shake[] = []
  private flashes: Flash[] = []
  private flashGap = 0
  private salt: number

  constructor(seed: number) {
    this.rng = mulberry32(seed)
    this.salt = seed
  }

  /** A new room: everything gone, the stream reseeded so the room's stills are reproducible. */
  reset(seed: number) {
    this.rng = mulberry32(seed)
    this.salt = seed
    this.particles.length = 0
    this.rings.length = 0
    this.decals.length = 0
    this.shakes.length = 0
    this.flashes.length = 0
    this.flashGap = 0
  }

  // ---------------------------------------------------------------- spawning
  private add(p: Particle) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift()
    this.particles.push(p)
  }

  private rnd(lo: number, hi: number): number {
    return lo + this.rng() * (hi - lo)
  }

  /**
   * Generic burst: a few sparks and a little dust in the colour, flying out in every direction.
   * The all-purpose "something happened here" the older call sites use.
   */
  burst(x: number, y: number, color: string, n: number, speed: number, z = 0) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2
      const s = speed * this.rnd(0.4, 1.2)
      const spark = this.rng() < 0.6
      this.add({
        kind: spark ? 'spark' : 'dust',
        x,
        y,
        z: z + (spark ? this.rnd(1, 4) : 0),
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s * 0.7,
        vz: spark ? this.rnd(0.8, 2.2) : this.rnd(0.1, 0.4),
        ttl: 0,
        max: 0,
        color: spark && this.rng() < 0.3 ? PAL.white : color,
        size: spark ? 2 : 2,
        seed: Math.floor(this.rng() * 1e6),
        rest: false,
      })
      const p = this.particles[this.particles.length - 1]
      p.max = p.ttl = Math.round(spark ? this.rnd(12, 24) : this.rnd(16, 30))
    }
  }

  /** A low puff of dust spreading out along the floor: footsteps, a landing, a wall hit. */
  dust(x: number, y: number, n: number, color: string = PAL.boneDark, speed = 0.6, dirX = 0, dirY = 0) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2
      const s = speed * this.rnd(0.3, 1)
      const ttl = Math.round(this.rnd(14, 26))
      this.add({
        kind: 'dust',
        x: x + this.rnd(-2, 2),
        y: y + this.rnd(-1, 1),
        z: 0,
        vx: Math.cos(a) * s + dirX * speed,
        vy: Math.sin(a) * s * 0.6 + dirY * speed * 0.6,
        vz: this.rnd(0.05, 0.3),
        ttl,
        max: ttl,
        color,
        size: this.rng() < 0.5 ? 2 : 1,
        seed: Math.floor(this.rng() * 1e6),
        rest: false,
      })
    }
  }

  /** Hard bright sparks: metal on stone, a deflect, a boomerang off a wall. */
  sparks(x: number, y: number, color: string, n: number, speed = 2.4, z = 4, dirX = 0, dirY = 0) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2
      const s = speed * this.rnd(0.5, 1.2)
      const ttl = Math.round(this.rnd(10, 22))
      this.add({
        kind: 'spark',
        x,
        y,
        z,
        vx: Math.cos(a) * s * 0.6 + dirX * s,
        vy: Math.sin(a) * s * 0.4 + dirY * s,
        vz: this.rnd(0.6, 2.4),
        ttl,
        max: ttl,
        color: this.rng() < 0.35 ? PAL.white : color,
        size: 2,
        seed: Math.floor(this.rng() * 1e6),
        rest: false,
      })
    }
  }

  /** Embers lifting off something hot and winking out. */
  embers(x: number, y: number, n: number, z = 0, spread = 3, color: string = PAL.flameO) {
    for (let i = 0; i < n; i++) {
      const ttl = Math.round(this.rnd(36, 80))
      this.add({
        kind: 'ember',
        x: x + this.rnd(-spread, spread),
        y: y + this.rnd(-spread, spread) * 0.6,
        z,
        vx: this.rnd(-0.15, 0.15),
        vy: this.rnd(-0.1, 0.1),
        vz: this.rnd(0.2, 0.6),
        ttl,
        max: ttl,
        color,
        size: 1,
        seed: Math.floor(this.rng() * 1e6),
        rest: false,
      })
    }
  }

  /** Debris that flies up, falls, bounces once and lies there: splinters, rubble, bone, ice. */
  chunks(x: number, y: number, colors: readonly string[], n: number, speed = 1.6, z = 4, lie = 120) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2
      const s = speed * this.rnd(0.3, 1)
      const ttl = Math.round(lie * this.rnd(0.7, 1.3))
      this.add({
        kind: 'chunk',
        x,
        y,
        z,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s * 0.7,
        vz: this.rnd(1.2, 3),
        ttl,
        max: ttl,
        color: colors[Math.floor(this.rng() * colors.length)],
        size: this.rng() < 0.4 ? 3 : 2,
        seed: Math.floor(this.rng() * 1e6),
        rest: false,
      })
    }
  }

  /** Smoke: dark blobs that rise, swell and thin out. */
  smoke(x: number, y: number, n: number, color = '#2a2230', z = 2, spread = 4) {
    for (let i = 0; i < n; i++) {
      const ttl = Math.round(this.rnd(36, 70))
      this.add({
        kind: 'smoke',
        x: x + this.rnd(-spread, spread),
        y: y + this.rnd(-spread, spread) * 0.5,
        z,
        vx: this.rnd(-0.12, 0.12),
        vy: this.rnd(-0.05, 0.05),
        vz: this.rnd(0.25, 0.5),
        ttl,
        max: ttl,
        color,
        size: Math.round(this.rnd(2, 4)),
        seed: Math.floor(this.rng() * 1e6),
        rest: false,
      })
    }
  }

  /** Ice splinters: bright, light, bounce once. */
  shards(x: number, y: number, n: number, speed = 1.8, z = 6) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2
      const s = speed * this.rnd(0.4, 1.1)
      const ttl = Math.round(this.rnd(22, 40))
      this.add({
        kind: 'shard',
        x,
        y,
        z,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s * 0.7,
        vz: this.rnd(1, 2.6),
        ttl,
        max: ttl,
        color: this.rng() < 0.4 ? PAL.white : PAL.iceLight,
        size: this.rng() < 0.5 ? 2 : 1,
        seed: Math.floor(this.rng() * 1e6),
        rest: false,
      })
    }
  }

  /** One ambient particle of the room's weather at a spot: a leaf, a drip, a mote, a flake, a wisp, a pebble. */
  ambient(kind: 'leaf' | 'drip' | 'mote' | 'flake' | 'wisp' | 'grit' | 'ember' | 'smoke', x: number, y: number, color: string) {
    const seed = Math.floor(this.rng() * 1e6)
    switch (kind) {
      case 'leaf': {
        const ttl = Math.round(this.rnd(150, 260))
        this.add({ kind, x, y, z: this.rnd(26, 40), vx: this.rnd(-0.1, 0.1), vy: this.rnd(-0.05, 0.05), vz: -this.rnd(0.22, 0.34), ttl, max: ttl, color, size: 2, seed, rest: false })
        break
      }
      case 'drip': {
        const ttl = 200
        this.add({ kind, x, y, z: this.rnd(44, 64), vx: 0, vy: 0, vz: 0, ttl, max: ttl, color, size: 1, seed, rest: false })
        break
      }
      case 'mote': {
        const ttl = Math.round(this.rnd(140, 260))
        this.add({ kind, x, y, z: this.rnd(4, 22), vx: this.rnd(-0.08, 0.08), vy: this.rnd(-0.04, 0.04), vz: this.rnd(-0.03, 0.03), ttl, max: ttl, color, size: 1, seed, rest: false })
        break
      }
      case 'flake': {
        const ttl = 400
        this.add({ kind, x, y, z: this.rnd(60, 90), vx: this.rnd(0.05, 0.2), vy: 0, vz: -this.rnd(0.3, 0.55), ttl, max: ttl, color, size: 1, seed, rest: false })
        break
      }
      case 'wisp': {
        const ttl = Math.round(this.rnd(50, 90))
        this.add({ kind, x, y, z: this.rnd(2, 8), vx: this.rnd(-0.08, 0.08), vy: 0, vz: this.rnd(0.3, 0.45), ttl, max: ttl, color, size: 1, seed, rest: false })
        break
      }
      case 'grit': {
        const ttl = Math.round(this.rnd(60, 90))
        this.add({ kind, x, y, z: this.rnd(10, 18), vx: this.rnd(-0.2, 0.2), vy: this.rnd(0.1, 0.4), vz: 0, ttl, max: ttl, color, size: 1, seed, rest: false })
        break
      }
      case 'ember':
        this.embers(x, y, 1, 0, 2, color)
        break
      case 'smoke':
        this.smoke(x, y, 1, color, 0, 3)
        break
    }
  }

  ring(x: number, y: number, r0: number, r1: number, color: string, ttl: number, ry = 0.8, inner?: string) {
    this.rings.push({ x, y, r0, r1, ttl, max: ttl, color, ry, inner })
  }

  decal(kind: DecalKind, x: number, y: number, color: string, opts: { w?: number; h?: number; dx?: number; dy?: number; ttl?: number } = {}) {
    if (this.decals.length >= MAX_DECALS) {
      // the oldest fading one goes first; permanent marks only go when there is nothing else
      const i = this.decals.findIndex((d) => d.ttl >= 0)
      this.decals.splice(i >= 0 ? i : 0, 1)
    }
    const ttl = opts.ttl ?? 180
    this.decals.push({ kind, x, y, w: opts.w ?? 2, h: opts.h ?? 1, dx: opts.dx ?? 1, dy: opts.dy ?? 0, color, ttl, max: ttl, seed: Math.floor(this.rng() * 1e6) })
  }

  /** Shake the world layer: `mag` px falling off over `ticks`. Several at once: the strongest wins. */
  shake(mag: number, ticks: number) {
    this.shakes.push({ mag, ttl: ticks, max: ticks })
  }

  /** A white flash over the world layer, `a` fading out over `ticks`. Rate-limited to one per FLASH_GAP: a barrel chain flashes once. */
  flash(a: number, ticks: number) {
    if (this.flashGap > 0) return
    this.flashGap = FLASH_GAP
    this.flashes.push({ a, ttl: ticks, max: ticks })
  }

  // ---------------------------------------------------------------- stepping
  step(tick: number) {
    const ps = this.particles
    let w = 0
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]
      p.ttl--
      if (p.ttl <= 0) continue
      const sway = hash2(tick >> 2, p.seed, 3) - 0.5
      switch (p.kind) {
        case 'dust':
          p.vx *= 0.88
          p.vy *= 0.88
          p.vz *= 0.9
          break
        case 'spark':
        case 'shard':
          p.vz -= GRAVITY
          p.vx *= 0.97
          p.vy *= 0.97
          if (p.z + p.vz <= 0 && p.vz < 0) {
            if (p.kind === 'spark' || p.vz > -0.5) {
              // a spark dies on the floor; a slow shard just stops
              if (p.kind === 'spark') p.ttl = Math.min(p.ttl, 2)
              p.vz = 0
              p.z = 0
              p.vx *= 0.5
              p.vy *= 0.5
            } else {
              p.vz = -p.vz * 0.4
              p.vx *= 0.6
              p.vy *= 0.6
            }
          }
          break
        case 'chunk':
          if (!p.rest) {
            p.vz -= GRAVITY
            if (p.z + p.vz <= 0 && p.vz < 0) {
              if (p.vz < -0.7) {
                p.vz = -p.vz * 0.45
                p.vx *= 0.55
                p.vy *= 0.55
              } else {
                p.vz = 0
                p.z = 0
                p.vx = p.vy = 0
                p.rest = true
              }
            }
          }
          break
        case 'ember':
          p.vz = Math.min(0.7, p.vz + 0.015)
          p.vx += sway * 0.12
          p.vx *= 0.96
          break
        case 'smoke':
          p.vz = Math.min(0.55, p.vz + 0.01)
          p.vx += sway * 0.04
          p.vx *= 0.98
          break
        case 'leaf':
          if (!p.rest) {
            p.vx = Math.sin((tick + p.seed) / 11) * 0.35 + sway * 0.1
            if (p.z + p.vz <= 0) {
              p.z = 0
              p.vz = 0
              p.vx = p.vy = 0
              p.rest = true
            }
          }
          break
        case 'drip':
          p.vz -= GRAVITY * 0.9
          if (p.z + p.vz <= 0) {
            // the splash: a ring and a few beads of water, then the drop itself is gone
            this.ring(p.x, p.y, 1, 5, p.color, 10, 0.5)
            for (let k = 0; k < 3; k++) {
              const a = this.rng() * Math.PI * 2
              this.add({ kind: 'shard', x: p.x, y: p.y, z: 1, vx: Math.cos(a) * 0.5, vy: Math.sin(a) * 0.3, vz: 0.9, ttl: 10, max: 10, color: p.color, size: 1, seed: p.seed + k, rest: false })
            }
            continue
          }
          break
        case 'mote':
          p.vx += sway * 0.01
          p.vy += (hash2(tick >> 2, p.seed, 5) - 0.5) * 0.006
          p.vz += (hash2(tick >> 3, p.seed, 7) - 0.5) * 0.01
          if (p.z < 2) p.vz = Math.abs(p.vz)
          break
        case 'flake':
          if (!p.rest) {
            p.vx = Math.sin((tick + p.seed) / 28) * 0.18 + 0.12
            if (p.z + p.vz <= 0) {
              // settles: a white dot on the floor that melts away
              this.decal('dot', p.x, p.y, p.color, { ttl: 140 })
              continue
            }
          }
          break
        case 'wisp':
          p.vx = Math.sin((tick + p.seed) / 9) * 0.12
          p.vz = Math.min(0.5, p.vz + 0.004)
          break
        case 'grit':
          p.vz -= GRAVITY
          if (p.z + p.vz <= 0) {
            this.dust(p.x, p.y, 1, p.color, 0.2)
            continue
          }
          break
      }
      p.x += p.vx
      p.y += p.vy
      p.z += p.vz
      ps[w++] = p
    }
    ps.length = w

    let rw = 0
    for (const r of this.rings) if (--r.ttl > 0) this.rings[rw++] = r
    this.rings.length = rw

    let dw = 0
    for (const d of this.decals) {
      if (d.ttl > 0) d.ttl--
      if (d.ttl !== 0) this.decals[dw++] = d
    }
    this.decals.length = dw

    let sw = 0
    for (const s of this.shakes) if (--s.ttl > 0) this.shakes[sw++] = s
    this.shakes.length = sw
    let fw = 0
    for (const f of this.flashes) if (--f.ttl > 0) this.flashes[fw++] = f
    this.flashes.length = fw
    if (this.flashGap > 0) this.flashGap--
  }

  // ---------------------------------------------------------------- screen effects
  /** Whole-pixel offset for the world layer this tick; the HUD never moves. */
  shakeOffset(tick: number): [number, number] {
    let mag = 0
    for (const s of this.shakes) mag = Math.max(mag, s.mag * (s.ttl / s.max))
    if (mag < 0.5) return [0, 0]
    // a fresh direction every tick, never the same two in a row, so it reads as a rattle not a drift
    const a = hash2(tick, 11, this.salt) * Math.PI * 2
    const m = mag * (0.6 + 0.4 * hash2(tick, 13, this.salt))
    return [Math.round(Math.cos(a) * m), Math.round(Math.sin(a) * m * 0.7)]
  }

  flashAlpha(): number {
    let a = 0
    for (const f of this.flashes) a = Math.max(a, f.a * (f.ttl / f.max))
    return a
  }

  // ---------------------------------------------------------------- drawing
  /** Floor marks and anything lying on the floor: drawn under the players. */
  drawGround(g: G, vis: (x: number) => boolean) {
    for (const d of this.decals) {
      if (!vis(d.x)) continue
      const t = d.ttl < 0 ? 1 : d.ttl / d.max
      switch (d.kind) {
        case 'smear':
          g.fillStyle = rgba(d.color, 0.2 + 0.5 * t)
          g.fillRect(Math.round(d.x) - (d.w >> 1), Math.round(d.y), d.w, 1)
          break
        case 'scorch': {
          const cx = Math.round(d.x)
          const cy = Math.round(d.y)
          g.fillStyle = rgba(PAL.outline, 0.42)
          fillEllipse(g, cx, cy, d.w, d.h)
          g.fillStyle = rgba(PAL.outline, 0.5)
          fillEllipse(g, cx, cy, Math.round(d.w * 0.55), Math.round(d.h * 0.55))
          // a ragged edge: a few flecks just outside the ellipse
          g.fillStyle = rgba(PAL.outline, 0.3)
          for (let k = 0; k < 10; k++) {
            const a = hash2(k, 1, d.seed) * Math.PI * 2
            const rr = 1 + hash2(k, 2, d.seed) * 0.25
            g.fillRect(Math.round(cx + Math.cos(a) * d.w * rr), Math.round(cy + Math.sin(a) * d.h * rr), 1, 1)
          }
          g.fillStyle = rgba(d.color, 0.35)
          for (let k = 0; k < 5; k++) {
            const a = hash2(k, 3, d.seed) * Math.PI * 2
            const rr = hash2(k, 4, d.seed) * 0.5
            g.fillRect(Math.round(cx + Math.cos(a) * d.w * rr), Math.round(cy + Math.sin(a) * d.h * rr), 1, 1)
          }
          break
        }
        case 'splat':
          g.fillStyle = rgba(d.color, 0.25 + 0.5 * t)
          for (let k = 0; k < 7; k++) {
            const a = hash2(k, 1, d.seed) * Math.PI * 2
            const rr = hash2(k, 2, d.seed) * d.w
            const s = k < 2 ? 2 : 1
            g.fillRect(Math.round(d.x + Math.cos(a) * rr), Math.round(d.y + Math.sin(a) * rr * 0.6), s, s)
          }
          break
        case 'print':
          g.fillStyle = rgba(d.color, 0.15 + 0.55 * t)
          g.fillRect(Math.round(d.x), Math.round(d.y), d.w, d.h)
          break
        case 'scratch': {
          g.fillStyle = rgba(d.color, 0.2 + 0.5 * t)
          const n = Math.max(1, Math.round(d.w))
          for (let k = 0; k < n; k++) g.fillRect(Math.round(d.x + d.dx * k), Math.round(d.y + d.dy * k), 1, 1)
          break
        }
        case 'dot':
          g.fillStyle = rgba(d.color, 0.75 * t)
          g.fillRect(Math.round(d.x), Math.round(d.y), 1, 1)
          break
      }
    }
    for (const p of this.particles) {
      if (!p.rest || !vis(p.x)) continue
      this.drawParticle(g, p, 0)
    }
  }

  /** Everything airborne, drawn over the scene. */
  drawAir(g: G, vis: (x: number) => boolean, tick: number) {
    for (const p of this.particles) {
      if (p.rest || !vis(p.x)) continue
      this.drawParticle(g, p, tick)
    }
    for (const r of this.rings) {
      if (!vis(r.x)) continue
      const t = 1 - r.ttl / r.max
      const e = 1 - (1 - t) * (1 - t) // ease out: fast at first, slowing as it fades
      const rr = r.r0 + (r.r1 - r.r0) * e
      const a = 1 - t
      g.fillStyle = rgba(r.color, a)
      ringEllipse(g, r.x, r.y, rr, rr * r.ry)
      if (r.inner && rr > 2) {
        g.fillStyle = rgba(r.inner, a * 0.9)
        ringEllipse(g, r.x, r.y, rr - 2, (rr - 2) * r.ry)
      }
    }
  }

  private drawParticle(g: G, p: Particle, tick: number) {
    const t = 1 - p.ttl / p.max // 0 fresh → 1 gone
    const sx = Math.round(p.x)
    const sy = Math.round(p.y - p.z)
    switch (p.kind) {
      case 'dust': {
        const a = 0.65 * (1 - t) * (1 - t)
        g.fillStyle = rgba(p.color, a)
        const s = t < 0.5 ? p.size : 1
        g.fillRect(sx, sy, s, s)
        break
      }
      case 'spark': {
        const [c0, c1, c2] = ramp(p.color)
        g.fillStyle = rgba(t < 0.25 ? c0 : t < 0.65 ? c1 : c2, t < 0.8 ? 1 : 0.5)
        const s = t < 0.2 ? p.size : 1
        g.fillRect(sx, sy, s, s)
        break
      }
      case 'shard': {
        g.fillStyle = rgba(p.color, t < 0.7 ? 1 : 0.5)
        g.fillRect(sx, sy, p.size, p.size)
        break
      }
      case 'ember': {
        const flick = hash2(tick >> 1, p.seed, 9)
        if (flick < 0.15) return
        const [c0, c1, c2] = ramp(p.color)
        const c = t < 0.3 ? c0 : t < 0.65 ? c1 : c2
        g.fillStyle = rgba(c, t < 0.75 ? 1 : (1 - t) * 4)
        const s = t < 0.4 && flick > 0.6 ? 2 : 1
        g.fillRect(sx, sy, s, s)
        break
      }
      case 'chunk': {
        const a = p.rest && t > 0.75 ? (1 - t) * 4 : 1
        g.fillStyle = rgba(p.color, a)
        g.fillRect(sx, sy, p.size, p.size)
        if (p.size > 2) {
          g.fillStyle = rgba(PAL.outline, a * 0.7)
          g.fillRect(sx, sy + p.size - 1, p.size, 1)
        }
        break
      }
      case 'smoke': {
        const grow = p.size * (0.6 + t * 1.1)
        g.fillStyle = rgba(p.color, 0.32 * (1 - t))
        fillEllipse(g, sx, sy, Math.round(grow), Math.round(grow * 0.7))
        break
      }
      case 'leaf': {
        const a = p.rest && t > 0.7 ? (1 - t) / 0.3 : 1
        g.fillStyle = rgba(p.color, a)
        // it turns over as it falls: a 2×1 or 1×2 mark; lies flat once down
        const flat = p.rest || ((tick + p.seed) >> 3) % 2 === 0
        g.fillRect(sx, sy, flat ? 2 : 1, flat ? 1 : 2)
        break
      }
      case 'drip': {
        g.fillStyle = rgba(p.color, 0.9)
        g.fillRect(sx, sy, 1, p.vz < -1.2 ? 2 : 1)
        break
      }
      case 'mote': {
        const tw = hash2(tick >> 2, p.seed, 21)
        const life = t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1
        g.fillStyle = rgba(p.color, (0.12 + 0.4 * tw) * life)
        g.fillRect(sx, sy, 1, 1)
        break
      }
      case 'flake': {
        g.fillStyle = rgba(p.color, 0.85)
        g.fillRect(sx, sy, 1, 1)
        break
      }
      case 'wisp': {
        g.fillStyle = rgba(p.color, 0.3 * (1 - t))
        g.fillRect(sx, sy, 1, 2)
        break
      }
      case 'grit': {
        g.fillStyle = rgba(p.color, 1)
        g.fillRect(sx, sy, 1, 1)
        break
      }
    }
  }
}
