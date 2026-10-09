import { PAL, PROP_KEY } from '../art/palette.ts'
import { DEBRIS } from '../art/props.ts'
import { hash2, hashInt, mulberry32, type Rng } from '../util/rng.ts'
import { ctx2d, makeCanvas, spriteFromRows } from './pixelart.ts'

export const TILE = 16

export enum TileKind {
  Floor = 0,
  Wall = 1,
  Pit = 2,
  Grass = 3,
}

export type PropKind = 'crate' | 'barrel' | 'torch'

export interface PropSpawn {
  kind: PropKind
  c: number
  r: number
}

export interface ArenaMap {
  cols: number
  rows: number
  tiles: Uint8Array
  props: PropSpawn[]
  spawns: { c: number; r: number }[]
}

/**
 * Map legend: # wall, T wall with torch, . floor, ~ pit, " tall grass,
 * C crate (on floor), B barrel (on floor), 1-6 spawn point (on floor).
 */
export function parseArena(rows: string[]): ArenaMap {
  const nrows = rows.length
  const cols = rows[0].length
  const tiles = new Uint8Array(cols * nrows)
  const props: PropSpawn[] = []
  const spawns: { c: number; r: number }[] = []
  for (let r = 0; r < nrows; r++) {
    if (rows[r].length !== cols) throw new Error(`arena row ${r} has width ${rows[r].length}, expected ${cols}`)
    for (let c = 0; c < cols; c++) {
      const ch = rows[r][c]
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
        case 'C':
          props.push({ kind: 'crate', c, r })
          break
        case 'B':
          props.push({ kind: 'barrel', c, r })
          break
        default:
          if (ch >= '1' && ch <= '6') spawns[Number(ch) - 1] = { c, r }
          else throw new Error(`arena: unknown tile "${ch}" at ${c},${r}`)
      }
      tiles[r * cols + c] = k
    }
  }
  return { cols, rows: nrows, tiles, props, spawns }
}

export function tileAt(m: ArenaMap, c: number, r: number): TileKind {
  if (c < 0 || r < 0 || c >= m.cols || r >= m.rows) return TileKind.Wall
  return m.tiles[r * m.cols + c] as TileKind
}

function tileRng(c: number, r: number, seed: number): Rng {
  return mulberry32(hashInt(c, r, seed))
}

