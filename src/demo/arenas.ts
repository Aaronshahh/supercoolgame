/**
 * The arena roster (docs/02 §7): the rooms a round is actually fought in, as opposed to the demo
 * strip in arena.ts, which is a showroom. One screen each. The rooms are not all the same rectangle
 * (Aaron, 2026-10-09: "the room should not be the same exact formatting size every single time …
 * use the same amount of total squares, but organize them in interesting ways that fit the room's
 * theme"): each has the Cellar's budget of open tiles, OPEN_BUDGET ± OPEN_TOLERANCE, laid out in a
 * footprint of its own inside a canvas of at most MAX_COLS × MAX_ROWS (the Cellar is 36 × 19; the
 * largest rooms are 40 wide or 22 tall, which still scales 2× in a laptop window).
 *
 * A room is written as its interior rows; `room()` wraps them in a one-tile wall ring plus a wall
 * row along the top that carries the torches. Hazard-list coordinates are MAP coordinates (the ones
 * `?at=c,r` and the validator use): interior column j is map column j + 1, interior row i is map
 * row i + 2. Each room is drawn in the look its theme maps to (src/render/looks.ts).
 *
 * Every room follows docs/notes-arena-design.md: one hazard family (the theme) plus one terrain
 * motif, left-right mirrored, six spawns in mirrored pairs, three power-up points (flanks plus one
 * in the risky middle), the centre a hazard or a block rather than a prize, at most two movers, no
 * belts, no carts. The Discotheque is the one dark room, by Aaron's call: its mirror balls are the
 * lights. Nine rooms, nine material worlds (docs/notes-environment-design.md): stone, sky, grove,
 * kitchen, laboratory, clockwork, pond, shrine, discotheque — room keys never change, titles do.
 *
 * `npm run check-arenas` validates every room here (src/demo/checkArenas.ts); `?arena=<key>` plays it.
 *
 *   column ruler for the rows:   0         1         2         3
 *                                0123456789012345678901234567890123456789
 */
import type { ArenaDef, HazardDef } from './arena.ts'

/** Largest canvas a room may need, in tiles, ring included: 640 × 366 px with the HUD. */
export const MAX_COLS = 40
export const MAX_ROWS = 22
/** Non-wall tiles per room: the Cellar's count, which every other room matches within the tolerance. */
export const OPEN_BUDGET = 520
export const OPEN_TOLERANCE = 0.04

export interface ArenaEntry extends ArenaDef {
  key: string
  title: string
  /** The hazard family the room is built around; picks the look too. */
  theme: string
  /** One line on what boomerang skill the room is for. */
  blurb: string
}

interface RoomSpec {
  key: string
  title: string
  theme: string
  blurb: string
  /** Interior columns that get a torch on the top wall row. The tile under each must be open. */
  torches?: number[]
  rows: string[]
  hazards?: HazardDef[]
  lightSource?: 'chandeliers'
}

/** Which look (src/render/looks.ts) each theme is drawn in. */
const LOOK_FOR_THEME: Record<string, string> = {
  blocks: 'stone',
  pits: 'sky',
  grass: 'bamboo',
  fire: 'kitchen',
  portals: 'lab',
  spikes: 'clockwork',
  ice: 'frost',
  gates: 'shrine',
  chandeliers: 'disco',
}

/** Wraps the interior rows in the wall ring and the torch row. */
export function room(spec: RoomSpec): ArenaEntry {
  const { key, title, theme, blurb, rows, torches = [], hazards = [], lightSource } = spec
  const cols = rows[0].length
  rows.forEach((row, i) => {
    if (row.length !== cols) throw new Error(`arena ${key}: interior row ${i} is ${row.length} wide, expected ${cols}`)
  })
  if (cols + 2 > MAX_COLS || rows.length + 3 > MAX_ROWS) throw new Error(`arena ${key}: ${cols + 2}×${rows.length + 3} is over ${MAX_COLS}×${MAX_ROWS}`)
  for (const c of torches) if (c < 0 || c >= cols || rows[0][c] === '#' || rows[0][c] === 'T') throw new Error(`arena ${key}: torch at column ${c} has no open floor under it`)
  const torchRow = Array.from({ length: cols }, (_, c) => (torches.includes(c) ? 'T' : '#')).join('')
  const full = ['#'.repeat(cols + 2), `#${torchRow}#`, ...rows.map((r) => `#${r}#`), '#'.repeat(cols + 2)]
  const look = LOOK_FOR_THEME[theme]
  if (!look) throw new Error(`arena ${key}: no look for theme "${theme}"`)
  return { key, title, theme, blurb, rows: full, hazards, zones: [{ name: title.toUpperCase(), c0: 0, c1: cols + 1 }], look, lightSource }
}

