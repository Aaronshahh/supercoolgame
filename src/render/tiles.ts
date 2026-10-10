import { PAL, PROP_KEY, rgba } from '../art/palette.ts'
import { DEBRIS } from '../art/props.ts'
import { hash2, hashInt, mulberry32, type Rng } from '../util/rng.ts'
import { LOOKS, WINDOW_FRAME, WINDOW_PANES, type Look } from './looks.ts'
import { ctx2d, makeCanvas, spriteFromRows } from './pixelart.ts'

export const TILE = 16

export enum TileKind {
  Floor = 0,
  Wall = 1,
  Pit = 2,
  Grass = 3,
  Ice = 4,
  Spikes = 5,
  Vent = 6,
  Crumble = 7,
  BeltL = 8,
  BeltR = 9,
  BeltU = 10,
  BeltD = 11,
}

export type PropKind = 'crate' | 'barrel' | 'torch' | 'bumper'

export interface PropSpawn {
  kind: PropKind
  c: number
  r: number
}

export interface ArenaMap {
  cols: number
  rows: number
  tiles: Uint8Array
  /** 1 where a periodic tile (spikes, vent) runs half a cycle behind its siblings. */
  phase: Uint8Array
  props: PropSpawn[]
  spawns: { c: number; r: number }[]
  powerups: { c: number; r: number }[]
}

/** How the grass on a tile currently looks: standing, cut to stubble, or sprouting back. */
export type GrassLook = 'full' | 'stubble' | 'sprout'
export type GrassAt = (c: number, r: number) => GrassLook

export function isBelt(k: TileKind): boolean {
  return k >= TileKind.BeltL && k <= TileKind.BeltD
}

export function beltDir(k: TileKind): [number, number] {
  switch (k) {
    case TileKind.BeltL:
      return [-1, 0]
    case TileKind.BeltR:
      return [1, 0]
    case TileKind.BeltU:
      return [0, -1]
    case TileKind.BeltD:
      return [0, 1]
    default:
      return [0, 0]
  }
}

/**
 * Map legend (docs/02 §2). One character per tile:
 *   #  wall            T  torch on a wall     .  floor           ~  pit
 *   "  tall grass      _  ice                 C  crate           B  barrel
 *   o  bumper          %  crumbling floor     p  power-up point  1-6 spawn
 *   ^  spikes          &  spikes, half a cycle behind
 *   *  fire vent       @  fire vent, half a cycle behind
 *   <  >  A  V         conveyor belt running left / right / up / down
 * Anything with a rail, a size or a partner (platforms, gates, crushers, carts, chandeliers,
 * portals) is in the arena's hazard list, not the map.
 */
export function parseArena(rows: string[]): ArenaMap {
  const nrows = rows.length
  const cols = rows[0].length
  const tiles = new Uint8Array(cols * nrows)
  const phase = new Uint8Array(cols * nrows)
  const props: PropSpawn[] = []
  const spawns: { c: number; r: number }[] = []
  const powerups: { c: number; r: number }[] = []
  for (let r = 0; r < nrows; r++) {
    if (rows[r].length !== cols) throw new Error(`arena row ${r} has width ${rows[r].length}, expected ${cols}`)
    for (let c = 0; c < cols; c++) {
      const ch = rows[r][c]
      const i = r * cols + c
      let k = TileKind.Floor
      switch (ch) {
        case '#':
          k = TileKind.Wall
          break
        case 'T':
          k = TileKind.Wall
          props.push({ kind: 'torch', c, r })
          break
        case '.':
          break
        case '~':
          k = TileKind.Pit
          break
        case '"':
          k = TileKind.Grass
          break
        case '_':
          k = TileKind.Ice
          break
        case '^':
          k = TileKind.Spikes
          break
        case '&':
          k = TileKind.Spikes
          phase[i] = 1
          break
        case '*':
          k = TileKind.Vent
          break
        case '@':
          k = TileKind.Vent
          phase[i] = 1
          break
        case '%':
          k = TileKind.Crumble
          break
        case '<':
          k = TileKind.BeltL
          break
        case '>':
          k = TileKind.BeltR
          break
        case 'A':
          k = TileKind.BeltU
          break
        case 'V':
          k = TileKind.BeltD
          break
        case 'C':
          props.push({ kind: 'crate', c, r })
          break
        case 'B':
          props.push({ kind: 'barrel', c, r })
          break
        case 'o':
          props.push({ kind: 'bumper', c, r })
          break
        case 'p':
          powerups.push({ c, r })
          break
        default:
          if (ch >= '1' && ch <= '6') spawns[Number(ch) - 1] = { c, r }
          else throw new Error(`arena: unknown tile "${ch}" at ${c},${r}`)
      }
      tiles[i] = k
    }
  }
  return { cols, rows: nrows, tiles, phase, props, spawns, powerups }
}

export function tileAt(m: ArenaMap, c: number, r: number): TileKind {
  if (c < 0 || r < 0 || c >= m.cols || r >= m.rows) return TileKind.Wall
  return m.tiles[r * m.cols + c] as TileKind
}

function tileRng(c: number, r: number, seed: number): Rng {
  return mulberry32(hashInt(c, r, seed))
}

/** True for the kinds drawn on a stone floor (everything that is not wall, pit or ice). */
function onFloor(k: TileKind): boolean {
  return k !== TileKind.Wall && k !== TileKind.Pit && k !== TileKind.Ice
}

/** The look's shadow colour at the given alpha. */
function shade(look: Look, a: number): string {
  const [r, g, b] = look.shade
  return `rgba(${r},${g},${b},${a})`
}

function pick(list: string[], t: number): string {
  return list[Math.floor(t * list.length)]
}

// ---------------------------------------------------------------------------------------------
// Floors

