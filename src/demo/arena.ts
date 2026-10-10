/**
 * Demo arenas. Map legend is in render/tiles.ts (parseArena); anything with a rail, a size or a
 * partner (platforms, gates, crushers, carts, chandeliers, portals) is in the arena's hazard list,
 * in tile coords.
 *
 * The default demo arena is STRIP: nine rooms side by side, one per docs/02 theme, each about a
 * screen wide, joined by two doorways in a one-tile wall. The camera follows the local player along
 * it so every tile and hazard from 02 can be walked up to and poked at.
 */

/** A rail waypoint in tile coords. Platforms use the top-left tile; everything else the tile centre. */
export type TilePt = [number, number]
/** A side of a tile: the way a portal mouth faces. */
export type Dir = 's' | 'n' | 'e' | 'w'

export type HazardDef =
  | { kind: 'platform'; rail: TilePt[]; w: number; h: number; speed?: number; dwell?: number; phase?: number }
  | { kind: 'crusher'; look: 'saw' | 'pendulum' | 'boulder'; rail: TilePt[]; anchor?: TilePt; speed?: number; dwell?: number; phase?: number }
  | { kind: 'cart'; rail: TilePt[]; speed?: number; dwell?: number; phase?: number }
  | { kind: 'gate'; tiles: TilePt[]; phase?: number }
  | { kind: 'chandelier'; c: number; r: number }
  /**
   * Two wall tiles, Portal-2 style: `a` is the blue mouth, `b` the orange one. Each faces its open
   * side (the first of south, north, east, west that is not wall; give `aFace` / `bFace` when both
   * sides are open, as on a wall between two rooms). Go into one and you come out of the other,
   * turned to match, speed kept; works both ways.
   */
  | { kind: 'portal'; a: TilePt; b: TilePt; aFace?: Dir; bFace?: Dir }
  /** Render-only: the lights go down between these columns (inclusive). */
  | { kind: 'dark'; c0: number; c1: number }

export interface ArenaDef {
  rows: string[]
  hazards: HazardDef[]
  zones: { name: string; c0: number; c1: number }[]
  /** Key into LOOKS (src/render/looks.ts): the environment the room is drawn in. Default stone. */
  look?: string
  /**
   * 'chandeliers': the room has no torches; its chandeliers are the only lights, and the ambient
   * light falls as they are dropped (Aaron, 2026-10-09: "if you don't have the chandeliers anymore,
   * there's no light").
   */
  lightSource?: 'chandeliers'
}

/** Movement test floor, 40×21: mostly open, one pillar, two pits and a few props to bounce off. */
export const ARENA_FLOOR: ArenaDef = {
  rows: [
    '########################################',
    '####T########T#########T########T#######',
    '#......................................#',
    '#..1................................2..#',
    '#......................................#',
    '#......................................#',
    '#..........""""...........~~~..........#',
    '#..........""""...........~~~..........#',
    '#......................................#',
    '#......................................#',
    '#.................##...................#',
    '#.................##...................#',
    '#......................................#',
    '#......C...............................#',
    '#......C....................B..........#',
    '#......................................#',
    '#......................................#',
    '#..........~~~.............""""........#',
    '#..........~~~.............""""........#',
    '#..3................................4..#',
    '########################################',
  ],
  hazards: [],
  zones: [{ name: 'FLOOR', c0: 0, c1: 39 }],
}

/** The original 30×16 brawl layout used for the look demo (`?arena=brawl`). */
export const ARENA_BRAWL: ArenaDef = {
  rows: [
    '##############################',
    '####T#######T#######T######T##',
    '#............................#',
    '#..1C......~~~~......""""..2.#',
    '#..........~~~~......""""....#',
    '#....B.....~~~~......""""....#',
    '#............................#',
    '#.....##..........##.........#',
    '#.....##.....................#',
    '#..""".........C.............#',
    '#..""".........C.......B.....#',
    '#..""".......................#',
    '#.........~~~~.........C.....#',
    '#..3......~~~~.............4.#',
    '#............................#',
    '##############################',
  ],
  hazards: [],
  zones: [{ name: 'BRAWL', c0: 0, c1: 29 }],
}

// ---------------------------------------------------------------- the strip