function drawFloor(g: CanvasRenderingContext2D, c: number, r: number, seed: number) {
  const x = c * TILE
  const y = r * TILE
  // 2×2-tile slabs; shade chosen per slab
  const sx = c >> 1
  const sy = r >> 1
  const shade = PAL.floor[Math.floor(hash2(sx, sy, seed) * PAL.floor.length)]
  g.fillStyle = shade
  g.fillRect(x, y, TILE, TILE)

  const left = (c & 1) === 0
  const top = (r & 1) === 0
  g.fillStyle = PAL.floorMortar
  if (left) g.fillRect(x, y, 1, TILE)
  if (top) g.fillRect(x, y, TILE, 1)
  g.fillStyle = PAL.floorLight
  if (left) g.fillRect(x + 1, y + (top ? 1 : 0), 1, TILE - (top ? 1 : 0))
  if (top) g.fillRect(x + (left ? 1 : 0), y + 1, TILE - (left ? 1 : 0), 1)

  const rng = tileRng(c, r, seed)
  const specks = 2 + Math.floor(rng() * 4)
  for (let i = 0; i < specks; i++) {
    const px = 2 + Math.floor(rng() * 13)
    const py = 2 + Math.floor(rng() * 13)
    g.fillStyle = rng() < 0.5 ? PAL.floorSpeck : PAL.floorCrack
    g.fillRect(x + px, y + py, 1, 1)
  }
  if (rng() < 0.14) {
    // short random-walk crack
    let px = 3 + Math.floor(rng() * 10)
    let py = 3 + Math.floor(rng() * 10)
    g.fillStyle = PAL.floorCrack
    const len = 4 + Math.floor(rng() * 5)
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
}

function drawWallCap(g: CanvasRenderingContext2D, m: ArenaMap, c: number, r: number, seed: number) {
  const x = c * TILE
  const y = r * TILE
  g.fillStyle = PAL.wallCap
  g.fillRect(x, y, TILE, TILE)
  // 16×8 stone blocks in a running bond; low-contrast joints so the cap reads as one dark mass
  g.fillStyle = PAL.wallCapJoint
  g.fillRect(x, y + 7, TILE, 1)
  g.fillRect(x, y + 15, TILE, 1)
  const odd = (r * 2) & 1
  g.fillRect(x + (odd ? 7 : 15), y, 1, 8)
  g.fillRect(x + (odd ? 15 : 7), y + 8, 1, 8)
  const rng = tileRng(c, r, seed + 3)
  g.fillStyle = PAL.wallCapLight
  const n = 2 + Math.floor(rng() * 3)
  for (let i = 0; i < n; i++) g.fillRect(x + Math.floor(rng() * 16), y + Math.floor(rng() * 16), 1, 1)

  // lit edges where the cap meets open space
  g.fillStyle = PAL.wallCapEdge
  if (tileAt(m, c, r - 1) !== TileKind.Wall) g.fillRect(x, y, TILE, 1)
  if (tileAt(m, c - 1, r) !== TileKind.Wall) g.fillRect(x, y, 1, TILE)
  if (tileAt(m, c + 1, r) !== TileKind.Wall) g.fillRect(x + 15, y, 1, TILE)
}

function drawWallFace(g: CanvasRenderingContext2D, m: ArenaMap, c: number, r: number, seed: number) {
  const x = c * TILE
  const y = r * TILE
  // cap lip along the top
  g.fillStyle = PAL.wallCapEdge
  g.fillRect(x, y, TILE, 1)
  g.fillStyle = PAL.wallCapLight
  g.fillRect(x, y + 1, TILE, 1)
  // bricks: three courses of 4px bricks + 1px mortar, 8px wide, alternate courses offset by 4
  g.fillStyle = PAL.brickMortar
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
      const idx = Math.floor(hash2(Math.floor(bx / 8), course, seed + 11) * PAL.brick.length)
      g.fillStyle = PAL.brick[idx]
      g.fillRect(x0, by, x1 - x0, 4)
      g.fillStyle = PAL.brickLight
      g.fillRect(x0, by, x1 - x0, 1)
    }
  }
  // ground contact darkening
  g.fillStyle = 'rgba(8,5,12,0.35)'
  g.fillRect(x, y + 13, TILE, 3)
  // ends of internal walls
  g.fillStyle = PAL.wallCapDark
  if (tileAt(m, c - 1, r) !== TileKind.Wall) g.fillRect(x, y, 1, TILE)
  if (tileAt(m, c + 1, r) !== TileKind.Wall) g.fillRect(x + 15, y, 1, TILE)
}

function drawPit(g: CanvasRenderingContext2D, m: ArenaMap, c: number, r: number, seed: number) {
  const x = c * TILE
  const y = r * TILE
  g.fillStyle = PAL.pit
  g.fillRect(x, y, TILE, TILE)
  const rng = tileRng(c, r, seed + 5)
  g.fillStyle = PAL.pitWallDark
  for (let i = 0; i < 3; i++) g.fillRect(x + Math.floor(rng() * 16), y + 6 + Math.floor(rng() * 10), 1, 1)

  // far (north) inner wall is visible from this camera angle
  if (tileAt(m, c, r - 1) !== TileKind.Pit) {
    g.fillStyle = PAL.pitWall
    g.fillRect(x, y, TILE, 2)
    g.fillStyle = PAL.pitWallDark
    g.fillRect(x, y + 2, TILE, 3)
    g.fillStyle = 'rgba(45,37,51,0.5)'
    g.fillRect(x, y + 5, TILE, 2)
  }
  g.fillStyle = PAL.pitWallDark
  if (tileAt(m, c - 1, r) !== TileKind.Pit) g.fillRect(x, y, 1, TILE)
  if (tileAt(m, c + 1, r) !== TileKind.Pit) g.fillRect(x + 15, y, 1, TILE)
}