function drawFloor(g: CanvasRenderingContext2D, c: number, r: number, seed: number, look: Look) {
  switch (look.floor) {
    case 'slabs':
      drawSlabs(g, c, r, seed, look)
      break
    case 'earth':
      drawEarth(g, c, r, seed, look)
      break
    case 'snow':
      drawSnow(g, c, r, seed, look)
      break
    case 'tiles':
      drawTiles(g, c, r, seed, look)
      break
    case 'plates':
      drawPlates(g, c, r, seed, look)
      break
    case 'cobbles':
      drawCobbles(g, c, r, seed, look)
      break
    case 'checker':
      drawChecker(g, c, r, seed, look)
      break
  }
}

/** 2×2-tile stone slabs with a mortar line and a lit edge; the original dungeon floor. */
function drawSlabs(g: CanvasRenderingContext2D, c: number, r: number, seed: number, look: Look) {
  const x = c * TILE
  const y = r * TILE
  g.fillStyle = pick(look.floors, hash2(c >> 1, r >> 1, seed))
  g.fillRect(x, y, TILE, TILE)

  const left = (c & 1) === 0
  const top = (r & 1) === 0
  g.fillStyle = look.floorMortar
  if (left) g.fillRect(x, y, 1, TILE)
  if (top) g.fillRect(x, y, TILE, 1)
  g.fillStyle = look.floorLight
  if (left) g.fillRect(x + 1, y + (top ? 1 : 0), 1, TILE - (top ? 1 : 0))
  if (top) g.fillRect(x + (left ? 1 : 0), y + 1, TILE - (left ? 1 : 0), 1)

  const rng = tileRng(c, r, seed)
  const specks = 2 + Math.floor(rng() * 4)
  for (let i = 0; i < specks; i++) {
    const px = 2 + Math.floor(rng() * 13)
    const py = 2 + Math.floor(rng() * 13)
    g.fillStyle = rng() < 0.5 ? look.floorSpeck : look.floorCrack
    g.fillRect(x + px, y + py, 1, 1)
  }
  if (rng() < 0.14) crackWalk(g, x, y, rng, look.floorCrack, 4 + Math.floor(rng() * 5))
  // the odd ember in a crack
  if (look.ember && rng() < 0.12) {
    g.fillStyle = look.ember
    g.fillRect(x + 2 + Math.floor(rng() * 12), y + 2 + Math.floor(rng() * 12), 1, 1)
  }
}

/** Packed dirt: no joints, mottled, a few pebbles, moss where the look has it. */
function drawEarth(g: CanvasRenderingContext2D, c: number, r: number, seed: number, look: Look) {
  const x = c * TILE
  const y = r * TILE
  const rng = tileRng(c, r, seed)
  g.fillStyle = pick(look.floors, hash2(c, r, seed))
  g.fillRect(x, y, TILE, TILE)
  // soften the tile seams: blend a neighbour's shade into the edges in blobs
  for (let i = 0; i < 3; i++) {
    g.fillStyle = pick(look.floors, rng())
    g.fillRect(x + Math.floor(rng() * 12), y + Math.floor(rng() * 12), 3 + Math.floor(rng() * 4), 2 + Math.floor(rng() * 4))
  }
  if (look.moss && hash2(c, r, seed + 41) < 0.22) {
    g.fillStyle = rgba(look.moss, 0.8)
    const mx = Math.floor(rng() * 8)
    const my = Math.floor(rng() * 8)
    g.fillRect(x + mx + 1, y + my, 5 + Math.floor(rng() * 3), 4 + Math.floor(rng() * 3))
    g.fillRect(x + mx, y + my + 1, 7 + Math.floor(rng() * 3), 2 + Math.floor(rng() * 3))
  }
  const specks = 6 + Math.floor(rng() * 5)
  for (let i = 0; i < specks; i++) {
    const t = rng()
    g.fillStyle = t < 0.4 ? look.floorSpeck : t < 0.8 ? look.floorCrack : look.floorMortar
    g.fillRect(x + Math.floor(rng() * 16), y + Math.floor(rng() * 16), 1, 1)
  }
  // a pebble or two: a light top over a dark underside
  const pebbles = rng() < 0.5 ? 1 : rng() < 0.3 ? 2 : 0
  for (let i = 0; i < pebbles; i++) {
    const px = 1 + Math.floor(rng() * 13)
    const py = 1 + Math.floor(rng() * 13)
    g.fillStyle = look.floorLight
    g.fillRect(x + px, y + py, 2, 1)
    g.fillStyle = look.floorMortar
    g.fillRect(x + px, y + py + 1, 2, 1)
  }
}

/** Snow: a soft matt field with sparkles and the odd wind-rippled drift line. */
function drawSnow(g: CanvasRenderingContext2D, c: number, r: number, seed: number, look: Look) {
  const x = c * TILE
  const y = r * TILE
  const rng = tileRng(c, r, seed)
  g.fillStyle = pick(look.floors, hash2(c >> 1, r >> 1, seed))
  g.fillRect(x, y, TILE, TILE)
  // soft blotches so the slab grid does not read
  for (let i = 0; i < 2; i++) {
    g.fillStyle = pick(look.floors, rng())
    g.fillRect(x + Math.floor(rng() * 10), y + Math.floor(rng() * 10), 4 + Math.floor(rng() * 5), 3 + Math.floor(rng() * 4))
  }
  // drift ripples: short pale lines with a shaded underside
  if (rng() < 0.3) {
    const dy = 2 + Math.floor(rng() * 12)
    const dx = Math.floor(rng() * 6)
    const len = 5 + Math.floor(rng() * 8)
    g.fillStyle = look.floorSpeck
    g.fillRect(x + dx, y + dy, Math.min(len, 16 - dx), 1)
    g.fillStyle = look.floorCrack
    g.fillRect(x + dx, y + dy + 1, Math.min(len, 16 - dx), 1)
  }
  // sparkle
  const sparks = rng() < 0.6 ? 1 + Math.floor(rng() * 2) : 0
  g.fillStyle = look.floorLight
  for (let i = 0; i < sparks; i++) g.fillRect(x + Math.floor(rng() * 16), y + Math.floor(rng() * 16), 1, 1)
  // blue grit
  g.fillStyle = look.floorMortar
  if (rng() < 0.35) g.fillRect(x + Math.floor(rng() * 16), y + Math.floor(rng() * 16), 1, 1)
}