/** One room of the strip: 18 interior rows (map rows 2–19); the wall rows are added for it. */
interface Zone {
  name: string
  /** Columns of row 1 that get a torch. */
  torches: number[]
  rows: string[]
  hazards?: HazardDef[]
  dark?: boolean
}

export const ZONE_ROWS = 21

/** Spawns 1–4 live here so `?bots=` opponents start near the local player. */
const CELLAR: Zone = {
  name: 'CELLAR',
  torches: [6, 16, 26],
  rows: [
    '..............................',
    '..............................',
    '...1..........................',
    '..............................',
    '........C.....................',
    '........C........BB...........',
    '..............................',
    '..............................',
    '...2.......##.................',
    '...........##.........~~......',
    '......................~~......',
    '..............................',
    '....C.........................',
    '....C..............B..........',
    '...3..........................',
    '..............................',
    '...............C..............',
    '...4..........................',
  ],
}

const GARDEN: Zone = {
  name: 'GARDEN',
  torches: [5, 15, 25],
  rows: [
    '..............................',
    '....""""""....................',
    '....""""""........""""""......',
    '....""""""........""""""......',
    '....""""""........""""""......',
    '..................""""""......',
    '..............C...............',
    '..............C...............',
    '..............................',
    '......""""....................',
    '......""""..........."""""....',
    '......""""..........."""""....',
    '...........C........."""""....',
    '..............................',
    '...."""""""""""...............',
    '...."""""""""""........B......',
    '..............................',
    '..............................',
  ],
}

/**
 * A pit band with a crumbling bridge and two lifts, a corridor that wraps through the room's side
 * walls (the portal pair is added to the strip below, since it sits in the dividing walls), and a
 * lake with a ferry.
 */
const PITS: Zone = {
  name: 'PITS',
  torches: [8, 17, 26],
  rows: [
    '..................................',
    '...~~~~~~~~~~~~%%~~~~~~~~~~~~~~...',
    '...~~~~~~~~~~~~%%~~~~~~~~~~~~~~...',
    '...~~~~~~~~~~~~%%~~~~~~~~~~~~~~...',
    '...~~~~~~~~~~~~%%~~~~~~~~~~~~~~...',
    '...~~~~~~~~~~~~%%~~~~~~~~~~~~~~...',
    '...~~~~~~~~~~~~%%~~~~~~~~~~~~~~...',
    '..................................',
    '..................................',
    '..................................',
    '..................................',
    '.....~~~~~~~~~~~~~~~~~~~~~~~~.....',
    '.....~~~~~..~~~~~~~~~~..~~~~~.....',
    '.....~~~~~..~~~~~~~~~~..~~~~~.....',
    '.....~~~~~~~~~~~~~~~~~~~~~~~~.....',
    '..................................',
    '..................................',
    '..................................',
  ],
  hazards: [
    { kind: 'platform', rail: [[7, 2], [7, 8]], w: 2, h: 2 },
    { kind: 'platform', rail: [[25, 2], [25, 8]], w: 2, h: 2, phase: 222 },
    { kind: 'platform', rail: [[3, 14], [29, 14]], w: 2, h: 2, speed: 1 },
  ],
}

/** Fire vents in two phases, belts feeding a pit from three sides, barrels. */
const FORGE: Zone = {
  name: 'FORGE',
  torches: [4, 12, 20, 28],
  rows: [
    '................................',
    '...*@*@*@*@.........*@*@*@*@....',
    '................................',
    '...@*@*@*@*.........@*@*@*@*....',
    '................................',
    '................................',
    '.....>>>>>>>>>>~~~<<<<<<<<<<....',
    '.....>>>>>>>>>>~~~<<<<<<<<<<....',
    '...............~~~..............',
    '..............AAAAA.............',
    '..............AAAAA.............',
    '..............AAAAA.............',
    '................................',
    '...B....................B.......',
    '...**....VVVV...........***.....',
    '...**....VVVV...........***.....',
    '.........****...................',
    '................................',
  ],
}

