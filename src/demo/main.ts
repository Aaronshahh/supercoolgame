/**
 * Visual style demo. Not the real simulation — a stand-in with the same feel
 * (60 Hz fixed step, spec constants) so the art and the hazards can be judged in motion.
 *
 * Tab (or the < > arrows in the HUD) swaps the room for the next one in the roster, Shift+Tab for the
 * previous; everyone is re-seated at the new room's spawns and the URL follows.
 *
 * URL params: ?arena=<roster key from arenas.ts>|strip|floor|brawl (default: the roster's first room;
 *             the strip is the nine showroom rooms in a row, one per docs/02 theme, with the camera
 *             following the local player), ?at=c,r start the local player on that
 *             tile of the strip, ?t=N render tick N of a scripted scene and stop (for screenshots), ?idle=1 make
 *             the scripted player stand still, ?push=x,y make them hold that direction from the
 *             scripted dash onwards (slide test), ?walk=x,y[,T] hold that direction from tick 0
 *             (until tick T) and throw along it at tick 10 (portal test), ?aim=dx,dy where the
 *             scripted cursor sits relative to the player (default 120,10), ?swap=K press Tab K times
 *             (negative: Shift+Tab) before the scripted scene runs, ?seed=N, ?light=0 to disable the lightmap,
 *             ?char=0-3 local character, ?bots=0-3 number of AI opponents (default 0),
 *             ?trace=1 per-tick log, ?sheet=1 (or sheet=all) shows every animation frame instead.
 */
import { CHARACTERS, type FacingFrames } from '../art/characters.ts'
import { CHAR_KEY, PAL, PLAYER_COLORS, PROP_KEY, darken, lighten, rgba, withPrimary } from '../art/palette.ts'
import { BARREL, BOOMERANG, CRATE, SHADOW_BOOM, SHADOW_DUDE, TORCH } from '../art/props.ts'
import * as art from '../render/hazardArt.ts'
import { Lightmap, type Light } from '../render/lighting.ts'
import { ctx2d, flipX, rotate90, silhouette, spriteFromRows, type Sprite } from '../render/pixelart.ts'
import { createScreen } from '../render/screen.ts'
import { drawText, textWidth } from '../render/text.ts'
import { TILE, TileKind, beltDir, isBelt, parseArena, redrawCells, renderArenaStatic, tileAt, type ArenaMap, type GrassAt } from '../render/tiles.ts'
import { LOOKS, type Look } from '../render/looks.ts'
import { hash2, mulberry32 } from '../util/rng.ts'
import { ARENA_BRAWL, ARENA_FLOOR, ARENA_STRIP, type ArenaDef } from './arena.ts'
import { ARENAS, ARENA_LIST, type ArenaEntry } from './arenas.ts'
import { cyclePeriod, cyclePhase, railPos, type Cycle, type PhaseInfo, type Pt, type Rail, type RailPos } from './hazards.ts'
import { sfxBeep, sfxBlast, sfxBump, sfxClank, sfxCreak, sfxCrunch, sfxThud, sfxWarp, unlockAudio } from './sfx.ts'

// ---------------------------------------------------------------- constants
const HUD_H = 14
// W, H, WORLD_W and WORLD_H follow the arena; they are defined right after it is parsed below.

const PLAYER_RADIUS = 5
const HURT_RADIUS = 6
const MAX_SPEED = 1.8
const ACCEL = 0.9 // full speed in 2 ticks once the windup is over; heading snaps to the input instantly
const DECEL = 0.9 // stopped in 2 ticks
const START_WINDUP = 5 // ticks of running in place before a standing start gets grip
// The run cycle is per character (art/chars/*.ts: run frames, runPeriod, runLift), render-only.
const SMEAR_EVERY = 5 // ticks between floor smears for a character that leaves a trail (the slime)
const SMEAR_TTL = 45 // ticks a smear takes to fade
const MELEE_SPEED_MULT = 0.5
// The dash lets go into a slide instead of stopping. The slide is a base velocity in the dash
// direction that friction bleeds off over ~40 ticks, and the stick works the whole time *on top* of
// it: your walk is added to the slide, never replaces it, so pushing forward overshoots, pushing
// sideways drifts, and pushing back holds you in place until the slide has dropped under walking
// speed. (Aaron, 2026-10-08: punish obsessive dashing; 2026-10-09: the punishment is unwanted
// movement, not a stop, and the walk has to compound with the slide, not wait for it.)
const DASH_SLIDE_SPEED = 4
const DASH_SLIDE_FRICTION = 0.93
const DASH_SLIDE_MIN = 0.2 // below this the slide is dropped

// 5.4 × 8 = 43.2 px: a hair under three tiles (Aaron, 2026-10-09: 10 % less roll, same slide after it)
const DASH_SPEED = 5.4
const DASH_TICKS = 8
const DASH_INVULN = 6
const DASH_COOLDOWN = 30
const SHOVE_IMPULSE = 4
const KB_DECAY = 0.8

const MELEE_WINDUP = 3
const MELEE_ACTIVE = 4
const MELEE_RECOVERY = 8
const MELEE_REACH = 10
const MELEE_RADIUS = 11

const THROW_RANGE = 224 // fixed: every throw covers 14 tiles of path, wall bounces included
const THROW_RECOVERY = 4
const THROW_OFFSET = 8

// Sprite animation lengths. Render-only: the sim timings above are what they were. Melee and the
// dash roll take their frame from the state timer; these cover the throw and the catch, which are
// instant in the sim.
const THROW_FRAME = 8 // ticks per throw frame: release, follow-through, settle
const THROW_ANIM = 3 * THROW_FRAME // three times the sim recovery on purpose: the pose is the point
const CATCH_ANIM = 14 // clutch frame after a catch or a pickup
const REACH_TTL = 3 // the reach frame lingers this long after the boomerang was last seen closing in
const ROLL_FRAME = 3 // ticks per roll frame: tuck, four tumble frames, unroll
const ROLL_ANIM = 6 * ROLL_FRAME // longer than the dash itself; the roll finishes during the slide

// Flight profile: the boomerang leaves the hand at BOOM_SPEED and loses speed at a constant rate the
// whole way out, drifting to a dead stop exactly at the end of its range — the speed curve of a ball
// tossed straight up, so its position over time is a parabola. It hangs there, then accelerates back
// at the same rate. Aaron asked for this (2026-10-08) over the measured Boomerang Fu profile of a
// flat cruise and a hard brake (docs/notes-boomerang-fu-motion.md), which read as "moving at a
// constant speed and then stopping". Holding the throw button keeps it hanging up there (a hover);
// letting go recalls it at full speed from the first tick instead of the gradual return.
const BOOM_RADIUS = 10 // hit radius against players and melee swings (Aaron's number; generous next to the 11 px sprite)
const BOOM_WALL_RADIUS = 4 // collision radius against walls; a little under the sprite so bounces hug the wall face
const BOOM_SPRITE = 11 // the chevron sprite is BOOM_SPRITE square, drawn centred on the boomerang
const BOOM_SPEED = 10 // launch speed; a full 224 px throw takes 46 ticks (0.77 s) to come to rest
const BOOM_HANG = 3 // dead stop at the top of the throw before it turns back (the slow approach already reads as a pause)
const BOOM_HOVER_MAX = 45 // the throw button held keeps it hanging up to this long (1.5 s)
const BOOM_RETURN_SPEED = 12 // cap on the return; a regular return from full range arrives at ~10
const BOOM_RECALL_SPEED = 12 // a hovered boomerang comes back at this speed from its first tick
const BOOM_BRAKE = 0.6 // emergency decel once the bounce or flight cap is hit
const BOOM_TURN = 0.16 // homing steer while returning, as a fraction of speed per tick
const BOOM_TURN_NEAR = 0.4 // within BOOM_NEAR_DIST of the owner it bends hard to land the catch
const BOOM_NEAR_DIST = 48
const BOOM_MAX_BOUNCES = 4
const BOOM_MAX_FLIGHT = 240
const CATCH_RADIUS = 10
const CATCH_REACH = CATCH_RADIUS + 4 * BOOM_RETURN_SPEED // the owner reaches when the catch is ~4 ticks away
const PICKUP_RADIUS = 8
const DROP_FRICTION = 0.85
const DEFLECT_SPEED = 7.5
const DEFLECT_RANGE = 112
const DEFLECT_GRACE = 1 // a swing still deflects (but no longer kills) for this many ticks after its active frames: 5-tick window vs 4, Aaron wanted ~20% more time
const BOOM_SUBSTEP = 8 // max px of outbound movement per wall-collision test, so a fast boomerang cannot land inside a 16 px wall
// Arming your own boomerang (Aaron, 2026-10-08): smacking a boomerang you already own turns it into
// a bomb. It relaunches a little slower than a throw over BOMB_RANGE, sits still, beeps twice,
// shrinks, and blows up. A steal keeps an armed boomerang armed.
const BOMB_SPEED_MULT = 0.8 // an armed boomerang launches at 80 % of BOOM_SPEED (Aaron: slower, not faster)
const BOMB_RANGE = Math.round(THROW_RANGE * 0.7) // 157 px: 7/10 of a throw, then it sits
const BOMB_PAUSE = 15 // ticks it sits quietly before the first beep
const BOMB_BEEP_GAP = 10 // ticks from the first beep to the second
const BOMB_BEEP_LEN = 3 // ticks each beep flashes white
const BOMB_SHRINK = 12 // ticks it shrinks after the second beep, then the blast
const BOMB_FUSE = BOMB_PAUSE + BOMB_BEEP_GAP + BOMB_BEEP_LEN + BOMB_SHRINK // 40 ticks (0.67 s) at rest before the blast
const BOMB_RADIUS = 40 // radius of the drawn blast ring, 2.5 tiles
const BOMB_HIT_RADIUS = Math.round(BOMB_RADIUS * 0.9) // 36 px kill radius, 10 % inside the ring so its edge is safe; the owner is not spared
const BLAST_TTL = 18 // ticks the blast ring and flash last
const BEEP_RING = 14 // radius of the little ring a beep pops out
const BEEP_RING_TTL = 8
const BOMB_COLOR = PAL.flameO
const BOOM_HEIGHT = 6
const BOOM_FIRE_TICKS = 60 // a boomerang that crossed a lit vent trails fire this long (render-only flag)

const RESPAWN_TICKS = 90
const SPAWN_PROTECT = 40
const ROUND_SECONDS = 60

// Tiles and hazards (docs/02 §12). Cycles are off → warn → on, in ticks; "on" is the lethal or
// closed part. Every tile of a kind shares one clock; the half-cycle legend variants run half a
// period behind, so stripes alternate.
const GRASS_REGROW = 480 // ticks from cut to standing again
const GRASS_SPROUT = 60 // the last GRASS_SPROUT of those it shows sprouts
const BARREL_FUSE = 24
const BARREL_HIT_RADIUS = 24
const BARREL_RING_RADIUS = 27
const ICE_GRIP = 0.2 // fraction of ACCEL you get on ice; the heading no longer snaps
const ICE_FRICTION = 0.94 // velocity kept per tick on ice with no input (or in a dash slide)
const KB_DECAY_ICE = 0.93 // knockback also carries further on ice
const SPIKE_CYCLE: Cycle = { off: 120, warn: 30, on: 45 }
const VENT_CYCLE: Cycle = { off: 150, warn: 30, on: 40 }
const GATE_CYCLE: Cycle = { off: 300, warn: 45, on: 300 } // off = open, warn = rattling, on = closed
const CRUMBLE_WARN = 30 // ticks from the first footstep to the fall
const CRUMBLE_RESET = 600 // demo only: a crumbled tile comes back so the strip stays walkable
const BELT_SPEED = 0.75
const PLATFORM_SPEED = 0.5
const PLATFORM_DWELL = 30
const CRUSHER_SPEED = 2
const CRUSHER_DWELL = 20
const CRUSHER_KILL_RADIUS = 7 // dash i-frames do protect: a crusher comes at you
const CART_SPEED = 2.5
const CART_DWELL = 60
const CART_SHOVE = 6
const CART_HALF_W = 8
const CART_HALF_H = 6
const BUMPER_RADIUS = 6
const BUMPER_SHOVE = 5
const CHANDELIER_HEIGHT = 22
const CHANDELIER_CREAK = 20
const CHANDELIER_FALL = 8
const CHANDELIER_KILL_RADIUS = 14
const CHANDELIER_TRIGGER_RADIUS = 12
const CHANDELIER_RESET = 900 // demo only: it is hoisted back up
const CHANDELIER_FADE = 90 // the rubble's candles go out over this long
const HAZARD_CREDIT_TICKS = 90 // a hazard kill goes to whoever shoved you within this long
const DARK_AMBIENT = 0.92 // lightmap darkness inside a dark zone (0.4 elsewhere)
const CANDLE_AMBIENT = 0.55 // lightmap darkness in a room lit only by its chandeliers, all of them hanging; DARK_AMBIENT once they are all down
const CAM_LERP = 0.12
const SFX_RANGE = 400 // sounds further than this from the local player are not played

// ---------------------------------------------------------------- setup
function reportError(msg: string) {
  console.error(msg)
  const pre = document.createElement('pre')
  pre.style.cssText = 'color:#f66;position:fixed;top:0;left:0;background:#000;z-index:9'
  pre.textContent = msg
  document.body.appendChild(pre)
}
window.addEventListener('error', (e) => reportError(`${e.message}\n${e.error?.stack ?? ''}`))
window.addEventListener('unhandledrejection', (e) => reportError(String(e.reason)))

const params = new URLSearchParams(location.search)
const seed = Number(params.get('seed') ?? 7)
const scriptedTicks = params.has('t') ? Number(params.get('t')) : -1
// ?trace=1 logs every boomerang's state per scripted tick to the console (shot.sh echoes CONSOLE lines)
const trace = params.get('trace') === '1'
const idle = params.get('idle') === '1'
// ?push=x,y: in the scripted scene, hold this movement direction from the dash onwards
const push = params.has('push') ? params.get('push')!.split(',').map(Number) : null
// ?walk=x,y[,T]: in the scripted scene, hold this direction from tick 0 (until tick T) and throw along it at tick 10
const walk = params.has('walk') ? params.get('walk')!.split(',').map(Number) : null
// ?aim=dx,dy: where the scripted cursor sits relative to the player
const aimOff = params.has('aim') ? params.get('aim')!.split(',').map(Number) : [120, 10]
let lightingOn = params.get('light') !== '0'
const localChar = Math.min(3, Math.max(0, Number(params.get('char') ?? 0)))
const sheet = params.get('sheet') // '1' = the local character's frames, 'all' = every character
const startAt = params.get('at')?.split(',').map(Number) // c,r tile for the local player

const rng = mulberry32(seed)
/** A roster room by key (arenas.ts), else one of the demo layouts. */
function pickDef(name: string): ArenaDef {
  return ARENAS[name] ?? (name === 'floor' ? ARENA_FLOOR : name === 'brawl' ? ARENA_BRAWL : ARENA_STRIP)
}
// the roster's first room unless asked otherwise; ?at= on its own means the strip, whose tiles it names
const arenaName = params.get('arena') ?? (startAt ? 'strip' : ARENA_LIST[0].key)
// where we are in the roster, for cycling; -1 on the strip and the two old demo layouts
let arenaIndex = ARENA_LIST.findIndex((a) => a.key === arenaName)
/** The roster entry being played, if it is one (the strip and the old layouts have no entry). */
function arenaEntry(): ArenaEntry | null {
  return arenaIndex >= 0 ? ARENA_LIST[arenaIndex] : null
}

// Everything from here down to loadArena() is per-arena state. It is assigned by loadArena(),
// not here, because Tab swaps the room at runtime and rebuilds all of it from a new definition.
let def!: ArenaDef
let look: Look = LOOKS.stone
let arena!: ArenaMap
let W!: number // the viewport is 40 tiles wide whatever the arena is
let H!: number
let WORLD_W!: number
let WORLD_H!: number

let tick = 0

// per-tile state: when each grass tile was cut (-1 standing), when a crumble tile was first stepped
// on and when it fell (-1 never)
let grassCut!: Int32Array
const cutList: number[] = []
let crumbleStart!: Int32Array
let crumbleGone!: Int32Array
const crumbling: number[] = []

const grassLook: GrassAt = (c, r) => {
  const t = grassCut[r * arena.cols + c]
  if (t < 0) return 'full'
  return tick - t < GRASS_REGROW - GRASS_SPROUT ? 'stubble' : 'sprout'
}
let staticLayer!: HTMLCanvasElement
let staticCtx!: CanvasRenderingContext2D

function idx(c: number, r: number): number {
  return r * arena.cols + c
}

// what stands in each tile: 0 open, 1 wall, 2 crate, 3 barrel, 4 closed gate
let solid!: Uint8Array

interface Crate {
  c: number
  r: number
  alive: boolean
}
interface Barrel {
  c: number
  r: number
  alive: boolean
  lit: boolean
  fuse: number
  lighter: number // player id that lit it, or -1
}
interface Bumper {
  x: number
  y: number
  hitT: number
}
const crates: Crate[] = []
const barrels: Barrel[] = []
const bumpers: Bumper[] = []
let crateAt!: Int16Array
let barrelAt!: Int16Array