/** Clean 8 px tiles in two alternating shades with hairline seams. */
function drawTiles(g: CanvasRenderingContext2D, c: number, r: number, seed: number, look: Look) {
  const x = c * TILE
  const y = r * TILE
  const rng = tileRng(c, r, seed)
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const tx = x + i * 8
      const ty = y + j * 8
      g.fillStyle = look.floors[((c * 2 + i + r * 2 + j) & 1) % look.floors.length]
      g.fillRect(tx, ty, 8, 8)
      g.fillStyle = look.floorMortar
      g.fillRect(tx, ty, 8, 1)
      g.fillRect(tx, ty, 1, 8)
      g.fillStyle = look.floorLight
      g.fillRect(tx + 1, ty + 1, 7, 1)
      g.fillRect(tx + 1, ty + 1, 1, 7)
    }
  }
  // the odd scuff
  if (rng() < 0.15) {
    g.fillStyle = look.floorCrack
    g.fillRect(x + 2 + Math.floor(rng() * 10), y + 2 + Math.floor(rng() * 12), 2 + Math.floor(rng() * 3), 1)
  }
}

/** Riveted iron plates, one per tile. */
function drawPlates(g: CanvasRenderingContext2D, c: number, r: number, seed: number, look: Look) {
  const x = c * TILE
  const y = r * TILE
  const rng = tileRng(c, r, seed)
  g.fillStyle = pick(look.floors, hash2(c, r, seed))
  g.fillRect(x, y, TILE, TILE)
  g.fillStyle = look.floorLight
  g.fillRect(x, y, TILE, 1)
  g.fillRect(x, y, 1, TILE)
  g.fillStyle = look.floorMortar
  g.fillRect(x, y + 15, TILE, 1)
  g.fillRect(x + 15, y, 1, TILE)
  for (const [rx, ry] of [[2, 2], [12, 2], [2, 12], [12, 12]] as const) {
    g.fillStyle = look.floorSpeck
    g.fillRect(x + rx, y + ry, 2, 2)
    g.fillStyle = look.floorCrack
    g.fillRect(x + rx + 1, y + ry + 1, 1, 1)
  }
  if (rng() < 0.2) crackWalk(g, x, y, rng, look.floorCrack, 4 + Math.floor(rng() * 5))
  if (rng() < 0.3) {
    g.fillStyle = look.floorCrack
    g.fillRect(x + 4 + Math.floor(rng() * 6), y + 4 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 3), 1)
  }
}

/** A 4×4 grid of rounded cobbles set in mortar. */
function drawCobbles(g: CanvasRenderingContext2D, c: number, r: number, seed: number, look: Look) {
  const x = c * TILE
  const y = r * TILE
  const rng = tileRng(c, r, seed)
  g.fillStyle = look.floorMortar
  g.fillRect(x, y, TILE, TILE)
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      const sx = x + i * 4
      const sy = y + j * 4
      g.fillStyle = pick(look.floors, rng())
      g.fillRect(sx, sy, 3, 3)
      g.fillStyle = look.floorLight
      g.fillRect(sx, sy, 1, 1)
      g.fillStyle = look.floorCrack
      g.fillRect(sx + 2, sy + 2, 1, 1)
      if (rng() < 0.08) {
        // a missing stone
        g.fillStyle = look.floorMortar
        g.fillRect(sx, sy, 3, 3)
      }
    }
  }
}

/** A one-tile checkerboard. */
function drawChecker(g: CanvasRenderingContext2D, c: number, r: number, seed: number, look: Look) {
  const x = c * TILE
  const y = r * TILE
  const rng = tileRng(c, r, seed)
  const light = ((c + r) & 1) === 1
  g.fillStyle = look.floors[light ? 1 : 0]
  g.fillRect(x, y, TILE, TILE)
  g.fillStyle = look.floorMortar
  g.fillRect(x, y, TILE, 1)
  g.fillRect(x, y, 1, TILE)
  if (light) {
    g.fillStyle = look.floorLight
    g.fillRect(x + 1, y + 1, TILE - 1, 1)
    g.fillRect(x + 1, y + 1, 1, TILE - 1)
  }
  const specks = 1 + Math.floor(rng() * 2)
  for (let i = 0; i < specks; i++) {
    g.fillStyle = light ? look.floorSpeck : look.floorCrack
    g.fillRect(x + 2 + Math.floor(rng() * 13), y + 2 + Math.floor(rng() * 13), 1, 1)
  }
  if (rng() < 0.1) crackWalk(g, x, y, rng, look.floorCrack, 4 + Math.floor(rng() * 4))
}

/** A short random-walk crack starting somewhere inside the tile. */
function crackWalk(g: CanvasRenderingContext2D, x: number, y: number, rng: Rng, color: string, len: number) {
  let px = 3 + Math.floor(rng() * 10)
  let py = 3 + Math.floor(rng() * 10)
  g.fillStyle = color
  for (let i = 0; i < len; i++) {
    g.fillRect(x + px, y + py, 1, 1)
    const d = rng()
    if (d < 0.4) py++
    else if (d < 0.7) px++
    else if (d < 0.85) px--
    else py--
    if (px < 1 || px > 14 || py < 1 || py > 14) break
  }
}

