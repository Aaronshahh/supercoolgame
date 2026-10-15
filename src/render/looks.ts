/**
 * Room looks (docs/02 §7): the environment each arena is drawn in. A look is a palette for the
 * floor, the wall caps, the wall faces and the pits, plus which of a handful of procedural styles
 * draws each. Everything is generated from these few colours at load time; there is no tile art
 * to draw by hand (Aaron is not an artist, so the asset list stays small). The Cellar's `stone`
 * look is the original one, and the strip and the two old demo layouts use it.
 */
import { PAL } from '../art/palette.ts'

export type FloorStyle =
  | 'slabs' // 2×2-tile stone slabs with mortar (the original)
  | 'earth' // packed dirt: mottled, pebbles, no joints; `moss` adds green patches
  | 'snow' // matt white-blue, sparkles, faint drifts
  | 'tiles' // clean 8 px tiles in two shades
  | 'plates' // riveted iron plates
  | 'cobbles' // 4×4 rounded cobbles per tile
  | 'checker' // one-tile checkerboard
  | 'planks' // wood planks in 4 px courses; the specks are brass rivets
  | 'tatami' // 2×1-tile mats with dark borders, orientation alternating per 2×2 block

export type WallStyle =
  | 'brick' // three courses of 8×4 bricks (the original)
  | 'bamboo' // vertical stalks with nodes
  | 'ice' // big translucent ice blocks with frost joints and a highlight streak
  | 'panel' // flat metal panels with a seam and rivets
  | 'ashlar' // two courses of big dressed blocks; `accent` adds creeping moss
  | 'kitchen' // glazed wall tiles over a stainless band, hanging copper pans in `accent`
  | 'gears' // dark steel panels; brass gears (drawn per frame, on the spike beat) half-sunk in them
  | 'shoji' // paper panes in a wood lattice, the odd pane backlit, a vermillion top beam
  | 'club' // near-black panels with a neon trim line and speaker boxes

export type CapStyle =
  | 'blocks' // running-bond blocks seen from above (the original)
  | 'canopy' // leaves
  | 'snow' // a smooth white mound with a bright rim

export interface Look {
  key: string
  floor: FloorStyle
  wall: WallStyle
  cap: CapStyle
  /** Floor shades (slabs/earth/cobbles pick from all of them; tiles and checker use the first two). */
  floors: string[]
  floorLight: string
  floorMortar: string
  floorCrack: string
  floorSpeck: string
  /** Earth only: colour of the moss patches, if any. */
  moss?: string
  /** Slabs only: colour of the odd glowing speck (embers in a crack, gold glints in a ruin). */
  ember?: string
  /** Wall decor colours: copper pans, brass gears, vermillion beams, the pink half of the neon. */
  accent?: string
  /** Its partner: pan speculars, brass highlights, a backlit pane, the cyan half of the neon. */
  accentLight?: string
  wallCap: string
  wallCapLight: string
  wallCapEdge: string
  wallCapJoint: string
  wallCapDark: string
  /** Wall-face block shades, the highlight along a block's top, the joints, and a dark accent (nodes, rivets). */
  faces: string[]
  faceLight: string
  faceMortar: string
  faceDark: string
  pit: string
  pitWall: string
  pitWallDark: string
  /** Pits are open daytime sky: a rock skirt instead of pit walls, clouds drifting below per frame. */
  sky?: boolean
  /** Colour of the 1 px rim where floor meets pit (default floorLight; dark against a bright sky). */
  rim?: string
  /** Base lightmap darkness (default 0.4); a room open to daylight sits much lower. */
  ambientLight?: number
  /** What hangs at the torch anchors (default the torch). */
  fixture?: 'lantern' | 'lamp'
  /** Checker only: the dance floor's hue set, cycled on the music's beat (hue only, value-locked). */
  floorCycle?: string[]
  /** Chandeliers are mirror balls: cool light, facet glints, drifting spot ellipses on the floor. */
  mirror?: boolean
  /** RGB of the cast shadows (walls onto the floor, ground contact); purple-black everywhere but the snow. */
  shade: [number, number, number]
  /** Loose debris decals on the floor, as a fraction of the default density. */
  debris: number
  /** Render-only weather and air (docs/04 §6): what drifts through the room when nothing is happening. */
  ambient: Ambient[]
  /** Colour of the dust a footstep or a landing kicks up here (snow puffs white, earth puffs brown). */
  dust: string
  /** Snow: footsteps leave prints that melt away. Ice-rink rooms get skate scratches instead (per tile, not per look). */
  prints?: string
}