/** Spike stripes in both phases, bumpers to ricochet off, a couple of crates. */
const ARMORY: Zone = {
  name: 'ARMORY',
  torches: [7, 15, 23],
  rows: [
    '..............................',
    '...^^^^&&&&^^^^&&&&^^^^.......',
    '...^^^^&&&&^^^^&&&&^^^^.......',
    '..............................',
    '..........o...........o.......',
    '..............................',
    '..&&&&&&&&&&&&&&&&&&&&&&......',
    '..............................',
    '......o.....C.....o...........',
    '..............................',
    '..^^^^^^^^^^^^^^^^^^^^^^......',
    '..............................',
    '...........o.........C........',
    '....&^&^&^&^&^&^&^&^&^&.......',
    '....&^&^&^&^&^&^&^&^&^&.......',
    '..............................',
    '...o.......................o..',
    '..............................',
  ],
}

/**
 * One sheet of ice with a pit hole in the middle and patches of plain floor to catch yourself on
 * (Aaron, 2026-10-09), plus bumpers and props to skid into.
 */
const ICEBOX: Zone = {
  name: 'ICEBOX',
  torches: [5, 16, 27],
  rows: [
    '................................',
    '..____________________________..',
    '..____..________________...___..',
    '..____..________________...___..',
    '..______o_____________o_______..',
    '..____________________________..',
    '..____________~~~~____________..',
    '..______...__~~~~~~___________..',
    '..______...__~~~~~~___________..',
    '..____________~~~~____________..',
    '..____________________________..',
    '..______o_____________o_______..',
    '..__.._____________.._________..',
    '..__..__________C__.._________..',
    '..____________________________..',
    '..___C________________B_______..',
    '..____________________________..',
    '................................',
  ],
}

/** Two walls with gated doorways in opposite phase, pendulums over the top corridor. */
const GATEHOUSE: Zone = {
  name: 'GATEHOUSE',
  torches: [4, 14, 24, 30],
  rows: [
    '..................................',
    '........#...........#.............',
    '........#...........#.............',
    '....................#.............',
    '....................#.....C.......',
    '........#.........................',
    '........#.........................',
    '........#...........#.............',
    '........#...........#.............',
    '........#...........#.............',
    '........#...........#.......B.....',
    '....................#.............',
    '....................#.............',
    '........#.........................',
    '........#.........................',
    '........#...........#.............',
    '..................................',
    '..................................',
  ],
  hazards: [
    { kind: 'gate', tiles: [[8, 5], [8, 6], [8, 13], [8, 14]] },
    { kind: 'gate', tiles: [[20, 7], [20, 8], [20, 15], [20, 16]], phase: 322 },
    { kind: 'crusher', look: 'pendulum', rail: [[10, 2], [18, 2]], anchor: [14, 1], dwell: 10 },
    { kind: 'crusher', look: 'pendulum', rail: [[22, 2], [31, 2]], anchor: [26, 1], dwell: 10, phase: 60 },
  ],
}

/** Two cart lines, a saw in a groove, a boulder in a trench, crates in the way. */
const MINE: Zone = {
  name: 'MINE',
  torches: [6, 15, 24, 33],
  rows: [
    '....................................',
    '....................................',
    '....................................',
    '......C.........C.........C.........',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....~~~~~~.........~~~~~~~..........',
    '....~~~~~~.........~~~~~~~..........',
    '....................................',
    '....................................',
    '....................................',
    '....................................',
    '....C.....C.....C.....C.............',
    '............C...........C...........',
    '....................................',
    '....................................',
  ],
  hazards: [
    { kind: 'cart', rail: [[2, 3], [33, 3]], dwell: 60 },
    { kind: 'cart', rail: [[33, 18], [2, 18]], dwell: 60, phase: 100 },
    { kind: 'crusher', look: 'saw', rail: [[4, 7], [31, 7]], dwell: 20 },
    { kind: 'crusher', look: 'boulder', rail: [[3, 13], [32, 13]], dwell: 40, phase: 150 },
  ],
}

/** Dark: two torches, spike corridors, two chandeliers on chains a boomerang can knock down. */
const CRYPT: Zone = {
  name: 'CRYPT',
  torches: [3, 28],
  dark: true,
  rows: [
    '................................',
    '....5...........................',
    '................................',
    '......^^^^^^^^^^^^^^^^^^........',
    '................................',
    '................................',
    '..........##..........##........',
    '..........##..........##........',
    '................................',
    '......&&&&&&&&&&&&&&&&&&........',
    '...........................B....',
    '................................',
    '..........##..........##........',
    '..........##..........##........',
    '................................',
    '......^^^^^^^^^^^^^^^^^^........',
    '................................',
    '....6...........................',
  ],
  hazards: [
    { kind: 'chandelier', c: 10, r: 7 },
    { kind: 'chandelier', c: 23, r: 13 },
  ],
}