function drawIce(g: CanvasRenderingContext2D, c: number, r: number, seed: number) {
  const x = c * TILE
  const y = r * TILE
  const sx = c >> 1
  const sy = r >> 1
  g.fillStyle = PAL.ice[Math.floor(hash2(sx, sy, seed + 21) * PAL.ice.length)]
  g.fillRect(x, y, TILE, TILE)
  const left = (c & 1) === 0
  const top = (r & 1) === 0
  g.fillStyle = PAL.iceDark
  if (left) g.fillRect(x, y, 1, TILE)
  if (top) g.fillRect(x, y, TILE, 1)
  g.fillStyle = PAL.iceLight
  if (left) g.fillRect(x + 1, y + (top ? 1 : 0), 1, TILE - (top ? 1 : 0))
  if (top) g.fillRect(x + (left ? 1 : 0), y + 1, TILE - (left ? 1 : 0), 1)
  const rng = tileRng(c, r, seed + 23)
  // a specular streak: a short diagonal of bright pixels
  if (rng() < 0.6) {
    let px = 2 + Math.floor(rng() * 7)
    let py = 3 + Math.floor(rng() * 7)
    const n = 3 + Math.floor(rng() * 4)
    g.fillStyle = PAL.iceLight
    for (let i = 0; i < n && px < 15 && py > 1; i++) {
      g.fillRect(x + px, y + py, 1, 1)
      px++
      py--
    }
  }
  if (rng() < 0.5) crackWalk(g, x, y, rng, PAL.iceCrack, 5 + Math.floor(rng() * 6))
}

/** Hole offsets of the spike grate: three rows of three 2 px holes. */
export const SPIKE_HOLES = [2, 7, 12]

function drawSpikeGrate(g: CanvasRenderingContext2D, c: number, r: number) {
  const x = c * TILE
  const y = r * TILE
  g.fillStyle = PAL.iron
  g.fillRect(x, y, TILE, TILE)
  g.fillStyle = PAL.ironLight
  g.fillRect(x, y, TILE, 1)
  g.fillRect(x, y, 1, TILE)
  g.fillStyle = PAL.ironDark
  g.fillRect(x, y + 15, TILE, 1)
  g.fillRect(x + 15, y, 1, TILE)
  g.fillStyle = PAL.pit
  for (const hy of SPIKE_HOLES) for (const hx of SPIKE_HOLES) g.fillRect(x + hx, y + hy, 2, 2)
}

function drawVentGrate(g: CanvasRenderingContext2D, c: number, r: number) {
  const x = c * TILE
  const y = r * TILE
  g.fillStyle = PAL.iron
  g.fillRect(x, y, TILE, TILE)
  g.fillStyle = PAL.ironLight
  g.fillRect(x + 1, y + 1, TILE - 2, 1)
  g.fillRect(x + 1, y + 1, 1, TILE - 2)
  g.fillStyle = PAL.ironDark
  g.fillRect(x, y, TILE, 1)
  g.fillRect(x, y, 1, TILE)
  g.fillRect(x, y + 15, TILE, 1)
  g.fillRect(x + 15, y, 1, TILE)
  g.fillStyle = PAL.pit
  for (let i = 0; i < 3; i++) g.fillRect(x + 3, y + 4 + i * 4, 10, 2)
}

function drawCrumble(g: CanvasRenderingContext2D, c: number, r: number, seed: number, look: Look) {
  drawFloor(g, c, r, seed, look)
  const x = c * TILE
  const y = r * TILE
  const rng = tileRng(c, r, seed + 31)
  for (let i = 0; i < 3; i++) crackWalk(g, x, y, rng, PAL.crack, 5 + Math.floor(rng() * 6))
  // chipped edge
  g.fillStyle = look.floorMortar
  for (let i = 0; i < 4; i++) g.fillRect(x + Math.floor(rng() * 16), y + Math.floor(rng() * 16), 2, 1)
}

function drawBeltBase(g: CanvasRenderingContext2D, k: TileKind, c: number, r: number) {
  const x = c * TILE
  const y = r * TILE
  g.fillStyle = PAL.ironDark
  g.fillRect(x, y, TILE, TILE)
  const [dx] = beltDir(k)
  g.fillStyle = PAL.ironLight
  if (dx !== 0) {
    g.fillRect(x, y, TILE, 1)
    g.fillRect(x, y + 15, TILE, 1)
    g.fillStyle = PAL.iron
    g.fillRect(x, y + 1, TILE, 1)
    g.fillRect(x, y + 14, TILE, 1)
  } else {
    g.fillRect(x, y, 1, TILE)
    g.fillRect(x + 15, y, 1, TILE)
    g.fillStyle = PAL.iron
    g.fillRect(x + 1, y, 1, TILE)
    g.fillRect(x + 14, y, 1, TILE)
  }
}

function drawPowerupMark(g: CanvasRenderingContext2D, c: number, r: number, look: Look) {
  const x = c * TILE + 8
  const y = r * TILE + 8
  g.fillStyle = look.floorLight
  for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4], [-3, -2], [3, -2], [-3, 2], [3, 2], [-2, -3], [2, -3], [-2, 3], [2, 3]] as const) g.fillRect(x + dx, y + dy, 1, 1)
  g.fillStyle = look.floorSpeck
  g.fillRect(x, y, 1, 1)
}

// ---------------------------------------------------------------------------------------------
// Walls: the cap is the top of a wall seen from above; the face is the side we see on the wall
// tile just above open ground.