/**
 * The neutral room everything else is judged against: no lethal tile, no mover. Four 2×2 pillars
 * frame a central bowl with a barrel pair at each end of it; side pillars and crates break the
 * long rows so a cross-room kill needs a bank. Skill: banks off the pillars, lighting the barrel
 * pairs from range, opening lanes through the crates. The one plain rectangle (34 × 16), kept as
 * it was; its 520 open tiles set the budget for the others.
 */
const CELLAR = room({
  key: 'cellar',
  title: 'The Cellar',
  theme: 'blocks',
  blurb: 'banks off pillars, barrel chains, crates that open lanes',
  torches: [5, 12, 21, 28],
  rows: [
    '..................................',
    '...1..........C.5..C..........2...',
    '..................................',
    '.......B..................B.......',
    '..........##..........##..........',
    '..........##....BB....##..........',
    '.............C......C.............',
    '...##.C.p.......p........p.C.##...',
    '...##.C....................C.##...',
    '.............C......C.............',
    '..........##....BB....##..........',
    '..........##..........##..........',
    '.......B..................B.......',
    '..................................',
    '...3..........C..6.C..........4...',
    '..................................',
  ],
})

/**
 * A shattered ruin floating in daylight, wide and low (38 × 15), its corners long since fallen
 * away. Open sky splits it into a north and a south island, with a cloud sea drifting far below.
 * Crossings: the two ends, a stone bridge in the middle, two crumbling spans that go one-way after
 * their first use, and two drifting platforms. Skill: throws cross the sky where bodies cannot; a
 * boomerang hovering over the bridge denies it; platform timing. (The room key stays `pits`.)
 */
const PITS = room({
  key: 'pits',
  title: 'The Spires',
  theme: 'pits',
  blurb: 'throws over the open sky, hovering to deny the bridge, platform timing',
  torches: [6, 14, 23, 31],
  rows: [
    '####.............####.............####',
    '##................5.................##',
    '....1.......##..........##.......2....',
    '............##..........##............',
    '......................................',
    '..............C........C..............',
    '.....~~~~%%~~~~~~~..~~~~~~~%%~~~~.....',
    '..p..~~~~%%~~~~~~~.p~~~~~~~%%~~~~..p..',
    '.....~~~~%%~~~~~~~..~~~~~~~%%~~~~.....',
    '..............C........C..............',
    '......................................',
    '............##..........##............',
    '....3.......##..........##.......4....',
    '##.................6................##',
    '####.............####.............####',
  ],
  hazards: [
    { kind: 'platform', rail: [[14, 8], [14, 10]], w: 2, h: 1 },
    { kind: 'platform', rail: [[24, 8], [24, 10]], w: 2, h: 1, phase: 94 },
  ],
})

/**
 * A bamboo grove, tall and narrow (30 × 19) so the beds are never far apart. Beds no bigger than
 * 4×3, two stands of bamboo a side, pews of crates. Nothing here kills; the beds hide bodies and a
 * throw cuts them open. Skill: recon by cutting, ambush from a bed with a hovered boomerang,
 * reading rustles.
 */
const GREENHOUSE = room({
  key: 'greenhouse',
  title: 'The Greenhouse',
  theme: 'grass',
  blurb: 'hide in the beds, cut them open with a throw, ambush from cover',
  torches: [6, 12, 17, 23],
  rows: [
    '####......................####',
    '##..........................##',
    '..............5...............',
    '....""""..............""""....',
    '....""""......CC......""""....',
    '.1..""""..............""""..2.',
    '..............................',
    '.........##........##.........',
    '.........##""".."""##.........',
    '""".....p.."""p."""..p....."""',
    '"""........""".."""........"""',
    '.........##""".."""##.........',
    '.........##........##.........',
    '..............................',
    '.3..""""..............""""..4.',
    '....""""......CC......""""....',
    '....""""..............""""....',
    '##............6.............##',
    '####......................####',
  ],
})

/**
 * A giant kitchen: an octagon (32 × 18) whose cut corners push the fight toward the burners.
 * Burner bars in two phases guard the approaches to the great stove block in the middle; powder
 * kegs sit against it like sacks of flour by an oven. A burner that is ON blocks bodies and lights
 * any boomerang that passes, which then lights barrels. Skill: rhythm (cross on OFF, throw across
 * on ON), lighting your boomerang on purpose, barrel chains at range. (The room key stays `forge`.)
 */