interface Platform {
  rail: Rail
  w: number
  h: number
  pos: RailPos // top-left corner this tick
  prev: RailPos // and last tick, so riders move by the difference
}
interface Gate {
  tiles: { c: number; r: number }[]
  phase: number
  vertical: boolean // bars along a wall column (true) or a wall row
  closed: boolean
}
interface Crusher {
  look: 'saw' | 'pendulum' | 'boulder'
  rail: Rail
  pos: RailPos
  anchor: Pt
}
interface Cart {
  rail: Rail
  pos: RailPos
  prev: RailPos
}
type ChandelierState = 'hang' | 'creak' | 'fall' | 'rubble'
interface Chandelier {
  x: number
  y: number
  ay: number // where the chain meets the wall
  state: ChandelierState
  t: number
  by: number // who knocked it down, for the kill credit
}
/**
 * One mouth of a portal: a wall tile, the open side it faces (unit normal out of the wall into the
 * room), the centre of that face, its colour, and where its oval is drawn (MouthLook).
 */
interface Mouth extends art.MouthLook {
  c: number
  r: number
  x: number // centre of the face: the tile's edge on the open side
  y: number
  hue: 'blue' | 'orange'
}
interface Portal {
  ends: [Mouth, Mouth] // blue, orange
  usedT: number // tick something last went through, for the flare
}
const platforms: Platform[] = []
const gates: Gate[] = []
const crushers: Crusher[] = []
const carts: Cart[] = []
const chandeliers: Chandelier[] = []
const portals: Portal[] = []
const darkZones: { x0: number; x1: number }[] = []

const tileCorner = ([c, r]: [number, number]): Pt => ({ x: c * TILE, y: r * TILE })
const tileCentre = ([c, r]: [number, number]): Pt => ({ x: c * TILE + 8, y: r * TILE + 8 })

/**
 * Builds every piece of per-arena state from a definition: the map and the canvas size, the static
 * layer, the solid grid, props, hazards and the fixed parts of the movers. Runs once at start and
 * again whenever Tab swaps the room; switchArena() below then re-seats the players in it.
 */
function loadArena(d: ArenaDef) {
  def = d
  arena = parseArena(d.rows)
  W = Math.min(40, arena.cols) * TILE
  H = HUD_H + arena.rows * TILE
  WORLD_W = arena.cols * TILE
  WORLD_H = arena.rows * TILE
  tick = 0
  const n = arena.cols * arena.rows

  grassCut = new Int32Array(n).fill(-1)
  cutList.length = 0
  crumbleStart = new Int32Array(n).fill(-1)
  crumbleGone = new Int32Array(n).fill(-1)
  crumbling.length = 0
  look = LOOKS[d.look ?? 'stone'] ?? LOOKS.stone
  staticLayer = renderArenaStatic(arena, seed, grassLook, look)
  staticCtx = ctx2d(staticLayer)

  solid = new Uint8Array(n)
  for (let i = 0; i < arena.tiles.length; i++) solid[i] = arena.tiles[i] === TileKind.Wall ? 1 : 0

  crates.length = 0
  barrels.length = 0
  bumpers.length = 0
  crateAt = new Int16Array(n).fill(-1)
  barrelAt = new Int16Array(n).fill(-1)
  for (const p of arena.props) {
    const i = idx(p.c, p.r)
    if (p.kind === 'crate') {
      crateAt[i] = crates.length
      crates.push({ c: p.c, r: p.r, alive: true })
      solid[i] = 2
    } else if (p.kind === 'barrel') {
      barrelAt[i] = barrels.length
      barrels.push({ c: p.c, r: p.r, alive: true, lit: false, fuse: 0, lighter: -1 })
      solid[i] = 3
    } else if (p.kind === 'bumper') bumpers.push({ x: p.c * TILE + 8, y: p.r * TILE + 8, hitT: -999 })
  }

  platforms.length = 0
  gates.length = 0
  crushers.length = 0
  carts.length = 0
  chandeliers.length = 0
  portals.length = 0
  darkZones.length = 0
  for (const h of d.hazards) {
    switch (h.kind) {
      case 'platform': {
        const rail: Rail = { pts: h.rail.map(tileCorner), speed: h.speed ?? PLATFORM_SPEED, dwell: h.dwell ?? PLATFORM_DWELL, phase: h.phase ?? 0 }
        const pos = railPos(rail, 0)
        platforms.push({ rail, w: h.w * TILE, h: h.h * TILE, pos, prev: pos })
        break
      }
      case 'crusher': {
        const rail: Rail = { pts: h.rail.map(tileCentre), speed: h.speed ?? CRUSHER_SPEED, dwell: h.dwell ?? CRUSHER_DWELL, phase: h.phase ?? 0 }
        // a pendulum's chain runs up to a runner at the top of the wall face on the anchor row
        const mid = rail.pts[0]
        const anchor = h.anchor ? { x: h.anchor[0] * TILE + 8, y: h.anchor[1] * TILE + 2 } : { x: mid.x, y: mid.y - 24 }
        crushers.push({ look: h.look, rail, pos: railPos(rail, 0), anchor })
        break
      }
      case 'cart': {
        const rail: Rail = { pts: h.rail.map(tileCentre), speed: h.speed ?? CART_SPEED, dwell: h.dwell ?? CART_DWELL, phase: h.phase ?? 0 }
        const pos = railPos(rail, 0)
        carts.push({ rail, pos, prev: pos })
        break
      }
      case 'gate':
        gates.push({
          tiles: h.tiles.map(([c, r]) => ({ c, r })),
          phase: h.phase ?? 0,
          vertical: h.tiles.every(([c]) => c === h.tiles[0][0]),
          closed: false,
        })
        break
      case 'chandelier':
        chandeliers.push({ x: h.c * TILE + 8, y: h.r * TILE + 8, ay: TILE + 12, state: 'hang', t: 0, by: -1 })
        break
      case 'portal': {
        const DIRS = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] } as const
        const mouth = ([c, r]: [number, number], face: keyof typeof DIRS | undefined, hue: 'blue' | 'orange'): Mouth => {
          if (tileAt(arena, c, r) !== TileKind.Wall) throw new Error(`portal mouth ${c},${r} is not a wall tile`)
          // a mouth faces its open side: as given, or the first of south, north, east, west that is not wall
          const f = face ?? (['s', 'n', 'e', 'w'] as const).find((k) => tileAt(arena, c + DIRS[k][0], r + DIRS[k][1]) !== TileKind.Wall)
          if (!f) throw new Error(`portal mouth ${c},${r} has no open side`)
          const [nx, ny] = DIRS[f]
          const x = c * TILE + 8 + nx * 8
          const y = r * TILE + 8 + ny * 8
          // on a wall face the oval stands on the ground line and reaches up into the cap above it;
          // on a wall seen from above it lies along the open edge
          const tall = ny === 1 && tileAt(arena, c, r - 1) === TileKind.Wall
          const gx = ny === 1 ? x : x - nx * 5
          const gy = ny === 1 ? y - (tall ? 13 : 8) : y - ny * 5
          const blue = hue === 'blue'
          return { c, r, x, y, nx, ny, gx, gy, tall, hue, col: blue ? PAL.portalBlue : PAL.portalOrange, lit: blue ? PAL.portalBlueLight : PAL.portalOrangeLight, dark: blue ? PAL.portalBlueDark : PAL.portalOrangeDark }
        }
        portals.push({ ends: [mouth(h.a, h.aFace, 'blue'), mouth(h.b, h.bFace, 'orange')], usedT: -999 })
        break
      }
      case 'dark':
        darkZones.push({ x0: h.c0 * TILE, x1: (h.c1 + 1) * TILE })
        break
    }
  }
  // the fixed parts of the movers go into the static layer: grooves, trenches, rails, tracks
  for (const cr of crushers) {
    if (cr.look === 'saw') art.drawSawGroove(staticCtx, cr.rail.pts)
    else if (cr.look === 'boulder') art.drawTrench(staticCtx, cr.rail.pts)
  }
  for (const ct of carts) art.drawCartRails(staticCtx, ct.rail.pts)
  for (const g of gates) for (const t of g.tiles) art.drawGateTrack(staticCtx, t.c * TILE, t.r * TILE, g.vertical)
}
loadArena(pickDef(arenaName))

/**
 * The portal mouth a body of radius r at (x, y) moving by (dx, dy) is about to press into, if any:
 * heading into the wall, reaching the face this tick, lined up with the tile. Checked before wall
 * collision, so the wall never gets to stop it.
 */
function mouthAhead(x: number, y: number, dx: number, dy: number, r: number): { portal: Portal; from: Mouth; to: Mouth } | null {
  for (const po of portals) {
    for (let i = 0; i < 2; i++) {
      const m = po.ends[i]
      const into = -(dx * m.nx + dy * m.ny)
      if (into <= 1e-3) continue
      const depth = (x - m.x) * m.nx + (y - m.y) * m.ny // how far in front of the face the centre is
      if (depth < -1 || depth - into > r) continue
      const side = (x - m.x) * m.ny - (y - m.y) * m.nx // offset along the face from its centre
      if (Math.abs(side) > 7) continue
      return { portal: po, from: m, to: po.ends[1 - i] }
    }
  }
  return null
}

// The Portal rule: the two mouths are one doorway. Heading into one is heading out of the other,
// what was on your right stays on your right, speed is kept. With four facings that is always a
// whole number of quarter turns, so a turn is stored as one and applied with rotQ.
/** Quarter turns (clockwise on screen) taking the way into `from` to the way out of `to`. */
function quarterTurns(from: Mouth, to: Mouth): number {
  let x = -from.nx
  let y = -from.ny
  for (let q = 0; q < 4; q++) {
    if (x === to.nx && y === to.ny) return q
    ;[x, y] = [-y, x]
  }
  return 0
}
function rotQ(x: number, y: number, q: number): [number, number] {
  for (let i = 0; i < q; i++) [x, y] = [-y, x]
  return [x, y]
}
/** Where a body of radius r comes out of `to` after going into `from` at (x, y): just clear of the exit face, same offset along it. */
function exitPoint(from: Mouth, to: Mouth, x: number, y: number, r: number): [number, number] {
  const lim = 8 - r - 0.5 // keep the body inside the mouth's tile
  const s = Math.max(-lim, Math.min(lim, (x - from.x) * from.ny - (y - from.y) * from.nx))
  const gap = r + 0.6
  return [to.x + to.nx * gap - to.ny * s, to.y + to.ny * gap + to.nx * s]
}

/** A player going through: position and every vector they carry are turned, and the stick is remembered (throughTurn). */
function enterPortal(p: Player, hit: { portal: Portal; from: Mouth; to: Mouth }, raw: Input) {
  const { from, to } = hit
  const q = quarterTurns(from, to)
  spawnBurst(from.gx, from.gy, from.lit, 10, 1.4)
  if (near(from.x) || near(to.x)) sfxWarp()
  ;[p.x, p.y] = exitPoint(from, to, p.x, p.y, PLAYER_RADIUS)
  ;[p.vx, p.vy] = rotQ(p.vx, p.vy, q)
  ;[p.slideX, p.slideY] = rotQ(p.slideX, p.slideY, q)
  ;[p.kbx, p.kby] = rotQ(p.kbx, p.kby, q)
  ;[p.dashX, p.dashY] = rotQ(p.dashX, p.dashY, q)
  const il = len(raw.mx, raw.my)
  p.turn = il > 0.1 ? { ix: raw.mx / il, iy: raw.my / il, q: ((p.turn?.q ?? 0) + q) % 4 } : null
  hit.portal.usedT = tick
  spawnBurst(to.gx, to.gy, to.lit, 10, 1.4)
  eventLog.push(`t${tick} P${p.id} went through the ${from.hue} portal`)
}

/**
 * After a portal, a stick still held the way it was going in keeps meaning "onwards": it is read
 * through the portal's turn until it is let go or moved, so a pair on the same wall does not
 * swallow you straight back. Screen-relative controls cannot turn with you the way a first-person
 * camera does; this is the nearest thing.
 */
function throughTurn(p: Player, raw: Input): Input {
  if (!p.turn) return raw
  const il = len(raw.mx, raw.my)
  if (il < 0.1 || (raw.mx * p.turn.ix + raw.my * p.turn.iy) / il < 0.5) {
    p.turn = null
    return raw
  }
  const [mx, my] = rotQ(raw.mx, raw.my, p.turn.q)
  return { ...raw, mx, my }
}

// shared clocks for the periodic tiles: plain and half-cycle variants
function half(c: Cycle): number {
  return cyclePeriod(c) >> 1
}
let spikeA: PhaseInfo = cyclePhase(0, 0, SPIKE_CYCLE)
let spikeB: PhaseInfo = cyclePhase(0, half(SPIKE_CYCLE), SPIKE_CYCLE)
let ventA: PhaseInfo = cyclePhase(0, 0, VENT_CYCLE)
let ventB: PhaseInfo = cyclePhase(0, half(VENT_CYCLE), VENT_CYCLE)
function phaseOf(kind: TileKind, c: number, r: number): PhaseInfo {
  const b = arena.phase[idx(c, r)] === 1
  if (kind === TileKind.Spikes) return b ? spikeB : spikeA
  return b ? ventB : ventA
}

function isSolid(c: number, r: number): boolean {
  if (c < 0 || r < 0 || c >= arena.cols || r >= arena.rows) return true
  return solid[idx(c, r)] !== 0
}
/** Crates don't stop a boomerang: it breaks them and flies on. Everything else solid does. */
function isSolidForBoom(c: number, r: number): boolean {
  if (c < 0 || r < 0 || c >= arena.cols || r >= arena.rows) return true
  const s = solid[idx(c, r)]
  return s !== 0 && s !== 2
}
function kindAt(x: number, y: number): TileKind {
  return tileAt(arena, Math.floor(x / TILE), Math.floor(y / TILE))
}
/** A pit (a crumbled tile becomes one). */
function pitLike(c: number, r: number): boolean {
  return tileAt(arena, c, r) === TileKind.Pit
}
function platformAt(x: number, y: number): number {
  for (let i = 0; i < platforms.length; i++) {
    const pl = platforms[i]
    if (x >= pl.pos.x && x < pl.pos.x + pl.w && y >= pl.pos.y && y < pl.pos.y + pl.h) return i
  }
  return -1
}
/** Nothing under this point: the centre of anything here falls. */
function overPit(x: number, y: number): boolean {
  return pitLike(Math.floor(x / TILE), Math.floor(y / TILE)) && platformAt(x, y) < 0
}
/** Plain footing: where the bots are happy to walk and a lost boomerang is happy to land. */
function plainFloor(c: number, r: number): boolean {
  if (isSolid(c, r)) return false
  const k = tileAt(arena, c, r)
  return k === TileKind.Floor || k === TileKind.Grass || k === TileKind.Ice
}
function blocksWalk(c: number, r: number): boolean {
  return !plainFloor(c, r)
}
function inGrass(x: number, y: number): boolean {
  return kindAt(x, y) === TileKind.Grass && grassCut[idx(Math.floor(x / TILE), Math.floor(y / TILE))] < 0
}
function onIce(x: number, y: number): boolean {
  return kindAt(x, y) === TileKind.Ice
}
function zoneName(x: number): string {
  const c = Math.floor(x / TILE)
  return def.zones.find((z) => c >= z.c0 && c <= z.c1)?.name ?? ''
}
/** How dark it is at world x: 1 deep inside a dark zone, fading out over ~6 tiles around its edges. */
function darknessAt(x: number): number {
  let d = 0
  for (const z of darkZones) {
    const inside = Math.min(x - z.x0, z.x1 - x)
    d = Math.max(d, Math.min(1, Math.max(0, (inside + 48) / 96)))
  }
  return d
}
/**
 * The lightmap's base darkness at world x: the strip's dark zones, and in a room lit only by its
 * chandeliers, how much of that light is left. Each chandelier still hanging keeps its share; a
 * dropped one's candles fade over CHANDELIER_FADE ticks; with all of them down the room is as dark
 * as a dark zone.
 */
function ambientAt(x: number): number {
  let d = 0.4 + (DARK_AMBIENT - 0.4) * darknessAt(x)
  if (def.lightSource === 'chandeliers' && chandeliers.length) {
    let lit = 0
    for (const ch of chandeliers) lit += ch.state === 'rubble' ? Math.max(0, 1 - ch.t / CHANDELIER_FADE) : 1
    d = Math.max(d, CANDLE_AMBIENT + (DARK_AMBIENT - CANDLE_AMBIENT) * (1 - lit / chandeliers.length))
  }
  return d
}

// ---------------------------------------------------------------- sprites
// One action's frames for every facing. The art draws down/up action frames with the arm on the
// right and side frames facing right; the L copies are the mirrors, used when aiming left.
interface ActionSet {
  down: Sprite[]
  downL: Sprite[]
  up: Sprite[]
  upL: Sprite[]
  sideR: Sprite[]
  sideL: Sprite[]
}
interface CharSet {
  stand: ActionSet
  run: ActionSet
  throw: ActionSet
  catch: ActionSet
  melee: ActionSet
  roll: Sprite[] // tumbling to the right
  rollL: Sprite[]
}

const charSets: CharSet[][] = CHARACTERS.map((ch) =>
  PLAYER_COLORS.map((col) => {
    const key = withPrimary(CHAR_KEY, col)
    const make = (f: FacingFrames): ActionSet => {
      const down = f.down.map((r) => spriteFromRows(r, key, ch.name))
      const up = f.up.map((r) => spriteFromRows(r, key, ch.name))
      const sideR = f.side.map((r) => spriteFromRows(r, key, ch.name))
      return { down, downL: down.map(flipX), up, upL: up.map(flipX), sideR, sideL: sideR.map(flipX) }
    }
    const roll = ch.roll.map((r) => spriteFromRows(r, key, ch.name))
    return { stand: make(ch.stand), run: make(ch.run), throw: make(ch.throw), catch: make(ch.catch), melee: make(ch.melee), roll, rollL: roll.map(flipX) }
  }),
)