/** One kind of ambient particle a room's air carries. */
export type AmbientKind =
  | 'mote' // dust hanging in the light
  | 'drip' // water off a cave ceiling
  | 'leaf' // off the canopy
  | 'ember' // up out of the floor cracks
  | 'flake' // snow
  | 'wisp' // steam or smoke threads
  | 'grit' // pebbles shaken off the walls
  | 'smoke' // heavier dark smoke

export interface Ambient {
  kind: AmbientKind
  /** Spawns per second over a reference room's worth of view (36×19 tiles); scaled to the view in play. */
  rate: number
  /** Where it starts: over open floor, against a wall (the tile below a wall), on tall grass, or anywhere. */
  where: 'floor' | 'wall' | 'grass' | 'anywhere'
  colors: string[]
}

const SHADE: [number, number, number] = [8, 5, 12]

const STONE: Look = {
  key: 'stone',
  floor: 'slabs',
  wall: 'brick',
  cap: 'blocks',
  floors: [...PAL.floor],
  floorLight: PAL.floorLight,
  floorMortar: PAL.floorMortar,
  floorCrack: PAL.floorCrack,
  floorSpeck: PAL.floorSpeck,
  wallCap: PAL.wallCap,
  wallCapLight: PAL.wallCapLight,
  wallCapEdge: PAL.wallCapEdge,
  wallCapJoint: PAL.wallCapJoint,
  wallCapDark: PAL.wallCapDark,
  faces: [...PAL.brick],
  faceLight: PAL.brickLight,
  faceMortar: PAL.brickMortar,
  faceDark: PAL.wallCapDark,
  pit: PAL.pit,
  pitWall: PAL.pitWall,
  pitWallDark: PAL.pitWallDark,
  shade: SHADE,
  debris: 1,
  // a cellar: dust in the torchlight, the odd pebble off the brickwork
  ambient: [
    { kind: 'mote', rate: 2.5, where: 'floor', colors: [PAL.boneDark, PAL.cream] },
    { kind: 'grit', rate: 0.25, where: 'wall', colors: [PAL.brickMortar, PAL.wallCapEdge] },
  ],
  dust: PAL.boneDark,
}