const FORGE = room({
  key: 'forge',
  title: 'The Kitchen',
  theme: 'fire',
  blurb: 'throw through the flames to light the boomerang, set the barrels off from range',
  torches: [6, 13, 18, 25],
  rows: [
    '####........................####',
    '###.1.......C..5...C.......2.###',
    '##............................##',
    '#........*@*@..p...@*@*........#',
    '................................',
    '.....B....................B.....',
    '......*.......B..B.......@......',
    '.C....@......##..##......*....C.',
    '.C....*......##p.##......@....C.',
    '......@.......B..B.......*......',
    '.....B....................B.....',
    '................................',
    '.........@*@*..p...*@*@.........',
    '................................',
    '#..............................#',
    '##............................##',
    '###.3.......C..6...C.......4.###',
    '####........................####',
  ],
})

/**
 * Two bays joined by a bridge: an H (34 × 19). Portal-2 blue and orange. One pair wraps the middle
 * row through the side walls; two pairs wrap a column of each bay through the top and bottom
 * walls, so a throw sent up a bay comes back out of its floor. Two 2×2 blocks and a few crates
 * give banks. Skill: throws that come out of the far wall behind the target, walking through a
 * mouth to break a chase, aiming with the preview through the hop.
 */
const LAB = room({
  key: 'lab',
  title: 'The Laboratory',
  theme: 'portals',
  blurb: 'throws that arrive from behind, mouths as escape hatches',
  torches: [2, 5, 28, 31],
  rows: [
    '..........##############..........',
    '...1......##############......2...',
    '..........##############..........',
    '..........##############..........',
    '................5.................',
    '..................................',
    '................CC................',
    '..................................',
    '...##........................##...',
    '.p.##...........p............##.p.',
    '...##........................##...',
    '..................................',
    '................CC................',
    '..................................',
    '.................6................',
    '..........##############..........',
    '..........##############..........',
    '...3......##############......4...',
    '..........##############..........',
  ],
  hazards: [
    { kind: 'portal', a: [0, 11], b: [35, 11], aFace: 'e', bFace: 'w' },
    { kind: 'portal', a: [8, 1], b: [8, 21] },
    { kind: 'portal', a: [27, 1], b: [27, 21] },
  ],
})

/**
 * The inside of a clock tower: a long hall (36 × 15) with machinery housings on its walls, brass
 * gears turning in them on the same beat the spikes keep. Two spike bands in opposite phase
 * separate the north and south strips from a central bowl between two gear housings. A band that
 * is UP is a wall to bodies and open to throws. Skill: timing crossings, throwing across a band
 * you cannot cross, banks off the housings. (The room key stays `armoury`.)
 */
const ARMOURY = room({
  key: 'armoury',
  title: 'The Clockwork',
  theme: 'spikes',
  blurb: 'cross on the beat, throw across the spikes you cannot cross',
  torches: [4, 13, 22, 31],
  rows: [
    '.........#................#.........',
    '...1.............5..............2...',
    '..........C..............C..........',
    '....................................',
    '....^^^^^...&&&&&&&&&&&&...^^^^^....',
    '....................................',
    '......##....C..........C....##......',
    '#.p...##.........p..........##...p.#',
    '......##....................##......',
    '......##....C..........C....##......',
    '....&&&&&...^^^^^^^^^^^^...&&&&&....',
    '....................................',
    '..........C..............C..........',
    '...3..............6.............4...',
    '.........#................#.........',
  ],
})

/**
 * A frozen pond (36 × 18): the snow bank rounds off every corner and the rink fills the middle,
 * with a hole of black water at its centre, snow patches to catch yourself on (Aaron's "holes in
 * the ice", 2026-10-09) and bumpers at the rink corners. The spawns stand on the snow. Skill:
 * leading a sliding target, throwing while you slide, banks off the bumpers, dash slides that
 * compound on the ice.
 */