const boomSets: Sprite[][] = PLAYER_COLORS.map((col) => {
  const f0 = spriteFromRows(BOOMERANG, withPrimary(PROP_KEY, col), 'boomerang')
  const f1 = rotate90(f0)
  const f2 = rotate90(f1)
  const f3 = rotate90(f2)
  return [f0, f1, f2, f3]
})

const crateSprite = spriteFromRows(CRATE, PROP_KEY, 'crate')
const barrelSprite = spriteFromRows(BARREL, PROP_KEY, 'barrel')
const torchFrames = TORCH.map((f) => spriteFromRows(f, PROP_KEY, 'torch'))
const shadowDude = spriteFromRows(SHADOW_DUDE, PROP_KEY, 'shadow')
const shadowBoom = spriteFromRows(SHADOW_BOOM, PROP_KEY, 'shadow')

const silCache = new Map<Sprite, Map<string, Sprite>>()
function sil(s: Sprite, color: string): Sprite {
  let m = silCache.get(s)
  if (!m) silCache.set(s, (m = new Map()))
  let out = m.get(color)
  if (!out) m.set(color, (out = silhouette(s, color)))
  return out
}

// ---------------------------------------------------------------- state
type Facing = 'down' | 'up' | 'side'
type PState = 'idle' | 'melee' | 'dash' | 'dead'
// Sprite-only pose: the throw, reaching for the returning boomerang, clutching it, and the roll
// (which starts with the dash state and keeps going after it ends, through the slide).
type Anim = 'none' | 'throw' | 'reach' | 'catch' | 'roll'

interface Player {
  id: number
  char: number
  color: number
  x: number
  y: number
  vx: number
  vy: number
  kbx: number
  kby: number
  aimX: number
  aimY: number
  cursorX: number
  cursorY: number
  facing: Facing
  flip: boolean
  walkT: number
  moving: boolean
  state: PState
  stateT: number
  dashX: number
  dashY: number
  slideX: number // the slide out of the last dash: a base velocity the walk is added to until friction drops it
  slideY: number
  windup: number // ticks spent running in place from a standstill
  held: boolean
  holdThrow: boolean // this tick's throw-button-held input, read by the hanging boomerang
  throwRec: number
  anim: Anim
  animT: number
  dashCd: number
  invuln: number
  respawnT: number
  spawnX: number
  spawnY: number
  score: number
  meleeHits: Set<string>
  lastShover: number // who last dash-shoved us, and when: a hazard kill inside HAZARD_CREDIT_TICKS is theirs
  lastShoveT: number
  plat: number // platform we stood on at the end of last tick, or -1
  turn: { ix: number; iy: number; q: number } | null // after a portal: the stick as held going in, and the quarter turns it is read through (throughTurn)
  ai: { tx: number; ty: number; retarget: number; throwT: number } | null
}

type BState = 'out' | 'hang' | 'return' | 'dropped'

interface Boomerang {
  owner: number
  x: number
  y: number
  vx: number
  vy: number
  state: BState
  range: number
  traveled: number
  decel: number // speed lost per outbound tick, set at launch so it comes to rest at the end of its range
  recall: boolean // it hovered, so it comes back at full speed rather than accelerating out of the hang
  hangT: number // ticks spent hanging so far
  armed: boolean // set by deflecting your own boomerang: it blows up at the end of its flight instead of returning
  fire: number // ticks of fire trail left after crossing a lit vent (render-only)
  bounces: number
  flight: number
  spin: number
  trail: { x: number; y: number }[]
  hit: Set<number>
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  ttl: number
  max: number
  color: string
}

interface Half {
  s: Sprite
  sx: number
  sy: number
  sw: number
  sh: number
  x: number
  y: number
  vx: number
  vy: number
  ttl: number
  max: number
}

interface Sink {
  s: Sprite
  x: number
  y: number
  ttl: number
  max: number
}

interface Afterimage {
  s: Sprite
  x: number
  y: number
  ttl: number
  max: number
}

interface Slash {
  x: number
  y: number
  ax: number
  ay: number
  color: string
  ttl: number
  max: number
}

/** An expanding ring: the blast itself, or the little pulse each fuse beep pops out. */
interface Blast {
  x: number
  y: number
  r: number
  ttl: number
  max: number
}

/** A dab of slime left on the floor behind a crawling character; fades out, never moves. */
interface Smear {
  x: number
  y: number
  w: number
  ttl: number
  max: number
  color: string
}

const players: Player[] = []
let booms: Boomerang[] = []
let particles: Particle[] = []
let halves: Half[] = []
let sinks: Sink[] = []
let afterimages: Afterimage[] = []
let slashes: Slash[] = []
let blasts: Blast[] = []
let smears: Smear[] = []
const eventLog: string[] = []

function makePlayer(id: number, char: number, color: number, ai: boolean): Player {
  const sp = arena.spawns[id] ?? arena.spawns[0] ?? { c: 3, r: 3 }
  const x = sp.c * TILE + 8
  const y = sp.r * TILE + 8
  return {
    id,
    char,
    color,
    x,
    y,
    vx: 0,
    vy: 0,
    kbx: 0,
    kby: 0,
    aimX: 1,
    aimY: 0,
    cursorX: x + 60,
    cursorY: y,
    facing: 'down',
    flip: false,
    walkT: 0,
    moving: false,
    state: 'idle',
    stateT: 0,
    dashX: 0,
    dashY: 0,
    slideX: 0,
    slideY: 0,
    windup: 0,
    held: true,
    holdThrow: false,
    throwRec: 0,
    anim: 'none',
    animT: 0,
    dashCd: 0,
    invuln: 0,
    respawnT: 0,
    spawnX: x,
    spawnY: y,
    score: 0,
    meleeHits: new Set(),
    lastShover: -1,
    lastShoveT: -9999,
    plat: -1,
    turn: null,
    ai: ai ? { tx: x, ty: y, retarget: 0, throwT: 60 + Math.floor(rng() * 120) } : null,
  }
}

players.push(makePlayer(0, localChar, 0, false))
if (startAt && startAt.length === 2 && startAt.every((n) => Number.isFinite(n))) {
  const p0 = players[0]
  p0.x = p0.spawnX = startAt[0] * TILE + 8
  p0.y = p0.spawnY = startAt[1] * TILE + 8
  p0.cursorX = p0.x + 60
  p0.cursorY = p0.y
}
// bots are off by default so the floor is free for feel-testing; ?bots=1-3 brings them back
const botCount = Math.min(3, Math.max(0, Number(params.get('bots') ?? 0) || 0))
for (let i = 1; i <= botCount; i++) players.push(makePlayer(i, (i + localChar) % 4, i, true))

/** True when a sound at world x is close enough to the local player to be worth playing. */
function near(x: number): boolean {
  return Math.abs(x - players[0].x) < SFX_RANGE
}

// ---------------------------------------------------------------- input
interface Input {
  mx: number
  my: number
  throw: boolean
  melee: boolean
  dash: boolean
  hold: boolean // throw button currently down: keeps a hanging boomerang hovering
  cursorX: number
  cursorY: number
}

const keys = new Set<string>()
let mouseX = W / 2
let mouseY = H / 2
let mouseDown = [false, false, false]
let throwQueued = false
let meleeQueued = false
let dashQueued = false
// where the HUD draws the room label and its < > arrows, so a click on it cycles the roster
let hudArenaBox = { x0: 0, x1: 0 }

const mount = document.getElementById('game')!
const screen = createScreen(W, H, mount)

window.addEventListener('keydown', (e) => {
  if (e.repeat) return
  unlockAudio()
  keys.add(e.code)
  if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') dashQueued = true
  if (e.code === 'KeyF') meleeQueued = true
  if (e.code === 'KeyL') lightingOn = !lightingOn
  if (e.code >= 'Digit1' && e.code <= 'Digit4') players[0].char = Number(e.code[5]) - 1
  if (e.code === 'Tab') switchArena(e.shiftKey ? -1 : 1)
  if (e.code === 'Space' || e.code === 'Tab') e.preventDefault()
})
window.addEventListener('keyup', (e) => keys.delete(e.code))
window.addEventListener('mousemove', (e) => {
  ;[mouseX, mouseY] = screen.toInternal(e.clientX, e.clientY)
})
window.addEventListener('mousedown', (e) => {
  unlockAudio()
  const [mx, my] = screen.toInternal(e.clientX, e.clientY)
  // a click on the room label in the HUD cycles the roster (left half back, right half on), not a throw
  if (e.button === 0 && my < HUD_H && mx >= hudArenaBox.x0 && mx <= hudArenaBox.x1) {
    switchArena(mx < (hudArenaBox.x0 + hudArenaBox.x1) / 2 ? -1 : 1)
    e.preventDefault()
    return
  }
  mouseDown[e.button] = true
  if (e.button === 0) throwQueued = true
  if (e.button === 2) meleeQueued = true
  if (e.button === 1) dashQueued = true
  e.preventDefault()
})
window.addEventListener('mouseup', (e) => {
  mouseDown[e.button] = false
})
window.addEventListener('contextmenu', (e) => e.preventDefault())

// camera: world x of the left edge of the view; follows the local player along the strip
let camX = 0

function readLocalInput(): Input {
  let mx = 0
  let my = 0
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1
  if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1
  const inp: Input = {
    mx,
    my,
    throw: throwQueued,
    melee: meleeQueued,
    dash: dashQueued,
    hold: mouseDown[0],
    cursorX: mouseX + camX,
    cursorY: mouseY - HUD_H,
  }
  throwQueued = meleeQueued = dashQueued = false
  return inp
}

/** Deterministic input for screenshot mode. */
function scriptedInput(t: number, p: Player): Input {
  // the second throw is held down: it hovers at the top of its flight, then is recalled
  const inp: Input = { mx: 0, my: 0, throw: false, melee: false, dash: false, hold: !idle && t >= 222 && t < 290, cursorX: p.x + aimOff[0], cursorY: p.y + aimOff[1] }
  if (idle) return inp
  if (walk) {
    // portal test: walk one way and throw along it
    if (walk.length < 3 || t < walk[2]) {
      inp.mx = walk[0]
      inp.my = walk[1]
    }
    inp.cursorX = p.x + walk[0] * 120
    inp.cursorY = p.y + walk[1] * 120
    inp.throw = t === 10
    inp.hold = false
    return inp
  }
  if (push && t >= 96) {
    // slide test: dash right, then hold one direction and watch it compound with the slide
    inp.dash = t === 96
    inp.mx = t === 96 ? 1 : push[0]
    inp.my = t === 96 ? 0.2 : push[1]
    return inp
  }
  if (t < 50) {
    inp.mx = 1
    inp.my = 0.45
  } else if (t === 52) {
    inp.throw = true
  } else if (t > 56 && t < 95) {
    inp.mx = -0.3
    inp.my = 1
    inp.cursorX = p.x + 90
    inp.cursorY = p.y + 50
  } else if (t === 96) {
    inp.dash = true
    inp.mx = 1
    inp.my = 0.2
  } else if (t === 135) {
    inp.melee = true // swing into the returning boomerang: an own-deflect, so it comes out armed
  } else if (t > 138 && t < 190) {
    inp.mx = -1 // then run from your own bomb
    inp.my = 0.4
    inp.cursorX = p.x + 150
    inp.cursorY = p.y - 40
  } else if (t >= 190 && t < 220) {
    inp.mx = 1 // and walk back towards where it dropped
    inp.my = -0.4
    inp.cursorX = p.x + 150
    inp.cursorY = p.y - 40
  } else if (t === 222) {
    inp.throw = true
    inp.cursorX = p.x + 150
    inp.cursorY = p.y - 40
  }
  return inp
}

// ---------------------------------------------------------------- helpers
function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y)
}

function norm(x: number, y: number): [number, number] {
  const l = len(x, y)
  return l > 1e-6 ? [x / l, y / l] : [1, 0]
}

function circleBlocked(x: number, y: number, r: number, test: (c: number, r: number) => boolean): boolean {
  const c0 = Math.floor((x - r) / TILE)
  const c1 = Math.floor((x + r) / TILE)
  const r0 = Math.floor((y - r) / TILE)
  const r1 = Math.floor((y + r) / TILE)
  for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) if (test(cc, rr)) return true
  return false
}

function moveX(p: { x: number; y: number }, dx: number, r: number, test: (c: number, r: number) => boolean): boolean {
  if (dx === 0) return false
  const nx = p.x + dx
  if (!circleBlocked(nx, p.y, r, test)) {
    p.x = nx
    return false
  }
  if (dx > 0) p.x = Math.floor((nx + r) / TILE) * TILE - r - 0.01
  else p.x = (Math.floor((nx - r) / TILE) + 1) * TILE + r + 0.01
  return true
}

function moveY(p: { x: number; y: number }, dy: number, r: number, test: (c: number, r: number) => boolean): boolean {
  if (dy === 0) return false
  const ny = p.y + dy
  if (!circleBlocked(p.x, ny, r, test)) {
    p.y = ny
    return false
  }
  if (dy > 0) p.y = Math.floor((ny + r) / TILE) * TILE - r - 0.01
  else p.y = (Math.floor((ny - r) / TILE) + 1) * TILE + r + 0.01
  return true
}

function spawnBurst(x: number, y: number, color: string, n: number, speed: number) {
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2
    const s = speed * (0.4 + rng() * 0.8)
    particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 0.5,
      ttl: 18 + Math.floor(rng() * 16),
      max: 30,
      color: rng() < 0.3 ? PAL.white : color,
    })
  }
}

/** True when the plain stand/run frame is what's on screen (so the run lift and held overlay apply). */
function showsWalk(p: Player): boolean {
  return p.state === 'idle' && p.anim === 'none'
}

/** Index into the character's run cycle: one counter drives every facing. 0 when standing. */
function runFrame(p: Player): number {
  if (!p.moving) return 0
  const art = CHARACTERS[p.char]
  return Math.floor(p.walkT / art.runPeriod) % art.run.down.length
}

/** Pixels the body is drawn above its shadow on the current run frame (the frog's hop, the shroom's bob). */
function runLift(p: Player): number {
  if (!showsWalk(p) || !p.moving) return 0
  return CHARACTERS[p.char].runLift[runFrame(p)] ?? 0
}

function playerSprite(p: Player): Sprite {
  const set = charSets[p.char][p.color]
  // the roll starts with the dash and finishes during the slide after it
  if (p.state === 'dash' || p.anim === 'roll') {
    const frames = p.dashX < 0 ? set.rollL : set.roll
    return frames[Math.min(frames.length - 1, Math.floor(p.animT / ROLL_FRAME))]
  }
  const left = p.aimX < 0
  const pick = (a: ActionSet, i: number): Sprite => {
    const frames =
      p.facing === 'down' ? (left ? a.downL : a.down) : p.facing === 'up' ? (left ? a.upL : a.up) : p.flip ? a.sideL : a.sideR
    return frames[Math.min(i, frames.length - 1)]
  }
  if (p.state === 'melee') {
    // windup, swing, then the recovery split between follow-through and recover
    const t = p.stateT
    const swingEnd = MELEE_WINDUP + MELEE_ACTIVE
    return pick(set.melee, t < MELEE_WINDUP ? 0 : t < swingEnd ? 1 : t < swingEnd + MELEE_RECOVERY / 2 ? 2 : 3)
  }
  if (p.anim === 'throw') return pick(set.throw, Math.floor(p.animT / THROW_FRAME))
  if (p.anim === 'reach') return pick(set.catch, 0)
  if (p.anim === 'catch') return pick(set.catch, 1)
  // stand/run frames are symmetric, so they ignore the aim side
  const a = p.moving ? set.run : set.stand
  const frames = p.facing === 'down' ? a.down : p.facing === 'up' ? a.up : p.flip ? a.sideL : a.sideR
  return frames[runFrame(p) % frames.length]
}

// ---------------------------------------------------------------- deaths
/** Who gets a hazard kill: the last player to dash-shove the victim, if it was recent. */
function credit(p: Player): number {
  return tick - p.lastShoveT < HAZARD_CREDIT_TICKS ? p.lastShover : -1
}

function award(p: Player, killer: number, verb: string, cause?: string) {
  if (killer >= 0 && killer !== p.id) players[killer].score++
  const who = cause ?? (killer >= 0 ? `P${killer}` : 'something')
  eventLog.push(`t${tick} ${who} ${verb} P${p.id}${cause && killer >= 0 ? ` (P${killer})` : ''}`)
}

/** Cut in two along (dx, dy): boomerangs, melee, blasts, spikes and crushers all end this way. */
function killSlice(p: Player, dx: number, dy: number, killer: number, cause?: string) {
  const s = playerSprite(p)
  const sx = Math.round(p.x) - 7
  const sy = Math.round(p.y) - 17
  const horizontal = Math.abs(dx) >= Math.abs(dy)
  const cut = horizontal ? 9 : 7
  if (horizontal) {
    // cut across the body; halves slide apart and drift with the throw
    halves.push({ s, sx: 0, sy: 0, sw: s.w, sh: cut, x: sx, y: sy, vx: dx * 0.5, vy: -0.22, ttl: 36, max: 36 })
    halves.push({ s, sx: 0, sy: cut, sw: s.w, sh: s.h - cut, x: sx, y: sy + cut, vx: dx * 0.5, vy: 0.22, ttl: 36, max: 36 })
  } else {
    halves.push({ s, sx: 0, sy: 0, sw: cut, sh: s.h, x: sx, y: sy, vx: -0.22, vy: dy * 0.5, ttl: 36, max: 36 })
    halves.push({ s, sx: cut, sy: 0, sw: s.w - cut, sh: s.h, x: sx + cut, y: sy, vx: 0.22, vy: dy * 0.5, ttl: 36, max: 36 })
  }
  spawnBurst(p.x, p.y - 8, PLAYER_COLORS[p.color], 14, 1.6)
  die(p)
  award(p, killer, 'sliced', cause)
}