const STRIP_ZONES: Zone[] = [CELLAR, GARDEN, PITS, FORGE, ARMORY, ICEBOX, GATEHOUSE, MINE, CRYPT]

/** The dividing wall between two rooms: solid except for two doorways. */
function separatorAt(r: number): string {
  return (r >= 5 && r <= 9) || (r >= 12 && r <= 16) ? '.' : '#'
}

function shift(h: HazardDef, dc: number): HazardDef {
  const mv = (p: TilePt): TilePt => [p[0] + dc, p[1]]
  switch (h.kind) {
    case 'platform':
    case 'cart':
      return { ...h, rail: h.rail.map(mv) }
    case 'crusher':
      return { ...h, rail: h.rail.map(mv), anchor: h.anchor ? mv(h.anchor) : undefined }
    case 'gate':
      return { ...h, tiles: h.tiles.map(mv) }
    case 'chandelier':
      return { ...h, c: h.c + dc }
    case 'portal':
      return { ...h, a: mv(h.a), b: mv(h.b) }
    case 'dark':
      return { ...h, c0: h.c0 + dc, c1: h.c1 + dc }
  }
}

/** Lays the rooms out left to right with a wall between each, and offsets their hazards to match. */
export function concatZones(zones: Zone[]): ArenaDef {
  const rows: string[] = Array.from({ length: ZONE_ROWS }, () => '#')
  const hazards: HazardDef[] = []
  const zoneSpans: ArenaDef['zones'] = []
  let col = 1
  zones.forEach((z, zi) => {
    if (z.rows.length !== ZONE_ROWS - 3) throw new Error(`zone ${z.name}: ${z.rows.length} interior rows, expected ${ZONE_ROWS - 3}`)
    const w = z.rows[0].length
    z.rows.forEach((row, i) => {
      if (row.length !== w) throw new Error(`zone ${z.name}: row ${i + 2} is ${row.length} wide, expected ${w}`)
    })
    const torchRow = Array.from({ length: w }, (_, c) => (z.torches.includes(c) ? 'T' : '#')).join('')
    const full = ['#'.repeat(w), torchRow, ...z.rows, '#'.repeat(w)]
    for (let r = 0; r < ZONE_ROWS; r++) rows[r] += full[r]
    for (const h of z.hazards ?? []) hazards.push(shift(h, col))
    if (z.dark) hazards.push({ kind: 'dark', c0: col, c1: col + w - 1 })
    zoneSpans.push({ name: z.name, c0: col, c1: col + w - 1 })
    col += w
    if (zi < zones.length - 1) {
      for (let r = 0; r < ZONE_ROWS; r++) rows[r] += separatorAt(r)
      col++
    }
  })
  for (let r = 0; r < ZONE_ROWS; r++) rows[r] += '#'
  return { rows, hazards, zones: zoneSpans }
}

export const ARENA_STRIP: ArenaDef = concatZones(STRIP_ZONES)
{
  // two portal pairs (Aaron, 2026-10-09: "portals that take you to the other side of the map",
  // "styled like portal 2 - blue and orange and on the walls"). The blue mouth in the CELLAR's back
  // wall comes out of the orange one in the CRYPT's bottom wall, the far corner of the strip; and
  // the PITS corridor runs out through the room's left wall and back in through its right, so the
  // room wraps like a tunnel. Mouths in the dividing walls need their facing spelled out: both
  // sides of those walls are open.
  const zone = (name: string) => ARENA_STRIP.zones.find((z) => z.name === name)!
  ARENA_STRIP.hazards.push(
    { kind: 'portal', a: [zone('CELLAR').c0 + 20, 1], b: [zone('CRYPT').c0 + 16, ZONE_ROWS - 1] },
    { kind: 'portal', a: [zone('PITS').c0 - 1, 10], b: [zone('PITS').c1 + 1, 10], aFace: 'e', bFace: 'w' },
  )
}