const ICEBOX = room({
  key: 'icebox',
  title: 'The Icebox',
  theme: 'ice',
  blurb: 'hit sliding targets, slide past the return, bank off the bumpers',
  torches: [13, 22],
  rows: [
    '###########..............###########',
    '######T..........5...........T######',
    '#####..........................#####',
    '###..1........................2..###',
    '##................................##',
    '#.......o__________________o.......#',
    '#.....________________________.....#',
    '....____..________________..____....',
    '...____p_______.~~~~._______p____...',
    '...____________.~~~~.____________...',
    '....____..________________..____....',
    '#.....________________________.....#',
    '#.......o__________________o.......#',
    '##...............p................##',
    '###..3........................4..###',
    '#####..........................#####',
    '#######...........6..........#######',
    '###########..............###########',
  ],
})

/**
 * A shrine: two outer halls and the inner sanctum between them (34 × 18). A walkway runs across
 * the top of all three; the sanctum's walls have two sliding shoji doors a side, top doors and
 * bottom doors in opposite phase, so one row is always open; a closed door bounces boomerangs. A
 * great censer swings across the walkway over the sanctum. Skill: throws through a door that is
 * about to close, closed doors as bank walls, the censer walk as a dash-timed shortcut. (The room
 * key stays `gatehouse`.)
 */
const GATEHOUSE = room({
  key: 'gatehouse',
  title: 'The Shrine',
  theme: 'gates',
  blurb: 'throw through sliding doors, bank off closed ones, dash the censer walk',
  torches: [2, 8, 25, 31],
  rows: [
    '..................................',
    '.........################.........',
    '...1.....#..............#.....2...',
    '.........#......5.......#.........',
    '..................................',
    '..................................',
    '.........#..............#.........',
    '..##.....#..............#.....##..',
    '..##.p...#......p.......#...p.##..',
    '.........#..............#.........',
    '..................................',
    '..................................',
    '.........#..............#.........',
    '.........#.......6......#.........',
    '.........#..............#.........',
    '...3.....################.....4...',
    '.........################.........',
    '.........################.........',
  ],
  hazards: [
    { kind: 'gate', tiles: [[10, 6], [10, 7]] },
    { kind: 'gate', tiles: [[25, 6], [25, 7]] },
    { kind: 'gate', tiles: [[10, 12], [10, 13]], phase: 322 },
    { kind: 'gate', tiles: [[25, 12], [25, 13]], phase: 322 },
    { kind: 'crusher', look: 'pendulum', rail: [[11, 2], [24, 2]], anchor: [17, 1], speed: 1.5, dwell: 10 },
  ],
})

/**
 * A nightclub in the shape of a cross (38 × 19, Aaron's "disco ball room"): the DJ stand at the
 * top, the dance floor down the middle, a wide lounge across it, crates stacked like road cases.
 * No torches: the four mirror balls are the lights, and every one that is dropped leaves the club
 * darker (Aaron, 2026-10-09). The pair over the lounge and the pair over the cases are staggered a
 * column apart, so no column of the dance floor is safe and no two chains overlap on screen. The
 * floor pulses through its hues on the music's beat — hue only, never value. Skill: dropping a
 * mirror ball on someone with a thrown boomerang, baiting people under one, choosing between light
 * and a kill. (The room key stays `chapel`.)
 */
const CHAPEL = room({
  key: 'chapel',
  title: 'The Discotheque',
  theme: 'chandeliers',
  blurb: 'drop the mirror balls on people; every one you drop makes it darker',
  torches: [],
  lightSource: 'chandeliers',
  rows: [
    '##############..........##############',
    '############......##......############',
    '#########.........##.........#########',
    '#########.1................2.#########',
    '#########....................#########',
    '.5..................................6.',
    '......................................',
    '......................................',
    '...##............................##...',
    '.p.##.............p..............##.p.',
    '............CC..........CC............',
    '............CC..........CC............',
    '......................................',
    '......................................',
    '#########....................#########',
    '#########...CC..........CC...#########',
    '#########...CC..........CC...#########',
    '#########....................#########',
    '#########.3................4.#########',
  ],
  hazards: [
    { kind: 'chandelier', c: 15, r: 8 },
    { kind: 'chandelier', c: 24, r: 8 },
    { kind: 'chandelier', c: 17, r: 14 },
    { kind: 'chandelier', c: 22, r: 14 },
  ],
})

/** The roster, in rotation order: static rooms and timed rooms alternate, looks too. */
export const ARENAS: Record<string, ArenaEntry> = Object.fromEntries(
  [CELLAR, PITS, GREENHOUSE, FORGE, LAB, ARMOURY, ICEBOX, GATEHOUSE, CHAPEL].map((a) => [a.key, a]),
)
export const ARENA_LIST: ArenaEntry[] = Object.values(ARENAS)