function killPit(p: Player, what: string) {
  const s = playerSprite(p)
  sinks.push({ s, x: Math.round(p.x) - 7, y: Math.round(p.y) - 17, ttl: 28, max: 28 })
  die(p)
  const k = credit(p)
  if (k >= 0) players[k].score++
  eventLog.push(`t${tick} P${p.id} ${what}${k >= 0 ? ` (shoved by P${k})` : ''}`)
}

/** Fire: the body goes up in a puff and an ash silhouette sinks into the grate. */
function killBurn(p: Player) {
  const s = sil(playerSprite(p), PAL.ironLight)
  sinks.push({ s, x: Math.round(p.x) - 7, y: Math.round(p.y) - 17, ttl: 20, max: 20 })
  spawnBurst(p.x, p.y - 8, PAL.flameO, 16, 1.6)
  spawnBurst(p.x, p.y - 10, PAL.flameY, 8, 1)
  die(p)
  const k = credit(p)
  if (k >= 0) players[k].score++
  eventLog.push(`t${tick} fire got P${p.id}${k >= 0 ? ` (P${k})` : ''}`)
}

/** Something heavy landed on them: flattened on the spot. */
function killSquash(p: Player, killer: number, cause: string) {
  const s = playerSprite(p)
  sinks.push({ s, x: Math.round(p.x) - 7, y: Math.round(p.y) - 17, ttl: 10, max: 10 })
  spawnBurst(p.x, p.y - 4, PLAYER_COLORS[p.color], 12, 1.8)
  die(p)
  award(p, killer, 'flattened', cause)
}

function die(p: Player) {
  p.state = 'dead'
  p.stateT = 0
  p.respawnT = RESPAWN_TICKS
  p.held = false
  p.vx = p.vy = p.kbx = p.kby = p.slideX = p.slideY = 0
  p.plat = -1
}

function respawn(p: Player) {
  booms = booms.filter((b) => b.owner !== p.id)
  p.x = p.spawnX
  p.y = p.spawnY
  p.state = 'idle'
  p.stateT = 0
  p.held = true
  p.invuln = SPAWN_PROTECT
  p.dashCd = 0
  p.throwRec = 0
  p.anim = 'none'
  p.animT = 0
  p.slideX = p.slideY = 0
  p.windup = 0
  p.lastShoveT = -9999
  p.turn = null
}

// ---------------------------------------------------------------- tiles and props
function cutGrass(c: number, r: number) {
  if (tileAt(arena, c, r) !== TileKind.Grass) return
  const i = idx(c, r)
  if (grassCut[i] >= 0) return
  grassCut[i] = tick
  cutList.push(i)
  redrawCells(staticCtx, arena, [{ c, r }], seed, grassLook, look)
  spawnBurst(c * TILE + 8, r * TILE + 6, PAL.grass[1], 6, 0.9)
}

/** Every tile whose centre is within `radius` of (x, y). */
function tilesNear(x: number, y: number, radius: number): { c: number; r: number }[] {
  const out: { c: number; r: number }[] = []
  const c0 = Math.floor((x - radius) / TILE)
  const c1 = Math.floor((x + radius) / TILE)
  const r0 = Math.floor((y - radius) / TILE)
  const r1 = Math.floor((y + radius) / TILE)
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) if (c >= 0 && r >= 0 && c < arena.cols && r < arena.rows && len(c * TILE + 8 - x, r * TILE + 8 - y) <= radius) out.push({ c, r })
  return out
}

function breakCrate(ci: number, by: number) {
  const cr = crates[ci]
  if (!cr.alive) return
  cr.alive = false
  solid[idx(cr.c, cr.r)] = 0
  const x = cr.c * TILE + 8
  const y = cr.r * TILE + 8
  spawnBurst(x, y - 6, PAL.wood, 10, 1.6)
  spawnBurst(x, y - 6, PAL.woodDark, 6, 1)
  eventLog.push(`t${tick} ${by >= 0 ? `P${by}` : 'something'} broke a crate`)
  if (near(x)) sfxCrunch()
}

function lightBarrel(bi: number, by: number) {
  const bl = barrels[bi]
  if (!bl.alive || bl.lit) return
  bl.lit = true
  bl.fuse = BARREL_FUSE
  bl.lighter = by
  spawnBurst(bl.c * TILE + 8, bl.r * TILE - 2, PAL.flameY, 4, 0.8)
  eventLog.push(`t${tick} ${by >= 0 ? `P${by}` : 'something'} lit a barrel`)
}

/** Crates go, barrels light, grass falls, in a circle: a swing, a blast, a passing boomerang. */
function wreckNear(x: number, y: number, radius: number, by: number, opts: { crates: boolean; barrels: boolean; grass: boolean }) {
  for (const { c, r } of tilesNear(x, y, radius)) {
    const i = idx(c, r)
    if (opts.crates && crateAt[i] >= 0) breakCrate(crateAt[i], by)
    if (opts.barrels && barrelAt[i] >= 0) lightBarrel(barrelAt[i], by)
    if (opts.grass) cutGrass(c, r)
  }
}

/**
 * A blast centred on (x, y): kills everyone inside hitR (the owner of a bomb included; a dash's
 * i-frames do protect), breaks crates, lights other barrels so they chain, flattens grass. `killer`
 * -1 means a hazard did it, in which case a recent shover gets the credit.
 */
function blast(x: number, y: number, hitR: number, ringR: number, killer: number, cause?: string) {
  for (const q of players) {
    if (q.state === 'dead' || q.invuln > 0) continue
    const dx = q.x - x
    const dy = q.y - y
    const d = len(dx, dy)
    if (d < hitR + HURT_RADIUS) {
      const [nx, ny] = d > 1e-6 ? norm(dx, dy) : [0, -1]
      killSlice(q, nx, ny, killer >= 0 ? killer : credit(q), cause ?? 'the blast')
    }
  }
  wreckNear(x, y, hitR + 4, killer, { crates: true, barrels: true, grass: true })
  blasts.push({ x, y: y - 4, r: ringR, ttl: BLAST_TTL, max: BLAST_TTL })
  spawnBurst(x, y - 4, PAL.flameO, 22, 3)
  spawnBurst(x, y - 4, PAL.flameY, 10, 1.8)
  if (near(x)) sfxBlast()
}

/** The nearest plain floor tile centre to (x, y): where a boomerang lost to a pit turns up. */
function nearestFloor(x: number, y: number): { x: number; y: number } {
  const c0 = Math.floor(x / TILE)
  const r0 = Math.floor(y / TILE)
  let best: { x: number; y: number } | null = null
  let bd = Infinity
  for (let rad = 1; rad <= 8 && !best; rad++) {
    for (let r = r0 - rad; r <= r0 + rad; r++) {
      for (let c = c0 - rad; c <= c0 + rad; c++) {
        if (!plainFloor(c, r)) continue
        const cx = c * TILE + 8
        const cy = r * TILE + 8
        const d = len(cx - x, cy - y)
        if (d < bd) {
          bd = d
          best = { x: cx, y: cy }
        }
      }
    }
  }
  return best ?? { x: players[0].spawnX, y: players[0].spawnY }
}

/** Reflect a moving circle off any bumper it overlaps. Doesn't count as a wall bounce. */
function bounceOffBumpers(o: { x: number; y: number; vx: number; vy: number }, r: number, fx: boolean): boolean {
  let hit = false
  for (const bu of bumpers) {
    const dx = o.x - bu.x
    const dy = o.y - bu.y
    const d = len(dx, dy)
    const minD = BUMPER_RADIUS + r
    if (d >= minD || d < 1e-6) continue
    const [nx, ny] = norm(dx, dy)
    const dot = o.vx * nx + o.vy * ny
    if (dot < 0) {
      o.vx -= 2 * dot * nx
      o.vy -= 2 * dot * ny
    }
    o.x = bu.x + nx * minD
    o.y = bu.y + ny * minD
    if (fx) {
      bu.hitT = tick
      if (near(bu.x)) sfxBump()
    }
    hit = true
  }
  return hit
}

/** Reflect a moving circle off a cart's box, along the axis it went in by. */
function bounceOffCarts(o: { x: number; y: number; vx: number; vy: number }, r: number): boolean {
  let hit = false
  for (const ct of carts) {
    const dx = o.x - ct.pos.x
    const dy = o.y - ct.pos.y
    const px = CART_HALF_W + r - Math.abs(dx)
    const py = CART_HALF_H + r - Math.abs(dy)
    if (px <= 0 || py <= 0) continue
    if (px < py) {
      const s = Math.sign(dx) || 1
      o.x += s * px
      if (Math.sign(o.vx) === -s) o.vx = -o.vx
    } else {
      const s = Math.sign(dy) || 1
      o.y += s * py
      if (Math.sign(o.vy) === -s) o.vy = -o.vy
    }
    hit = true
  }
  return hit
}

// Where a throw leaves the hand: a little in front of the body, or at the feet when the player is
// pressed against a wall so the boomerang never starts inside a tile.
function throwOrigin(p: Player): { x: number; y: number } {
  const x = p.x + p.aimX * THROW_OFFSET
  const y = p.y + p.aimY * THROW_OFFSET
  return circleBlocked(x, y, BOOM_WALL_RADIUS, isSolidForBoom) ? { x: p.x, y: p.y } : { x, y }
}

function newBoomerang(owner: number, x: number, y: number, ax: number, ay: number): Boomerang {
  return {
    owner,
    x,
    y,
    vx: ax * BOOM_SPEED,
    vy: ay * BOOM_SPEED,
    state: 'out',
    range: THROW_RANGE,
    traveled: 0,
    decel: flightDecel(BOOM_SPEED, THROW_RANGE),
    recall: false,
    hangT: 0,
    armed: false,
    fire: 0,
    bounces: 0,
    flight: 0,
    spin: 0,
    trail: [],
    hit: new Set(),
  }
}

function throwBoomerang(p: Player) {
  const o = throwOrigin(p)
  booms.push(newBoomerang(p.id, o.x, o.y, p.aimX, p.aimY))
  p.held = false
  p.throwRec = THROW_RECOVERY
  p.anim = 'throw'
  p.animT = 0
}

/** Start the catch pose, if the body is free to show it (a dash or melee keeps its own frames). */
function startCatchAnim(p: Player) {
  if (p.state !== 'idle') return
  p.anim = 'catch'
  p.animT = 0
}

/**
 * Speed lost per tick that brings a launch at `speed` to rest after exactly `range` px of path.
 * The tick-by-tick sum of (speed − k·decel) is speed²/(2·decel) − speed/2, hence the extra term
 * versus the continuous speed²/(2·range).
 */
function flightDecel(speed: number, range: number): number {
  return (speed * speed) / (2 * range + speed)
}

/** What an airborne boomerang does to the tile it is over: crates break, grass falls, vents set it alight, chains get knocked. */
function passTile(b: Boomerang) {
  const c = Math.floor(b.x / TILE)
  const r = Math.floor(b.y / TILE)
  if (c < 0 || r < 0 || c >= arena.cols || r >= arena.rows) return
  const i = idx(c, r)
  if (crateAt[i] >= 0) breakCrate(crateAt[i], b.owner)
  const k = arena.tiles[i]
  if (k === TileKind.Grass) cutGrass(c, r)
  else if (k === TileKind.Vent && phaseOf(k, c, r).phase === 'on') b.fire = BOOM_FIRE_TICKS
  for (const ch of chandeliers) {
    if (ch.state === 'hang' && len(b.x - ch.x, b.y - ch.y) < CHANDELIER_TRIGGER_RADIUS) {
      ch.state = 'creak'
      ch.t = 0
      ch.by = b.owner
      eventLog.push(`t${tick} P${b.owner} hit a chandelier`)
      if (near(ch.x)) sfxCreak()
    }
  }
}

// One outbound tick: the speed drops by the throw's decel every tick from the moment it leaves the
// hand, so it drifts to rest exactly at the end of its range (clamped to the path left so it never
// overshoots). Wall hits reflect the velocity and keep counting distance. Returns true on the tick
// it comes to rest. Shared by the sim and the aim-indicator preview (fx=false: no sparks and no
// side effects on the world, so the render side never touches the sim rng).
function flyOutbound(b: Boomerang, fx: boolean): boolean {
  if (b.bounces >= BOOM_MAX_BOUNCES || b.flight >= BOOM_MAX_FLIGHT) b.decel = Math.max(b.decel, BOOM_BRAKE)
  const was = len(b.vx, b.vy)
  const sp = Math.max(0, Math.min(was - b.decel, b.range - b.traveled))
  if (was > 1e-6) {
    b.vx *= sp / was
    b.vy *= sp / was
  }
  b.traveled += sp
  // sub-stepped so a fast boomerang cannot end a tick inside a 16 px wall
  const steps = Math.max(1, Math.ceil(sp / BOOM_SUBSTEP))
  for (let i = 0; i < steps; i++) {
    // a portal mouth ahead takes an outbound boomerang through, turned to match, before the wall
    // can bounce it. Outbound only: a returning boomerang flies over everything anyway. Runs in the
    // preview too, so the aim line shows where it comes out.
    const ahead = mouthAhead(b.x, b.y, b.vx / steps, b.vy / steps, BOOM_WALL_RADIUS)
    if (ahead) {
      const { from, to } = ahead
      if (fx) {
        spawnBurst(from.gx, from.gy, from.lit, 6, 1.2)
        if (near(from.x) || near(to.x)) sfxWarp()
        ahead.portal.usedT = tick
        eventLog.push(`t${tick} P${b.owner}'s boomerang went through the ${from.hue} portal`)
        b.trail.length = 0
      }
      ;[b.x, b.y] = exitPoint(from, to, b.x, b.y, BOOM_WALL_RADIUS)
      ;[b.vx, b.vy] = rotQ(b.vx, b.vy, quarterTurns(from, to))
      if (fx) spawnBurst(to.gx, to.gy, to.lit, 6, 1.2)
      continue
    }
    if (moveX(b, b.vx / steps, BOOM_WALL_RADIUS, isSolidForBoom)) {
      b.vx = -b.vx
      b.bounces++
      if (fx) {
        spawnBurst(b.x, b.y - 4, PAL.boneDark, 3, 0.9)
        wreckNear(b.x, b.y, 14, b.owner, { crates: false, barrels: true, grass: false })
      }
    }
    if (moveY(b, b.vy / steps, BOOM_WALL_RADIUS, isSolidForBoom)) {
      b.vy = -b.vy
      b.bounces++
      if (fx) {
        spawnBurst(b.x, b.y - 4, PAL.boneDark, 3, 0.9)
        wreckNear(b.x, b.y, 14, b.owner, { crates: false, barrels: true, grass: false })
      }
    }
    bounceOffBumpers(b, BOOM_WALL_RADIUS, fx)
    bounceOffCarts(b, BOOM_WALL_RADIUS)
    if (fx) passTile(b)
  }
  if (sp <= 0) {
    b.vx = b.vy = 0
    return true
  }
  return false
}

// A melee swing connecting with an airborne boomerang. A steal keeps an armed boomerang armed;
// smacking a boomerang you already own arms it: it relaunches over BOMB_RANGE, sits, beeps twice,
// shrinks and blows up.
function deflect(b: Boomerang, p: Player) {
  if (b.owner === p.id) b.armed = true
  const speed = b.armed ? BOOM_SPEED * BOMB_SPEED_MULT : DEFLECT_SPEED
  const range = b.armed ? BOMB_RANGE : DEFLECT_RANGE
  b.owner = p.id
  b.state = 'out'
  b.vx = p.aimX * speed
  b.vy = p.aimY * speed
  b.range = range
  b.traveled = 0
  b.decel = flightDecel(speed, range)
  b.recall = false
  b.hangT = 0
  b.bounces = 0
  b.flight = 0
  b.hit.clear()
  spawnBurst(b.x, b.y - 6, b.armed ? BOMB_COLOR : PAL.white, b.armed ? 14 : 8, 1.4)
  eventLog.push(`t${tick} P${p.id} deflected${b.armed ? ' (armed)' : ''}`)
}

/** Where an armed boomerang is in its fuse: flashing white on a beep, and how far it has shrunk. */
function fusePhase(b: Boomerang): { flash: boolean; scale: number } {
  if (!b.armed || b.state !== 'hang') return { flash: false, scale: 1 }
  const t = b.hangT
  const beep2 = BOMB_PAUSE + BOMB_BEEP_GAP
  const flash = (t >= BOMB_PAUSE && t < BOMB_PAUSE + BOMB_BEEP_LEN) || (t >= beep2 && t < beep2 + BOMB_BEEP_LEN)
  const shrink = Math.min(1, Math.max(0, t - beep2 - BOMB_BEEP_LEN) / BOMB_SHRINK)
  return { flash, scale: 1 - 0.8 * shrink }
}

// One beep of the fuse: a white flash (fusePhase), a small ring pulse and a blip.
function beep(b: Boomerang) {
  blasts.push({ x: b.x, y: b.y - BOOM_HEIGHT, r: BEEP_RING, ttl: BEEP_RING_TTL, max: BEEP_RING_TTL })
  if (near(b.x)) sfxBeep()
}

// An armed boomerang at the end of its fuse: everyone in the blast radius dies, the owner included,
// and the boomerang drops where it went off, disarmed.
function explode(b: Boomerang) {
  blast(b.x, b.y, BOMB_HIT_RADIUS, BOMB_RADIUS, b.owner, `P${b.owner}'s bomb`)
  b.state = 'dropped'
  b.armed = false
  b.vx = b.vy = 0
  b.hit.clear()
}