export const LOOKS: Record<string, Look> = {
  stone: STONE,

  /**
   * The Spires: a shattered ruin floating in daylight. Pale dressed stone with moss and the odd
   * gold glint; the pits are open sky with a cloud sea drifting below (drawn per frame), so every
   * walkable edge gets a dark rim — bright sky against pale stone goes mushy without one.
   */
  sky: {
    ...STONE,
    key: 'sky',
    wall: 'ashlar',
    floors: ['#b4b0a2', '#bcb8aa', '#aeaa9c', '#b8b4a6'],
    floorLight: '#dad6c8',
    floorMortar: '#86826f',
    floorCrack: '#96927f',
    floorSpeck: '#ccc8ba',
    ember: '#e8c04a',
    wallCap: '#716d60',
    wallCapLight: '#847f70',
    wallCapEdge: '#aaa695',
    wallCapJoint: '#565244',
    wallCapDark: '#3c3930',
    faces: ['#cfccbf', '#d8d4c6', '#c6c2b4', '#dedacc'],
    faceLight: '#f0ecde',
    faceMortar: '#8a8678',
    faceDark: '#a09c8e',
    accent: '#58c0a8',
    pit: '#7db8e8',
    pitWall: '#8a8172',
    pitWallDark: '#675f50',
    sky: true,
    rim: '#4a4858',
    ambientLight: 0.12,
    shade: [40, 55, 90],
    debris: 0.3,
    // open air: bright motes on the wind, a leaf of moss off the stonework now and then
    ambient: [
      { kind: 'mote', rate: 1.6, where: 'anywhere', colors: ['#ffffff', '#dce8f4'] },
      { kind: 'leaf', rate: 0.4, where: 'wall', colors: ['#58c0a8', '#8aa89a'] },
    ],
    dust: '#aaa695',
  },

  /** The Greenhouse: a bamboo grove. Earth and moss underfoot, stalks for walls, leaves on top. */
  bamboo: {
    ...STONE,
    key: 'bamboo',
    floor: 'earth',
    wall: 'bamboo',
    cap: 'canopy',
    floors: ['#4a3d2c', '#51432f', '#453829', '#4d4030'],
    floorLight: '#5e4f3a',
    floorMortar: '#2c2419',
    floorCrack: '#332a1e',
    floorSpeck: '#6a5a42',
    moss: '#3e5a2e',
    wallCap: '#1f3320',
    wallCapLight: '#2f4a2c',
    wallCapEdge: '#4f7a3a',
    wallCapJoint: '#162416',
    wallCapDark: '#0f190f',
    faces: ['#9aa84e', '#aab85a', '#8a9844', '#b4c068'],
    faceLight: '#d2dc8a',
    faceMortar: '#2a3a1e',
    faceDark: '#5c6a2c',
    debris: 0.5,
    // a grove: leaves come down off the canopy, pale motes drift between the stalks
    ambient: [
      { kind: 'leaf', rate: 1.6, where: 'wall', colors: ['#9aa84e', '#6a8a3a', '#c8b060'] },
      { kind: 'mote', rate: 1.2, where: 'grass', colors: ['#d2dc8a'] },
    ],
    dust: '#6a5a42',
  },

  /**
   * The Kitchen: cream-and-terracotta checker, glazed wall tiles over a stainless band, hanging
   * copper. The room stays cool and clean so the warm hazards pop — the burners (vents) and the
   * barrels keep their own colours, as every hazard does in every room.
   */
  kitchen: {
    ...STONE,
    key: 'kitchen',
    floor: 'checker',
    wall: 'kitchen',
    floors: ['#a2583a', '#d8ccb2'],
    floorLight: '#eee2c8',
    floorMortar: '#774428',
    floorCrack: '#8d5134',
    floorSpeck: '#c2b599',
    wallCap: '#473830',
    wallCapLight: '#594840',
    wallCapEdge: '#8a7258',
    wallCapJoint: '#332822',
    wallCapDark: '#221a16',
    faces: ['#d8e4e0', '#cedad6'],
    faceLight: '#f0faf4',
    faceMortar: '#a4b0ac',
    faceDark: '#78898c',
    accent: '#c87f3f',
    accentLight: '#ffd9a0',
    debris: 0.15,
    // a working kitchen: steam off the counters, warm flour dust in the light
    ambient: [
      { kind: 'wisp', rate: 1.4, where: 'wall', colors: ['#e4efec'] },
      { kind: 'mote', rate: 1.2, where: 'floor', colors: ['#eee2c8'] },
    ],
    dust: '#c2b599',
    fixture: 'lamp',
  },

  /** The Laboratory: clean two-tone tiles, riveted panels, nothing on the floor. */
  lab: {
    ...STONE,
    key: 'lab',
    floor: 'tiles',
    wall: 'panel',
    floors: ['#4a4e5c', '#50546a'],
    floorLight: '#606678',
    floorMortar: '#2c2f3a',
    floorCrack: '#383c48',
    floorSpeck: '#6c7288',
    wallCap: '#2c3038',
    wallCapLight: '#3c424c',
    wallCapEdge: '#6c7488',
    wallCapJoint: '#20242a',
    wallCapDark: '#15181c',
    faces: ['#5c6270', '#616878'],
    faceLight: '#8a92a4',
    faceMortar: '#30343e',
    faceDark: '#444a56',
    debris: 0,
    // a lab: clean air, steam leaking from the seams of the panels
    ambient: [{ kind: 'wisp', rate: 0.9, where: 'wall', colors: ['#9aa4b8'] }],
    dust: '#6c7288',
  },

  /**
   * The Clockwork: a clock tower. Cold steel-blue walls so the brass gears read as metal (warm on
   * warm is mud), dark planks with brass rivets underfoot; the gears advance on the spike beat, so
   * the room itself telegraphs the hazard's rhythm.
   */
  clockwork: {
    ...STONE,
    key: 'clockwork',
    floor: 'planks',
    wall: 'gears',
    floors: ['#56402c', '#5e4631', '#503c29', '#5a432e'],
    floorLight: '#7a5c3e',
    floorMortar: '#30231a',
    floorCrack: '#413020',
    floorSpeck: '#c9962e',
    wallCap: '#232a42',
    wallCapLight: '#303a56',
    wallCapEdge: '#4e5c80',
    wallCapJoint: '#181e30',
    wallCapDark: '#0f1420',
    faces: ['#3c4a6e', '#425078'],
    faceLight: '#5c6c96',
    faceMortar: '#242c48',
    faceDark: '#1a2238',
    accent: '#c9962e',
    accentLight: '#f0d060',
    debris: 0.4,
    // a tower full of machinery: dust in the works, grit shaken off on the tick
    ambient: [
      { kind: 'mote', rate: 1.4, where: 'floor', colors: ['#8a94b4'] },
      { kind: 'grit', rate: 0.3, where: 'wall', colors: ['#4e5c80', '#8a6420'] },
    ],
    dust: '#6a5f52',
    fixture: 'lamp',
  },

  /** The Icebox: a frozen waste. Snow for floor, ice blocks for walls, dark water in the holes. */
  frost: {
    ...STONE,
    key: 'frost',
    floor: 'snow',
    wall: 'ice',
    cap: 'snow',
    floors: ['#c4d4e0', '#cad9e4', '#bfd0dc', '#c7d7e2'],
    floorLight: '#eef5fa',
    floorMortar: '#9fb4c4',
    floorCrack: '#a9bfd0',
    floorSpeck: '#dce8f0',
    wallCap: '#dfe9f0',
    wallCapLight: '#f4f9fc',
    wallCapEdge: '#ffffff',
    wallCapJoint: '#bcd0de',
    wallCapDark: '#8aa6ba',
    faces: ['#6f9ab8', '#7aa5c2', '#6590ae', '#80aac6'],
    faceLight: '#d4ecf8',
    faceMortar: '#a8ccdf',
    faceDark: '#4a7290',
    pit: '#0c1a2c',
    pitWall: '#5a86a4',
    pitWallDark: '#2f516a',
    shade: [30, 50, 80],
    debris: 0,
    // a frozen waste: snow falls over everything and settles; footsteps leave prints that melt
    ambient: [{ kind: 'flake', rate: 22, where: 'anywhere', colors: ['#f0f8ff'] }],
    dust: '#eef5fa',
    prints: '#8aa6ba',
  },

  /**
   * The Shrine: wood and paper. Tatami underfoot (the alternating mat layout is the read, not the
   * weave), shoji panels with the odd pane lamplit from behind, vermillion rationed to the beams,
   * paper lanterns at the torch anchors.
   */
  shrine: {
    ...STONE,
    key: 'shrine',
    floor: 'tatami',
    wall: 'shoji',
    floors: ['#b0a468', '#a4945a', '#b8ac70', '#aa9c60'],
    floorLight: '#ccc080',
    floorMortar: '#584c2c',
    floorCrack: '#8e8050',
    floorSpeck: '#d4c888',
    wallCap: '#2e2218',
    wallCapLight: '#3e2e20',
    wallCapEdge: '#6b4a28',
    wallCapJoint: '#20170f',
    wallCapDark: '#140e08',
    faces: ['#e8dfc4', '#efe6cc', '#e2d9be'],
    faceLight: '#f8f0da',
    faceMortar: '#4a3220',
    faceDark: '#352314',
    accent: '#c43226',
    accentLight: '#ffe8b0',
    debris: 0.25,
    // a shrine: incense dust in the lantern light, a petal across the room now and then
    ambient: [
      { kind: 'mote', rate: 1.8, where: 'floor', colors: ['#f2e9d0', '#d4c888'] },
      { kind: 'leaf', rate: 0.5, where: 'wall', colors: ['#e8a7b4', '#d88a9a'] },
    ],
    dust: '#a89858',
    fixture: 'lantern',
  },

  /**
   * The Discotheque: a dark club lit by its mirror balls alone (the chandelier light-share system,
   * unchanged). The checker dance floor sits in a narrow near-black value band and cycles hue only,
   * on the music's beat; the walls stay dark so the floor and the neon carry all the colour, and
   * nothing in the room may reach the players' brightness.
   */
  disco: {
    ...STONE,
    key: 'disco',
    floor: 'checker',
    wall: 'club',
    floors: ['#17121f', '#262033'],
    floorLight: '#3a2f4c',
    floorMortar: '#0d0a14',
    floorCrack: '#2e2540',
    floorSpeck: '#453a58',
    floorCycle: ['#ff3355', '#ffaa00', '#33ff77', '#3388ff'],
    wallCap: '#141020',
    wallCapLight: '#1e1830',
    wallCapEdge: '#352a48',
    wallCapJoint: '#0b0814',
    wallCapDark: '#060410',
    faces: ['#1c1626', '#211a2c'],
    faceLight: '#3a2e4e',
    faceMortar: '#0d0a14',
    faceDark: '#070510',
    accent: '#ff2e8a',
    accentLight: '#00e5ff',
    mirror: true,
    shade: [4, 3, 8],
    debris: 0,
    // a club: haze in the beams
    ambient: [{ kind: 'mote', rate: 2, where: 'floor', colors: ['#5a4a7a', '#8a6aa8'] }],
    dust: '#453a58',
  },
}