function drawWallCap(g: CanvasRenderingContext2D, m: ArenaMap, c: number, r: number, seed: number, look: Look) {
  const x = c * TILE
  const y = r * TILE
  const rng = tileRng(c, r, seed + 3)
  g.fillStyle = look.wallCap
  g.fillRect(x, y, TILE, TILE)
  switch (look.cap) {
    case 'blocks': {
      // 16×8 stone blocks in a running bond; low-contrast joints so the cap reads as one dark mass
      g.fillStyle = look.wallCapJoint
      g.fillRect(x, y + 7, TILE, 1)
      g.fillRect(x, y + 15, TILE, 1)
      const odd = (r * 2) & 1
      g.fillRect(x + (odd ? 7 : 15), y, 1, 8)
      g.fillRect(x + (odd ? 15 : 7), y + 8, 1, 8)
      g.fillStyle = look.wallCapLight
      const n = 2 + Math.floor(rng() * 3)
      for (let i = 0; i < n; i++) g.fillRect(x + Math.floor(rng() * 16), y + Math.floor(rng() * 16), 1, 1)
      break
    }
    case 'rough': {
      // lumps of rock: light tops, dark undersides, no straight joints
      for (let i = 0; i < 4; i++) {
        const bx = Math.floor(rng() * 12)
        const by = Math.floor(rng() * 12)
        const bw = 3 + Math.floor(rng() * 4)
        const bh = 2 + Math.floor(rng() * 3)
        g.fillStyle = look.wallCapLight
        g.fillRect(x + bx, y + by, bw, bh)
        g.fillStyle = look.wallCapJoint
        g.fillRect(x + bx, y + by + bh, bw, 1)
      }
      g.fillStyle = look.wallCapDark
      for (let i = 0; i < 3; i++) g.fillRect(x + Math.floor(rng() * 16), y + Math.floor(rng() * 16), 1, 1)
      break
    }
    case 'canopy': {
      // leaves: two greens over the dark, with gaps
      for (let i = 0; i < 9; i++) {
        const lx = Math.floor(rng() * 15)
        const ly = Math.floor(rng() * 15)
        g.fillStyle = rng() < 0.6 ? look.wallCapLight : look.wallCapEdge
        if (rng() < 0.5) g.fillRect(x + lx, y + ly, 2, 1)
        else g.fillRect(x + lx, y + ly, 1, 2)
      }
      g.fillStyle = look.wallCapJoint
      for (let i = 0; i < 3; i++) g.fillRect(x + Math.floor(rng() * 16), y + Math.floor(rng() * 16), 1, 1)
      break
    }
    case 'snow': {
      // a smooth mound: lighter in the middle, a few sparkles
      g.fillStyle = look.wallCapLight
      g.fillRect(x + 2 + Math.floor(rng() * 2), y + 2 + Math.floor(rng() * 2), 10 + Math.floor(rng() * 3), 9 + Math.floor(rng() * 3))
      g.fillStyle = look.wallCapEdge
      for (let i = 0; i < 2; i++) g.fillRect(x + Math.floor(rng() * 16), y + Math.floor(rng() * 16), 1, 1)
      g.fillStyle = look.wallCapJoint
      if (rng() < 0.4) g.fillRect(x + Math.floor(rng() * 12), y + 13 + Math.floor(rng() * 3), 3 + Math.floor(rng() * 4), 1)
      break
    }
  }

  // lit edges where the cap meets open space
  g.fillStyle = look.wallCapEdge
  if (tileAt(m, c, r - 1) !== TileKind.Wall) g.fillRect(x, y, TILE, 1)
  if (tileAt(m, c - 1, r) !== TileKind.Wall) g.fillRect(x, y, 1, TILE)
  if (tileAt(m, c + 1, r) !== TileKind.Wall) g.fillRect(x + 15, y, 1, TILE)
}

function drawWallFace(g: CanvasRenderingContext2D, m: ArenaMap, c: number, r: number, seed: number, look: Look) {
  const x = c * TILE
  const y = r * TILE
  // cap lip along the top
  g.fillStyle = look.wallCapEdge
  g.fillRect(x, y, TILE, 1)
  g.fillStyle = look.wallCapLight
  g.fillRect(x, y + 1, TILE, 1)

  switch (look.wall) {
    case 'brick':
      drawBrickFace(g, x, y, r, seed, look)
      break
    case 'rock':
      drawRockFace(g, x, y, c, r, seed, look)
      break
    case 'bamboo':
      drawBambooFace(g, x, y, c, seed, look)
      break
    case 'ice':
      drawIceFace(g, x, y, c, r, seed, look)
      break
    case 'panel':
      drawPanelFace(g, x, y, c, r, seed, look)
      break
    case 'ashlar':
      drawAshlarFace(g, x, y, r, seed, look)
      break
    case 'chapel':
      drawAshlarFace(g, x, y, r, seed, look)
      if (c % 2 === 0 && tileAt(m, c, r - 2) === TileKind.Wall && tileAt(m, c - 1, r) === TileKind.Wall && tileAt(m, c + 1, r) === TileKind.Wall) {
        drawWindow(g, x, y, c, r, seed, look)
      }
      break
  }

  // ground contact darkening
  g.fillStyle = shade(look, 0.35)
  g.fillRect(x, y + 13, TILE, 3)
  // ends of internal walls
  g.fillStyle = look.wallCapDark
  if (tileAt(m, c - 1, r) !== TileKind.Wall) g.fillRect(x, y, 1, TILE)
  if (tileAt(m, c + 1, r) !== TileKind.Wall) g.fillRect(x + 15, y, 1, TILE)
}

/** Three courses of 8×4 bricks with 1 px mortar, alternate courses offset by half a brick. */
function drawBrickFace(g: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number, look: Look) {
  g.fillStyle = look.faceMortar
  g.fillRect(x, y + 2, TILE, 14)
  for (let i = 0; i < 3; i++) {
    const by = y + 2 + i * 5
    const course = r * 3 + i
    const off = (course & 1) === 1 ? 4 : 0
    for (let k = -1; k < 3; k++) {
      const bx = x + off + k * 8
      const x0 = Math.max(x, bx)
      const x1 = Math.min(x + TILE, bx + 7)
      if (x1 <= x0) continue
      g.fillStyle = pick(look.faces, hash2(Math.floor(bx / 8), course, seed + 11))
      g.fillRect(x0, by, x1 - x0, 4)
      g.fillStyle = look.faceLight
      g.fillRect(x0, by, x1 - x0, 1)
    }
  }
}