// Dry run of a throw from where the player stands: the per-tick ground positions of the outbound
// flight, bounces included, ending where it will stop and hang. Drives the aim indicator.
function previewThrow(p: Player): { x: number; y: number }[] {
  const o = throwOrigin(p)
  const d = newBoomerang(p.id, o.x, o.y, p.aimX, p.aimY)
  const pts = [{ x: d.x, y: d.y }]
  for (let i = 0; i < BOOM_MAX_FLIGHT; i++) {
    d.flight++
    const done = flyOutbound(d, false)
    pts.push({ x: d.x, y: d.y })
    if (done) break
  }
  return pts
}

function nearestEnemy(p: Player): Player | null {
  let best: Player | null = null
  let bd = Infinity
  for (const q of players) {
    if (q.id === p.id || q.state === 'dead') continue
    const d = len(q.x - p.x, q.y - p.y)
    if (d < bd) {
      bd = d
      best = q
    }
  }
  return best
}

/** Somewhere on plain floor within a screen of the local player, so the bots stay in the room with you. */
function randomWalkTarget(): [number, number] {
  const pc = Math.floor(players[0].x / TILE)
  const cMin = Math.max(1, pc - 18)
  const cMax = Math.min(arena.cols - 2, pc + 18)
  for (let i = 0; i < 50; i++) {
    const c = cMin + Math.floor(rng() * (cMax - cMin + 1))
    const r = 2 + Math.floor(rng() * (arena.rows - 3))
    if (!blocksWalk(c, r) && !blocksWalk(c - 1, r) && !blocksWalk(c + 1, r) && !blocksWalk(c, r - 1) && !blocksWalk(c, r + 1))
      return [c * TILE + 8, r * TILE + 8]
  }
  return [players[0].x, players[0].y]
}

function aiInput(p: Player): Input {
  const ai = p.ai!
  const inp: Input = { mx: 0, my: 0, throw: false, melee: false, dash: false, hold: false, cursorX: p.cursorX, cursorY: p.cursorY }
  ai.retarget--
  const own = booms.find((b) => b.owner === p.id && b.state === 'dropped')
  if (!p.held && own) {
    ai.tx = own.x
    ai.ty = own.y
  } else if (ai.retarget <= 0 || len(ai.tx - p.x, ai.ty - p.y) < 6) {
    ;[ai.tx, ai.ty] = randomWalkTarget()
    ai.retarget = 90 + Math.floor(rng() * 150)
  }
  const dx = ai.tx - p.x
  const dy = ai.ty - p.y
  if (len(dx, dy) > 4) {
    const [nx, ny] = norm(dx, dy)
    inp.mx = nx
    inp.my = ny
  }
  const enemy = nearestEnemy(p)
  if (enemy) {
    inp.cursorX = enemy.x + enemy.vx * 10
    inp.cursorY = enemy.y + enemy.vy * 10
    ai.throwT--
    const d = len(enemy.x - p.x, enemy.y - p.y)
    if (p.held && ai.throwT <= 0 && d < 210 && d > 30) {
      inp.throw = true
      ai.throwT = 120 + Math.floor(rng() * 180)
    }
  } else {
    inp.cursorX = p.x + inp.mx * 40
    inp.cursorY = p.y + inp.my * 40
  }
  // deflect anything coming at us
  for (const b of booms) {
    if (b.owner === p.id || b.state === 'dropped') continue
    const d = len(b.x - p.x, b.y - p.y)
    const closing = (b.x - p.x) * b.vx + (b.y - p.y) * b.vy < 0
    if (d < 26 && closing && rng() < 0.35) {
      inp.melee = true
      inp.cursorX = b.x
      inp.cursorY = b.y
    } else if (d < 40 && closing && rng() < 0.15) inp.dash = true
  }
  if (rng() < 0.003) inp.dash = true
  return inp
}

// ---------------------------------------------------------------- simulation
/** Advance the shared clocks and every rail-rider to this tick. Pure functions of the tick. */
function advanceMovers() {
  spikeA = cyclePhase(tick, 0, SPIKE_CYCLE)
  spikeB = cyclePhase(tick, half(SPIKE_CYCLE), SPIKE_CYCLE)
  ventA = cyclePhase(tick, 0, VENT_CYCLE)
  ventB = cyclePhase(tick, half(VENT_CYCLE), VENT_CYCLE)
  for (const pl of platforms) {
    pl.prev = pl.pos
    pl.pos = railPos(pl.rail, tick)
  }
  for (const cr of crushers) cr.pos = railPos(cr.rail, tick)
  for (const ct of carts) {
    ct.prev = ct.pos
    ct.pos = railPos(ct.rail, tick)
  }
}

/** Shove a player (or a dropped boomerang) off a gate tile as the bars come down. Never kills. */
function ejectFromGate(g: Gate) {
  for (const t of g.tiles) {
    const tx = t.c * TILE + 8
    const ty = t.r * TILE + 8
    const clear = (o: { x: number; y: number }, r: number) => {
      if (Math.abs(o.x - tx) >= 8 + r || Math.abs(o.y - ty) >= 8 + r) return false
      if (g.vertical) o.x = o.x < tx ? tx - 8 - r - 0.5 : tx + 8 + r + 0.5
      else o.y = o.y < ty ? ty - 8 - r - 0.5 : ty + 8 + r + 0.5
      return true
    }
    for (const p of players) if (p.state !== 'dead' && clear(p, PLAYER_RADIUS)) spawnBurst(p.x, p.y, PAL.boneDark, 3, 0.6)
    for (const b of booms) if (b.state === 'dropped') clear(b, 3)
  }
}

/** Gates, crushers, carts, chandeliers, barrels, crumbling floor, grass regrowth. */
function stepHazards() {
  for (const g of gates) {
    const ph = cyclePhase(tick, g.phase, GATE_CYCLE)
    const closed = ph.phase === 'on'
    if (closed === g.closed) continue
    g.closed = closed
    for (const t of g.tiles) solid[idx(t.c, t.r)] = closed ? 4 : 0
    if (closed) {
      ejectFromGate(g)
      if (near(g.tiles[0].c * TILE)) sfxClank()
    }
  }

  for (const cr of crushers) {
    for (const p of players) {
      if (p.state === 'dead' || p.invuln > 0) continue
      if (len(p.x - cr.pos.x, p.y - cr.pos.y) < CRUSHER_KILL_RADIUS + HURT_RADIUS) {
        const dx = cr.pos.dx || Math.sign(p.x - cr.pos.x) || 1
        killSlice(p, dx, cr.pos.dy, credit(p), `the ${cr.look}`)
      }
    }
  }

  for (const ct of carts) {
    // the cart's front edge smashes crates on its line
    const fx = ct.pos.x + ct.pos.dx * CART_HALF_W
    const fy = ct.pos.y + ct.pos.dy * CART_HALF_H
    const i = idx(Math.floor(fx / TILE), Math.floor(fy / TILE))
    if (ct.pos.moving && i >= 0 && i < crateAt.length && crateAt[i] >= 0) breakCrate(crateAt[i], -1)
  }

  for (const ch of chandeliers) {
    switch (ch.state) {
      case 'hang':
        break
      case 'creak':
        if (++ch.t >= CHANDELIER_CREAK) {
          ch.state = 'fall'
          ch.t = 0
        }
        break
      case 'fall':
        if (++ch.t >= CHANDELIER_FALL) {
          for (const p of players) {
            if (p.state === 'dead' || p.invuln > 0) continue
            if (len(p.x - ch.x, p.y - ch.y) < CHANDELIER_KILL_RADIUS + HURT_RADIUS) killSquash(p, ch.by, 'the chandelier')
          }
          blasts.push({ x: ch.x, y: ch.y, r: 18, ttl: 10, max: 10 })
          spawnBurst(ch.x, ch.y - 2, PAL.bone, 10, 1.6)
          spawnBurst(ch.x, ch.y - 2, PAL.flameY, 6, 1.2)
          if (near(ch.x)) sfxThud()
          ch.state = 'rubble'
          ch.t = 0
        }
        break
      case 'rubble':
        if (++ch.t >= CHANDELIER_RESET) {
          ch.state = 'hang'
          ch.t = 0
        }
        break
    }
  }

  for (let i = 0; i < barrels.length; i++) {
    const bl = barrels[i]
    if (!bl.alive || !bl.lit) continue
    const x = bl.c * TILE + 8
    const y = bl.r * TILE + 8
    if (bl.fuse % 3 === 0) spawnBurst(x, y - 12, PAL.flameY, 1, 0.6)
    if (--bl.fuse > 0) continue
    bl.alive = false
    bl.lit = false
    solid[idx(bl.c, bl.r)] = 0
    blast(x, y, BARREL_HIT_RADIUS, BARREL_RING_RADIUS, bl.lighter, 'a barrel')
  }

  for (let k = crumbling.length - 1; k >= 0; k--) {
    const i = crumbling[k]
    const c = i % arena.cols
    const r = Math.floor(i / arena.cols)
    if (crumbleGone[i] < 0) {
      if (tick - crumbleStart[i] < CRUMBLE_WARN) continue
      crumbleGone[i] = tick
      arena.tiles[i] = TileKind.Pit
      redrawCells(staticCtx, arena, [{ c, r }], seed, grassLook, look)
      spawnBurst(c * TILE + 8, r * TILE + 8, PAL.stoneDark, 8, 1.2)
      if (near(c * TILE)) sfxThud()
    } else if (tick - crumbleGone[i] >= CRUMBLE_RESET) {
      crumbleGone[i] = -1
      crumbleStart[i] = -1
      arena.tiles[i] = TileKind.Crumble
      crumbling.splice(k, 1)
      redrawCells(staticCtx, arena, [{ c, r }], seed, grassLook, look)
    }
  }

  for (let k = cutList.length - 1; k >= 0; k--) {
    const i = cutList[k]
    const age = tick - grassCut[i]
    const c = i % arena.cols
    const r = Math.floor(i / arena.cols)
    if (age === GRASS_REGROW - GRASS_SPROUT) redrawCells(staticCtx, arena, [{ c, r }], seed, grassLook, look)
    else if (age >= GRASS_REGROW) {
      grassCut[i] = -1
      cutList.splice(k, 1)
      redrawCells(staticCtx, arena, [{ c, r }], seed, grassLook, look)
    }
  }

  // tile sounds: one clank when a bank of spikes goes off near the local player
  const p0 = players[0]
  const p0c = Math.floor(p0.x / TILE)
  const p0r = Math.floor(p0.y / TILE)
  let clank = false
  for (let r = Math.max(0, p0r - 10); r <= Math.min(arena.rows - 1, p0r + 10) && !clank; r++) {
    for (let c = Math.max(0, p0c - 20); c <= Math.min(arena.cols - 1, p0c + 20); c++) {
      const k = tileAt(arena, c, r)
      if (k !== TileKind.Spikes) continue
      const ph = phaseOf(k, c, r)
      if (ph.phase === 'on' && ph.t === 0) {
        clank = true
        break
      }
    }
  }
  if (clank) sfxClank()
}

/** What the floor does to whoever is standing on it, once everyone has moved. */
function groundCheck() {
  for (const p of players) {
    if (p.state === 'dead') continue
    const c = Math.floor(p.x / TILE)
    const r = Math.floor(p.y / TILE)
    const k = tileAt(arena, c, r)
    if (overPit(p.x, p.y)) {
      killPit(p, 'fell')
      continue
    }
    // things you stand on don't care about i-frames
    if (k === TileKind.Spikes && phaseOf(k, c, r).phase === 'on') {
      killSlice(p, 0, -1, credit(p), 'the spikes')
      continue
    }
    if (k === TileKind.Vent && phaseOf(k, c, r).phase === 'on') {
      killBurn(p)
      continue
    }
    if (k === TileKind.Crumble) {
      const i = idx(c, r)
      if (crumbleStart[i] < 0) {
        crumbleStart[i] = tick
        crumbling.push(i)
      }
    }
  }
}