function drawPitRims(g: CanvasRenderingContext2D, m: ArenaMap, c: number, r: number) {
  const x = c * TILE
  const y = r * TILE
  g.fillStyle = PAL.floorLight
  if (tileAt(m, c, r - 1) === TileKind.Pit) g.fillRect(x, y, TILE, 1)
  if (tileAt(m, c, r + 1) === TileKind.Pit) g.fillRect(x, y + 15, TILE, 1)
  if (tileAt(m, c - 1, r) === TileKind.Pit) g.fillRect(x, y, 1, TILE)
  if (tileAt(m, c + 1, r) === TileKind.Pit) g.fillRect(x + 15, y, 1, TILE)
}

function drawGrass(g: CanvasRenderingContext2D, m: ArenaMap, c: number, r: number, seed: number) {
  const x = c * TILE
  const y = r * TILE
  const rng = tileRng(c, r, seed + 7)
  const openW = tileAt(m, c - 1, r) !== TileKind.Grass
  const openE = tileAt(m, c + 1, r) !== TileKind.Grass
  const openN = tileAt(m, c, r - 1) !== TileKind.Grass
  const openS = tileAt(m, c, r + 1) !== TileKind.Grass
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

function drawDebris(g: CanvasRenderingContext2D, m: ArenaMap, rng: Rng, count: number) {
  const decals = Object.values(DEBRIS).map((rows) => spriteFromRows(rows, PROP_KEY, 'debris'))
  const floorTiles: number[] = []
  for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === TileKind.Floor) floorTiles.push(i)
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

function drawWallShadows(g: CanvasRenderingContext2D, m: ArenaMap) {
  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) {
      if (tileAt(m, c, r) === TileKind.Wall) continue
      const x = c * TILE
      const y = r * TILE
      if (tileAt(m, c, r - 1) === TileKind.Wall) {
        const grad = g.createLinearGradient(0, y, 0, y + 7)
        grad.addColorStop(0, 'rgba(8,5,12,0.65)')
        grad.addColorStop(1, 'rgba(8,5,12,0)')
        g.fillStyle = grad
        g.fillRect(x, y, TILE, 7)
      }
      if (tileAt(m, c - 1, r) === TileKind.Wall) {
        g.fillStyle = 'rgba(8,5,12,0.45)'
        g.fillRect(x, y, 1, TILE)
        g.fillStyle = 'rgba(8,5,12,0.2)'
        g.fillRect(x + 1, y, 1, TILE)
      }
      if (tileAt(m, c + 1, r) === TileKind.Wall) {
        g.fillStyle = 'rgba(8,5,12,0.45)'
        g.fillRect(x + 15, y, 1, TILE)
        g.fillStyle = 'rgba(8,5,12,0.2)'
        g.fillRect(x + 14, y, 1, TILE)
      }
    }
  }
}

/** Renders everything that never changes during a round into one canvas. */
export function renderArenaStatic(m: ArenaMap, seed: number): HTMLCanvasElement {
  const cv = makeCanvas(m.cols * TILE, m.rows * TILE)
  const g = ctx2d(cv)
  const rng = mulberry32(seed)

  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) {
      const k = tileAt(m, c, r)
      if (k === TileKind.Floor || k === TileKind.Grass) drawFloor(g, c, r, seed)
      else if (k === TileKind.Pit) drawPit(g, m, c, r, seed)
    }
  }
  drawDebris(g, m, rng, 26)
  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) {
      const k = tileAt(m, c, r)
      if (k === TileKind.Grass) drawGrass(g, m, c, r, seed)
      else if (k === TileKind.Floor) drawPitRims(g, m, c, r)
    }
  }
  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) {
      if (tileAt(m, c, r) !== TileKind.Wall) continue
      if (tileAt(m, c, r + 1) !== TileKind.Wall) drawWallFace(g, m, c, r, seed)
      else drawWallCap(g, m, c, r, seed)
    }
  }
  drawWallShadows(g, m)
  return cv
}