/** Irregular lumps of rock in a dark matrix. */
function drawRockFace(g: CanvasRenderingContext2D, x: number, y: number, c: number, r: number, seed: number, look: Look) {
  const rng = tileRng(c, r, seed + 11)
  g.fillStyle = look.faceMortar
  g.fillRect(x, y + 2, TILE, 14)
  for (let i = 0; i < 6; i++) {
    const bw = 4 + Math.floor(rng() * 5)
    const bh = 3 + Math.floor(rng() * 3)
    const bx = x - 2 + Math.floor(rng() * 14)
    const by = y + 2 + Math.floor(rng() * 11)
    const x0 = Math.max(x, bx)
    const x1 = Math.min(x + TILE, bx + bw)
    const y1 = Math.min(y + TILE, by + bh)
    if (x1 <= x0) continue
    g.fillStyle = pick(look.faces, rng())
    g.fillRect(x0, by, x1 - x0, y1 - by)
    g.fillStyle = look.faceLight
    g.fillRect(x0 + (bx < x ? 0 : 1), by, Math.max(1, x1 - x0 - 1), 1)
    g.fillStyle = look.faceDark
    g.fillRect(x0, y1 - 1, x1 - x0, 1)
  }
}

/** Vertical bamboo stalks, 3 px wide with a 1 px gap, with a node ring at a height of their own. */
function drawBambooFace(g: CanvasRenderingContext2D, x: number, y: number, c: number, seed: number, look: Look) {
  g.fillStyle = look.faceMortar
  g.fillRect(x, y + 2, TILE, 14)
  for (let i = 0; i < 4; i++) {
    const sx = x + i * 4
    const stalk = c * 4 + i
    const t = hash2(stalk, 0, seed + 13)
    g.fillStyle = pick(look.faces, t)
    g.fillRect(sx, y + 2, 3, 14)
    g.fillStyle = look.faceLight
    g.fillRect(sx, y + 2, 1, 14)
    g.fillStyle = look.faceDark
    g.fillRect(sx + 2, y + 2, 1, 14)
    // nodes every 6 px, phase per stalk
    const off = Math.floor(hash2(stalk, 1, seed + 13) * 6)
    for (let ny = y + 3 + off; ny < y + 16; ny += 6) {
      g.fillStyle = look.faceDark
      g.fillRect(sx, ny, 3, 1)
      g.fillStyle = look.faceLight
      g.fillRect(sx, ny + 1, 3, 1)
    }
  }
}

/** Big translucent ice blocks: two courses of 8 px blocks with pale frost joints and a glint. */
function drawIceFace(g: CanvasRenderingContext2D, x: number, y: number, c: number, r: number, seed: number, look: Look) {
  const rng = tileRng(c, r, seed + 11)
  g.fillStyle = look.faceMortar
  g.fillRect(x, y + 2, TILE, 14)
  for (let i = 0; i < 2; i++) {
    const by = y + 2 + i * 7
    const bh = i === 0 ? 6 : 7
    const off = i === 1 ? 4 : 0
    for (let k = -1; k < 3; k++) {
      const bx = x + off + k * 8
      const x0 = Math.max(x, bx)
      const x1 = Math.min(x + TILE, bx + 7)
      if (x1 <= x0) continue
      g.fillStyle = pick(look.faces, hash2(Math.floor(bx / 8), r * 2 + i, seed + 11))
      g.fillRect(x0, by, x1 - x0, bh)
      g.fillStyle = look.faceLight
      g.fillRect(x0, by, x1 - x0, 1)
      g.fillStyle = look.faceDark
      g.fillRect(x0, by + bh - 1, x1 - x0, 1)
    }
  }
  // a glint: a short bright diagonal
  if (rng() < 0.7) {
    let px = 2 + Math.floor(rng() * 8)
    let py = 6 + Math.floor(rng() * 6)
    g.fillStyle = look.faceLight
    for (let i = 0; i < 3 && px < 15 && py > 2; i++) {
      g.fillRect(x + px, y + py, 1, 1)
      px++
      py--
    }
  }
}

/** Flat metal panels with a seam and four rivets. */
function drawPanelFace(g: CanvasRenderingContext2D, x: number, y: number, c: number, r: number, seed: number, look: Look) {
  g.fillStyle = pick(look.faces, hash2(c, r, seed + 11))
  g.fillRect(x, y + 2, TILE, 14)
  g.fillStyle = look.faceLight
  g.fillRect(x, y + 2, TILE, 1)
  g.fillStyle = look.faceMortar
  g.fillRect(x, y + 9, TILE, 1)
  g.fillRect(x + 15, y + 2, 1, 14)
  g.fillStyle = look.faceDark
  for (const [rx, ry] of [[2, 5], [12, 5], [2, 12], [12, 12]] as const) g.fillRect(x + rx, y + ry, 1, 1)
}

/** Two courses of big dressed blocks, 16 px wide, the lower course offset by half. */
function drawAshlarFace(g: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number, look: Look) {
  g.fillStyle = look.faceMortar
  g.fillRect(x, y + 2, TILE, 14)
  for (let i = 0; i < 2; i++) {
    const by = y + 2 + i * 7
    const bh = i === 0 ? 6 : 7
    const off = i === 1 ? 8 : 0
    for (let k = -1; k < 2; k++) {
      const bx = x + off + k * 16
      const x0 = Math.max(x, bx)
      const x1 = Math.min(x + TILE, bx + 15)
      if (x1 <= x0) continue
      g.fillStyle = pick(look.faces, hash2(Math.floor(bx / 16) * 2 + i, r, seed + 11))
      g.fillRect(x0, by, x1 - x0, bh)
      g.fillStyle = look.faceLight
      g.fillRect(x0, by, x1 - x0, 1)
    }
  }
}

