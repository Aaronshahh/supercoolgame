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

export type WallStyle =
  | 'brick' // three courses of 8×4 bricks (the original)
  | 'rock' // irregular rock lumps
  | 'bamboo' // vertical stalks with nodes
  | 'ice' // big translucent ice blocks with frost joints and a highlight streak
  | 'panel' // flat metal panels with a seam and rivets
  | 'ashlar' // two courses of big dressed blocks
  | 'chapel' // ashlar with tall dark windows in the outer walls

export type CapStyle =
  | 'blocks' // running-bond blocks seen from above (the original)
  | 'rough' // flecked rock, no joints
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
  /** Slabs only: colour of the odd glowing speck (the Forge's embers). */
  ember?: string
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

  /** The Pits: a cave. Dirt floor, rock walls, no straight line anywhere. */
  cavern: {
    ...STONE,
    key: 'cavern',
    floor: 'earth',
    wall: 'rock',
    cap: 'rough',
    floors: ['#3a3331', '#403836', '#36302e', '#3d3533'],
    floorLight: '#4a413e',
    floorMortar: '#241f1e',
    floorCrack: '#2a2423',
    floorSpeck: '#55493f',
    wallCap: '#2b2522',
    wallCapLight: '#3a322e',
    wallCapEdge: '#5a4e46',
    wallCapJoint: '#1e1917',
    wallCapDark: '#15110f',
    faces: ['#6b5a4e', '#75635a', '#5f5047', '#7a675c'],
    faceLight: '#8c7a6c',
    faceMortar: '#2e2520',
    faceDark: '#3e322c',
    pitWall: '#4a3f3a',
    pitWallDark: '#2d2624',
    // a cave: water drips off the unseen ceiling, dust hangs in the air
    ambient: [
      { kind: 'drip', rate: 1.2, where: 'floor', colors: ['#7fa6bd'] },
      { kind: 'mote', rate: 1.5, where: 'floor', colors: ['#6a5d55'] },
    ],
    dust: '#6a5a4c',
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

  /** The Forge: charcoal slabs with embers in the cracks, blackened red brick. */
  forge: {
    ...STONE,
    key: 'forge',
    floors: ['#2e2628', '#33292b', '#2a2325', '#302729'],
    floorLight: '#3e3335',
    floorMortar: '#1a1416',
    floorCrack: '#201a1b',
    floorSpeck: '#5a3a30',
    ember: PAL.flameO,
    wallCap: '#241c1c',
    wallCapLight: '#352828',
    wallCapEdge: '#6a4a3a',
    wallCapJoint: '#1a1313',
    wallCapDark: '#120d0d',
    faces: ['#5a3028', '#64362c', '#4e2a22', '#6c3a2e'],
    faceLight: '#7a4838',
    faceMortar: '#241412',
    faceDark: '#1a0e0c',
    debris: 0.6,
    // a forge: embers lift out of the cracks in the floor, a little smoke hangs by the walls
    ambient: [
      { kind: 'ember', rate: 4, where: 'floor', colors: [PAL.flameO, PAL.flameR] },
      { kind: 'smoke', rate: 0.35, where: 'wall', colors: ['#1a1416'] },
    ],
    dust: '#4a3a38',
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

  /** The Armoury: iron plates underfoot, cold grey dressed stone. */
  armoury: {
    ...STONE,
    key: 'armoury',
    floor: 'plates',
    wall: 'ashlar',
    floors: ['#3a3a42', '#3e3e46', '#36363e', '#3c3c44'],
    floorLight: '#55555f',
    floorMortar: '#1e1e24',
    floorCrack: '#2a2a30',
    floorSpeck: '#6a6a76',
    wallCap: '#2a2a30',
    wallCapLight: '#3a3a42',
    wallCapEdge: '#5e5e6a',
    wallCapJoint: '#1e1e24',
    wallCapDark: '#141418',
    faces: ['#6a6672', '#726e7a', '#625e6a', '#7a7682'],
    faceLight: '#8e8a98',
    faceMortar: '#2e2c34',
    faceDark: '#3e3a46',
    debris: 0.8,
    // an armoury: grey dust, grit off the old stone
    ambient: [
      { kind: 'mote', rate: 1.5, where: 'floor', colors: ['#8e8a98'] },
      { kind: 'grit', rate: 0.3, where: 'wall', colors: ['#5e5e6a'] },
    ],
    dust: '#6a6a76',
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

  /** The Gatehouse: cobbles and warm sandstone. */
  keep: {
    ...STONE,
    key: 'keep',
    floor: 'cobbles',
    wall: 'ashlar',
    floors: ['#5a4e42', '#625548', '#52473c', '#5e5146'],
    floorLight: '#766858',
    floorMortar: '#2e2720',
    floorCrack: '#38302a',
    floorSpeck: '#80705e',
    wallCap: '#3a3128',
    wallCapLight: '#4c4034',
    wallCapEdge: '#7a6a52',
    wallCapJoint: '#2a231c',
    wallCapDark: '#1a1510',
    faces: ['#a08a62', '#aa9468', '#96805a', '#b09c70'],
    faceLight: '#c8b48a',
    faceMortar: '#4a3c2a',
    faceDark: '#6a5a40',
    debris: 0.6,
    // a keep: warm dust, sand trickling off the sandstone
    ambient: [
      { kind: 'mote', rate: 1.5, where: 'floor', colors: ['#c8b48a'] },
      { kind: 'grit', rate: 0.5, where: 'wall', colors: ['#a08a62', '#766858'] },
    ],
    dust: '#80705e',
  },

  /** The Chapel: a checkered floor, pale limestone, dark windows. Lit by its chandeliers alone. */
  chapel: {
    ...STONE,
    key: 'chapel',
    floor: 'checker',
    wall: 'chapel',
    floors: ['#3a3240', '#574e58'],
    floorLight: '#6a6070',
    floorMortar: '#221c26',
    floorCrack: '#2a222c',
    floorSpeck: '#605666',
    wallCap: '#2a2530',
    wallCapLight: '#3a3442',
    wallCapEdge: '#625a6c',
    wallCapJoint: '#1e1a24',
    wallCapDark: '#15121a',
    faces: ['#7a7378', '#847d82', '#706a6f', '#8a8388'],
    faceLight: '#a39ca1',
    faceMortar: '#3a343a',
    faceDark: '#4a4248',
    debris: 0.4,
    // a chapel: dust turning in the candlelight (the chandeliers add their own candle smoke)
    ambient: [{ kind: 'mote', rate: 3, where: 'floor', colors: [PAL.cream, PAL.boneDark] }],
    dust: '#605666',
  },
}

/** Stained glass for the chapel windows: frame, then the pane colours (deep, so they read as unlit). */
export const WINDOW_FRAME = PAL.boneDark
export const WINDOW_PANES = ['#1c2a55', '#4a1c3a', '#1c3a3a']