function step(inputs: Input[]) {
  tick++
  advanceMovers()

  for (const p of players) {
    const raw = inputs[p.id]
    const inp = throughTurn(p, raw)
    if (p.state === 'dead') {
      if (--p.respawnT <= 0) respawn(p)
      continue
    }
    if (p.dashCd > 0) p.dashCd--
    if (p.invuln > 0) p.invuln--
    if (p.throwRec > 0) p.throwRec--
    if (p.anim !== 'none') {
      // the reach is refreshed every tick the boomerang is still closing in; the others just run out
      const dur = p.anim === 'throw' ? THROW_ANIM : p.anim === 'catch' ? CATCH_ANIM : p.anim === 'roll' ? ROLL_ANIM : REACH_TTL
      if (++p.animT >= dur) p.anim = 'none'
    }

    // aim
    p.cursorX = inp.cursorX
    p.cursorY = inp.cursorY
    p.holdThrow = inp.hold
    const adx = p.cursorX - p.x
    const ady = p.cursorY - (p.y - 8)
    if (len(adx, ady) > 2) [p.aimX, p.aimY] = norm(adx, ady)
    if (Math.abs(p.aimY) > Math.abs(p.aimX) * 1.2) p.facing = p.aimY > 0 ? 'down' : 'up'
    else {
      p.facing = 'side'
      p.flip = p.aimX < 0
    }

    // state machine
    if (p.state === 'melee') {
      p.stateT++
      if (p.stateT >= MELEE_WINDUP + MELEE_ACTIVE + MELEE_RECOVERY) p.state = 'idle'
    } else if (p.state === 'dash') {
      p.stateT++
      if (p.stateT >= DASH_TICKS) {
        // the dash doesn't stop so much as let go: its speed becomes the slide, and the walk starts
        // again from zero on top of it
        p.state = 'idle'
        p.slideX = p.dashX * DASH_SLIDE_SPEED
        p.slideY = p.dashY * DASH_SLIDE_SPEED
        p.vx = p.vy = 0
      }
    }
    if (p.state === 'idle') {
      if (inp.dash && p.dashCd === 0) {
        const [dx, dy] = len(inp.mx, inp.my) > 0.1 ? norm(inp.mx, inp.my) : [p.aimX, p.aimY]
        p.state = 'dash'
        p.stateT = 0
        p.anim = 'roll'
        p.animT = 0
        p.dashX = dx
        p.dashY = dy
        p.slideX = p.slideY = 0 // a new dash takes over whatever the last one left
        p.invuln = Math.max(p.invuln, DASH_INVULN)
        p.dashCd = DASH_COOLDOWN
      } else if (inp.melee) {
        p.state = 'melee'
        p.stateT = 0
        p.anim = 'none'
        p.meleeHits.clear()
        slashes.push({ x: p.x, y: p.y, ax: p.aimX, ay: p.aimY, color: PLAYER_COLORS[p.color], ttl: 7, max: 7 })
      } else if (inp.throw && p.held && p.throwRec === 0) {
        throwBoomerang(p)
      }
    }

    // movement
    const ice = onIce(p.x, p.y)
    if (p.state === 'dash') {
      p.vx = p.dashX * DASH_SPEED
      p.vy = p.dashY * DASH_SPEED
      p.moving = true
    } else if (ice) {
      // ice: the heading no longer snaps; the stick only leans on a velocity that friction slowly
      // bleeds, so turning takes a while and letting go coasts
      const il = len(inp.mx, inp.my)
      const mult = p.state === 'melee' ? MELEE_SPEED_MULT : 1
      p.vx *= ICE_FRICTION
      p.vy *= ICE_FRICTION
      if (il > 0.1) {
        const [ix, iy] = norm(inp.mx, inp.my)
        p.vx += ix * ACCEL * ICE_GRIP
        p.vy += iy * ACCEL * ICE_GRIP
        const sp = len(p.vx, p.vy)
        const cap = MAX_SPEED * mult
        if (sp > cap) {
          p.vx *= cap / sp
          p.vy *= cap / sp
        }
        p.moving = true
      } else {
        const sp = len(p.vx, p.vy)
        if (sp < 0.05) p.vx = p.vy = 0
        p.moving = sp > 0.3
      }
      p.windup = 0
    } else {
      const il = len(inp.mx, inp.my)
      const mult = p.state === 'melee' ? MELEE_SPEED_MULT : 1
      if (il > 0.1) {
        const [ix, iy] = norm(inp.mx, inp.my)
        const cur = len(p.vx, p.vy)
        const sliding = p.slideX !== 0 || p.slideY !== 0
        if (cur === 0 && !sliding && p.windup < START_WINDUP) {
          // standing start: run in place until the feet find grip, then go (not while still sliding
          // out of a dash: you are moving, just not where you want)
          p.windup++
          p.moving = true
          if (p.windup === 1 || p.windup === 3) spawnBurst(p.x - ix * 3, p.y, PAL.boneDark, 2, 0.4)
        } else {
          // heading follows the input with no inertia; only the speed ramps
          const sp = Math.min(MAX_SPEED * mult, cur + ACCEL)
          p.vx = ix * sp
          p.vy = iy * sp
          p.moving = true
        }
      } else {
        p.windup = 0
        const sp = len(p.vx, p.vy)
        if (sp <= DECEL) p.vx = p.vy = 0
        else {
          p.vx *= (sp - DECEL) / sp
          p.vy *= (sp - DECEL) / sp
        }
        p.moving = sp > 0.3
      }
    }
    if (p.moving) {
      p.walkT++
      // a crawling character dabs the floor behind it as it goes (not while hidden in grass)
      if (CHARACTERS[p.char].leavesTrail && showsWalk(p) && p.walkT % SMEAR_EVERY === 0 && !inGrass(p.x, p.y)) {
        smears.push({
          x: p.x + (rng() - 0.5) * 6,
          y: p.y + (rng() - 0.5) * 2,
          w: 2 + Math.floor(rng() * 2),
          ttl: SMEAR_TTL,
          max: SMEAR_TTL,
          color: darken(PLAYER_COLORS[p.color], 0.4),
        })
      }
    }

    // a platform you stood on carries you first
    if (p.plat >= 0 && p.plat < platforms.length) {
      const pl = platforms[p.plat]
      moveX(p, pl.pos.x - pl.prev.x, PLAYER_RADIUS, isSolid)
      moveY(p, pl.pos.y - pl.prev.y, PLAYER_RADIUS, isSolid)
    }

    // a portal mouth ahead takes you through, turned to match, before the wall can stop you
    const ahead = mouthAhead(p.x, p.y, p.vx + p.slideX, p.vy + p.slideY, PLAYER_RADIUS)
    if (ahead) enterPortal(p, ahead, raw)

    // voluntary movement: walls stop you, and so does the edge of a drop — walking is never how
    // you fall in. Only your centre counts, so you can lean out over the edge and ride a platform.
    // The slide out of a dash rides along under the walk; it counts as voluntary too, so it cannot
    // tip you into a pit either, and a wall or an edge kills it.
    const ox = p.x
    const oy = p.y
    const wasOver = overPit(ox, oy)
    let hitX = moveX(p, p.vx + p.slideX, PLAYER_RADIUS, isSolid)
    if (!wasOver && overPit(p.x, p.y)) {
      p.x = ox
      p.vx = 0
      hitX = true
    }
    if (hitX) p.slideX = 0
    const mx = p.x
    let hitY = moveY(p, p.vy + p.slideY, PLAYER_RADIUS, isSolid)
    if (!wasOver && overPit(p.x, p.y)) {
      p.x = mx
      p.y = oy
      p.vy = 0
      hitY = true
    }
    if (hitY) p.slideY = 0
    if (p.state === 'dash' && (hitX || hitY)) {
      p.state = 'idle'
      p.slideX = p.slideY = 0
      p.vx = p.vy = 0
      spawnBurst(p.x + p.dashX * 5, p.y - 4 + p.dashY * 5, PAL.boneDark, 5, 1)
    }
    if (p.slideX !== 0 || p.slideY !== 0) {
      const ss = len(p.slideX, p.slideY)
      if (ss > 1 && tick % 3 === 0) spawnBurst(p.x - (p.slideX / ss) * 4, p.y - (p.slideY / ss) * 4, PAL.boneDark, 1, 0.3) // skid dust
      const fr = ice ? ICE_FRICTION : DASH_SLIDE_FRICTION
      p.slideX *= fr
      p.slideY *= fr
      if (len(p.slideX, p.slideY) < DASH_SLIDE_MIN) p.slideX = p.slideY = 0
    }

    // belts carry whatever stands on them, straight into whatever they point at
    const under = kindAt(p.x, p.y)
    if (isBelt(under)) {
      const [bx, by] = beltDir(under)
      const fed = mouthAhead(p.x, p.y, bx * BELT_SPEED, by * BELT_SPEED, PLAYER_RADIUS)
      if (fed) enterPortal(p, fed, raw)
      moveX(p, bx * BELT_SPEED, PLAYER_RADIUS, isSolid)
      moveY(p, by * BELT_SPEED, PLAYER_RADIUS, isSolid)
    }

    // bumpers and carts shove; neither kills on its own
    for (const bu of bumpers) {
      const dx = p.x - bu.x
      const dy = p.y - bu.y
      const d = len(dx, dy)
      const minD = BUMPER_RADIUS + PLAYER_RADIUS
      if (d >= minD) continue
      const [nx, ny] = d > 1e-6 ? norm(dx, dy) : [1, 0]
      p.x = bu.x + nx * minD
      p.y = bu.y + ny * minD
      p.kbx = nx * BUMPER_SHOVE
      p.kby = ny * BUMPER_SHOVE
      p.vx = p.vy = p.slideX = p.slideY = 0
      if (p.state === 'dash') p.state = 'idle'
      bu.hitT = tick
      spawnBurst(p.x, p.y - 4, PAL.white, 3, 0.8)
      if (near(bu.x)) sfxBump()
    }
    for (const ct of carts) {
      const dx = p.x - ct.pos.x
      const dy = p.y - ct.pos.y
      const px = CART_HALF_W + PLAYER_RADIUS - Math.abs(dx)
      const py = CART_HALF_H + PLAYER_RADIUS - Math.abs(dy)
      if (px <= 0 || py <= 0) continue
      let sx: number
      let sy: number
      if (ct.pos.moving && (ct.pos.dx !== 0 || ct.pos.dy !== 0)) {
        sx = ct.pos.dx
        sy = ct.pos.dy
      } else if (px < py) {
        sx = Math.sign(dx) || 1
        sy = 0
      } else {
        sx = 0
        sy = Math.sign(dy) || 1
      }
      p.x = ct.pos.x + sx * (CART_HALF_W + PLAYER_RADIUS + 0.5) + (sx === 0 ? dx : 0)
      p.y = ct.pos.y + sy * (CART_HALF_H + PLAYER_RADIUS + 0.5) + (sy === 0 ? dy : 0)
      p.kbx = sx * CART_SHOVE
      p.kby = sy * CART_SHOVE
      p.slideX = p.slideY = 0
      if (p.state === 'dash') {
        p.state = 'idle'
        p.vx = p.vy = 0
      }
      spawnBurst(p.x, p.y - 4, PAL.boneDark, 3, 0.8)
    }

    // knockback ignores pits (that's how you fall in)
    if (p.kbx !== 0 || p.kby !== 0) {
      const thrown = mouthAhead(p.x, p.y, p.kbx, p.kby, PLAYER_RADIUS)
      if (thrown) enterPortal(p, thrown, raw)
      moveX(p, p.kbx, PLAYER_RADIUS, isSolid)
      moveY(p, p.kby, PLAYER_RADIUS, isSolid)
      const decay = onIce(p.x, p.y) ? KB_DECAY_ICE : KB_DECAY
      p.kbx *= decay
      p.kby *= decay
      if (len(p.kbx, p.kby) < 0.15) p.kbx = p.kby = 0
    }

    // dash afterimages (render-only, but cheap to spawn here)
    if (p.state === 'dash' && p.invuln > 0 && (p.stateT & 1) === 0) {
      afterimages.push({ s: playerSprite(p), x: Math.round(p.x) - 7, y: Math.round(p.y) - 17, ttl: 12, max: 12 })
    }

    p.plat = platformAt(p.x, p.y)
  }

  // separation + shoves
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i]
      const b = players[j]
      if (a.state === 'dead' || b.state === 'dead') continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = len(dx, dy)
      const minD = PLAYER_RADIUS * 2
      if (d >= minD || d < 1e-6) continue
      const [nx, ny] = norm(dx, dy)
      if (a.state === 'dash' && b.state !== 'dash') {
        b.kbx += a.dashX * SHOVE_IMPULSE
        b.kby += a.dashY * SHOVE_IMPULSE
        b.lastShover = a.id
        b.lastShoveT = tick
      } else if (b.state === 'dash' && a.state !== 'dash') {
        a.kbx += b.dashX * SHOVE_IMPULSE
        a.kby += b.dashY * SHOVE_IMPULSE
        a.lastShover = b.id
        a.lastShoveT = tick
      }
      const push = (minD - d) / 2
      moveX(a, -nx * push, PLAYER_RADIUS, isSolid)
      moveY(a, -ny * push, PLAYER_RADIUS, isSolid)
      moveX(b, nx * push, PLAYER_RADIUS, isSolid)
      moveY(b, ny * push, PLAYER_RADIUS, isSolid)
    }
  }

  stepHazards()
  groundCheck()

  // boomerangs
  for (const b of booms) {
    b.spin++
    if (b.fire > 0) b.fire--
    const owner = players[b.owner]
    if (b.state === 'dropped') {
      b.vx *= DROP_FRICTION
      b.vy *= DROP_FRICTION
      if (len(b.vx, b.vy) < 0.05) b.vx = b.vy = 0
      moveX(b, b.vx, 3, isSolid)
      moveY(b, b.vy, 3, isSolid)
      // the floor moves it: belts, a platform it landed on, a cart ploughing through
      const k = kindAt(b.x, b.y)
      if (isBelt(k)) {
        const [dx, dy] = beltDir(k)
        moveX(b, dx * BELT_SPEED, 3, isSolid)
        moveY(b, dy * BELT_SPEED, 3, isSolid)
      }
      const pi = platformAt(b.x, b.y)
      if (pi >= 0) {
        const pl = platforms[pi]
        moveX(b, pl.pos.x - pl.prev.x, 3, isSolid)
        moveY(b, pl.pos.y - pl.prev.y, 3, isSolid)
      }
      for (const ct of carts) {
        const dx = b.x - ct.pos.x
        const dy = b.y - ct.pos.y
        if (Math.abs(dx) < CART_HALF_W + 3 && Math.abs(dy) < CART_HALF_H + 3) {
          const sx = ct.pos.dx || Math.sign(dx) || 1
          const sy = ct.pos.dy
          b.x = ct.pos.x + sx * (CART_HALF_W + 4) + (sx === 0 ? dx : 0)
          b.y = ct.pos.y + sy * (CART_HALF_H + 4) + (sy === 0 ? dy : 0)
          b.vx = sx * 2
          b.vy = sy * 2
        }
      }
      // a boomerang is never lost to a pit: it turns up on the nearest floor
      if (overPit(b.x, b.y)) {
        const f = nearestFloor(b.x, b.y)
        spawnBurst(b.x, b.y, PAL.boneDark, 4, 0.8)
        b.x = f.x
        b.y = f.y
        b.vx = b.vy = 0
        spawnBurst(b.x, b.y, PLAYER_COLORS[owner.color], 4, 0.8)
      }
      // pickup
      for (const p of players) {
        if (p.state === 'dead' || p.held) continue
        if (len(p.x - b.x, p.y - b.y) < PICKUP_RADIUS + 3) {
          p.held = true
          startCatchAnim(p)
          b.owner = p.id
          b.flight = -1
          spawnBurst(b.x, b.y - 4, PLAYER_COLORS[p.color], 4, 0.8)
          break
        }
      }
      continue
    }

    b.flight++
    b.trail.unshift({ x: b.x, y: b.y })
    if (b.trail.length > 7) b.trail.pop()

    if (b.state === 'out') {
      if (flyOutbound(b, true)) {
        b.hit.clear()
        // an armed boomerang sits on its fuse whatever happened to its owner; the blast is posthumous
        if (owner.state === 'dead' && !b.armed) b.state = 'dropped'
        else {
          b.state = 'hang'
          b.hangT = 0
        }
      }
    } else if (b.state === 'hang') {
      passTile(b)
      if (b.armed) {
        // the fuse: sit still, beep, beep, shrink, blast
        b.hangT++
        if (b.hangT === BOMB_PAUSE || b.hangT === BOMB_PAUSE + BOMB_BEEP_GAP) beep(b)
        if (b.hangT >= BOMB_FUSE) explode(b)
      } else if (owner.state === 'dead') b.state = 'dropped'
      else {
        b.hangT++
        // the throw button held keeps it hanging up there (still lethal) until let go or the cap
        const hover = owner.holdThrow && b.hangT < BOOM_HOVER_MAX
        if (b.hangT >= BOOM_HANG && !hover) {
          b.state = 'return'
          if (b.hangT > BOOM_HANG) {
            // it was hovering: recalled at full speed from the first tick, not the gradual return
            b.recall = true
            const [tx, ty] = norm(owner.x - b.x, owner.y - 6 - b.y)
            b.vx = tx * BOOM_RECALL_SPEED
            b.vy = ty * BOOM_RECALL_SPEED
          }
        }
      }
    } else {
      // returning: accelerates out of the hang straight at its owner at the rate it slowed on the way
      // out (a recall holds full speed instead), flies over obstacles, homes hard
      if (owner.state === 'dead') {
        b.state = 'dropped'
      } else {
        const ox = owner.x - b.x
        const oy = owner.y - 6 - b.y
        const d = len(ox, oy)
        const [tx, ty] = norm(ox, oy)
        const sp = Math.min(Math.max(len(b.vx, b.vy) + b.decel, b.recall ? BOOM_RECALL_SPEED : 0), BOOM_RETURN_SPEED)
        const turn = (d < BOOM_NEAR_DIST ? BOOM_TURN_NEAR : BOOM_TURN) * sp + b.decel
        const dvx = tx * sp - b.vx
        const dvy = ty * sp - b.vy
        const dl = len(dvx, dvy)
        const k = dl > turn ? turn / dl : 1
        b.vx += dvx * k
        b.vy += dvy * k
        b.x += b.vx
        b.y += b.vy
        passTile(b)
        const dNow = len(owner.x - b.x, owner.y - 6 - b.y)
        // the owner reaches for it while it's about two ticks out, hands empty and body free
        if (dNow < CATCH_REACH && !owner.held && owner.state === 'idle' && (owner.anim === 'none' || owner.anim === 'reach')) {
          owner.anim = 'reach'
          owner.animT = 0
        }
        if (dNow < CATCH_RADIUS) {
          if (!owner.held) {
            owner.held = true
            startCatchAnim(owner)
            b.flight = -1
          } else {
            b.state = 'dropped'
            b.vx = b.vy = 0
          }
        }
        if (b.flight > BOOM_MAX_FLIGHT * 2) b.state = 'dropped'
      }
    }
    if (b.flight === -1) continue

    // lethality: anything airborne kills, including a boomerang hanging at the top of its throw
    if (b.state !== 'dropped') {
      const sp = len(b.vx, b.vy)
      for (const p of players) {
        if (p.id === b.owner || p.state === 'dead' || p.invuln > 0 || b.hit.has(p.id)) continue
        if (len(p.x - b.x, p.y - 6 - b.y) < BOOM_RADIUS + HURT_RADIUS) {
          b.hit.add(p.id)
          const [kx, ky] = sp > 1e-6 ? [b.vx / sp, b.vy / sp] : [p.x - b.x, p.y - b.y]
          killSlice(p, kx, ky, b.owner)
        }
      }
    }
  }
  booms = booms.filter((b) => b.flight !== -1)

  // melee hits
  for (const p of players) {
    if (p.state !== 'melee') continue
    const active = p.stateT >= MELEE_WINDUP && p.stateT < MELEE_WINDUP + MELEE_ACTIVE
    const deflecting = p.stateT >= MELEE_WINDUP && p.stateT < MELEE_WINDUP + MELEE_ACTIVE + DEFLECT_GRACE
    if (!deflecting) continue
    const hx = p.x + p.aimX * MELEE_REACH
    const hy = p.y + p.aimY * MELEE_REACH
    for (const b of booms) {
      if (b.state === 'dropped') continue
      const key = `b${booms.indexOf(b)}`
      if (p.meleeHits.has(key)) continue
      if (len(b.x - hx, b.y - 6 - hy) < MELEE_RADIUS + BOOM_RADIUS) {
        p.meleeHits.add(key)
        deflect(b, p)
      }
    }
    if (!active) continue // the grace tick is for deflects only; players are safe once the active frames end
    // the swing also wrecks the scenery in front of you
    if (!p.meleeHits.has('tiles')) {
      p.meleeHits.add('tiles')
      wreckNear(hx, hy, MELEE_RADIUS + 4, p.id, { crates: true, barrels: true, grass: true })
    }
    for (const q of players) {
      if (q.id === p.id || q.state === 'dead' || q.invuln > 0) continue
      const key = `p${q.id}`
      if (p.meleeHits.has(key)) continue
      if (len(q.x - hx, q.y - hy) < MELEE_RADIUS + HURT_RADIUS) {
        p.meleeHits.add(key)
        killSlice(q, p.aimX, p.aimY, p.id)
      }
    }
  }

  // effects
  for (const pt of particles) {
    pt.x += pt.vx
    pt.y += pt.vy
    pt.vx *= 0.9
    pt.vy = pt.vy * 0.9 + 0.08
    pt.ttl--
  }
  particles = particles.filter((pt) => pt.ttl > 0)
  for (const s of smears) s.ttl--
  smears = smears.filter((s) => s.ttl > 0)
  for (const h of halves) {
    h.x += h.vx
    h.y += h.vy
    h.vx *= 0.92
    h.vy *= 0.92
    h.ttl--
  }
  halves = halves.filter((h) => h.ttl > 0)
  for (const s of sinks) s.ttl--
  sinks = sinks.filter((s) => s.ttl > 0)
  for (const a of afterimages) a.ttl--
  afterimages = afterimages.filter((a) => a.ttl > 0)
  for (const s of slashes) s.ttl--
  slashes = slashes.filter((s) => s.ttl > 0)
  for (const bl of blasts) bl.ttl--
  blasts = blasts.filter((bl) => bl.ttl > 0)
}

// ---------------------------------------------------------------- rendering
const ctx = screen.ctx
let lightmap = new Lightmap(W, WORLD_H)

interface Drawable {
  y: number
  draw: () => void
}

function camTarget(): number {
  return Math.max(0, Math.min(WORLD_W - W, players[0].x - W / 2))
}

/** Ease the view after the local player; snap for scripted frames or after a long jump (a respawn). */
function updateCamera(snap: boolean) {
  if (WORLD_W <= W) {
    camX = 0
    return
  }
  const t = camTarget()
  if (snap || Math.abs(t - camX) > 240) camX = t
  else camX += (t - camX) * CAM_LERP
}
updateCamera(true)

// ---------------------------------------------------------------- arena cycling
/**
 * Loads the next (1) or previous (-1) roster room in place of the current one and re-seats everyone
 * at its spawns with a fresh score: Tab, Shift+Tab or the < > arrows in the HUD. From the strip or
 * the old layouts, forwards goes to the first room and back to the last.
 */