/** A tall arched window with dark leaded panes, drawn over the face. */
function drawWindow(g: CanvasRenderingContext2D, x: number, y: number, c: number, r: number, seed: number, look: Look) {
  const wx = x + 4
  const wy = y + 3
  g.fillStyle = WINDOW_FRAME
  g.fillRect(wx, wy, 7, 11)
  const rng = tileRng(c, r, seed + 17)
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      g.fillStyle = pick(WINDOW_PANES, rng())
      g.fillRect(wx + 1 + i * 3, wy + 1 + j * 5, 2, 4)
    }
  }
  // round the arch by knocking the top corners back to stone and lighting the keystone
  g.fillStyle = pick(look.faces, hash2(c, r, seed + 11))
  g.fillRect(wx, wy, 1, 1)
  g.fillRect(wx + 6, wy, 1, 1)
  g.fillStyle = PAL.bone
  g.fillRect(wx + 3, wy, 1, 1)
}

// ---------------------------------------------------------------------------------------------
// Pits, grass, debris, shadows

function drawPit(g: CanvasRenderingContext2D, m: ArenaMap, c: number, r: number, seed: number, look: Look) {
  const x = c * TILE
  const y = r * TILE
  g.fillStyle = look.pit
  g.fillRect(x, y, TILE, TILE)
  const rng = tileRng(c, r, seed + 5)
  g.fillStyle = look.pitWallDark
  for (let i = 0; i < 3; i++) g.fillRect(x + Math.floor(rng() * 16), y + 6 + Math.floor(rng() * 10), 1, 1)

  // far (north) inner wall is visible from this camera angle
  if (tileAt(m, c, r - 1) !== TileKind.Pit) {
    g.fillStyle = look.pitWall
    g.fillRect(x, y, TILE, 2)
    g.fillStyle = look.pitWallDark
    g.fillRect(x, y + 2, TILE, 3)
    g.fillStyle = rgba(look.pitWallDark, 0.5)
    g.fillRect(x, y + 5, TILE, 2)
  }
  g.fillStyle = look.pitWallDark
  if (tileAt(m, c - 1, r) !== TileKind.Pit) g.fillRect(x, y, 1, TILE)
  if (tileAt(m, c + 1, r) !== TileKind.Pit) g.fillRect(x + 15, y, 1, TILE)
}

function drawPitRims(g: CanvasRenderingContext2D, m: ArenaMap, c: number, r: number, look: Look) {
  const x = c * TILE
  const y = r * TILE
  g.fillStyle = look.floorLight
  if (tileAt(m, c, r - 1) === TileKind.Pit) g.fillRect(x, y, TILE, 1)
  if (tileAt(m, c, r + 1) === TileKind.Pit) g.fillRect(x, y + 15, TILE, 1)
  if (tileAt(m, c - 1, r) === TileKind.Pit) g.fillRect(x, y, 1, TILE)
  if (tileAt(m, c + 1, r) === TileKind.Pit) g.fillRect(x + 15, y, 1, TILE)
}

function drawGrass(g: CanvasRenderingContext2D, m: ArenaMap, c: number, r: number, seed: number, grassAt: GrassAt) {
  const x = c * TILE
  const y = r * TILE
  const rng = tileRng(c, r, seed + 7)
  const standing = (cc: number, rr: number) => tileAt(m, cc, rr) === TileKind.Grass && grassAt(cc, rr) === 'full'
  const openW = !standing(c - 1, r)
  const openE = !standing(c + 1, r)
  const openN = !standing(c, r - 1)
  const openS = !standing(c, r + 1)
  g.fillStyle = PAL.grassBase
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const edge = (px < 2 && openW) || (px > 13 && openE) || (py < 2 && openN) || (py > 13 && openS)
      if (!edge || rng() < 0.5) g.fillRect(x + px, y + py, 1, 1)
    }
  }
  const blades = 12 + Math.floor(rng() * 5)
  for (let i = 0; i < blades; i++) {
    const bx = Math.floor(rng() * 16)
    const by = 2 + Math.floor(rng() * 14)
    const h = 2 + Math.floor(rng() * 3)
    g.fillStyle = PAL.grass[Math.floor(rng() * PAL.grass.length)]
    g.fillRect(x + bx, y + by - h + 1, 1, h)
    if (rng() < 0.4 && bx < 15) g.fillRect(x + bx + 1, y + by - h + 2, 1, 1)
  }
}

/** Cut grass: stubble on the bare floor; sprouting grass adds a few short bright blades. */
function drawStubble(g: CanvasRenderingContext2D, c: number, r: number, seed: number, sprout: boolean) {
  const x = c * TILE
  const y = r * TILE
  const rng = tileRng(c, r, seed + 9)
  const n = 10 + Math.floor(rng() * 6)
  for (let i = 0; i < n; i++) {
    const bx = Math.floor(rng() * 16)
    const by = 1 + Math.floor(rng() * 15)
    g.fillStyle = rng() < 0.7 ? PAL.grassCut : PAL.grassBase
    g.fillRect(x + bx, y + by, 1, 1)
  }
  if (sprout) {
    g.fillStyle = PAL.grassSprout
    for (let i = 0; i < 6; i++) {
      const bx = Math.floor(rng() * 16)
      const by = 2 + Math.floor(rng() * 14)
      g.fillRect(x + bx, y + by - 1, 1, 2)
    }
  }
}