function switchArena(dir: 1 | -1) {
  const n = ARENA_LIST.length
  arenaIndex = arenaIndex < 0 ? (dir > 0 ? 0 : n - 1) : (arenaIndex + dir + n) % n
  const entry = ARENA_LIST[arenaIndex]
  loadArena(entry)
  screen.resize(W, H)
  if (lightmap.w !== W || lightmap.h !== WORLD_H) lightmap = new Lightmap(W, WORLD_H)
  // the shared clocks restart with the tick count (advanceMovers keeps them from here on)
  spikeA = cyclePhase(0, 0, SPIKE_CYCLE)
  spikeB = cyclePhase(0, half(SPIKE_CYCLE), SPIKE_CYCLE)
  ventA = cyclePhase(0, 0, VENT_CYCLE)
  ventB = cyclePhase(0, half(VENT_CYCLE), VENT_CYCLE)
  booms = []
  particles = []
  halves = []
  sinks = []
  afterimages = []
  slashes = []
  blasts = []
  smears = []
  eventLog.length = 0
  for (const p of players) {
    const sp = arena.spawns[p.id] ?? arena.spawns[0] ?? { c: 3, r: 3 }
    p.spawnX = sp.c * TILE + 8
    p.spawnY = sp.r * TILE + 8
    respawn(p)
    p.score = 0
    p.vx = p.vy = p.kbx = p.kby = 0
    p.cursorX = p.x + 60
    p.cursorY = p.y
    p.plat = -1
    p.meleeHits.clear()
    if (p.ai) {
      p.ai.tx = p.x
      p.ai.ty = p.y
      p.ai.retarget = 0
    }
  }
  updateCamera(true)
  // the URL follows, so a reload comes back to this room; ?at= only ever named a strip tile
  params.set('arena', entry.key)
  params.delete('at')
  history.replaceState(null, '', `?${params}`)
  document.title = pageTitle()
}
function pageTitle(): string {
  return `Boomerangeon — ${arenaEntry()?.title ?? arenaName}`
}

function drawSprite(s: Sprite, x: number, y: number, alpha = 1) {
  if (alpha <= 0) return
  ctx.globalAlpha = alpha
  ctx.drawImage(s.img, Math.round(x), Math.round(y))
  ctx.globalAlpha = 1
}

/** A sprite drawn at a fraction of its size, centred on (cx, cy), nearest-neighbour so it stays chunky. */
function drawSpriteScaled(s: Sprite, cx: number, cy: number, scale: number, alpha = 1) {
  if (alpha <= 0) return
  const w = Math.max(1, Math.round(s.w * scale))
  const h = Math.max(1, Math.round(s.h * scale))
  ctx.imageSmoothingEnabled = false
  ctx.globalAlpha = alpha
  ctx.drawImage(s.img, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h)
  ctx.globalAlpha = 1
}

function drawPlayer(p: Player) {
  const s = playerSprite(p)
  let alpha = 1
  if (inGrass(p.x, p.y)) alpha = p.id === 0 ? 0.4 : 0
  if (p.invuln > 0 && p.state !== 'dash' && (tick & 2) === 0) alpha *= 0.4
  if (alpha <= 0) return
  // a run frame may lift the body off its shadow (the frog's hop, the shroom's bob); the shadow
  // stays on the ground so it reads as leaving the floor, not floating. Action poses are drawn
  // flat so the hand-drawn frames land where they were drawn.
  const hop = runLift(p)
  const x = Math.round(p.x) - 7
  const y = Math.round(p.y) - 17 - hop
  // no invulnerability flash on the dash: the roll itself is the tell, as with a Dark Souls roll
  drawSprite(s, x, y, alpha)
  if (p.held && p.state !== 'dash' && p.anim !== 'catch' && p.anim !== 'roll') {
    // held boomerang peeks out beside the body, opposite the aim side (the clutch frame has it baked in)
    const b = boomSets[p.color][0]
    const side = p.aimX < 0 ? 1 : -1
    drawSprite(b, p.x + side * 7 - 4, p.y - 11 - hop, alpha)
  }
}

function drawBoomerang(b: Boomerang) {
  const frames = boomSets[players[b.owner].color]
  const half = Math.floor(BOOM_SPRITE / 2)
  if (b.state === 'dropped') {
    const f = frames[Math.floor(b.spin / 10) & 3]
    if (b.owner === 0 && !players[0].held) {
      const o = sil(f, PLAYER_COLORS[0])
      const pulse = (tick & 16) === 0 ? 0.9 : 0.5
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) drawSprite(o, b.x - half + ox, b.y - half + oy, pulse)
    }
    drawSprite(f, b.x - half, b.y - half)
    return
  }
  const color = boomHue(b)
  for (let i = b.trail.length - 1; i >= 0; i--) {
    const t = b.trail[i]
    const a = (b.armed || b.fire > 0 ? 0.8 : 0.55) * (1 - i / b.trail.length)
    ctx.fillStyle = rgba(color, a)
    const sz = (i < 2 ? 3 : 2) + (b.armed || b.fire > 0 ? 1 : 0)
    ctx.fillRect(Math.round(t.x) - 1, Math.round(t.y) - BOOM_HEIGHT - 1, sz, sz)
  }
  const f = frames[Math.floor(b.spin / 2) & 3]
  const fuse = fusePhase(b)
  if (fuse.scale < 1) {
    // shrinking down on its fuse: drawn from the centre so it collapses on the spot
    const cx = b.x - half + f.w / 2
    const cy = b.y - half - BOOM_HEIGHT + f.h / 2
    drawSpriteScaled(f, cx, cy, fuse.scale)
    if (fuse.flash) drawSpriteScaled(sil(f, PAL.white), cx, cy, fuse.scale)
    return
  }
  drawSprite(f, b.x - half, b.y - half - BOOM_HEIGHT)
  if (fuse.flash) drawSprite(sil(f, PAL.white), b.x - half, b.y - half - BOOM_HEIGHT)
}

/** The colour a boomerang's trail and glow take: its owner's, orange once armed, red-hot off a vent. */
function boomHue(b: Boomerang): string {
  if (b.armed) return BOMB_COLOR
  if (b.fire > 0) return (tick & 2) === 0 ? PAL.flameR : PAL.flameY
  return PLAYER_COLORS[players[b.owner].color]
}

/** Expanding ring, white edge over orange, fading as it grows to its radius: the blast, or a beep's pulse. */
function drawBlast(bl: Blast) {
  const t = 1 - bl.ttl / bl.max
  const r = bl.r * (0.15 + 0.85 * t)
  const alpha = 1 - t
  for (const [rr, color] of [
    [r, rgba(PAL.white, alpha)],
    [r - 2, rgba(PAL.flameO, alpha * 0.9)],
  ] as const) {
    if (rr <= 0) continue
    ctx.fillStyle = color
    for (let a = 0; a < Math.PI * 2; a += 0.03) {
      ctx.fillRect(Math.round(bl.x + Math.cos(a) * rr), Math.round(bl.y + Math.sin(a) * rr * 0.8), 1, 1)
    }
  }
}

function drawSlash(s: Slash) {
  const t = 1 - s.ttl / s.max
  const base = Math.atan2(s.ay, s.ax)
  const spread = 1.1
  const a0 = base - spread + t * spread * 0.6
  const a1 = base + spread - t * spread * 0.6
  const cx = s.x + s.ax * 6
  const cy = s.y - 7 + s.ay * 6
  const alpha = 1 - t * 0.7
  for (const [r, color] of [
    [11, rgba(PAL.white, alpha)],
    [13, rgba(s.color, alpha * 0.9)],
  ] as const) {
    ctx.fillStyle = color
    for (let a = a0; a <= a1; a += 0.04) {
      ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.8), 1, 1)
    }
  }
}

function drawAimIndicator(p: Player) {
  const color = PLAYER_COLORS[p.color]
  const ox = p.x
  const oy = p.y - 8
  if (p.id === 0 && p.held) {
    // the exact path the throw will take, wall bounces included, with the stop point marked
    const pts = previewThrow(p)
    const lift = BOOM_HEIGHT // ground path drawn at the height the boomerang sprite flies
    const phase = (tick >> 1) % 4
    let next = 10 + phase // path distance of the next dot
    let dist = 0
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      const seg = len(b.x - a.x, b.y - a.y)
      if (seg > BOOM_SPEED * 2) continue // a portal hop: no tick moves it this far, so draw nothing between the mouths
      while (seg > 0 && next <= dist + seg) {
        const f = (next - dist) / seg
        ctx.fillStyle = rgba(color, 0.75 - (next / THROW_RANGE) * 0.4)
        ctx.fillRect(Math.round(a.x + (b.x - a.x) * f), Math.round(a.y + (b.y - a.y) * f - lift), 1, 1)
        next += 4
      }
      dist += seg
    }
    // landing marker where it will stop and hang
    const end = pts[pts.length - 1]
    const mx = Math.round(end.x)
    const my = Math.round(end.y - lift)
    ctx.fillStyle = rgba(PAL.outline, 0.8)
    ctx.fillRect(mx - 3, my - 1, 7, 3)
    ctx.fillRect(mx - 1, my - 3, 3, 7)
    ctx.fillStyle = color
    ctx.fillRect(mx - 2, my, 5, 1)
    ctx.fillRect(mx, my - 2, 1, 5)
  } else {
    // chevron a little in front of the body
    const cx = ox + p.aimX * 12
    const cy = oy + p.aimY * 12
    const px = -p.aimY
    const py = p.aimX
    ctx.fillStyle = rgba(color, 0.9)
    ctx.fillRect(Math.round(cx + p.aimX * 2), Math.round(cy + p.aimY * 2), 1, 1)
    ctx.fillRect(Math.round(cx + px * 1.5), Math.round(cy + py * 1.5), 1, 1)
    ctx.fillRect(Math.round(cx - px * 1.5), Math.round(cy - py * 1.5), 1, 1)
    ctx.fillStyle = rgba(color, 0.45)
    ctx.fillRect(Math.round(cx - p.aimX * 1.5 + px * 3), Math.round(cy - p.aimY * 1.5 + py * 3), 1, 1)
    ctx.fillRect(Math.round(cx - p.aimX * 1.5 - px * 3), Math.round(cy - p.aimY * 1.5 - py * 3), 1, 1)
  }
}

function drawHud() {
  ctx.fillStyle = PAL.hud
  ctx.fillRect(0, 0, W, HUD_H)
  ctx.fillStyle = PAL.hudLine
  ctx.fillRect(0, HUD_H - 1, W, 1)

  for (const p of players) {
    const x = 5 + p.id * 34
    const col = PLAYER_COLORS[p.color]
    ctx.fillStyle = PAL.outline
    ctx.fillRect(x - 1, 3, 8, 8)
    ctx.fillStyle = p.state === 'dead' ? PAL.hudDim : col
    ctx.fillRect(x, 4, 6, 6)
    if (p.id === 0) {
      ctx.fillStyle = PAL.white
      ctx.fillRect(x + 2, 12, 2, 1)
    }
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = k < p.score ? col : PAL.hudLine
      ctx.fillRect(x + 10 + k * 4, 6, 3, 3)
    }
  }

  const remaining = Math.max(0, ROUND_SECONDS - Math.floor(tick / 60) % ROUND_SECONDS)
  const timer = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
  const timerX = W / 2 - textWidth(timer) / 2
  drawText(ctx, timer, timerX, 4, remaining <= 10 ? PAL.red : PAL.bone)

  // movement feel readout for the local player, when there is room before the timer
  const p0 = players[0]
  const sp = len(p0.vx + p0.slideX, p0.vy + p0.slideY) // what the feet actually do: walk plus slide
  const parts = [p0.state.toUpperCase(), `${sp.toFixed(2)} PX/T`]
  if (p0.anim !== 'none') parts.push(p0.anim.toUpperCase())
  if (p0.windup > 0 && sp === 0) parts.push(`WINDUP ${p0.windup}/${START_WINDUP}`)
  if (p0.slideX !== 0 || p0.slideY !== 0) parts.push(`SLIDE ${len(p0.slideX, p0.slideY).toFixed(2)}`)
  if (p0.state !== 'dead' && onIce(p0.x, p0.y)) parts.push('ICE')
  const hanging = booms.find((b) => b.owner === 0 && b.state === 'hang')
  if (hanging && hanging.hangT > BOOM_HANG) parts.push(`HOVER ${hanging.hangT}/${BOOM_HOVER_MAX}`)
  else if (p0.dashCd > 0) parts.push(`DASH CD ${p0.dashCd}`)
  const feel = parts.join('  ')
  const feelX = 5 + players.length * 34 + 4
  if (feelX + textWidth(feel) < timerX - 8) drawText(ctx, feel, feelX, 4, PAL.hudDim)

  // the room you are in between < > arrows that cycle the roster (click, or Tab), then the title
  const title = 'BOOMERANGEON'
  const titleX = W - textWidth(title) - 5
  drawText(ctx, title, titleX, 4, PAL.hudDim)
  const entry = arenaEntry()
  const zone = zoneName(p0.x) || arenaName.toUpperCase()
  const label = entry ? `${zone} ${arenaIndex + 1}/${ARENA_LIST.length}` : zone
  const lw = textWidth(label)
  const labelX = titleX - lw - 18
  hudArenaBox = { x0: labelX - 8, x1: labelX + lw + 8 }
  const over = scriptedTicks < 0 && mouseY < HUD_H && mouseX >= hudArenaBox.x0 && mouseX <= hudArenaBox.x1
  const overBack = over && mouseX < labelX + lw / 2
  drawText(ctx, '<', labelX - 6, 4, overBack ? PAL.white : PAL.hudDim)
  drawText(ctx, label, labelX, 4, PAL.bone)
  drawText(ctx, '>', labelX + lw + 3, 4, over && !overBack ? PAL.white : PAL.hudDim)
  if (!lightingOn) drawText(ctx, 'LIGHTS OFF', hudArenaBox.x0 - 44, 4, PAL.hudDim)
}

// The room card: title, what the room is for, how to move on. Shown for the first 2.5 s of a room
// (the tick count restarts when one loads) and never in scripted stills.
const BANNER_TICKS = 150
function drawBanner() {
  if (scriptedTicks >= 0 || tick >= BANNER_TICKS) return
  const fade = Math.min(1, (BANNER_TICKS - tick) / 30)
  const entry = arenaEntry()
  const title = (entry?.title ?? arenaName).toUpperCase()
  const blurb = entry ? entry.blurb.toUpperCase() : ''
  const hint = `${entry ? `ROOM ${arenaIndex + 1}/${ARENA_LIST.length}   ` : ''}TAB: NEXT ROOM   SHIFT-TAB: BACK   OR CLICK < > IN THE HUD`
  const bandH = blurb ? 44 : 34
  const y0 = HUD_H + Math.round(WORLD_H / 2 - bandH / 2)
  ctx.globalAlpha = 0.8 * fade
  ctx.fillStyle = PAL.outline
  ctx.fillRect(0, y0, W, bandH)
  ctx.globalAlpha = fade
  ctx.fillStyle = PAL.hudLine
  ctx.fillRect(0, y0, W, 1)
  ctx.fillRect(0, y0 + bandH - 1, W, 1)
  let y = y0 + 7
  drawText(ctx, title, W / 2 - textWidth(title, 2) / 2, y, PAL.bone, 2)
  y += 14
  if (blurb) {
    drawText(ctx, blurb, W / 2 - textWidth(blurb) / 2, y, PAL.cream)
    y += 10
  }
  drawText(ctx, hint, W / 2 - textWidth(hint) / 2, y, PAL.hudDim)
  ctx.globalAlpha = 1
}

function drawCursor() {
  if (scriptedTicks >= 0) return
  const x = Math.round(mouseX)
  const y = Math.round(mouseY)
  ctx.fillStyle = PAL.outline
  ctx.fillRect(x - 4, y - 1, 9, 3)
  ctx.fillRect(x - 1, y - 4, 3, 9)
  ctx.fillStyle = PAL.white
  ctx.fillRect(x - 3, y, 2, 1)
  ctx.fillRect(x + 2, y, 2, 1)
  ctx.fillRect(x, y - 3, 1, 2)
  ctx.fillRect(x, y + 2, 1, 2)
}

// Art review: every frame of each action, one row per facing, right-facing/right-armed originals only.
function renderSheet() {
  ctx.fillStyle = PAL.floor[0]
  ctx.fillRect(0, 0, W, H)
  const rows: [string, (s: CharSet) => Sprite[]][] = [
    ['STAND', (s) => [...s.stand.down, ...s.stand.sideR, ...s.stand.up]],
    ['RUN D', (s) => s.run.down],
    ['RUN S', (s) => s.run.sideR],
    ['RUN U', (s) => s.run.up],
    ['THROW D', (s) => s.throw.down],
    ['THROW S', (s) => s.throw.sideR],
    ['THROW U', (s) => s.throw.up],
    ['CATCH D', (s) => s.catch.down],
    ['CATCH S', (s) => s.catch.sideR],
    ['CATCH U', (s) => s.catch.up],
    ['MELEE D', (s) => s.melee.down],
    ['MELEE S', (s) => s.melee.sideR],
    ['MELEE U', (s) => s.melee.up],
    ['ROLL', (s) => s.roll],
  ]
  const chars = sheet === 'all' ? CHARACTERS.map((_, i) => i) : [localChar]
  chars.forEach((c, ci) => {
    const x0 = 6 + ci * 156
    drawText(ctx, CHARACTERS[c].name, x0, 4, PAL.bone)
    rows.forEach(([label, frames], ri) => {
      const y = 14 + ri * 24 // 14 rows fit the 350 px canvas at 24
      drawText(ctx, label, x0, y + 7, PAL.hudDim)
      frames(charSets[c][ci]).forEach((s, i) => {
        // a ground line under each frame makes a floating pose or an empty bottom row obvious
        ctx.fillStyle = PAL.floorMortar
        ctx.fillRect(x0 + 34 + i * 18, y + s.h, s.w, 1)
        ctx.drawImage(s.img, x0 + 34 + i * 18, y)
      })
    })
  })
  screen.present()
}