function drawDebris(g: CanvasRenderingContext2D, m: ArenaMap, rng: Rng, count: number) {
  if (count <= 0) return
  const decals = Object.values(DEBRIS).map((rows) => spriteFromRows(rows, PROP_KEY, 'debris'))
  const floorTiles: number[] = []
  for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === TileKind.Floor) floorTiles.push(i)
  if (!floorTiles.length) return
  for (let i = 0; i < count; i++) {
    const t = floorTiles[Math.floor(rng() * floorTiles.length)]
    const c = t % m.cols
    const r = Math.floor(t / m.cols)
    const d = decals[Math.floor(rng() * decals.length)]
    const x = c * TILE + 1 + Math.floor(rng() * (TILE - d.w - 2))
    const y = r * TILE + 1 + Math.floor(rng() * (TILE - d.h - 2))
    g.globalAlpha = 0.6 + rng() * 0.4
    g.drawImage(d.img, x, y)
  }
  g.globalAlpha = 1
}

function drawWallShadow(g: CanvasRenderingContext2D, m: ArenaMap, c: number, r: number, look: Look) {
  if (tileAt(m, c, r) === TileKind.Wall) return
  const x = c * TILE
  const y = r * TILE
  if (tileAt(m, c, r - 1) === TileKind.Wall) {
    const grad = g.createLinearGradient(0, y, 0, y + 7)
    grad.addColorStop(0, shade(look, 0.65))
    grad.addColorStop(1, shade(look, 0))
    g.fillStyle = grad
    g.fillRect(x, y, TILE, 7)
  }
  if (tileAt(m, c - 1, r) === TileKind.Wall) {
    g.fillStyle = shade(look, 0.45)
    g.fillRect(x, y, 1, TILE)
    g.fillStyle = shade(look, 0.2)
    g.fillRect(x + 1, y, 1, TILE)
  }
  if (tileAt(m, c + 1, r) === TileKind.Wall) {
    g.fillStyle = shade(look, 0.45)
    g.fillRect(x + 15, y, 1, TILE)
    g.fillStyle = shade(look, 0.2)
    g.fillRect(x + 14, y, 1, TILE)
  }
}

// ---------------------------------------------------------------------------------------------

/** The ground of one cell: floor, ice or the pit floor. */
function drawBase(g: CanvasRenderingContext2D, m: ArenaMap, c: number, r: number, seed: number, look: Look) {
  const k = tileAt(m, c, r)
  if (k === TileKind.Pit) drawPit(g, m, c, r, seed, look)
  else if (k === TileKind.Ice) drawIce(g, c, r, seed)
  else if (k === TileKind.Crumble) drawCrumble(g, c, r, seed, look)
  else if (onFloor(k)) drawFloor(g, c, r, seed, look)
}

/** What sits on the ground of one cell: grass or stubble, grates, belts, pit rims. */
function drawOverlay(g: CanvasRenderingContext2D, m: ArenaMap, c: number, r: number, seed: number, grassAt: GrassAt, look: Look) {
  const k = tileAt(m, c, r)
  switch (k) {
    case TileKind.Grass: {
      const grass = grassAt(c, r)
      if (grass === 'full') drawGrass(g, m, c, r, seed, grassAt)
      else drawStubble(g, c, r, seed, grass === 'sprout')
      break
    }
    case TileKind.Spikes:
      drawSpikeGrate(g, c, r)
      break
    case TileKind.Vent:
      drawVentGrate(g, c, r)
      break
    case TileKind.BeltL:
    case TileKind.BeltR:
    case TileKind.BeltU:
    case TileKind.BeltD:
      drawBeltBase(g, k, c, r)
      break
    default:
      break
  }
  if (k === TileKind.Floor || k === TileKind.Ice || k === TileKind.Crumble) drawPitRims(g, m, c, r, look)
}

function drawWall(g: CanvasRenderingContext2D, m: ArenaMap, c: number, r: number, seed: number, look: Look) {
  if (tileAt(m, c, r + 1) !== TileKind.Wall) drawWallFace(g, m, c, r, seed, look)
  else drawWallCap(g, m, c, r, seed, look)
}

const FULL: GrassAt = () => 'full'

/** Renders everything that never changes during a round into one canvas, in the given look. */
export function renderArenaStatic(m: ArenaMap, seed: number, grassAt: GrassAt = FULL, look: Look = LOOKS.stone): HTMLCanvasElement {
  const cv = makeCanvas(m.cols * TILE, m.rows * TILE)
  const g = ctx2d(cv)
  const rng = mulberry32(seed)

  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) drawBase(g, m, c, r, seed, look)
  drawDebris(g, m, rng, Math.round(m.cols * m.rows * 0.03 * look.debris))
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) drawOverlay(g, m, c, r, seed, grassAt, look)
  for (const p of m.powerups) drawPowerupMark(g, p.c, p.r, look)
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) if (tileAt(m, c, r) === TileKind.Wall) drawWall(g, m, c, r, seed, look)
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) drawWallShadow(g, m, c, r, look)
  return cv
}

/**
 * Redraws the given cells and their four neighbours in place (grass cut or regrown, a floor tile
 * that crumbled into pit). Walls never change, so wall cells are left alone; the loose debris
 * decals on a redrawn floor tile are lost, which nobody will miss.
 */
export function redrawCells(g: CanvasRenderingContext2D, m: ArenaMap, cells: { c: number; r: number }[], seed: number, grassAt: GrassAt, look: Look = LOOKS.stone) {
  const todo = new Set<number>()
  for (const { c, r } of cells) {
    for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const cc = c + dc
      const rr = r + dr
      if (cc < 0 || rr < 0 || cc >= m.cols || rr >= m.rows) continue
      if (tileAt(m, cc, rr) === TileKind.Wall) continue
      todo.add(rr * m.cols + cc)
    }
  }
  for (const i of todo) {
    const c = i % m.cols
    const r = Math.floor(i / m.cols)
    g.clearRect(c * TILE, r * TILE, TILE, TILE)
    drawBase(g, m, c, r, seed, look)
    drawOverlay(g, m, c, r, seed, grassAt, look)
    drawWallShadow(g, m, c, r, look)
  }
}