/** How high the pendulum blade rides: lowest mid-swing, lifting toward either end of its arc. */
function pendulumLift(cr: Crusher): number {
  const u = cr.pos.length > 0 ? (2 * cr.pos.dist) / cr.pos.length - 1 : 0
  return 2 + Math.round(8 * u * u)
}

function render() {
  if (sheet) return renderSheet()
  const cx = Math.round(camX)
  const x0 = cx
  const x1 = cx + W
  const vis = (x: number, m = 40) => x > x0 - m && x < x1 + m
  const c0 = Math.max(0, Math.floor(x0 / TILE))
  const c1 = Math.min(arena.cols - 1, Math.floor((x1 - 1) / TILE))

  ctx.fillStyle = PAL.bg
  ctx.fillRect(0, 0, W, H)
  ctx.save()
  ctx.translate(-cx, HUD_H)
  ctx.drawImage(staticLayer, x0, 0, W, WORLD_H, x0, 0, W, WORLD_H)

  const lights: Light[] = [] // world coords; shifted to the screen when composed
  const drawables: Drawable[] = []
  const overhead: (() => void)[] = [] // things hanging above everyone

  // the live tiles in view: spikes, vents, belts, cracking floor
  for (let r = 0; r < arena.rows; r++) {
    for (let c = c0; c <= c1; c++) {
      const k = tileAt(arena, c, r)
      if (k === TileKind.Floor || k === TileKind.Wall || k === TileKind.Pit || k === TileKind.Grass || k === TileKind.Ice) continue
      const x = c * TILE
      const y = r * TILE
      const i = idx(c, r)
      if (k === TileKind.Spikes) {
        const ph = phaseOf(k, c, r)
        art.drawSpikes(ctx, x, y, ph.phase, ph.t, SPIKE_CYCLE.on)
      } else if (k === TileKind.Vent) {
        const ph = phaseOf(k, c, r)
        if (ph.phase === 'warn') art.drawVentEmbers(ctx, x, y, ph.t, i)
        else if (ph.phase === 'on') {
          drawables.push({ y: y + TILE, draw: () => art.drawVentFlame(ctx, x, y, ph.t, VENT_CYCLE.on, tick, i) })
          lights.push({ x: x + 8, y: y + 2, r: 40, a: 0.8, glow: rgba(PAL.flameO, 0.3), glowR: 26 })
        }
      } else if (isBelt(k)) {
        const [dx, dy] = beltDir(k)
        art.drawBeltStripes(ctx, x, y, dx, dy, tick, BELT_SPEED)
      } else if (k === TileKind.Crumble && crumbleStart[i] >= 0 && crumbleGone[i] < 0) {
        art.drawCrumbleCracks(ctx, x, y, (tick - crumbleStart[i]) / CRUMBLE_WARN, c, r)
      }
    }
  }

  // portal mouths: a blue and an orange oval set into the wall, a flare when used, and a glow in
  // the mouth's colour that spills onto the floor in front and carries in the dark
  for (const po of portals) {
    const since = tick - po.usedT
    for (const m of po.ends) {
      if (!vis(m.x)) continue
      art.drawPortalMouth(ctx, m, tick, since)
      const flare = since < 12 ? 1 - since / 12 : 0
      lights.push({ x: m.gx + m.nx * 4, y: m.gy + m.ny * 4, r: 28 + 18 * flare, a: 0.55 + 0.45 * flare, glow: rgba(m.col, 0.22 + 0.3 * flare), glowR: 16 + 10 * flare })
    }
  }

  // torches sit on wall faces; animated, so not in the static layer
  arena.props.forEach((pr, i) => {
    if (pr.kind !== 'torch' || !vis(pr.c * TILE, 120)) return
    const x = pr.c * TILE + 4
    const y = pr.r * TILE + 3
    const frame = Math.floor(tick / 6 + i * 1.7) % 3
    drawSprite(torchFrames[frame], x, y)
    const flick = hash2(tick >> 2, i, 99) * 6
    lights.push({
      x: x + 3,
      y: y + 12,
      r: 100 + flick,
      a: 1,
      glow: 'rgba(255,150,60,0.24)',
      glowR: 64 + flick,
    })
  })

  // ground layer: platforms, rubble, slime trail, dropped boomerangs, shadows, sinking players, afterimages
  for (const pl of platforms) if (vis(pl.pos.x, pl.w + 16)) art.drawPlatform(ctx, Math.round(pl.pos.x), Math.round(pl.pos.y), pl.w, pl.h)
  for (const ch of chandeliers) {
    if (!vis(ch.x)) continue
    if (ch.state === 'rubble') {
      art.drawRubble(ctx, ch.x, ch.y)
      const left = 1 - ch.t / CHANDELIER_FADE
      if (left > 0) lights.push({ x: ch.x, y: ch.y, r: 36, a: 0.6 * left, glow: rgba(PAL.flameO, 0.25 * left), glowR: 24 })
    } else {
      const height = ch.state === 'fall' ? CHANDELIER_HEIGHT * (1 - ch.t / CHANDELIER_FALL) : CHANDELIER_HEIGHT
      const jitter = ch.state === 'creak' ? (((ch.t >> 1) & 1) ? 1 : -1) : 0
      overhead.push(() => art.drawChandelier(ctx, ch.x, ch.y, height, ch.ay, jitter, tick))
      // where the chandeliers are the only lights they throw further
      const r = def.lightSource === 'chandeliers' ? 100 : 72
      lights.push({ x: ch.x, y: ch.y - height, r, a: 0.9, glow: rgba(PAL.flameO, 0.28), glowR: r * 0.6 })
    }
  }
  for (const bl of barrels) {
    if (!bl.alive || !bl.lit) continue
    art.drawFuseGlow(ctx, bl.c * TILE + 8, bl.r * TILE + 13, bl.fuse)
  }
  for (const s of smears) {
    if (!vis(s.x)) continue
    const t = s.ttl / s.max
    ctx.fillStyle = rgba(s.color, 0.2 + 0.5 * t)
    ctx.fillRect(Math.round(s.x) - (s.w >> 1), Math.round(s.y), s.w, 1)
  }
  for (const b of booms) if (b.state === 'dropped' && vis(b.x)) drawBoomerang(b)
  for (const p of players) {
    if (p.state === 'dead' || !vis(p.x)) continue
    if (inGrass(p.x, p.y) && p.id !== 0) continue
    drawSprite(shadowDude, p.x - 5, p.y - 2)
  }
  for (const b of booms) if (b.state !== 'dropped' && vis(b.x)) drawSprite(shadowBoom, b.x - 3, b.y - 1)
  for (const s of sinks) {
    if (!vis(s.x)) continue
    const t = s.ttl / s.max
    const h = Math.max(1, Math.round(s.s.h * t))
    ctx.globalAlpha = 0.35 + t * 0.65
    ctx.drawImage(s.s.img, 0, 0, s.s.w, h, s.x, s.y + (s.s.h - h), s.s.w, h)
    ctx.globalAlpha = 1
  }
  for (const a of afterimages) {
    if (!vis(a.x)) continue
    const t = a.ttl / a.max
    drawSprite(sil(a.s, lighten(PAL.white, 0)), a.x, a.y, t * 0.55)
  }

  // y-sorted layer
  for (const cr of crates) {
    if (!cr.alive || !vis(cr.c * TILE)) continue
    drawables.push({ y: cr.r * TILE + 15, draw: () => drawSprite(crateSprite, cr.c * TILE + 1, cr.r * TILE + 1) })
  }
  for (const bl of barrels) {
    if (!bl.alive || !vis(bl.c * TILE)) continue
    drawables.push({
      y: bl.r * TILE + 15,
      draw: () => {
        drawSprite(barrelSprite, bl.c * TILE + 2, bl.r * TILE + 1)
        if (bl.lit && (bl.fuse & 2) === 0) drawSprite(sil(barrelSprite, PAL.white), bl.c * TILE + 2, bl.r * TILE + 1, 0.7)
      },
    })
    if (bl.lit) lights.push({ x: bl.c * TILE + 8, y: bl.r * TILE + 4, r: 30, a: 0.8, glow: rgba(PAL.flameO, 0.3), glowR: 22 })
  }
  for (const bu of bumpers) {
    if (!vis(bu.x)) continue
    const since = tick - bu.hitT
    const squash = since < 6 ? 1 - since / 6 : 0
    drawables.push({ y: bu.y + 4, draw: () => art.drawBumper(ctx, bu.x, bu.y, squash) })
  }
  for (const g of gates) {
    const ph = cyclePhase(tick, g.phase, GATE_CYCLE)
    const closed = ph.phase === 'on' ? Math.min(1, (ph.t + 1) / 6) : ph.phase === 'warn' ? 0.15 : 0
    const jitter = ph.phase === 'warn' ? (ph.t >> 1) & 1 : 0
    if (closed <= 0) continue
    for (const t of g.tiles) {
      if (!vis(t.c * TILE)) continue
      drawables.push({ y: t.r * TILE + TILE, draw: () => art.drawGateBars(ctx, t.c * TILE, t.r * TILE, closed, jitter) })
    }
  }
  for (const cr of crushers) {
    if (!vis(cr.pos.x)) continue
    const x = Math.round(cr.pos.x)
    const y = Math.round(cr.pos.y)
    if (cr.look === 'saw') drawables.push({ y: y + 8, draw: () => art.drawSaw(ctx, x, y, tick) })
    else if (cr.look === 'boulder') drawables.push({ y: y + 8, draw: () => art.drawBoulder(ctx, x, y, cr.pos.dist) })
    else {
      const lift = pendulumLift(cr)
      drawables.push({ y: y + 8, draw: () => art.drawPendulum(ctx, x, y, lift, cr.anchor.x, cr.anchor.y) })
    }
  }
  for (const ct of carts) {
    if (!vis(ct.pos.x)) continue
    const x = Math.round(ct.pos.x)
    const y = Math.round(ct.pos.y)
    const lamp = !ct.pos.moving && ct.pos.wait <= 20
    drawables.push({ y: y + 6, draw: () => art.drawCart(ctx, x, y, lamp) })
    if (lamp) lights.push({ x, y: y - 8, r: 26, a: 0.6, glow: rgba(PAL.flameY, 0.2), glowR: 16 })
  }
  for (const p of players) {
    if (p.state === 'dead' || !vis(p.x)) continue
    drawables.push({ y: p.y, draw: () => drawPlayer(p) })
    const strength = p.id === 0 ? 0.5 : 0.35
    lights.push({ x: p.x, y: p.y - 8, r: 44, a: strength })
  }
  for (const b of booms) {
    if (b.state === 'dropped' || !vis(b.x)) continue
    drawables.push({ y: b.y + 2, draw: () => drawBoomerang(b) })
    // an armed boomerang throws a bigger orange glow; it flares white on each beep and the glow
    // tightens as it shrinks, so the light collapses with it before the blast
    const fuse = fusePhase(b)
    lights.push({
      x: b.x,
      y: b.y - BOOM_HEIGHT,
      r: b.armed ? 44 : 30,
      a: fuse.flash ? 1 : 0.75 + 0.25 * (1 - fuse.scale),
      glow: rgba(fuse.flash ? PAL.white : boomHue(b), b.armed ? 0.45 + 0.3 * (1 - fuse.scale) : 0.28),
      glowR: b.armed ? 34 * (0.4 + 0.6 * fuse.scale) : 22,
    })
  }
  for (const bl of blasts) {
    const t = 1 - bl.ttl / bl.max
    lights.push({ x: bl.x, y: bl.y, r: 1.5 * bl.r * (2 - t), a: 1, glow: rgba(PAL.flameO, 0.5 * (1 - t)), glowR: 1.75 * bl.r })
  }
  for (const h of halves) {
    if (!vis(h.x)) continue
    drawables.push({
      y: h.y + h.sh,
      draw: () => {
        ctx.globalAlpha = Math.min(1, (h.ttl / h.max) * 1.6)
        ctx.drawImage(h.s.img, h.sx, h.sy, h.sw, h.sh, Math.round(h.x), Math.round(h.y), h.sw, h.sh)
        ctx.globalAlpha = 1
      },
    })
  }
  drawables.sort((a, b) => a.y - b.y)
  for (const d of drawables) d.draw()

  for (const pt of particles) {
    if (!vis(pt.x)) continue
    const t = pt.ttl / pt.max
    ctx.fillStyle = rgba(pt.color, Math.min(1, t * 1.5))
    const sz = pt.ttl > 10 ? 2 : 1
    ctx.fillRect(Math.round(pt.x), Math.round(pt.y), sz, sz)
  }
  for (const s of slashes) drawSlash(s)
  for (const bl of blasts) if (vis(bl.x, bl.r + 40)) drawBlast(bl)
  for (const o of overhead) o()
  if (look.snowfall) {
    // weather, render-only: a sparse fall of single-pixel flakes drifting down and a little to the right
    const n = Math.round((arena.cols * arena.rows) / 12)
    ctx.fillStyle = 'rgba(240,248,255,0.8)'
    for (let k = 0; k < n; k++) {
      const speed = 0.25 + hash2(k, 1, 7) * 0.35
      const sway = hash2(k, 2, 7) * 6.28
      const fy = (hash2(k, 0, 7) * WORLD_H + tick * speed) % WORLD_H
      const fx = (hash2(k, 3, 7) * WORLD_W + Math.sin(tick / 40 + sway) * 6 + tick * 0.15 + WORLD_W) % WORLD_W
      if (!vis(fx)) continue
      ctx.fillRect(Math.round(fx), Math.round(fy), 1, 1)
    }
  }
  ctx.restore()

  if (lightingOn) {
    // the lightmap is screen-sized: shift the lights by the camera and drop the ones out of view
    const onScreen: Light[] = []
    for (const l of lights) {
      const reach = Math.max(l.r, l.glowR ?? 0)
      if (l.x + reach < x0 || l.x - reach > x1) continue
      onScreen.push({ ...l, x: l.x - cx })
    }
    lightmap.render(onScreen, ambientAt(cx + W / 2), 0.5)
    ctx.save()
    ctx.translate(0, HUD_H)
    lightmap.compose(ctx, onScreen)
    ctx.restore()
  }

  ctx.save()
  ctx.translate(-cx, HUD_H)
  for (const p of players) {
    if (p.state === 'dead' || !vis(p.x, 240)) continue
    if (p.id !== 0 && inGrass(p.x, p.y)) continue
    drawAimIndicator(p)
  }
  ctx.restore()

  drawBanner()
  drawHud()
  drawCursor()
  screen.present()
}

// ---------------------------------------------------------------- loop
function frameInputs(scripted: boolean): Input[] {
  return players.map((p) => (p.ai ? aiInput(p) : scripted ? scriptedInput(tick, p) : readLocalInput()))
}

if (scriptedTicks >= 0) {
  try {
    // ?swap=K: press Tab K times (Shift+Tab for negative K) before the scene runs, to still a swap
    const swap = Number(params.get('swap') ?? 0) || 0
    for (let i = 0; i < Math.abs(swap); i++) switchArena(swap > 0 ? 1 : -1)
    for (let i = 0; i < scriptedTicks; i++) {
      step(frameInputs(true))
      if (trace) {
        const p0 = players[0]
        const bs = booms
          .map((b) => `P${b.owner} ${b.state}${b.state === 'hang' ? b.hangT : ''}${b.recall && b.state === 'return' ? '(recall)' : ''}${b.armed ? '*' : ''} ${b.x.toFixed(1)},${b.y.toFixed(1)} v=${len(b.vx, b.vy).toFixed(2)}`)
          .join(' | ')
        const slide = len(p0.slideX, p0.slideY)
        const flags = `${slide ? ` slide${slide.toFixed(2)}` : ''}${p0.windup ? ` windup${p0.windup}` : ''}${p0.anim !== 'none' ? ` ${p0.anim}${p0.animT}` : ''}`
        console.log(`T${tick} P0 ${p0.state}${flags} ${p0.x.toFixed(1)},${p0.y.toFixed(1)} v=${len(p0.vx + p0.slideX, p0.vy + p0.slideY).toFixed(2)} walk=${len(p0.vx, p0.vy).toFixed(2)} ${bs}`)
      }
    }
    updateCamera(true)
    render()
    // one line the screenshot script can grep: where the local player ended up and what happened
    const p0 = players[0]
    console.log(`END t${tick} P0 ${p0.state} ${p0.x.toFixed(1)},${p0.y.toFixed(1)} tile ${Math.floor(p0.x / TILE)},${Math.floor(p0.y / TILE)} cam ${Math.round(camX)} | ${eventLog.join(' · ') || 'no events'}`)
    document.title = `boomerangeon t=${tick}`
    document.getElementById('hint')!.textContent = `scripted frame t=${tick} · ${zoneName(players[0].x)} · ${booms.length} boomerangs · ${eventLog.join(' · ') || 'no events yet'}`
    // headless screenshots only pick up canvas content presented inside an animation frame
    requestAnimationFrame(() => render())
  } catch (err) {
    reportError(err instanceof Error ? `${err.message}\n${err.stack}` : String(err))
  }
} else {
  document.title = pageTitle()
  let last = performance.now()
  let acc = 0
  const DT = 1000 / 60
  const loop = (now: number) => {
    acc += Math.min(100, now - last)
    last = now
    while (acc >= DT) {
      step(frameInputs(false))
      acc -= DT
    }
    updateCamera(false)
    render()
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}
