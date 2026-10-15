/**
 * The game proper, grown out of the visual style demo: a stand-in simulation with the spec's feel
 * (60 Hz fixed step, spec constants) and everything drawn round it. The shell (game/app.ts) imports
 * this module and calls startGame() once, in one of three modes:
 *
 *   practice  the demo as it stands: you and some bots in a roster room, Tab (or the < > arrows in
 *             the HUD) swaps the room for the next one, Shift+Tab for the previous, everyone is
 *             re-seated and the URL follows; B adds a bot; nobody keeps score for long
 *   match     docs/01 §10 rounds: intro, play, round end, results; first to the target; 3/5/7 lives per round
 *             (offline against bots with ?match=1, or online below)
 *   online    a match driven by a lockstep session (net/lockstep.ts): every client steps the same
 *             inputs on the same ticks, so the sim here must stay deterministic (no Math.random, no
 *             Math.sin/cos, nothing read from the renderer)
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
 *             ?char=0-6 local character, ?bots=0-3 number of AI opponents (default 1; B / Shift+B
 *             add / remove one while playing),
 *             ?give=fire,triple hand the local player those power-ups at the start (and after every
 *             room swap), ?powerups=0 stop pickups spawning,
 *             ?trace=1 per-tick log, ?sheet=1 (or sheet=all) shows every animation frame instead,
 *             ?shake=0 no screen shake and no blast flash, ?hitstop=0 no hold on kills (docs/04 §5).
 */
import { CHARACTERS, characterIndex, timedFrame, type FacingFrames } from '../art/characters.ts'
import { CHAR_KEY, PAL, PLAYER_COLORS, PROP_KEY, darken, lighten, rgba, withPrimary } from '../art/palette.ts'
import { BARREL, BOOMERANG, CRATE, LAMP, LANTERN, SHADOW_BOOM, SHADOW_DUDE, TORCH } from '../art/props.ts'
import { POWER_GLYPHS, POWER_KEY, badgeRows } from '../art/powerups.ts'
import * as art from '../render/hazardArt.ts'
import { Fx } from '../render/fx.ts'
import * as part from '../render/powerupArt.ts'
import { Lightmap, type Light } from '../render/lighting.ts'
import { ctx2d, flipX, makeCanvas, rotate90, silhouette, spriteFromRows, type Sprite } from '../render/pixelart.ts'
import { createScreen, type Screen } from '../render/screen.ts'
import { drawText, textWidth } from '../render/text.ts'
import { TILE, TileKind, beltDir, drawGear, gearAt, isBelt, parseArena, redrawCells, renderArenaStatic, tileAt, type ArenaMap, type GrassAt } from '../render/tiles.ts'
import { LOOKS, type Ambient, type Look } from '../render/looks.ts'
import { hash2, hashInt, mulberry32 } from '../util/rng.ts'
import { dcos, dsin } from '../util/trig.ts'
import { ARENA_BRAWL, ARENA_FLOOR, ARENA_STRIP, type ArenaDef } from './arena.ts'
import { ARENAS, ARENA_LIST, type ArenaEntry } from './arenas.ts'
import { cyclePeriod, cyclePhase, railPos, type Cycle, type PhaseInfo, type Pt, type Rail, type RailPos } from './hazards.ts'
import { POWERS, POWER_KINDS, isPowerKind, type PowerKind } from './powerups.ts'
import { endFrame, engine, loadSamples, loop, music, setListener, sfx, stopLoops } from '../audio/index.ts'
import { options, saveOptions } from '../game/options.ts'
import { optionsItems } from '../game/optionsMenu.ts'
import { Menu, drawPanel, type Item } from '../game/ui.ts'
import { HASH_EVERY, type NetSession } from '../net/lockstep.ts'
import { TEAM_NAMES } from '../game/roster.ts'
import { roundLives, type Input, type RoomOrder, type MatchKind, type Team } from '../net/protocol.ts'

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
const DASH_SLIDE_SPEED = 4 * 0.95
const DASH_SLIDE_FRICTION = 0.93
const DASH_SLIDE_MIN = 0.2 // below this the slide is dropped

// Dash and its exit slide are 5% slower (2026-10-11). Duration and cooldown stay the same.
const DASH_SPEED = 5.4 * 0.95
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

// Original action durations; the three new animals split the throw into uneven frame holds.
// Visual recovery can continue after the combat state ends, and new input interrupts it.
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
// constant speed and then stopping". After the launch click, another hold stops it anywhere along
// either leg of the flight. Releasing starts the return from rest, with the same acceleration.
const BOOM_RADIUS = 10 // hit radius against players and melee swings (Aaron's number; generous next to the 11 px sprite)
const BOOM_WALL_RADIUS = 4 // collision radius against walls; a little under the sprite so bounces hug the wall face
const BOOM_SPRITE = 11 // the chevron sprite is BOOM_SPRITE square, drawn centred on the boomerang
const BOOM_SPEED = 10 * 0.95 // 5% slower; range stays 224 px, so the parabola takes a little longer
const BOOM_HANG = 3 // dead stop at the top of the throw before it turns back (the slow approach already reads as a pause)
const BOOM_HOVER_BRAKE = 6 // 100 ms: a short glide to rest before hovering
const BOOM_HOVER_MAX = 45 // the throw button held keeps it hanging up to this long (0.75 s)
const BOOM_RETURN_SPEED = 12 * 0.95 // cap on the return; a regular return from full range arrives at ~10
const BOOM_BRAKE = 0.6 // emergency decel once the bounce or flight cap is hit
const BOOM_TURN = 0.16 // homing steer while returning, as a fraction of speed per tick
const BOOM_TURN_NEAR = 0.4 // within BOOM_NEAR_DIST of the owner it bends hard to land the catch
const BOOM_NEAR_DIST = 48
const BOOM_MAX_BOUNCES = 4
const BOOM_MAX_FLIGHT = 240
const CATCH_RADIUS = 10
const CATCH_REACH = CATCH_RADIUS + 4 * BOOM_RETURN_SPEED
const PICKUP_RADIUS = 8
const DROP_FRICTION = 0.85
const DEFLECT_SPEED = 7.5 * 0.95
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
const SPAWN_PROTECT = 120 // two seconds to escape a camper, including floor fire and shoves
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

// Power-ups (docs/03 §12). Pickups land on the room's `p` points on a timer; a player holds up to
// POWERUP_CAP, loses them all on death. Boomerang flags ride on the boomerang from the throw and
// survive a steal; body power-ups work while held.
const POWERUP_FIRST = 120 // ticks after a room loads before the first pickup is announced
const POWERUP_INTERVAL = 480 // ticks between pickups (8 s)
const POWERUP_MAX_ON_FIELD = 2 // no new pickup while this many are waiting to be taken
const POWERUP_WARN = 45 // the point glows this long before the pickup lands on it
const POWERUP_TTL = 900 // an untaken pickup fizzles after 15 s so the kinds keep rotating
const POWERUP_PICK_RADIUS = 10
const POWERUP_CAP = 3 // held at once; a fourth pushes out the oldest
const CRATE_DROP_CHANCE = 0.25 // a broken crate drops a pickup this often
const FIRE_TTL = 120 // ticks a fire tile burns (2 s)
const FIRE_START = 24 // px of flight before the first fire or ice tile, so the thrower is never standing in it
const FIRE_SPREAD = 20 // ticks between a burning grass tile catching its standing neighbours
const ICE_TTL = 480 // ticks a laid ice tile lasts (8 s); it thins away over its last quarter
const BIG_SCALE = 2 // hit radius and sprite of a big boomerang
const TRIPLE_SPREAD = (20 * Math.PI) / 180 // the phantoms fly this far either side of the throw
const SPEED_MULT = 1.35 // run speed cap with Speed
const SPEED_DASH_CD = 15 // dash cooldown with Speed (30 without)
const SHIELD_KB = 6 // the pop knocks you away from what hit you
const SHIELD_GRACE = 20 // and gives you i-frames this long
const BLINK_SQUASH_RADIUS = 8 // landing on someone when you blink flattens them
const DARK_AMBIENT = 0.92 // lightmap darkness inside a dark zone (0.4 elsewhere)
const CANDLE_AMBIENT = 0.55 // lightmap darkness in a room lit only by its chandeliers, all of them hanging; DARK_AMBIENT once they are all down
const CAM_LERP = 0.12

// Juice and atmosphere (docs/04 §5–7). All of it is render-only: the simulation never sees any of
// it, and the effects run on their own seeded rng (render/fx.ts) so the sim's stream is untouched.
const HIT_FLASH = 2 // simulation ticks a killed body is drawn solid white
const SHAKE_KILL = 2 // px of screen shake on a kill
const SHAKE_BLAST = 4 // on a blast
const SHAKE_LAND = 3 // on something heavy landing
const SPAWN_DROP = 14 // ticks a respawning body takes to drop in from above and land
const SPAWN_LAND = 3 // the last of those it spends squashed on the floor before standing up
const SPAWN_HEIGHT = 40 // px above its spawn point the drop starts
const BREATHE_PERIOD = 72 // ticks between idle breaths
const BREATHE_DIP = 10 // ticks each breath holds the top of the body a pixel lower
const BREATHE_FOLD = 0.45 // the breath folds this far down the visible body: head and shoulders above it move, the feet don't
const FADE_IN = 20 // ticks a freshly loaded room takes to come up from black (live play only)
const PRINT_TTL = 240 // ticks a footprint in the snow lasts
const SCORCH_TTL = 3600 // ticks a blast's mark stays on the floor (a round)

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
let seed = Number(params.get('seed') ?? 7)
const scriptedTicks = params.has('t') ? Number(params.get('t')) : -1
// ?trace=1 logs every boomerang's state per scripted tick to the console (shot.sh echoes CONSOLE lines)
const trace = params.get('trace') === '1'
const idle = params.get('idle') === '1'
// ?push=x,y: in the scripted scene, hold this movement direction from the dash onwards
const push = params.has('push') ? params.get('push')!.split(',').map(Number) : null
// ?walk=x,y[,T]: in the scripted scene, hold this direction from tick 0 (until tick T) and throw along it at tick 10
const walk = params.has('walk') ? params.get('walk')!.split(',').map(Number) : null
// ?hover=start,end;start,end: scripted holds, including release/re-hold during the return.
const hoverWindows = params.has('hover') ? params.get('hover')!.split(';').map((s) => s.split(',').map(Number)) : null
// ?aim=dx,dy: where the scripted cursor sits relative to the player
const aimOff = params.has('aim') ? params.get('aim')!.split(',').map(Number) : [120, 10]
// ?light=0, ?shake=0, ?hitstop=0: the picture toggles (docs/04 §9) live in the saved options
// (game/options.ts, read live so the pause menu's changes apply at once); a URL param overrides
// them for this page without being saved
if (params.get('light') === '0') options.lighting = false
if (params.get('shake') === '0') options.shake = false
if (params.get('hitstop') === '0') options.hitstop = false
let localChar = params.has('char') ? characterIndex(Number(params.get('char'))) : options.char
const sheet = params.get('sheet') // '1' = the local character's frames, 'all' = every character
const startAt = params.get('at')?.split(',').map(Number) // c,r tile for the local player
// ?give=fire,triple: power-ups the local player starts with (and gets back after a room swap)
const giveList: PowerKind[] = (params.get('give') ?? '').split(',').filter(isPowerKind)
const powerupsOn = params.get('powerups') !== '0'

let rng = mulberry32(seed)
/** Particles, decals, shake and flash: render-only, on its own stream so the sim's rng is never touched. */
let vfx = new Fx(seed * 7919 + 1)
/** Shared death slowdown with a local camera view. */
const DEATH_SLOW_TICKS = 18
let deathSlowT = 0 // shared simulation ticks; every peer slows the same part of the fight
let deathX = 0
let deathY = 0
let deathFrame: HTMLCanvasElement | null = null
function gameSpeed(): number {
  return deathSlowT > 0 ? 0.6 + 0.4 * Math.max(0, 1 - deathSlowT / 6) : 1
}
/** Crop the world only; aim input uses the inverse of this same view. */
function deathView() {
  const progress = 1 - deathSlowT / DEATH_SLOW_TICKS
  const envelope = Math.min(1, progress / 0.18) * Math.min(1, (1 - progress) / 0.7)
  const zoom = options.hitstop && deathSlowT > 0 ? 1 + 0.09 * envelope : 1
  return { zoom, sx: Math.max(0, Math.min(W - W / zoom, deathX - camX - W / (2 * zoom))),
    sy: Math.max(0, Math.min(WORLD_H - WORLD_H / zoom, deathY - WORLD_H / (2 * zoom))) }
}
/** A roster room by key (arenas.ts), else one of the demo layouts. */
function pickDef(name: string): ArenaDef {
  return ARENAS[name] ?? (name === 'floor' ? ARENA_FLOOR : name === 'brawl' ? ARENA_BRAWL : ARENA_STRIP)
}
// the roster's first room unless asked otherwise; ?at= on its own means the strip, whose tiles it names
let arenaName = params.get('arena') ?? (startAt ? 'strip' : ARENA_LIST[0].key)
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
// fire laid by a fire boomerang: the tick each tile caught (-1 not burning) and who lit it
let fireAt!: Int32Array
let fireBy!: Int16Array
const fireList: number[] = []
// ice laid by an ice boomerang: the tick each tile was coated (-1 bare) and who laid it
let iceAt!: Int32Array
let iceBy!: Int16Array
const iceList: number[] = []
/** A power-up on the floor: announced at its point for POWERUP_WARN ticks, then waiting to be taken. */
interface Pickup {
  kind: PowerKind
  x: number
  y: number
  t: number // ticks since announced (warn) or since it landed (ready)
  ready: boolean
}
const pickups: Pickup[] = []
let nextPickupT = POWERUP_FIRST
let lastPickupKind: PowerKind | null = null

const grassLook: GrassAt = (c, r) => {
  const t = grassCut[r * arena.cols + c]
  if (t < 0) return 'full'
  return tick - t < GRASS_REGROW - GRASS_SPROUT ? 'stubble' : 'sprout'
}
let staticLayer!: HTMLCanvasElement
let staticCtx!: CanvasRenderingContext2D
// a sky room's cloud sea: two strips (far, near) tiled under the pits at different parallax
let cloudStrips: HTMLCanvasElement[] | null = null

/** One room-tall strip of pixel clouds that tiles horizontally (each cloud is drawn wrapped). */
function makeCloudStrip(w: number, h: number, salt: number, body: string, shadowColor: string): HTMLCanvasElement {
  const cv = makeCanvas(w, h)
  const g = ctx2d(cv)
  const rng = mulberry32(hashInt(salt, w, h))
  const n = Math.round((w * h) / 2600)
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(rng() * w)
    const cy = Math.floor(rng() * h)
    const cw = 14 + Math.floor(rng() * 22)
    for (const ox of [0, -w, w]) {
      // three stacked bars, each shorter than the one below, over a shadow line
      let bw = cw
      for (let row = 0; row < 3; row++) {
        const bx = cx + ox + Math.floor((cw - bw) * (0.3 + rng() * 0.4))
        g.fillStyle = body
        g.fillRect(bx, cy - row * 2, bw, 2)
        bw = Math.max(4, bw - 4 - Math.floor(rng() * 6))
      }
      g.fillStyle = shadowColor
      g.fillRect(cx + ox + 1, cy + 2, cw - 2, 1)
    }
  }
  return cv
}

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
  fireAt = new Int32Array(n).fill(-1)
  fireBy = new Int16Array(n).fill(-1)
  fireList.length = 0
  iceAt = new Int32Array(n).fill(-1)
  iceBy = new Int16Array(n).fill(-1)
  iceList.length = 0
  pickups.length = 0
  nextPickupT = POWERUP_FIRST
  look = LOOKS[d.look ?? 'stone'] ?? LOOKS.stone
  // the effects restart with the room on a stream of their own, so a still of any room is reproducible
  vfx.reset(seed * 7919 + arena.cols * 131 + arena.rows)
  staticLayer = renderArenaStatic(arena, seed, grassLook, look)
  staticCtx = ctx2d(staticLayer)
  cloudStrips = look.sky
    ? [makeCloudStrip(320, WORLD_H, seed + 1, '#dce8f4', '#aac4e0'), makeCloudStrip(256, WORLD_H, seed + 2, '#ffffff', '#c4daf0')]
    : null

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
  sfx('warp', closerX(from.x, to.x))
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
/** Slippery underfoot: the room's own ice, or a coat laid by an ice boomerang (docs/03 §5.5). */
function onIce(x: number, y: number): boolean {
  if (kindAt(x, y) === TileKind.Ice) return true
  const c = Math.floor(x / TILE)
  const r = Math.floor(y / TILE)
  if (c < 0 || r < 0 || c >= arena.cols || r >= arena.rows) return false
  return iceAt[idx(c, r)] >= 0
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
  const base = look.ambientLight ?? 0.4
  let d = base + (DARK_AMBIENT - base) * darknessAt(x)
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
const lanternFrames = LANTERN.map((f) => spriteFromRows(f, PROP_KEY, 'lantern'))
const lampFrames = LAMP.map((f) => spriteFromRows(f, PROP_KEY, 'lamp'))
const shadowDude = spriteFromRows(SHADOW_DUDE, PROP_KEY, 'shadow')
const shadowBoom = spriteFromRows(SHADOW_BOOM, PROP_KEY, 'shadow')
// power-up badges: the 7×7 glyph on a dark 9×9 tile; the pickup on the floor, the HUD and the stack over a head
const powerIcons = Object.fromEntries(POWER_KINDS.map((k) => [k, spriteFromRows(badgeRows(POWER_GLYPHS[k]), POWER_KEY, k)])) as Record<PowerKind, Sprite>

const silCache = new Map<Sprite, Map<string, Sprite>>()
function sil(s: Sprite, color: string): Sprite {
  let m = silCache.get(s)
  if (!m) silCache.set(s, (m = new Map()))
  let out = m.get(color)
  if (!out) m.set(color, (out = silhouette(s, color)))
  return out
}

/** The first row of a sprite with anything drawn in it (the slime is short; its body starts well down the frame). Cached. */
const topCache = new WeakMap<Sprite, number>()
function spriteTop(s: Sprite): number {
  let top = topCache.get(s)
  if (top === undefined) {
    const px = s.img.getContext('2d')!.getImageData(0, 0, s.w, s.h).data
    top = s.h
    scan: for (let r = 0; r < s.h; r++)
      for (let c = 0; c < s.w; c++)
        if (px[(r * s.w + c) * 4 + 3] > 0) {
          top = r
          break scan
        }
    topCache.set(s, top)
  }
  return top
}

// ---------------------------------------------------------------- state
type Facing = 'down' | 'up' | 'side'
type PState = 'idle' | 'melee' | 'dash' | 'dead'
// Sprite-only pose: the throw, reaching for the returning boomerang, clutching it, and the roll
// (which starts with the dash state and keeps going after it ends, through the slide).
type Anim = 'none' | 'throw' | 'reach' | 'catch' | 'roll'

interface Player {
  id: number
  name: string // lobby name; empty in practice
  char: number
  color: number
  kills: number // match mode: kills, for the podium's tie-break (docs/01 §10); the score counts rounds
  gone: boolean // match mode: left the room; stays in the list so ids keep meaning, never acts again
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
  holdThrow: boolean // this tick's throw-button-held input, read by the airborne boomerang
  throwRec: number
  anim: Anim
  animT: number
  dashCd: number
  invuln: number
  spawnProtect: number
  team: Team
  respawnT: number
  lives: number // remaining lives, including the current one; refilled each round
  spawnX: number
  spawnY: number
  score: number
  meleeHits: Set<string>
  lastShover: number // who last dash-shoved us, and when: a hazard kill inside HAZARD_CREDIT_TICKS is theirs
  lastShoveT: number
  plat: number // platform we stood on at the end of last tick, or -1
  turn: { ix: number; iy: number; q: number } | null // after a portal: the stick as held going in, and the quarter turns it is read through (throughTurn)
  powers: PowerKind[] // held power-ups, oldest first; at most POWERUP_CAP; cleared on death
  spawnT: number // render-only: ticks left of the drop-in after a (re)spawn; the body is in the air above SPAWN_LAND
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
  hovering: boolean // braking/hover active; release returns once at rest, without the endpoint pause
  hoverReady: boolean // launch click has been released
  hoverUsed: boolean // one hover for the entire throw, even after a deflect
  hoverReleased: boolean // release during braking also commits to the return
  brakeT: number // ticks left to ease down to zero; never changes normal return acceleration
  hangT: number // ticks spent hanging so far
  armed: boolean // set by deflecting your own boomerang: it blows up at the end of its flight instead of returning
  fire: number // ticks of fire trail left after crossing a lit vent (render-only)
  bounces: number
  flight: number
  spin: number
  trail: { x: number; y: number }[]
  hit: Set<number>
  powers: Set<PowerKind> // the thrower's boomerang flags, fixed at the throw; a steal keeps them
  phantom: boolean // one of a triple's side copies: kills, is deflectable (pops), never hangs, returns or drops
  lastTile: number // tile index the fire trail last lit, so each tile is lit once as it crosses
}

// Particles, rings and floor marks live in render/fx.ts (`vfx`); these are the sprite-based effects.

/** The two halves of a sliced body: drawn solid white for their first HIT_FLASH ticks (docs/01 §8). */
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

/** A body sinking into the floor: a fall, a burn or a squash. `flash`: it was hit, so it flashes white first. */
interface Sink {
  s: Sprite
  x: number
  y: number
  ttl: number
  max: number
  flash: boolean
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

const players: Player[] = []
let booms: Boomerang[] = []
let halves: Half[] = []
let sinks: Sink[] = []
let afterimages: Afterimage[] = []
let slashes: Slash[] = []
let blasts: Blast[] = []
const eventLog: string[] = []

/** The slot of the player this browser controls: whose camera, aim line, HUD marker and sounds. */
let localId = 0
function local(): Player {
  return playerById(localId) ?? players[0]
}
function playerById(id: number): Player | undefined {
  for (const p of players) if (p.id === id) return p
  return undefined
}
/** Which spawn point each player id takes this round: its own in practice, a seeded shuffle in a match (docs/01 §10). */
let spawnOrder: number[] = []
function spawnFor(id: number): Pt {
  const sp = arena.spawns[spawnOrder[id] ?? id] ?? arena.spawns[0] ?? { c: 3, r: 3 }
  return { x: sp.c * TILE + 8, y: sp.r * TILE + 8 }
}
function shuffleSpawns() {
  const order = arena.spawns.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  if (match.gameMode === 'teams') {
    // Keep teammates on the same side, with seeded side swaps and spawn choices each round.
    order.sort((a, b) => arena.spawns[a].c - arena.spawns[b].c)
    const ends = [order.slice(0, 2), order.slice(-2)]
    const swap = rng() < 0.5 ? 0 : 1
    const used = [0, 0]
    spawnOrder = []
    for (const p of players) spawnOrder[p.id] = ends[p.team ^ swap][used[p.team]++]
  } else spawnOrder = order
}

function makePlayer(id: number, char: number, color: number, ai: boolean, name = '', team: Team = (id % 2) as Team): Player {
  const { x, y } = spawnFor(id)
  return {
    id,
    name,
    char,
    color,
    kills: 0,
    gone: false,
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
    spawnProtect: 0,
    team,
    respawnT: 0,
    lives: 3,
    spawnX: x,
    spawnY: y,
    score: 0,
    meleeHits: new Set(),
    lastShover: -1,
    lastShoveT: -9999,
    plat: -1,
    turn: null,
    powers: [],
    spawnT: SPAWN_DROP,
    ai: ai ? { tx: x, ty: y, retarget: 0, throwT: 60 + Math.floor(rng() * 120) } : null,
  }
}

/** Practice: you and the bots the URL asks for (startGame; a match gets its roster from the lobby instead). */
function seatPracticePlayers() {
  players.push(makePlayer(0, localChar, 0, false))
  if (startAt && startAt.length === 2 && startAt.every((n) => Number.isFinite(n))) {
    const p0 = players[0]
    p0.x = p0.spawnX = startAt[0] * TILE + 8
    p0.y = p0.spawnY = startAt[1] * TILE + 8
    p0.cursorX = p0.x + 60
    p0.cursorY = p0.y
  }
  // one sparring bot by default (Aaron, 2026-10-09: "add a bot in the demo so i can test play");
  // ?bots=0 clears the floor for feel-testing, ?bots=2-3 for a crowd; B / Shift+B change it live.
  // Scripted stills (?t=) stay empty unless they ask, so the existing shots don't change.
  const botCount = Math.min(3, Math.max(0, Number(params.get('bots') ?? (scriptedTicks >= 0 ? 0 : 1)) || 0))
  for (let i = 1; i <= botCount; i++) players.push(makePlayer(i, (i + localChar) % CHARACTERS.length, i, true))
}

/** B: another bot joins at the next free spawn, up to three. */
function addBot() {
  if (players.length >= 4) return
  const id = players.length
  const p = makePlayer(id, (id + localChar) % CHARACTERS.length, id, true)
  p.invuln = SPAWN_PROTECT
  p.spawnProtect = SPAWN_PROTECT
  players.push(p)
  eventLog.push(`t${tick} bot P${id} joined`)
}

/** Shift+B: the last bot leaves, taking its boomerang and any credit it was owed with it. */
function removeBot() {
  const p = players[players.length - 1]
  if (!p?.ai) return
  players.pop()
  booms = booms.filter((b) => b.owner !== p.id)
  for (const i of fireList) if (fireBy[i] === p.id) fireBy[i] = -1
  for (const i of iceList) if (iceBy[i] === p.id) iceBy[i] = -1
  for (const q of players) if (q.lastShover === p.id) q.lastShover = -1
  vfx.smoke(p.x, p.y, 6, '#2a2230', 6, 4)
  eventLog.push(`t${tick} bot P${p.id} left`)
}

/** Of two world x positions (a portal's two mouths, a blink's two ends), the one nearer the local player: where its one sound plays. */
function closerX(a: number, b: number): number {
  const lx = local().x
  return Math.abs(a - lx) <= Math.abs(b - lx) ? a : b
}

/** True when world x is on screen, give or take `m` px: shake, flash and the ambient spawns only bother with what you can see. */
function inView(x: number, m = 40): boolean {
  const x0 = scriptedTicks >= 0 ? camTarget() : camX
  return x > x0 - m && x < x0 + W + m
}

/** Screen shake from something at world x, if it is on screen and the toggle is on. */
function shakeAt(x: number, mag: number, ticks: number) {
  if (options.shake && inView(x, 80)) vfx.shake(mag, ticks)
}

/** A white flash over the world from something at world x (blasts), under the same toggle as the shake. */
function flashAt(x: number, a: number, ticks: number) {
  if (options.shake && inView(x, 80)) vfx.flash(a, ticks)
}

/** The feet mark the floor (docs/04 §6): prints in snow, scratches on ice, a puff of dust anywhere else. */
function footsteps(p: Player, ice: boolean) {
  if (!p.moving || !showsWalk(p) || p.state === 'dash' || inGrass(p.x, p.y)) return
  const sp = len(p.vx, p.vy)
  if (sp < 0.3) return
  const ux = p.vx / sp
  const uy = p.vy / sp
  if (ice) {
    if (p.walkT % 8 === 0) vfx.decal('scratch', p.x + (vfx.rng() - 0.5) * 4, p.y + 1, PAL.iceCrack, { w: 3, dx: ux, dy: uy * 0.6, ttl: 300 })
    return
  }
  if (p.walkT % 8 !== 0) return
  const side = (p.walkT >> 3) & 1 ? 2 : -2 // left foot, right foot
  if (look.prints) vfx.decal('print', p.x - uy * side, p.y + ux * side * 0.5, look.prints, { w: 2, h: 1, ttl: PRINT_TTL })
  else vfx.dust(p.x - ux * 2, p.y - uy * 2, 1, look.dust, 0.3)
}

/**
 * The room's air (docs/04 §6): what the look says drifts through it, plus what its fixtures give
 * off: torches, lit vents, burning floor, running saws and carts, portal mouths, candles. All of it
 * render-only and spawned over the visible columns alone, from vfx's own random stream.
 */
function stepAtmosphere() {
  const x0 = scriptedTicks >= 0 ? camTarget() : camX
  const c0 = Math.max(0, Math.floor(x0 / TILE))
  const c1 = Math.min(arena.cols - 1, Math.floor((x0 + W - 1) / TILE))
  const cols = c1 - c0 + 1
  const area = (cols * arena.rows) / (36 * 19)
  for (const a of look.ambient) {
    const want = (a.rate / 60) * area
    let n = Math.floor(want)
    if (vfx.rng() < want - n) n++
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 8; tries++) {
        const c = c0 + Math.floor(vfx.rng() * cols)
        const r = Math.floor(vfx.rng() * arena.rows)
        const i = idx(c, r)
        const t = arena.tiles[i]
        const x = c * TILE + vfx.rng() * TILE
        let y = r * TILE + vfx.rng() * TILE
        if (a.where === 'floor' || a.where === 'anywhere') {
          if (t === TileKind.Pit || (a.where === 'floor' && t === TileKind.Wall)) continue
        } else if (a.where === 'wall') {
          // the open tile under a wall: leaves off the canopy, grit off the brick, steam from a seam
          if (t === TileKind.Wall || t === TileKind.Pit || r === 0 || arena.tiles[idx(c, r - 1)] !== TileKind.Wall) continue
          y = r * TILE + 1 + vfx.rng() * 3
        } else if (t !== TileKind.Grass || grassCut[i] >= 0) continue
        vfx.ambient(a.kind, x, y, a.colors[Math.floor(vfx.rng() * a.colors.length)])
        break
      }
    }
  }
  // fixtures: a torch sheds an ember now and then and a thread of smoke less often; a paper
  // lantern or an enclosed lamp just breathes the odd wisp
  arena.props.forEach((pr, i) => {
    if (pr.kind !== 'torch' || !inView(pr.c * TILE)) return
    const x = pr.c * TILE + 7
    const y = pr.r * TILE + 16
    if (!look.fixture) {
      if ((tick + i * 7) % 18 === 0) vfx.embers(x, y, 1, 10, 2)
      if ((tick + i * 13) % 80 === 0) vfx.smoke(x, y, 1, '#3a3038', 13, 1)
    } else if ((tick + i * 13) % 60 === 0) vfx.ambient('wisp', x, y - 10, look.fixture === 'lantern' ? '#e8dcc0' : '#8a8292')
  })
  // lit vents spit; burning floor lifts embers and the odd puff of smoke
  for (let r = 0; r < arena.rows; r++)
    for (let c = c0; c <= c1; c++) {
      if (arena.tiles[idx(c, r)] !== TileKind.Vent || phaseOf(TileKind.Vent, c, r).phase !== 'on') continue
      if ((tick + c) % 3 === 0) vfx.embers(c * TILE + 4 + vfx.rng() * 8, r * TILE + 8, 1, 12, 3, PAL.flameY)
    }
  for (const i of fireList) {
    const c = i % arena.cols
    const r = (i - c) / arena.cols
    if (!inView(c * TILE)) continue
    if (vfx.rng() < 0.25) vfx.embers(c * TILE + 2 + vfx.rng() * 12, r * TILE + 2 + vfx.rng() * 12, 1, 6, 2)
    if (vfx.rng() < 0.03) vfx.smoke(c * TILE + 8, r * TILE + 8, 1, '#2a2230', 12, 3)
  }
  // moving hazards: a running saw throws sparks, a boulder raises dust, a cart's wheels spark on the rail
  for (const cr of crushers) {
    if (!cr.pos.moving || !inView(cr.pos.x)) continue
    if (cr.look === 'saw' && tick % 2 === 0) vfx.sparks(cr.pos.x - cr.pos.dx * 6, cr.pos.y + 2, PAL.flameY, 1, 1.2, 2, -cr.pos.dx, -cr.pos.dy)
    if (cr.look === 'boulder' && tick % 3 === 0) vfx.dust(cr.pos.x - cr.pos.dx * 8, cr.pos.y + 6 - cr.pos.dy * 8, 1, look.dust, 0.5, -cr.pos.dx, -cr.pos.dy)
  }
  for (const ct of carts) {
    if (!ct.pos.moving || !inView(ct.pos.x)) continue
    if (tick % 5 === 0) vfx.sparks(ct.pos.x - ct.pos.dx * CART_HALF_W, ct.pos.y + CART_HALF_H - 1, PAL.flameY, 1, 0.8, 0, -ct.pos.dx, 0)
  }
  // portal mouths breathe motes of their colour
  for (const po of portals)
    for (const m of po.ends) {
      if (!inView(m.x)) continue
      if ((tick + m.c * 3) % 12 === 0) vfx.ambient('mote', m.x + m.nx * 3 + (vfx.rng() - 0.5) * 8, m.y + m.ny * 3 + (vfx.rng() - 0.5) * 4, m.col)
    }
  // candles: hanging chandeliers give off wisps of smoke; the fallen ones smoulder for a while.
  // Mirror balls neither smoke nor smoulder — a dropped one just glints in the wreck for a bit.
  for (const ch of chandeliers) {
    if (!inView(ch.x)) continue
    if (ch.state === 'hang' || ch.state === 'creak') {
      if (!look.mirror && (tick + ch.x) % 16 === 0) vfx.ambient('wisp', ch.x + (vfx.rng() - 0.5) * 12, ch.y - CHANDELIER_HEIGHT + 2, '#3a3038')
    } else if (ch.state === 'rubble' && ch.t < CHANDELIER_FADE / 2) {
      if (look.mirror) {
        if (vfx.rng() < 0.05) vfx.sparks(ch.x + (vfx.rng() - 0.5) * 12, ch.y + (vfx.rng() - 0.5) * 6, '#dce8ff', 1, 0.3, 4)
      } else {
        if (vfx.rng() < 0.08) vfx.embers(ch.x + (vfx.rng() - 0.5) * 12, ch.y + (vfx.rng() - 0.5) * 6, 1, 2, 1)
        if (vfx.rng() < 0.04) vfx.smoke(ch.x, ch.y, 1, '#2a2230', 4, 4)
      }
    }
  }
  // a power-up waiting on the floor glints
  for (const pk of pickups) {
    if (!pk.ready || !inView(pk.x)) continue
    if ((tick + Math.round(pk.x)) % 36 === 0) vfx.sparks(pk.x + (vfx.rng() - 0.5) * 8, pk.y, POWERS[pk.kind].color, 1, 0.3, 8)
  }
}

// ---------------------------------------------------------------- input
// The Input shape is the wire format's (net/protocol.ts): what a player does in one tick.

const keys = new Set<string>()
let mouseX = W / 2
let mouseY = H / 2
let mouseDown = [false, false, false]
let throwQueued = false
let meleeQueued = false
let dashQueued = false
// where the HUD draws the room label and its < > arrows, so a click on it cycles the roster
let hudArenaBox = { x0: 0, x1: 0 }

let screen!: Screen

function installListeners() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return
    engine.unlock()
    if (e.code === 'Escape') {
      e.preventDefault()
      toggleOverlay()
      return
    }
    if (overlay) {
      // a menu is up: it gets the keys, the player does not
      if (overlay.menu.key(e)) e.preventDefault()
      return
    }
    keys.add(e.code)
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') dashQueued = true
    if (e.code === 'KeyF') meleeQueued = true
    if (e.code === 'KeyL') {
      options.lighting = !options.lighting
      saveOptions()
    }
    if (e.code === 'KeyM') {
      options.mute = !engine.isMuted
      engine.setMuted(options.mute)
      saveOptions()
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') requestRematch()
    if (!match.on) {
      // practice only: the room, the bots and the costume are yours to change
      if (/^Digit[1-7]$/.test(e.code)) local().char = Number(e.code[5]) - 1
      if (e.code === 'Tab') switchArena(e.shiftKey ? -1 : 1)
      if (e.code === 'KeyB') e.shiftKey ? removeBot() : addBot()
    }
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault()
  })
  window.addEventListener('keyup', (e) => keys.delete(e.code))
  window.addEventListener('blur', () => {
    // alt-tabbing away with a key down would leave the player running
    keys.clear()
    mouseDown = [false, false, false]
  })
  window.addEventListener('mousemove', (e) => {
    ;[mouseX, mouseY] = screen.toInternal(e.clientX, e.clientY)
    overlay?.menu.mouseMove(mouseX, mouseY)
  })
  window.addEventListener('mousedown', (e) => {
    engine.unlock()
    const [mx, my] = screen.toInternal(e.clientX, e.clientY)
    e.preventDefault()
    if (overlay) {
      if (e.button === 0) overlay.menu.click(mx, my)
      return
    }
    // a click on the room label in the HUD cycles the roster (left half back, right half on), not a throw
    if (!match.on && e.button === 0 && my < HUD_H && mx >= hudArenaBox.x0 && mx <= hudArenaBox.x1) {
      switchArena(mx < (hudArenaBox.x0 + hudArenaBox.x1) / 2 ? -1 : 1)
      return
    }
    mouseDown[e.button] = true
    if (e.button === 0) throwQueued = true
    if (e.button === 2) meleeQueued = true
    if (e.button === 1) dashQueued = true
  })
  window.addEventListener('mouseup', (e) => {
    mouseDown[e.button] = false
  })
  window.addEventListener('contextmenu', (e) => e.preventDefault())
}

// Audio (docs/07). Everything waits for the first key or click (engine.unlock above); a scripted
// run never makes one, so headless stills stay silent and deterministic. ?mute=1 starts muted,
// ?music=0 / ?sfx=0 drop a bus. The shell has usually unlocked the engine and started the music
// already (the menu plays the Cellar theme); both calls are safe to repeat.
function initAudio() {
  if (params.get('mute') === '1') engine.setMuted(true)
  if (params.get('music') === '0') engine.setMusicOn(false)
  if (params.get('sfx') === '0') engine.setSfxOn(false)
  music.playRoom(arenaEntry()?.key ?? 'cellar')
  engine.onUnlock(loadSamples)
  // ?audio=test: the headless smoke test (scripts/audio-smoke.sh) unlocks without a gesture and plays everything once
  if (params.get('audio') === 'test') void import('../audio/smoke.ts').then(m => m.runAudioSmoke())
}

// ---------------------------------------------------------------- pause / leave menu
interface Overlay {
  title: string
  menu: Menu
  lines?: string[]
  w?: number
}
let overlay: Overlay | null = null
/** Practice and an offline match stop the sim while a menu is up; an online match cannot (the others play on). */
let paused = false

function toggleOverlay() {
  if (overlay) {
    closeOverlay()
    return
  }
  overlay = net ? leaveMenu() : pauseMenu()
  paused = !net
  keys.clear()
  mouseDown = [false, false, false]
}
function closeOverlay() {
  overlay = null
  paused = false
}
function optionsOverlay(back: () => Overlay): Overlay {
  return { title: 'OPTIONS', menu: new Menu(optionsItems(() => (overlay = back()))), w: 210 }
}
function pauseMenu(): Overlay {
  const items: Item[] = [
    { kind: 'button', label: 'RESUME', onSelect: closeOverlay },
    { kind: 'button', label: 'OPTIONS', onSelect: () => (overlay = optionsOverlay(pauseMenu)) },
    { kind: 'button', label: 'QUIT TO MENU', onSelect: quitToMenu, color: PAL.red },
  ]
  return { title: match.on ? 'PAUSED' : 'PRACTICE', menu: new Menu(items) }
}
function leaveMenu(): Overlay {
  const items: Item[] = [
    { kind: 'button', label: 'STAY', onSelect: closeOverlay },
    { kind: 'button', label: 'OPTIONS', onSelect: () => (overlay = optionsOverlay(leaveMenu)) },
    { kind: 'button', label: 'LEAVE', onSelect: quitToMenu, color: PAL.red },
  ]
  return { title: 'LEAVE THE MATCH?', lines: ['THE OTHERS PLAY ON WITHOUT YOU'], menu: new Menu(items) }
}
/** Back to the main menu. This module keeps its state at module level and is not re-entrant, so the way back is a fresh page. */
function quitToMenu() {
  net?.close()
  const u = new URL(location.href)
  const signal = u.searchParams.get('signal')
  u.search = signal ? `?signal=${encodeURIComponent(signal)}` : ''
  u.hash = ''
  location.assign(u.toString())
}

function drawOverlay() {
  if (!overlay) return
  const rowH = 12
  const w = overlay.w ?? 150
  const lines = overlay.lines ?? []
  const hasHint = overlay.menu.items.some((it) => it.hint)
  const menuH = overlay.menu.items.reduce((a, it) => a + (it.kind === 'gap' ? rowH / 2 : rowH), 0)
  const h = 20 + lines.length * 8 + menuH + (hasHint ? 14 : 8)
  const x = Math.round(W / 2 - w / 2)
  const y = Math.round(HUD_H + WORLD_H / 2 - h / 2)
  ctx.fillStyle = rgba(PAL.outline, 0.55)
  ctx.fillRect(0, HUD_H, W, WORLD_H)
  drawPanel(ctx, x, y, w, h, 0.94)
  drawText(ctx, overlay.title, Math.round(W / 2 - textWidth(overlay.title) / 2), y + 7, PAL.bone)
  let ly = y + 17
  for (const l of lines) {
    drawText(ctx, l, Math.round(W / 2 - textWidth(l) / 2), ly, PAL.hudDim)
    ly += 8
  }
  overlay.menu.draw(ctx, x + 6, ly + 3, w - 12, { rowH, valueW: 70 })
  const hint = overlay.menu.hint()
  if (hint) drawText(ctx, hint, Math.round(W / 2 - textWidth(hint) / 2), y + h - 10, PAL.hudDim)
}

// camera: world x of the left edge of the view; follows the local player along the strip
let camX = 0

function readLocalInput(): Input {
  let mx = 0
  let my = 0
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1
  if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1
  if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1
  const view = deathView()
  const inp: Input = {
    mx,
    my,
    throw: throwQueued,
    melee: meleeQueued,
    dash: dashQueued,
    hold: mouseDown[0],
    cursorX: view.sx + mouseX / view.zoom + camX,
    cursorY: view.sy + (mouseY - HUD_H) / view.zoom,
  }
  throwQueued = meleeQueued = dashQueued = false
  return inp
}

/** Deterministic input for screenshot mode. */
function scriptedInput(t: number, p: Player): Input {
  // The second throw is stopped in mid-flight, then returns smoothly when released.
  const hold = hoverWindows?.some(([start, end]) => t >= start && t < end)
  const inp: Input = { mx: 0, my: 0, throw: false, melee: false, dash: false, hold: !idle && (hold ?? (t >= 240 && t < 270)), cursorX: p.x + aimOff[0], cursorY: p.y + aimOff[1] }
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
    inp.hold = hold ?? false
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

/** A puff of pixels (the all-purpose effect). Render-only: it draws on the effects' own rng, never the sim's. */
function spawnBurst(x: number, y: number, color: string, n: number, speed: number) {
  vfx.burst(x, y, color, n, speed)
}

/** True when the plain stand/run frame is what's on screen (so the run lift and held overlay apply). */
function showsWalk(p: Player): boolean {
  return p.state === 'idle' && p.anim === 'none'
}

/** Index into the character's run cycle: one counter drives every facing. 0 when standing. */
function runFrame(p: Player): number {
  if (!p.moving) return 0
  const art = CHARACTERS[p.char]
  return art.runTicks ? timedFrame(p.walkT, art.runTicks) : Math.floor(p.walkT / art.runPeriod) % art.run.down.length
}

/** Pixels the body is drawn above its shadow on the current run frame (the frog's hop, the shroom's bob). */
function runLift(p: Player): number {
  if (!showsWalk(p) || !p.moving) return 0
  return CHARACTERS[p.char].runLift[runFrame(p)] ?? 0
}

function playerSprite(p: Player): Sprite {
  const set = charSets[p.char][p.color]
  const art = CHARACTERS[p.char]
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
  if (p.anim === 'throw') return pick(set.throw, art.throwTicks ? timedFrame(p.animT, art.throwTicks, false) : Math.floor(p.animT / THROW_FRAME))
  if (p.anim === 'reach') return pick(set.catch, 0)
  if (p.anim === 'catch') return pick(set.catch, set.catch.down.length > 2 && p.animT >= 6 ? 2 : 1)
  // stand/run frames are symmetric, so they ignore the aim side
  const a = p.moving ? set.run : set.stand
  const frames = p.facing === 'down' ? a.down : p.facing === 'up' ? a.up : p.flip ? a.sideL : a.sideR
  const frame = !p.moving && art.idleTicks ? timedFrame(tick + p.id * 23, art.idleTicks) : runFrame(p)
  return frames[frame % frames.length]
}

// ---------------------------------------------------------------- deaths
/** Who gets a hazard kill: the last player to dash-shove the victim, if it was recent. */
function credit(p: Player): number {
  return tick - p.lastShoveT < HAZARD_CREDIT_TICKS ? p.lastShover : -1
}

/**
 * Credit for a kill to player k, if they are still in the game (a removed bot may still be owed it):
 * a point in practice, where kills are the only score; a kill in a match, where the score counts
 * rounds (docs/01 §10) and kills only break ties.
 */
function scoreTo(k: number) {
  const q = playerById(k)
  if (!q) return
  if (match.on) q.kills++
  else q.score++
}

function award(p: Player, killer: number, verb: string, cause?: string) {
  if (killer >= 0 && killer !== p.id) scoreTo(killer)
  const who = cause ?? (killer >= 0 ? `P${killer}` : 'something')
  eventLog.push(`t${tick} ${who} ${verb} P${p.id}${cause && killer >= 0 ? ` (P${killer})` : ''}`)
}

/** Cut in two along (dx, dy): boomerangs, melee, blasts, spikes and crushers all end this way. */
function killSlice(p: Player, dx: number, dy: number, killer: number, cause?: string) {
  if (p.state === 'dead' || p.spawnProtect > 0 || isAlly(killer, p)) return
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
  // docs/01 §8 kill feedback: a ring in the victim's colour, chunks of them, sparks along the cut, a splat
  // left on the floor, a shake and a held frame (the body flashes white: see drawHalves)
  const col = PLAYER_COLORS[p.color]
  vfx.ring(p.x, p.y - 6, 3, 16, col, 10, 0.7)
  vfx.chunks(p.x, p.y - 8, [col, darken(col, 0.35), PAL.white], 7, 1.4, 6)
  vfx.sparks(p.x, p.y - 8, PAL.white, 6, 2.2, 6, dx, dy)
  vfx.decal('splat', p.x + dx * 4, p.y + dy * 3, darken(col, 0.45), { w: 5, h: 3, ttl: 420 })
  shakeAt(p.x, SHAKE_KILL, 8)
  sfx('slice', p.x)
  die(p)
  award(p, killer, 'sliced', cause)
}

function killPit(p: Player, what: string) {
  if (p.state === 'dead' || p.spawnProtect > 0) return
  const s = playerSprite(p)
  sinks.push({ s, x: Math.round(p.x) - 7, y: Math.round(p.y) - 17, ttl: 28, max: 28, flash: false })
  vfx.dust(p.x, p.y, 4, look.dust, 0.5)
  sfx('fall', p.x)
  die(p)
  const k = credit(p)
  if (k >= 0) scoreTo(k)
  eventLog.push(`t${tick} P${p.id} ${what}${k >= 0 ? ` (shoved by P${k})` : ''}`)
}

/**
 * Fire: the body goes up in a puff and an ash silhouette sinks into the floor. A vent is a hazard
 * (a recent shover gets the credit); a fire boomerang's trail belongs to whoever threw it.
 */
function killBurn(p: Player, killer = -1) {
  if (p.state === 'dead' || p.spawnProtect > 0 || isAlly(killer, p)) return
  const s = sil(playerSprite(p), PAL.ironLight)
  sinks.push({ s, x: Math.round(p.x) - 7, y: Math.round(p.y) - 17, ttl: 20, max: 20, flash: true })
  vfx.embers(p.x, p.y - 8, 14, 4, 5)
  vfx.sparks(p.x, p.y - 10, PAL.flameY, 6, 1.4, 8)
  vfx.smoke(p.x, p.y - 12, 5, '#2a2230', 10, 3)
  shakeAt(p.x, SHAKE_KILL, 8)
  sfx('burn', p.x)
  die(p)
  const k = killer >= 0 ? killer : credit(p)
  if (k >= 0 && k !== p.id) scoreTo(k)
  eventLog.push(`t${tick} fire got P${p.id}${k >= 0 ? ` (P${k})` : ''}`)
}

/** Something heavy landed on them: flattened on the spot. */
function killSquash(p: Player, killer: number, cause: string) {
  if (p.state === 'dead' || p.spawnProtect > 0 || isAlly(killer, p)) return
  const s = playerSprite(p)
  sinks.push({ s, x: Math.round(p.x) - 7, y: Math.round(p.y) - 17, ttl: 10, max: 10, flash: true })
  const col = PLAYER_COLORS[p.color]
  // flattened: everything goes sideways, nothing goes up
  vfx.chunks(p.x, p.y - 2, [col, darken(col, 0.35)], 8, 2.2, 1, 150)
  vfx.dust(p.x, p.y, 8, look.dust, 1.2)
  vfx.decal('splat', p.x, p.y, darken(col, 0.45), { w: 7, h: 4, ttl: 420 })
  shakeAt(p.x, SHAKE_KILL, 8)
  sfx('squash', p.x)
  die(p)
  award(p, killer, 'flattened', cause)
}

function die(p: Player) {
  if (p.state === 'dead') return
  deathSlowT = DEATH_SLOW_TICKS
  deathX = p.x
  deathY = p.y
  music.deathSlow()
  if (match.on) p.lives = Math.max(0, p.lives - 1)
  if (net && params.has('test')) console.log(`NET death t${netTick} slot=${p.id} lives=${p.lives}`)

  p.state = 'dead'
  p.stateT = 0
  p.respawnT = RESPAWN_TICKS
  p.held = false
  p.vx = p.vy = p.kbx = p.kby = p.slideX = p.slideY = 0
  p.plat = -1
  p.powers.length = 0 // docs/01 §12: power-ups go with you (Boomerang Fu keeps them; decision for Aaron)
}

function respawn(p: Player) {
  booms = booms.filter((b) => b.owner !== p.id)
  p.x = p.spawnX
  p.y = p.spawnY
  p.state = 'idle'
  p.stateT = 0
  p.held = true
  p.invuln = SPAWN_PROTECT
  p.spawnProtect = SPAWN_PROTECT
  p.dashCd = 0
  p.throwRec = 0
  p.anim = 'none'
  p.animT = 0
  p.slideX = p.slideY = 0
  p.windup = 0
  p.lastShoveT = -9999
  p.turn = null
  p.spawnT = SPAWN_DROP // render-only: the body drops in from above and lands (drawPlayer)
  sfx('spawnDrop', p.x)
}

// ---------------------------------------------------------------- tiles and props
function cutGrass(c: number, r: number) {
  if (tileAt(arena, c, r) !== TileKind.Grass) return
  const i = idx(c, r)
  if (grassCut[i] >= 0) return
  grassCut[i] = tick
  cutList.push(i)
  redrawCells(staticCtx, arena, [{ c, r }], seed, grassLook, look)
  // cut grass: blades fly up and fall, a couple of leaves come down after
  vfx.chunks(c * TILE + 8, r * TILE + 8, [PAL.grass[1], PAL.grass[2], PAL.grass[0]], 6, 0.9, 5, 90)
  for (let i = 0; i < 2; i++) vfx.ambient('leaf', c * TILE + 4 + vfx.rng() * 8, r * TILE + 8, PAL.grass[2])
  sfx('grass', c * TILE + 8)
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
  // splinters that bounce and lie where they fall, plus a puff of the room's dust
  vfx.chunks(x, y - 2, [PAL.wood, PAL.woodDark, PAL.woodLight], 10, 1.6, 6, 150)
  vfx.dust(x, y, 5, look.dust, 0.7)
  eventLog.push(`t${tick} ${by >= 0 ? `P${by}` : 'something'} broke a crate`)
  sfx('crate', x)
  // docs/02 §4.3: a crate may hold a power-up. It lands ready, right where the crate stood.
  if (powerupsOn && rng() < CRATE_DROP_CHANCE) {
    const kind = pickKind()
    pickups.push({ kind, x, y, t: 0, ready: true })
    spawnBurst(x, y - 6, POWERS[kind].color, 8, 1.2)
    eventLog.push(`t${tick} the crate held ${POWERS[kind].name}`)
  }
}

function lightBarrel(bi: number, by: number) {
  const bl = barrels[bi]
  if (!bl.alive || bl.lit) return
  bl.lit = true
  bl.fuse = BARREL_FUSE
  bl.lighter = by
  vfx.sparks(bl.c * TILE + 8, bl.r * TILE + 8, PAL.flameY, 5, 1.2, 12)
  eventLog.push(`t${tick} ${by >= 0 ? `P${by}` : 'something'} lit a barrel`)
  sfx('barrelLit', bl.c * TILE + 8)
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
    if (q.state === 'dead' || q.invuln > 0 || isAlly(killer, q)) continue
    const dx = q.x - x
    const dy = q.y - y
    const d = len(dx, dy)
    if (d < hitR + HURT_RADIUS) {
      const [nx, ny] = d > 1e-6 ? norm(dx, dy) : [0, -1]
      if (tryShield(q, nx, ny)) continue
      killSlice(q, nx, ny, killer >= 0 ? killer : credit(q), cause ?? 'the blast')
    }
  }
  wreckNear(x, y, hitR + 4, killer, { crates: true, barrels: true, grass: true })
  blasts.push({ x, y: y - 4, r: ringR, ttl: BLAST_TTL, max: BLAST_TTL })
  // the bang: a white flash, the biggest shake there is, embers and sparks out, smoke up, a scorch left behind
  vfx.sparks(x, y - 4, PAL.flameY, 14, 3, 6)
  vfx.embers(x, y - 4, 18, 4, ringR * 0.5)
  vfx.smoke(x, y - 6, 8, '#2a2230', 6, ringR * 0.4)
  vfx.decal('scorch', x, y, '#1a1416', { w: Math.round(ringR * 0.55), h: Math.round(ringR * 0.35), ttl: SCORCH_TTL })
  shakeAt(x, SHAKE_BLAST, 12)
  flashAt(x, 0.35, 3)
  sfx('blast', x)
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
      sfx('bumper', bu.x)
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
    hovering: false,
    hoverReady: false,
    hoverUsed: false,
    hoverReleased: false,
    brakeT: 0,
    hangT: 0,
    armed: false,
    fire: 0,
    bounces: 0,
    flight: 0,
    spin: 0,
    trail: [],
    hit: new Set(),
    powers: new Set(),
    phantom: false,
    lastTile: -1,
  }
}

/**
 * The throw copies the thrower's boomerang flags onto the boomerang (docs/01 §12: they ride with it
 * from here, through steals). Triple adds two phantoms TRIPLE_SPREAD either side with the same flags.
 */
function throwBoomerang(p: Player) {
  const o = throwOrigin(p)
  const flags = p.powers.filter((k) => POWERS[k].boomerang)
  const b = newBoomerang(p.id, o.x, o.y, p.aimX, p.aimY)
  for (const k of flags) b.powers.add(k)
  booms.push(b)
  if (b.powers.has('triple')) {
    for (const s of [-1, 1]) {
      const [ax, ay] = rotate(p.aimX, p.aimY, s * TRIPLE_SPREAD)
      const ph = newBoomerang(p.id, o.x, o.y, ax, ay)
      for (const k of flags) ph.powers.add(k)
      ph.phantom = true
      booms.push(ph)
    }
  }
  p.held = false
  p.throwRec = THROW_RECOVERY
  p.anim = 'throw'
  p.animT = 0
  // the release: a few sparks off the hand along the throw
  vfx.sparks(o.x, o.y - 4, PAL.white, 4, 1.6, 4, p.aimX, p.aimY)
  sfx('throw', o.x, { pitch: b.powers.has('big') ? 0.8 : 1 })

}

/** Sim-side rotation. Math.sin/cos may differ in the last bit between browsers, which lockstep cannot have; util/trig.ts is bit-exact everywhere. */
function rotate(x: number, y: number, a: number): [number, number] {
  const c = dcos(a)
  const s = dsin(a)
  return [x * c - y * s, x * s + y * c]
}

/** Hit radius against players and swings: a big boomerang reaches twice as far. */
function boomHitR(b: Boomerang): number {
  return b.powers.has('big') ? BOOM_RADIUS * BIG_SCALE : BOOM_RADIUS
}

/** A phantom hit by a swing or at the end of its flight: gone in a puff, nothing to steal. */
function popPhantom(b: Boomerang) {
  vfx.ring(b.x, b.y - 6, 2, 9, PAL.white, 8, 0.8)
  spawnBurst(b.x, b.y - 6, PAL.white, 6, 1.2)
  sfx('phantomPop', b.x)
  b.flight = -1
}

/** Start the catch pose, if the body is free to show it (a dash or melee keeps its own frames). */
function startCatchAnim(p: Player) {
  // the catch itself: a small ring and sparks at the hand (even when the body is busy and keeps its frames)
  vfx.ring(p.x, p.y - 10, 2, 8, PAL.white, 7, 0.8)
  vfx.sparks(p.x, p.y - 10, PAL.white, 4, 1.2, 8)
  sfx('catch', p.x)
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
  else if (k === TileKind.Vent && phaseOf(k, c, r).phase === 'on') {
    // the 02 §4.7 hook: a lit vent gives the boomerang the Fire flag for the rest of this flight
    b.fire = BOOM_FIRE_TICKS
    if (!b.powers.has('fire')) {
      b.powers.add('fire')
      // fire and ice never ride together (docs/03 §6): the vent's flame burns the frost off an ice boomerang
      const thawed = b.powers.delete('ice')
      eventLog.push(`t${tick} P${b.owner}'s boomerang caught fire from a vent${thawed ? ' and lost its ice' : ''}`)
    }
  }
  // a fire boomerang lays a tile of fire, an ice boomerang a tile of ice, on each tile it crosses
  // on the way out, once clear of the hand (they never ride together: see the vent above and givePower)
  if (b.state === 'out' && b.traveled > FIRE_START && i !== b.lastTile && (b.powers.has('fire') || b.powers.has('ice'))) {
    const first = b.lastTile === -1 && !b.phantom
    b.lastTile = i
    if (b.powers.has('ice')) layIce(c, r, b.owner, first)
    else lightFloor(c, r, b.owner)
  }
  for (const ch of chandeliers) {
    if (ch.state === 'hang' && len(b.x - ch.x, b.y - ch.y) < CHANDELIER_TRIGGER_RADIUS) {
      ch.state = 'creak'
      ch.t = 0
      ch.by = b.owner
      eventLog.push(`t${tick} P${b.owner} hit a chandelier`)
      sfx('creak', ch.x)
    }
  }
}

// One outbound tick: the speed drops by the throw's decel every tick from the moment it leaves the
// hand, so it drifts to rest exactly at the end of its range (clamped to the path left so it never
// overshoots). Wall hits reflect the velocity and keep counting distance. Returns true on the tick
// it comes to rest. Shared by the sim and the aim-indicator preview (fx=false: no sparks and no
// side effects on the world, so the render side never touches the sim rng).
function flyOutbound(b: Boomerang, fx: boolean, brake = 0): boolean {
  if (b.bounces >= BOOM_MAX_BOUNCES || b.flight >= BOOM_MAX_FLIGHT) b.decel = Math.max(b.decel, BOOM_BRAKE)
  const was = len(b.vx, b.vy)
  const sp = Math.max(0, Math.min(was - Math.max(b.decel, brake), b.range - b.traveled))
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
        sfx('warp', closerX(from.x, to.x))
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
        wallHitFx(b, Math.sign(b.vx), 0)
        bounceSfx(b)
        wreckNear(b.x, b.y, 14, b.owner, { crates: false, barrels: true, grass: false })
      }
    }
    if (moveY(b, b.vy / steps, BOOM_WALL_RADIUS, isSolidForBoom)) {
      b.vy = -b.vy
      b.bounces++
      if (fx) {
        wallHitFx(b, 0, Math.sign(b.vy))
        bounceSfx(b)
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

/** A boomerang off a wall: sparks in its colour away from the wall (nx, ny points back into the room) and grit off the wall. */
function wallHitFx(b: Boomerang, nx: number, ny: number) {
  vfx.sparks(b.x, b.y - 4, boomHue(b), 4, 1.6, 4, nx, ny)
  vfx.dust(b.x + nx * 2, b.y + ny * 2, 2, look.dust, 0.5, nx, ny)
}

/** The ricochet: a semitone higher per bounce of this flight (docs/07 §4: pitch is the cartoon's counter), phantoms quieter. */
function bounceSfx(b: Boomerang) {
  // a semitone higher per bounce so the ear counts them, capped at four so a long rally stays wood
  sfx('bounce', b.x, { pitch: Math.pow(2, Math.min(4, b.bounces - 1) / 12), gain: b.phantom ? 0.4 : 1 })

}

// A melee swing connecting with an airborne boomerang. A steal keeps an armed boomerang armed;
// smacking a boomerang you already own arms it: it relaunches over BOMB_RANGE, sits, beeps twice,
// shrinks and blows up.
function deflect(b: Boomerang, p: Player) {
  if (b.phantom) {
    popPhantom(b)
    eventLog.push(`t${tick} P${p.id} popped a phantom`)
    return
  }
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
  b.hovering = false
  b.hoverReady = false
  b.brakeT = 0
  b.hangT = 0
  b.bounces = 0
  b.flight = 0
  b.hit.clear()
  // the clang: a ring and sparks along the new direction; arming it adds the bomb's orange
  vfx.ring(b.x, b.y - 6, 2, b.armed ? 14 : 10, b.armed ? BOMB_COLOR : PAL.white, 8, 0.8)
  vfx.sparks(b.x, b.y - 6, PAL.white, b.armed ? 10 : 7, 2.4, 6, p.aimX, p.aimY)
  if (b.armed) vfx.embers(b.x, b.y - 6, 8, 6, 3)
  shakeAt(b.x, 1, 4)
  eventLog.push(`t${tick} P${p.id} deflected${b.armed ? ' (armed)' : ''}`)
  // the clang is the deflect; arming your own boomerang gets the cuckoo instead (docs/07 §4.2)
  sfx(b.armed ? 'arm' : 'deflect', b.x)

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
  // the second beep a major third up: the question, then the answer
  sfx('beep', b.x, { pitch: b.hangT >= BOMB_PAUSE + BOMB_BEEP_GAP ? 1.26 : 1 })
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
function previewThrow(p: Player, rot = 0): { x: number; y: number }[] {
  const o = throwOrigin(p)
  const [ax, ay] = rot ? rotate(p.aimX, p.aimY, rot) : [p.aimX, p.aimY]
  const d = newBoomerang(p.id, o.x, o.y, ax, ay)
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
    if (q.id === p.id || isAlly(p.id, q) || q.state === 'dead') continue
    const d = len(q.x - p.x, q.y - p.y)
    if (d < bd) {
      bd = d
      best = q
    }
  }
  return best
}

/**
 * Somewhere on plain floor within a screen of the first player, so the bots stay in the room with
 * you on the strip. Sim side: it is the first player on every client, not the local one, so the
 * bots walk the same way everywhere (roster rooms are one screen wide anyway).
 */
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
  // a power-up waiting nearby is worth a detour while there is room for it
  let want: Pickup | null = null
  if (p.powers.length < POWERUP_CAP) {
    let bd = 160
    for (const pk of pickups) {
      const d = len(pk.x - p.x, pk.y - p.y)
      if (pk.ready && d < bd) {
        bd = d
        want = pk
      }
    }
  }
  if (!p.held && own) {
    ai.tx = own.x
    ai.ty = own.y
  } else if (want) {
    ai.tx = want.x
    ai.ty = want.y
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
    if (b.owner === p.id || isAlly(b.owner, p) || b.state === 'dropped') continue
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

// ---------------------------------------------------------------- power-ups
function hasPower(p: Player, k: PowerKind): boolean {
  return p.powers.includes(k)
}

/**
 * Take a power-up: a repeat moves it to newest, a fourth pushes the oldest out (docs/03 §4). Fire and
 * Ice never share a stack (Boomerang Fu's rule, 03 §2): taking one lets go of the other.
 */
function givePower(p: Player, k: PowerKind) {
  const i = p.powers.indexOf(k)
  const rival: PowerKind | null = k === 'fire' ? 'ice' : k === 'ice' ? 'fire' : null
  const j = rival ? p.powers.indexOf(rival) : -1
  if (i >= 0) p.powers.splice(i, 1)
  else if (rival && j >= 0) {
    p.powers.splice(j, 1)
    eventLog.push(`t${tick} P${p.id} let go of ${POWERS[rival].name} for ${POWERS[k].name}`)
    sfx('pickupLost', p.x, { delay: 0.3 }) // the gliss down, after the take's gliss up
  } else if (p.powers.length >= POWERUP_CAP) {
    const old = p.powers.shift()!
    eventLog.push(`t${tick} P${p.id} let go of ${POWERS[old].name} for ${POWERS[k].name}`)
    sfx('pickupLost', p.x, { delay: 0.3 })
  }
  p.powers.push(k)
}

/** The next kind to put on the floor: seeded, never the same one twice running. */
function pickKind(): PowerKind {
  const pool = POWER_KINDS.filter((k) => k !== lastPickupKind)
  const k = pool[Math.floor(rng() * pool.length)]
  lastPickupKind = k
  return k
}

/**
 * Announce a pickup on a free `p` point. With someone already stacked up it lands on the free point
 * farthest from them: Boomerang Fu's "finger very gently on the scales", placement not odds.
 */
function spawnPickup() {
  const free = arena.powerups.filter((pt) => !pickups.some((pk) => pk.x === pt.c * TILE + 8 && pk.y === pt.r * TILE + 8))
  if (free.length === 0) return
  let pt = free[Math.floor(rng() * free.length)]
  let rich: Player | null = null
  for (const p of players) if (p.state !== 'dead' && p.powers.length >= 2 && (!rich || p.powers.length > rich.powers.length)) rich = p
  if (rich) {
    const r = rich
    const far = (q: { c: number; r: number }) => len(q.c * TILE + 8 - r.x, q.r * TILE + 8 - r.y)
    pt = free.reduce((a, b) => (far(b) > far(a) ? b : a))
  }
  pickups.push({ kind: pickKind(), x: pt.c * TILE + 8, y: pt.r * TILE + 8, t: 0, ready: false })
  sfx('pickupGlow', pt.c * TILE + 8)
}

/** Tick step 10 (docs/01 §9): announce, land, fizzle and take pickups. */
function stepPickups() {
  // the clock only runs while there is room on the floor, so taking one never spawns the next at once
  if (powerupsOn && arena.powerups.length > 0 && pickups.length < POWERUP_MAX_ON_FIELD && --nextPickupT <= 0) {
    spawnPickup()
    nextPickupT = POWERUP_INTERVAL
  }
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pk = pickups[i]
    const info = POWERS[pk.kind]
    pk.t++
    if (!pk.ready) {
      if (pk.t >= POWERUP_WARN) {
        pk.ready = true
        pk.t = 0
        vfx.ring(pk.x, pk.y, 2, 12, info.color, 10, 0.5)
        vfx.sparks(pk.x, pk.y, info.color, 8, 1.2, 2)
        eventLog.push(`t${tick} ${info.name} landed`)
        sfx('pickupLand', pk.x)
      }
      continue
    }
    if (pk.t >= POWERUP_TTL) {
      vfx.smoke(pk.x, pk.y - 4, 3, '#2a2230', 4, 2) // fizzles out
      sfx('pickupFizzle', pk.x)
      pickups.splice(i, 1)
      continue
    }
    // the nearest player inside the radius takes it; at a dead heat the lower id (deterministic, docs/03 §10)
    let taker: Player | null = null
    let bd = POWERUP_PICK_RADIUS
    for (const p of players) {
      if (p.state === 'dead') continue
      const d = len(p.x - pk.x, p.y - pk.y)
      if (d < bd) {
        bd = d
        taker = p
      }
    }
    if (taker) {
      givePower(taker, pk.kind)
      vfx.ring(pk.x, pk.y - 6, 2, 10, info.color, 8, 0.8)
      vfx.sparks(pk.x, pk.y - 6, info.color, 10, 1.6, 6)
      eventLog.push(`t${tick} P${taker.id} took ${info.name}`)
      sfx('pickupTake', pk.x)
      pickups.splice(i, 1)
    }
  }
}

/**
 * A shielded player takes a hit on the shield instead: it pops, they are knocked back along the hit
 * and get a moment's grace. Called where a hit would kill; never for the floor or things falling on you.
 */
function tryShield(p: Player, dx: number, dy: number): boolean {
  if (!hasPower(p, 'shield')) return false
  p.powers.splice(p.powers.indexOf('shield'), 1)
  const [nx, ny] = len(dx, dy) > 1e-6 ? norm(dx, dy) : [0, 0]
  p.kbx += nx * SHIELD_KB
  p.kby += ny * SHIELD_KB
  p.invuln = Math.max(p.invuln, SHIELD_GRACE)
  // the pop: the ring bursts outward, teal sparks, a little shake
  vfx.ring(p.x, p.y - 8, 8, 18, PAL.teal, 10, 0.9, PAL.white)
  vfx.sparks(p.x, p.y - 8, PAL.teal, 12, 2, 8)
  shakeAt(p.x, 1, 5)
  eventLog.push(`t${tick} P${p.id}'s shield popped`)
  sfx('shieldPop', p.x)
  return true
}

/** Fire and ice take to anything you can stand on except the room's own ice and the vents' grates; never a wall, a pit or a prop. */
function canCoat(c: number, r: number): boolean {
  if (c < 0 || r < 0 || c >= arena.cols || r >= arena.rows) return false
  const i = idx(c, r)
  const k = arena.tiles[i]
  if (k === TileKind.Wall || k === TileKind.Pit || k === TileKind.Ice || k === TileKind.Vent) return false
  return solid[i] === 0
}

function putOutFire(i: number) {
  fireAt[i] = -1
  fireBy[i] = -1
  const k = fireList.indexOf(i)
  if (k >= 0) fireList.splice(k, 1)
}

function meltIce(i: number) {
  iceAt[i] = -1
  iceBy[i] = -1
  const k = iceList.indexOf(i)
  if (k >= 0) iceList.splice(k, 1)
}

/** Fire meeting ice, either way round: both go and a puff of steam is left (docs/03 §6). */
function steam(c: number, r: number) {
  const x = c * TILE + 8
  const y = r * TILE + 8
  vfx.smoke(x, y - 2, 3, '#c8d8e0', 5, 3)
  vfx.dust(x, y, 2, PAL.iceLight, 0.5)
  sfx('steam', x)
}

/**
 * Set a tile alight: a fire boomerang passing over it, or the grass next to a burning tile. Fire
 * over laid ice melts it instead and lights nothing.
 */
function lightFloor(c: number, r: number, by: number) {
  if (!canCoat(c, r)) return
  const i = idx(c, r)
  if (fireAt[i] >= 0) return
  if (iceAt[i] >= 0) {
    meltIce(i)
    steam(c, r)
    return
  }
  fireAt[i] = tick
  fireBy[i] = by
  fireList.push(i)
  cutGrass(c, r)
}

/**
 * Coat a tile in ice: an ice boomerang passing over it. Ice over a burning tile puts the fire out
 * instead and lays nothing. Crossing a tile already iced refreshes its clock. The grass under it is
 * flattened so the ice reads. `first` is the throw's first tile, which carries the sound.
 */
function layIce(c: number, r: number, by: number, first: boolean) {
  if (!canCoat(c, r)) return
  const i = idx(c, r)
  if (fireAt[i] >= 0) {
    putOutFire(i)
    steam(c, r)
    return
  }
  const fresh = iceAt[i] < 0
  if (fresh) iceList.push(i)
  iceAt[i] = tick
  iceBy[i] = by
  cutGrass(c, r)
  const x = c * TILE + 8
  const y = r * TILE + 8
  if (fresh) {
    vfx.shards(x, y, 2, 0.8, 2)
    vfx.dust(x, y, 1, PAL.iceLight, 0.4)
  }
  if (first) sfx('ice', x)
}

/**
 * Laid ice thins away; while it lasts, whoever laid it holds the hazard credit for anyone else standing
 * on it, unless a fresher shove has a live claim (02 §3 kill credit), so a slide off the ice into a pit
 * or spikes is the ice-layer's kill.
 */
function stepIce() {
  for (let k = iceList.length - 1; k >= 0; k--) {
    const i = iceList[k]
    if (tick - iceAt[i] < ICE_TTL) continue
    const c = i % arena.cols
    const r = Math.floor(i / arena.cols)
    meltIce(i)
    if (inView(c * TILE)) vfx.dust(c * TILE + 8, r * TILE + 8, 2, PAL.iceLight, 0.4)
  }
  if (iceList.length === 0) return
  for (const p of players) {
    if (p.state === 'dead') continue
    const c = Math.floor(p.x / TILE)
    const r = Math.floor(p.y / TILE)
    if (c < 0 || r < 0 || c >= arena.cols || r >= arena.rows) continue
    const i = idx(c, r)
    const by = iceAt[i] >= 0 ? iceBy[i] : -1
    if (by < 0 || by === p.id || isAlly(by, p)) continue
    if (tick - p.lastShoveT >= HAZARD_CREDIT_TICKS || p.lastShover === by) {
      p.lastShover = by
      p.lastShoveT = tick
    }
  }
}

/** Fire burns down, spreads through standing grass while young, and takes whoever stands in it. */
function stepFire() {
  for (let k = fireList.length - 1; k >= 0; k--) {
    const i = fireList[k]
    const age = tick - fireAt[i]
    if (age >= FIRE_TTL) {
      fireAt[i] = -1
      fireBy[i] = -1
      fireList.splice(k, 1)
      continue
    }
    if (age % FIRE_SPREAD === FIRE_SPREAD - 1 && age < FIRE_TTL / 2) {
      const c = i % arena.cols
      const r = Math.floor(i / arena.cols)
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (tileAt(arena, c + dc, r + dr) === TileKind.Grass && grassCut[idx(c + dc, r + dr)] < 0) lightFloor(c + dc, r + dr, fireBy[i])
      }
    }
  }
  if (fireList.length === 0) return
  // standing in it: a floor rule, so no i-frames and no shield; whoever lit it gets the kill
  for (const p of players) {
    if (p.state === 'dead') continue
    const c = Math.floor(p.x / TILE)
    const r = Math.floor(p.y / TILE)
    if (c < 0 || r < 0 || c >= arena.cols || r >= arena.rows) continue
    const i = idx(c, r)
    if (fireAt[i] >= 0) killBurn(p, fireBy[i])
  }
}

/**
 * Blink: a dash with empty hands puts you where your boomerang is, catching it, and flattens anyone
 * you land on. False (so the dash happens instead) when there is nothing of yours out there.
 */
function blink(p: Player): boolean {
  const bi = booms.findIndex((q) => q.owner === p.id && !q.phantom)
  if (bi < 0) return false
  const b = booms[bi]
  const fromX = p.x
  let to = { x: b.x, y: b.y }
  if (blocksWalk(Math.floor(to.x / TILE), Math.floor(to.y / TILE)) && platformAt(to.x, to.y) < 0) to = nearestFloor(to.x, to.y)
  afterimages.push({ s: playerSprite(p), x: Math.round(p.x) - 7, y: Math.round(p.y) - 17, ttl: 14, max: 14 })
  // leaving: a ring opens where you were; arriving: one closes on where you are
  vfx.ring(p.x, p.y - 8, 2, 12, PAL.violet, 8, 0.8)
  vfx.sparks(p.x, p.y - 8, PAL.violet, 8, 1.6, 8)
  p.x = to.x
  p.y = to.y
  p.vx = p.vy = p.kbx = p.kby = p.slideX = p.slideY = 0
  p.turn = null
  p.windup = 0
  p.held = true
  p.anim = 'none'
  startCatchAnim(p)
  booms.splice(bi, 1)
  p.dashCd = DASH_COOLDOWN
  p.invuln = Math.max(p.invuln, DASH_INVULN)
  vfx.ring(p.x, p.y - 8, 12, 2, PAL.violet, 8, 0.8)
  vfx.sparks(p.x, p.y - 8, PAL.white, 4, 1, 8)
  vfx.dust(p.x, p.y, 4, look.dust, 0.8)
  for (const q of players) {
    if (q.id === p.id || isAlly(p.id, q) || q.state === 'dead' || q.invuln > 0) continue
    if (len(q.x - p.x, q.y - p.y) < BLINK_SQUASH_RADIUS + HURT_RADIUS) killSquash(q, p.id, 'a blink')
  }
  eventLog.push(`t${tick} P${p.id} blinked${b.armed ? ' (disarmed)' : ''}`)
  sfx('blink', closerX(fromX, p.x))
  return true
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
    for (const p of players) if (p.state !== 'dead' && clear(p, PLAYER_RADIUS)) vfx.dust(p.x, p.y, 3, look.dust, 0.6)
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
      sfx('gate', g.tiles[0].c * TILE + 8)
    }
  }

  for (const cr of crushers) {
    for (const p of players) {
      if (p.state === 'dead' || p.invuln > 0) continue
      if (len(p.x - cr.pos.x, p.y - cr.pos.y) < CRUSHER_KILL_RADIUS + HURT_RADIUS) {
        const dx = cr.pos.dx || Math.sign(p.x - cr.pos.x) || 1
        if (tryShield(p, dx, cr.pos.dy)) continue
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
          sfx('chandelierFall', ch.x)
        }
        break
      case 'fall':
        if (++ch.t >= CHANDELIER_FALL) {
          for (const p of players) {
            if (p.state === 'dead' || p.invuln > 0) continue
            if (len(p.x - ch.x, p.y - ch.y) < CHANDELIER_KILL_RADIUS + HURT_RADIUS) killSquash(p, ch.by, 'the chandelier')
          }
          // the thud: a dust ring, bone and candle-wax chunks that lie in the rubble, the candles' last sparks, a heavy shake
          vfx.ring(ch.x, ch.y, 4, 22, look.dust, 12, 0.5)
          vfx.chunks(ch.x, ch.y, [PAL.bone, PAL.boneDark, PAL.flameY], 10, 1.8, 6, 180)
          vfx.dust(ch.x, ch.y, 10, look.dust, 1.4)
          vfx.sparks(ch.x, ch.y - 2, PAL.flameY, 5, 1.2, 6)
          vfx.smoke(ch.x, ch.y - 4, 3, '#2a2230', 6, 6)
          shakeAt(ch.x, SHAKE_LAND, 10)
          sfx('chandelierLand', ch.x)
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
    // the fuse spits sparks off the top of the barrel and a thread of smoke
    if (bl.fuse % 3 === 0) vfx.sparks(x, y, PAL.flameY, 1, 0.5, 13)
    if (bl.fuse % 9 === 0) vfx.smoke(x, y, 1, '#3a3038', 14, 1)
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
      // the floor goes: a puff of its own colours, short-lived so nothing lies over the new hole
      vfx.chunks(c * TILE + 8, r * TILE + 8, [look.floors[0], look.floorMortar, look.floorLight], 6, 1, 2, 40)
      vfx.dust(c * TILE + 8, r * TILE + 8, 6, look.dust, 0.9)
      shakeAt(c * TILE, 1, 5)
      sfx('crumble', c * TILE + 8)
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

  // tile sounds: one clank when a bank of spikes goes off, one whoomph when a bank of vents lights,
  // placed on the nearest tile of the bank to the local player (the cycle tiles share a clock, so
  // the whole bank fires on the same tick)
  const p0 = local()
  const p0c = Math.floor(p0.x / TILE)
  const p0r = Math.floor(p0.y / TILE)
  let spikeX = NaN
  let ventX = NaN
  for (let r = Math.max(0, p0r - 10); r <= Math.min(arena.rows - 1, p0r + 10); r++) {
    for (let c = Math.max(0, p0c - 20); c <= Math.min(arena.cols - 1, p0c + 20); c++) {
      const k = tileAt(arena, c, r)
      if (k !== TileKind.Spikes && k !== TileKind.Vent) continue
      const ph = phaseOf(k, c, r)
      if (ph.phase !== 'on' || ph.t !== 0) continue
      const x = c * TILE + 8
      if (k === TileKind.Spikes) spikeX = Number.isNaN(spikeX) ? x : closerX(spikeX, x)
      else ventX = Number.isNaN(ventX) ? x : closerX(ventX, x)
    }
  }
  if (!Number.isNaN(spikeX)) sfx('spikes', spikeX)
  if (!Number.isNaN(ventX)) sfx('vent', ventX)

  stepFire()
  stepIce()
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
    if (p.gone) continue
    const raw = inputs[p.id]
    let inp = throughTurn(p, raw)
    if (p.state === 'dead') {
      // A lost life respawns after the delay; an eliminated player waits for the next round.
      if ((!match.on || p.lives > 0) && --p.respawnT <= 0) respawn(p)
      continue
    }
    if (p.dashCd > 0) p.dashCd--
    if (p.invuln > 0) p.invuln--
    if (p.spawnProtect > 0) p.spawnProtect--
    if (p.throwRec > 0) p.throwRec--
    // the spawn-in drop (render-only): the body lands SPAWN_LAND ticks before it stands up
    if (p.spawnT > 0 && --p.spawnT === SPAWN_LAND) {
      vfx.ring(p.x, p.y, 3, 14, PLAYER_COLORS[p.color], 10, 0.5)
      vfx.dust(p.x, p.y, 8, look.dust, 1)
      sfx('spawnLand', p.x)
    }
    const speedy = hasPower(p, 'speed')
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
      if (inp.dash && p.dashCd === 0 && hasPower(p, 'blink') && !p.held && blink(p)) {
        // the dash button blinked you to your boomerang instead of rolling (blink sets the cooldown)
      } else if (inp.dash && p.dashCd === 0) {
        const [dx, dy] = len(inp.mx, inp.my) > 0.1 ? norm(inp.mx, inp.my) : [p.aimX, p.aimY]
        p.state = 'dash'
        p.stateT = 0
        p.anim = 'roll'
        p.animT = 0
        p.dashX = dx
        p.dashY = dy
        p.slideX = p.slideY = 0 // a new dash takes over whatever the last one left
        p.invuln = Math.max(p.invuln, DASH_INVULN)
        p.dashCd = speedy ? SPEED_DASH_CD : DASH_COOLDOWN
        vfx.dust(p.x, p.y, 5, look.dust, 0.9, -dx, -dy) // kicked off behind the feet
        sfx('dash', p.x)
      } else if (inp.melee) {
        p.state = 'melee'
        p.stateT = 0
        p.anim = 'none'
        p.meleeHits.clear()
        slashes.push({ x: p.x, y: p.y, ax: p.aimX, ay: p.aimY, color: PLAYER_COLORS[p.color], ttl: 7, max: 7 })
        sfx('swing', p.x)
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
      const mult = (p.state === 'melee' ? MELEE_SPEED_MULT : 1) * (speedy ? SPEED_MULT : 1)
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
      const mult = (p.state === 'melee' ? MELEE_SPEED_MULT : 1) * (speedy ? SPEED_MULT : 1)
      if (il > 0.1) {
        const [ix, iy] = norm(inp.mx, inp.my)
        const cur = len(p.vx, p.vy)
        const sliding = p.slideX !== 0 || p.slideY !== 0
        if (cur === 0 && !sliding && p.windup < START_WINDUP) {
          // standing start: run in place until the feet find grip, then go (not while still sliding
          // out of a dash: you are moving, just not where you want)
          p.windup++
          p.moving = true
          if (p.windup === 1 || p.windup === 3) vfx.dust(p.x - ix * 3, p.y, 2, look.dust, 0.4, -ix, -iy)
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
      // speed: a puff of yellow dust off the heels every few steps, so the extra pace reads from across the room
      if (speedy && p.state !== 'dash' && p.walkT % 4 === 0) vfx.sparks(p.x - p.vx * 2, p.y, PAL.flameY, 1, 0.5, 1)
      // a crawling character dabs the floor behind it as it goes (not while hidden in grass)
      const art = CHARACTERS[p.char]
      if (art.landingFrame !== undefined && art.runTicks && showsWalk(p) &&
          timedFrame(p.walkT, art.runTicks) === art.landingFrame && timedFrame(p.walkT - 1, art.runTicks) !== art.landingFrame) {
        vfx.dust(p.x, p.y, 3, look.dust, 0.45, -p.vx, -p.vy)
      }
      if (CHARACTERS[p.char].leavesTrail && showsWalk(p) && p.walkT % SMEAR_EVERY === 0 && !inGrass(p.x, p.y)) {
        vfx.decal('smear', p.x + (vfx.rng() - 0.5) * 6, p.y + (vfx.rng() - 0.5) * 2, darken(PLAYER_COLORS[p.color], 0.4), { w: 2 + Math.floor(vfx.rng() * 2), ttl: SMEAR_TTL })
      }
      footsteps(p, ice)
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
      // into a wall at speed: dust off it and a bump
      vfx.dust(p.x + p.dashX * 5, p.y + p.dashY * 5, 6, look.dust, 1, -p.dashX, -p.dashY)
      shakeAt(p.x, 1, 4)
    }
    if (p.slideX !== 0 || p.slideY !== 0) {
      const ss = len(p.slideX, p.slideY)
      if (ss > 1 && tick % 3 === 0) {
        // skidding: dust behind the feet, or a scratch in the ice
        if (ice) vfx.decal('scratch', p.x + (vfx.rng() - 0.5) * 4, p.y + 1, PAL.iceCrack, { w: 3, dx: p.slideX / ss, dy: (p.slideY / ss) * 0.6, ttl: 300 })
        else vfx.dust(p.x - (p.slideX / ss) * 4, p.y - (p.slideY / ss) * 4, 1, look.dust, 0.3)
      }
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
      vfx.sparks(p.x, p.y - 4, PAL.white, 4, 1.2, 4, nx, ny)
      vfx.ring(bu.x, bu.y - 2, BUMPER_RADIUS, BUMPER_RADIUS + 6, PAL.white, 6, 0.8)
      sfx('bumper', bu.x, { pitch: 0.8 }) // a body is bigger than a boomerang: lower
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
      vfx.dust(p.x, p.y, 3, look.dust, 0.8, sx, sy)
    }

    // knockback ignores pits (that's how you fall in)
    if (p.kbx !== 0 || p.kby !== 0) {
      const thrown = mouthAhead(p.x, p.y, p.kbx, p.kby, PLAYER_RADIUS)
      if (thrown) enterPortal(p, thrown, raw)
      moveX(p, p.kbx, PLAYER_RADIUS, isSolid)
      moveY(p, p.kby, PLAYER_RADIUS, isSolid)
      // on ice (the room's or a laid trail) a shove carries further: push them somewhere they shouldn't go
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
      if (a.state === 'dash' && b.state !== 'dash' && b.spawnProtect === 0 && !isAlly(a.id, b)) {
        b.kbx += a.dashX * SHOVE_IMPULSE
        b.kby += a.dashY * SHOVE_IMPULSE
        b.lastShover = a.id
        if (b.lastShoveT < tick - 1) sfx('shove', b.x) // the first tick of contact, not every tick of it
        b.lastShoveT = tick
      } else if (b.state === 'dash' && a.state !== 'dash' && a.spawnProtect === 0 && !isAlly(b.id, a)) {
        a.kbx += b.dashX * SHOVE_IMPULSE
        a.kby += b.dashY * SHOVE_IMPULSE
        a.lastShover = b.id
        if (a.lastShoveT < tick - 1) sfx('shove', a.x)
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
    const owner = playerById(b.owner)!
    if (!owner.holdThrow) b.hoverReady = true
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
        vfx.dust(b.x, b.y, 3, look.dust, 0.6)
        b.x = f.x
        b.y = f.y
        b.vx = b.vy = 0
        vfx.ring(b.x, b.y, 1, 7, PLAYER_COLORS[owner.color], 8, 0.5)
      }
      // pickup
      for (const p of players) {
        if (p.state === 'dead' || p.held) continue
        if (len(p.x - b.x, p.y - b.y) < PICKUP_RADIUS + 3) {
          p.held = true
          startCatchAnim(p)
          b.owner = p.id
          b.flight = -1
          break
        }
      }
      continue
    }

    b.flight++
    b.trail.unshift({ x: b.x, y: b.y })
    if (b.trail.length > 7) b.trail.pop()
    // a big boomerang smashes a tile either side of its line as it goes
    if (b.powers.has('big')) wreckNear(b.x, b.y, 14, b.owner, { crates: true, barrels: true, grass: true })

    if (b.hovering && !owner.holdThrow) b.hoverReleased = true
    const hover = !b.hoverUsed && owner.state !== 'dead' && owner.holdThrow && b.hoverReady && !b.armed && !b.phantom
    if (hover && (b.state === 'out' || b.state === 'return')) {
      b.hovering = true
      b.hoverUsed = true
      b.brakeT = BOOM_HOVER_BRAKE
    }
    if (b.state === 'out') {
      const brake = b.brakeT > 0 ? len(b.vx, b.vy) / b.brakeT-- : 0
      if (flyOutbound(b, true, brake)) {
        b.brakeT = 0
        // the return pass can take anyone the throw missed
        b.hit.clear()
        // a bomb boomerang goes off where it stops, then comes back as normal (an own-deflect
        // fuse, if it is armed, takes over and this blast doesn't happen)
        if (b.powers.has('bomb') && !b.armed) blast(b.x, b.y, BOMB_HIT_RADIUS, BOMB_RADIUS, b.owner, `P${b.owner}'s bomb`)
        // an armed boomerang sits on its fuse whatever happened to its owner; the blast is posthumous
        if (b.phantom) popPhantom(b)
        else if (owner.state === 'dead' && !b.armed) b.state = 'dropped'
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
        if (owner.holdThrow && !b.hoverUsed) {
          b.hovering = true
          b.hoverUsed = true
        }
        const holding = b.hovering && !b.hoverReleased && owner.holdThrow && b.hangT < BOOM_HOVER_MAX
        if (!holding && (b.hovering || b.hangT >= BOOM_HANG)) {
          b.state = 'return'
          b.hovering = false
          b.vx = b.vy = 0
        }
      }
    } else {
      // returning: accelerates out of the hang straight at its owner at the rate it slowed on the way
      // out. A hover brakes to zero first; it flies over obstacles and homes hard.
      if (owner.state === 'dead') {
        b.state = 'dropped'
      } else {
        const ox = owner.x - b.x
        const oy = owner.y - 6 - b.y
        const d = len(ox, oy)
        const [tx, ty] = norm(ox, oy)
        const braking = b.brakeT > 0
        const sp = braking ? len(b.vx, b.vy) * (1 - 1 / b.brakeT--) : Math.min(len(b.vx, b.vy) + b.decel, BOOM_RETURN_SPEED)
        const turn = (d < BOOM_NEAR_DIST ? BOOM_TURN_NEAR : BOOM_TURN) * sp + b.decel
        const [dx, dy] = braking ? norm(b.vx, b.vy) : [tx, ty]
        const dvx = dx * sp - b.vx
        const dvy = dy * sp - b.vy
        const dl = len(dvx, dvy)
        const k = !braking && dl > turn ? turn / dl : 1
        b.vx += dvx * k
        b.vy += dvy * k
        b.x += b.vx
        b.y += b.vy
        passTile(b)
        if (braking && b.brakeT === 0) {
          b.vx = b.vy = 0
          b.state = 'hang'
          b.hangT = 0
        }
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
            // hands full: it drops at your feet
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
      const reach = boomHitR(b) + HURT_RADIUS
      for (const p of players) {
        if (p.id === b.owner || isAlly(b.owner, p) || p.state === 'dead' || p.invuln > 0 || b.hit.has(p.id)) continue
        if (len(p.x - b.x, p.y - 6 - b.y) < reach) {
          b.hit.add(p.id)
          const [kx, ky] = sp > 1e-6 ? [b.vx / sp, b.vy / sp] : [p.x - b.x, p.y - b.y]
          if (tryShield(p, kx, ky)) continue
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
      if (b.state === 'dropped' || isAlly(b.owner, p)) continue
      const key = `b${booms.indexOf(b)}`
      if (p.meleeHits.has(key)) continue
      if (len(b.x - hx, b.y - 6 - hy) < MELEE_RADIUS + boomHitR(b)) {
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
      if (q.id === p.id || isAlly(p.id, q) || q.state === 'dead' || q.invuln > 0) continue
      const key = `p${q.id}`
      if (p.meleeHits.has(key)) continue
      if (len(q.x - hx, q.y - hy) < MELEE_RADIUS + HURT_RADIUS) {
        p.meleeHits.add(key)
        if (tryShield(q, p.aimX, p.aimY)) continue
        killSlice(q, p.aimX, p.aimY, p.id)
      }
    }
  }

  stepPickups()

  // effects: render-only, nothing above reads them
  stepAtmosphere()
  vfx.step(tick)
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
let ctx!: CanvasRenderingContext2D
let lightmap!: Lightmap

interface Drawable {
  y: number
  draw: () => void
}

function camTarget(): number {
  return Math.max(0, Math.min(WORLD_W - W, local().x - W / 2))
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

// ---------------------------------------------------------------- arena cycling
/**
 * Practice: loads the next (1) or previous (-1) roster room in place of the current one and re-seats
 * everyone at its spawns with a fresh score: Tab, Shift+Tab or the < > arrows in the HUD. From the
 * strip or the old layouts, forwards goes to the first room and back to the last.
 */
function switchArena(dir: 1 | -1) {
  const n = ARENA_LIST.length
  enterRoom(arenaIndex < 0 ? (dir > 0 ? 0 : n - 1) : (arenaIndex + dir + n) % n, true)
  // the URL follows, so a reload comes back to this room; ?at= only ever named a strip tile
  params.set('arena', ARENA_LIST[arenaIndex].key)
  params.delete('at')
  history.replaceState(null, '', `?${params}`)
}

/**
 * Loads roster room `index` and re-seats everyone at its spawns (shuffled in a match). The scores
 * reset when asked (a room swap in practice, a rematch), stay otherwise (the next round of a match).
 */
function enterRoom(index: number, resetScores: boolean) {
  arenaIndex = index
  const entry = ARENA_LIST[arenaIndex]
  arenaName = entry.key
  loadArena(entry)
  screen.resize(W, H)
  if (lightmap.w !== W || lightmap.h !== WORLD_H) lightmap = new Lightmap(W, WORLD_H)
  // the shared clocks restart with the tick count (advanceMovers keeps them from here on)
  spikeA = cyclePhase(0, 0, SPIKE_CYCLE)
  spikeB = cyclePhase(0, half(SPIKE_CYCLE), SPIKE_CYCLE)
  ventA = cyclePhase(0, 0, VENT_CYCLE)
  ventB = cyclePhase(0, half(VENT_CYCLE), VENT_CYCLE)
  deathSlowT = 0
  music.clearDeathSlow()
  booms = []
  halves = []
  sinks = []
  afterimages = []
  slashes = []
  blasts = []
  eventLog.length = 0
  if (match.on) shuffleSpawns()
  else spawnOrder = []
  for (const p of players) {
    const sp = spawnFor(p.id)
    p.spawnX = sp.x
    p.spawnY = sp.y
    if (resetScores) p.score = p.kills = 0
    if (p.gone) {
      // left the match: parked at its spawn, dead, out of everyone's way
      p.x = sp.x
      p.y = sp.y
      continue
    }
    respawn(p)
    p.vx = p.vy = p.kbx = p.kby = 0
    p.cursorX = p.x + 60
    p.cursorY = p.y
    p.plat = -1
    p.meleeHits.clear()
    p.powers.length = 0
    if (p.id === localId) for (const k of giveList) givePower(p, k)
    if (p.ai) {
      p.ai.tx = p.x
      p.ai.ty = p.y
      p.ai.retarget = 0
    }
  }
  updateCamera(true)
  // the room's own song (docs/07 §6), the continuous sounds of the old room cut
  stopLoops()
  music.playRoom(entry.key)
  document.title = pageTitle()
}

// ---------------------------------------------------------------- match flow (docs/01 §10)
type Phase = 'intro' | 'play' | 'end' | 'over'
const MATCH_INTRO = 90 // arena intro 30 + READY 60, nobody can move
const ROUND_END_TICKS = 45 // the sim freezes on the last kill and the winner is called
const RESULTS_HOLD = 90 // the podium stays up at least this long before a rematch can be called
const match = {
  on: false,
  phase: 'play' as Phase,
  phaseT: 0,
  /** ticks of play this round, for the timer */
  roundTick: 0,
  round: 0,
  target: 5,
  lives: 3,
  gameMode: 'ffa' as MatchKind,
  rooms: 'cycle' as RoomOrder,
  /** roster index of the first room; a rematch starts over from it */
  startIndex: 0,
  /** who took the last round, -1 for a draw */
  lastWinner: -1,
}
/** Big centred words over the world for a moment: GO, who took the round, DRAW. Ticked by advance() so stills age it too; never read by the sim. */
let callout: { text: string; color: string; ttl: number; max: number } | null = null
function say(text: string, color: string, ttl: number) {
  callout = { text, color, ttl, max: ttl }
}
/** Small lines under the HUD that fade: who left. Render-only. */
const notices: { text: string; ttl: number }[] = []
function notice(text: string) {
  notices.push({ text, ttl: 240 })
}

function startMatch(target: number, rooms: RoomOrder, startIndex: number, lives: number, gameMode: MatchKind = 'ffa') {
  match.on = true
  match.target = target
  match.lives = roundLives(lives)
  match.gameMode = gameMode
  match.rooms = rooms
  match.startIndex = startIndex
  resetMatch()
}

/** Scores to zero, back to the first room, round one: the start and every rematch. */
function resetMatch() {
  for (const p of players) p.score = p.kills = 0
  match.round = 0
  enterRoom(match.startIndex, true)
  beginRound()
}

function beginRound() {
  for (const p of players) p.lives = p.gone ? 0 : match.lives
  match.round++
  match.phase = 'intro'
  match.phaseT = 0
  match.roundTick = 0
  callout = null
}

function inGame(): Player[] {
  return players.filter((p) => !p.gone)
}
function isAlly(attacker: number, p: Player): boolean {
  return match.on && match.gameMode === 'teams' && attacker !== p.id && playerById(attacker)?.team === p.team
}
function side(p: Player): number { return match.gameMode === 'teams' ? p.team : p.id }
function sidesLeft(): number[] { return [...new Set(inGame().filter(p => p.lives > 0).map(side))] }
function sideName(p: Player): string { return match.gameMode === 'teams' ? TEAM_NAMES[p.team] + ' TEAM' : displayName(p) }
function displayName(p: Player): string {
  return p.name || `P${p.id + 1}`
}

const NEUTRAL_INPUT: Input = { mx: 0, my: 0, throw: false, melee: false, dash: false, hold: false, cursorX: 0, cursorY: 0 }
/** Nobody does anything, cursors where they were: the intro, and anyone whose input never came. */
function neutralFor(p: Player): Input {
  return { ...NEUTRAL_INPUT, cursorX: p.cursorX, cursorY: p.cursorY }
}

/**
 * One tick of the game: step() wrapped in the match phases, so every client of a lockstep session
 * runs exactly this on every tick. `inputs` is only asked for in a phase that uses them, so the
 * bots' rng draws happen on the same ticks everywhere.
 */
function advance(inputs: () => Input[]) {
  if (deathSlowT > 0) deathSlowT--
  if (callout && --callout.ttl <= 0) callout = null
  if (!match.on) {
    step(inputs())
    return
  }
  switch (match.phase) {
    case 'intro': {
      match.phaseT++
      const still: Input[] = []
      for (const p of players) still[p.id] = neutralFor(p)
      step(still)
      if (match.phaseT === MATCH_INTRO - 60) sfx('ready', local().x)
      if (match.phaseT >= MATCH_INTRO) {
        match.phase = 'play'
        match.roundTick = 0
        say('GO', PAL.cream, 30)
      }
      break
    }
    case 'play': {
      step(inputs())
      match.roundTick++
      // A dead player awaiting respawn is still a contender. Only exhausted lives end a round.
      const live = inGame().filter((p) => p.lives > 0)
      if (players.length >= 2 && sidesLeft().length <= 1) endRound(live[0]?.id ?? -1)
      break
    }
    case 'end':
      match.phaseT++
      if (match.phaseT >= ROUND_END_TICKS) {
        if (players.some((p) => p.score >= match.target) || new Set(inGame().map(side)).size < 2) {
          match.phase = 'over'
          match.phaseT = 0
          callout = null
          sfx('win', local().x)
        } else {
          enterRoom(match.rooms === 'cycle' ? (arenaIndex + 1) % ARENA_LIST.length : arenaIndex, false)
          beginRound()
        }
      }
      break
    case 'over':
      match.phaseT++
      break
  }
}

function endRound(winner: number) {
  match.phase = 'end'
  match.phaseT = 0
  match.lastWinner = winner
  const w = winner >= 0 ? playerById(winner) : undefined
  if (w) {
    for (const p of players) if (side(p) === side(w)) p.score++
    say(`${sideName(w)} TAKES THE ROUND`, PLAYER_COLORS[w.color], ROUND_END_TICKS + 20)
    eventLog.push(`t${tick} round ${match.round} to P${w.id}`)
  } else {
    say('DRAW', PAL.bone, ROUND_END_TICKS + 20)
    eventLog.push(`t${tick} round ${match.round} drawn`)
  }
}

/** The podium's order: rounds won, then kills, then slot (docs/01 §10). */
function standings(): Player[] {
  return inGame()
    .concat(players.filter((p) => p.gone))
    .sort((a, b) => b.score - a.score || (match.gameMode === 'teams' ? a.team - b.team : 0) || b.kills - a.kills || a.id - b.id)
}

/** Enter on the results: the host (or the one player of an offline match) calls the rematch for everyone. */
function requestRematch() {
  if (!match.on || match.phase !== 'over' || match.phaseT < RESULTS_HOLD) return
  if (net) {
    if (net.role === 'host') net.command('rematch')
  } else resetMatch()
}

/** A host command that rode in on a lockstep bundle; every client applies it on the same tick. */
function applyCmd(c: string) {
  if (c === 'rematch') resetMatch()
  else if (c.startsWith('leave:')) removePlayer(Number(c.slice(6)))
}

/** A player left the match: dead for good, their boomerang and any credit they were owed gone with them. */
function removePlayer(id: number) {
  const p = playerById(id)
  if (!p || p.gone) return
  p.gone = true
  if (p.state !== 'dead') {
    p.state = 'dead'
    p.held = false
    p.powers.length = 0
  }
  p.lives = 0
  p.respawnT = 1e9
  booms = booms.filter((b) => b.owner !== id)
  for (const i of fireList) if (fireBy[i] === id) fireBy[i] = -1
  for (const i of iceList) if (iceBy[i] === id) iceBy[i] = -1
  for (const q of players) if (q.lastShover === id) q.lastShover = -1
  vfx.smoke(p.x, p.y, 6, '#2a2230', 6, 4)
  eventLog.push(`t${tick} P${id} left`)
  notice(`${displayName(p)} LEFT`)
}

// ---------------------------------------------------------------- lockstep (docs/05 §4, §7)
let net: NetSession | null = null
/** the last tick stepped from a bundle */
let netTick = 0
/** frames spent waiting for the next bundle, for the WAITING notice */
let stallT = 0

/**
 * One tick of lockstep: step the next bundle if it is here, else wait. Exactly one tick per call:
 * the real-time accumulator in the loop decides how many ticks are due, and the net only gates
 * them. (A "catch-up" that steps extra ticks whenever bundles are queued feeds itself, because each
 * tick stepped also submits an input, and the match runs away at two or three times speed.)
 */
function netStep() {
  const n = net!
  const ti = n.take(netTick + 1)
  if (!ti) {
    stallT++
    // No bundles may arrive until a hidden peer steps its queued inputs. Only visible clients
    // initiate this wake-up; hidden peers responding with wakes would create a feedback loop.
    if (!document.hidden) n.wakePeers()
    return false
  }
  stallT = 0
  netTick++
  for (const c of ti.cmds) applyCmd(c)
  advance(() => {
    const inputs: Input[] = []
    for (const p of players) inputs[p.id] = p.ai ? aiInput(p) : ti.inputs[p.id] ?? neutralFor(p)
    return inputs
  })
  // our input for a tick `delay` ahead, so the host has it by the time that tick is due
  n.submitLocal(netTick + n.delay, readLocalInput())
  if (netTick % HASH_EVERY === 0) {
    const h = stateHash()
    n.reportHash(netTick, h)
    // ?test=…: one greppable line per hash, so two headless browsers can be compared (docs/05 §8)
    if (params.has('test')) {
      console.log(`NET t${netTick} hash ${h} players ${players.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}`)
      console.log(`NET booms t${netTick} ${boomTrace()}`)
    }
  }
  if (params.has('test') && n.desyncTick >= 0 && !desyncLogged) {
    desyncLogged = true
    console.log(`NET desync at t${n.desyncTick}`)
  }
  return true
}
let desyncLogged = false

/** Flight details shared by the scripted and two-browser diagnostics. */
function boomTrace(): string {
  return booms
    .map((b) => `P${b.owner} ${b.state}${b.state === 'hang' ? b.hangT : ''}${b.brakeT > 0 ? '(brake)' : b.hovering ? '(hover)' : ''}${b.armed ? '*' : ''} ${b.x.toFixed(1)},${b.y.toFixed(1)} v=${len(b.vx, b.vy).toFixed(2)}`)
    .join(' | ')
}

const hashF64 = new Float64Array(1)
const hashU32 = new Uint32Array(hashF64.buffer)
function mixNum(h: number, v: number): number {
  hashF64[0] = v
  h = Math.imul(h ^ hashU32[0], 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15) ^ hashU32[1], 0x85ebca77)
  return h ^ (h >>> 13)
}
/** A 32-bit digest of the simulation the session compares across clients every HASH_EVERY ticks. Nothing render-side goes in. */
function stateHash(): number {
  let h = 0x811c9dc5 ^ tick
  h = mixNum(h, match.phase === 'play' ? 1 : match.phase === 'intro' ? 2 : match.phase === 'end' ? 3 : 4)
  h = mixNum(h, match.roundTick)
  h = mixNum(h, match.lives)
  h = mixNum(h, match.gameMode === 'teams' ? 1 : 0)
  h = mixNum(h, deathSlowT)
  for (const p of players) {
    h = mixNum(h, p.x)
    h = mixNum(h, p.y)
    h = mixNum(h, p.vx)
    h = mixNum(h, p.vy)
    h = mixNum(h, p.team)
    h = mixNum(h, p.invuln)
    h = mixNum(h, p.spawnProtect)
    h = mixNum(h, p.lives)
    h = mixNum(h, p.respawnT)
    h = mixNum(h, p.slideX)
    h = mixNum(h, p.slideY)
    const st = p.state === 'dead' ? 1 : p.state === 'dash' ? 2 : p.state === 'melee' ? 3 : 0
    h = mixNum(h, st + p.score * 8 + p.kills * 256 + (p.held ? 4096 : 0) + p.powers.length * 8192 + (p.gone ? 65536 : 0))
  }
  for (const b of booms) {
    h = mixNum(h, b.x)
    h = mixNum(h, b.y)
    h = mixNum(h, b.vx)
    h = mixNum(h, b.vy)
    h = mixNum(h, b.owner)
    h = mixNum(h, b.state === 'out' ? 0 : b.state === 'hang' ? 1 : b.state === 'return' ? 2 : 3)
    h = mixNum(h, b.hangT)
    h = mixNum(h, (b.hovering ? 1 : 0) + (b.hoverReady ? 2 : 0) + (b.hoverUsed ? 4 : 0) + (b.hoverReleased ? 8 : 0))
    h = mixNum(h, b.brakeT)
  }
  return h >>> 0
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

/** A sprite stretched by (sx, sy) about the middle of its bottom edge: the landing squash. */
function drawSpriteStretched(s: Sprite, cx: number, baseY: number, sx: number, sy: number, alpha = 1) {
  if (alpha <= 0) return
  const w = Math.max(1, Math.round(s.w * sx))
  const h = Math.max(1, Math.round(s.h * sy))
  ctx.imageSmoothingEnabled = false
  ctx.globalAlpha = alpha
  ctx.drawImage(s.img, Math.round(cx - w / 2), Math.round(baseY - h), w, h)
  ctx.globalAlpha = 1
}

/** Rows [row0, row0 + rows) of a sprite, drawn `dy` px off their place: the idle breath folds a body this way. */
function drawSpriteRows(s: Sprite, x: number, y: number, row0: number, rows: number, dy: number, alpha = 1) {
  if (alpha <= 0 || rows <= 0) return
  ctx.globalAlpha = alpha
  ctx.drawImage(s.img, 0, row0, s.w, rows, Math.round(x), Math.round(y) + row0 + dy, s.w, rows)
  ctx.globalAlpha = 1
}

function drawPlayer(p: Player) {
  const s = playerSprite(p)
  let alpha = 1
  if (inGrass(p.x, p.y)) alpha = p.id === localId ? 0.4 : 0
  const dropping = p.spawnT > 0
  if (p.invuln > 0 && p.state !== 'dash' && !dropping && (tick & 2) === 0) alpha *= 0.4
  if (alpha <= 0) return
  // a run frame may lift the body off its shadow (the frog's hop, the shroom's bob); the shadow
  // stays on the ground so it reads as leaving the floor, not floating. Action poses are drawn
  // flat so the hand-drawn frames land where they were drawn.
  const hop = runLift(p)
  const x = Math.round(p.x) - 7
  const y = Math.round(p.y) - 17 - hop
  if (dropping) {
    // the spawn-in (docs/04 §5): the body falls in from above, squashes on landing, then stands up
    if (p.spawnT > SPAWN_LAND) {
      const f = (p.spawnT - SPAWN_LAND) / (SPAWN_DROP - SPAWN_LAND)
      drawSprite(s, x, y - Math.round(SPAWN_HEIGHT * f * f), alpha)
    } else {
      const k = p.spawnT / SPAWN_LAND // 1 flattest, towards 0 upright
      drawSpriteStretched(s, p.x, Math.round(p.y) + 1, 1 + 0.3 * k, 1 - 0.3 * k, alpha)
    }
    return
  }
  // no invulnerability flash on the dash: the roll itself is the tell, as with a Dark Souls roll
  if (!CHARACTERS[p.char].idleTicks && showsWalk(p) && !p.moving && (tick + p.id * 23) % BREATHE_PERIOD < BREATHE_DIP) {
    // the idle breath: the feet stay put and everything above the fold drops a pixel for a moment
    // (the fold sits partway down the drawn body, so the slime breathes as well as Skully)
    const top = spriteTop(s)
    const fold = top + Math.round((s.h - top) * BREATHE_FOLD)
    drawSpriteRows(s, x, y, fold, s.h - fold, 0, alpha)
    drawSpriteRows(s, x, y, 0, fold, 1, alpha)
  } else drawSprite(s, x, y, alpha)
  if (p.held && p.state !== 'dash' && p.anim !== 'catch' && p.anim !== 'roll') {
    const b = boomSets[p.color][0]
    const side = p.aimX < 0 ? 1 : -1
    drawSprite(b, p.x + side * 7 - 4, p.y - 11 - hop, alpha)
  }
  // the power-up tells (docs/03 §7): the shield ring, and the held stack over the head
  if (hasPower(p, 'shield')) part.drawShieldRing(ctx, p.x, p.y, tick)
  if (p.powers.length > 0 && alpha >= 1) {
    const w = p.powers.length * 10 - 1
    const x0 = Math.round(p.x) - Math.floor(w / 2)
    p.powers.forEach((k, i) => drawSprite(powerIcons[k], x0 + i * 10, y - 11, 0.9))
  }
}

function drawBoomerang(b: Boomerang) {
  const owner = playerById(b.owner)!
  const frames = boomSets[owner.color]
  const half = Math.floor(BOOM_SPRITE / 2)
  if (b.state === 'dropped') {
    const f = frames[Math.floor(b.spin / 10) & 3]
    if (b.owner === localId && !owner.held) {
      const o = sil(f, PLAYER_COLORS[owner.color])
      const pulse = (tick & 16) === 0 ? 0.9 : 0.5
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) drawSprite(o, b.x - half + ox, b.y - half + oy, pulse)
    }
    drawSprite(f, b.x - half, b.y - half)
    return
  }
  const color = boomHue(b)
  const hot = b.armed || b.fire > 0 || b.powers.size > 0 // a flagged boomerang trails thick, like an armed one
  const ghost = b.phantom ? 0.7 : 1
  for (let i = b.trail.length - 1; i >= 0; i--) {
    const t = b.trail[i]
    const a = (hot ? 0.8 : 0.55) * (1 - i / b.trail.length) * ghost
    ctx.fillStyle = rgba(color, a)
    const sz = (i < 2 ? 3 : 2) + (hot ? 1 : 0)
    ctx.fillRect(Math.round(t.x) - 1, Math.round(t.y) - BOOM_HEIGHT - 1, sz, sz)
  }
  const f = frames[Math.floor(b.spin / 2) & 3]
  const fuse = fusePhase(b)
  const scale = b.powers.has('big') ? BIG_SCALE * fuse.scale : fuse.scale
  if (scale !== 1 || b.phantom) {
    // scaled (shrinking on its fuse, or big) or ghosted: drawn from the centre so it grows and collapses on the spot
    const cx = b.x - half + f.w / 2
    const cy = b.y - half - BOOM_HEIGHT + f.h / 2
    drawSpriteScaled(f, cx, cy, scale, ghost)
    if (fuse.flash) drawSpriteScaled(sil(f, PAL.white), cx, cy, scale, ghost)
    else if (b.phantom && (tick & 4) === 0) drawSpriteScaled(sil(f, PAL.white), cx, cy, scale, 0.35)
    return
  }
  drawSprite(f, b.x - half, b.y - half - BOOM_HEIGHT)
  if (fuse.flash) drawSprite(sil(f, PAL.white), b.x - half, b.y - half - BOOM_HEIGHT)
}

/**
 * The colour a boomerang's trail and glow take: its owner's, orange once armed, red-hot off a vent,
 * or its power-up's when it carries one (fire red, ice blue, bomb orange, big bone, triple white).
 */
function boomHue(b: Boomerang): string {
  if (b.armed) return BOMB_COLOR
  if (b.fire > 0) return (tick & 2) === 0 ? PAL.flameR : PAL.flameY
  for (const k of POWER_KINDS) if (b.powers.has(k)) return POWERS[k].color
  return PLAYER_COLORS[playerById(b.owner)!.color]
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
  if (p.id === localId && p.held) {
    // the exact path the throw will take, wall bounces included, with the stop point marked; with
    // Triple the two phantom paths too, dimmer
    const lift = BOOM_HEIGHT // ground path drawn at the height the boomerang sprite flies
    const phase = (tick >> 1) % 4
    const rots = hasPower(p, 'triple') ? [-TRIPLE_SPREAD, TRIPLE_SPREAD, 0] : [0]
    let pts: { x: number; y: number }[] = []
    for (const rot of rots) {
      pts = previewThrow(p, rot)
      const dim = rot === 0 ? 1 : 0.45
      let next = 10 + phase // path distance of the next dot
      let dist = 0
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]
        const b = pts[i]
        const seg = len(b.x - a.x, b.y - a.y)
        if (seg > BOOM_SPEED * 2) continue // a portal hop: no tick moves it this far, so draw nothing between the mouths
        while (seg > 0 && next <= dist + seg) {
          const f = (next - dist) / seg
          ctx.fillStyle = rgba(color, (0.75 - (next / THROW_RANGE) * 0.4) * dim)
          ctx.fillRect(Math.round(a.x + (b.x - a.x) * f), Math.round(a.y + (b.y - a.y) * f - lift), 1, 1)
          next += 4
        }
        dist += seg
      }
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

/** Width of a player's HUD slot: colour box, one pip per point to the target (five in practice), three power-up badges. */
function hudSlotWidth(pips: number): number {
  return 38 + pips * 4 // 58 for five pips
}

function drawHud() {
  ctx.fillStyle = PAL.hud
  ctx.fillRect(0, 0, W, HUD_H)
  ctx.fillStyle = PAL.hudLine
  ctx.fillRect(0, HUD_H - 1, W, 1)

  if (match.on) {
    // Two compact lines per player keep lives and round wins separate, even with six players.
    const slot = Math.min(66, Math.floor((W - 126) / players.length))
    players.forEach((p, i) => {
      const x = 5 + i * slot
      const col = PLAYER_COLORS[p.color]
      ctx.fillStyle = p.lives > 0 && !p.gone ? col : PAL.hudDim
      ctx.fillRect(x, 3, 6, 7)
      if (p.id === localId) { ctx.fillStyle = PAL.white; ctx.fillRect(x + 2, 12, 2, 1) }
      drawText(ctx, `${p.lives}L`, x + 9, 1, p.lives > 0 ? col : PAL.hudDim)
      drawText(ctx, match.gameMode === 'teams' ? `P${p.id + 1}` : `${p.score}W`, x + 9, 7, PAL.bone)
      p.powers.forEach((kind, k) => drawSprite(powerIcons[kind], x + 22 + k * 8, 3))
    })
    const gold = players.find(p => p.team === 0)?.score ?? 0
    const teal = players.find(p => p.team === 1)?.score ?? 0
    drawText(ctx, match.gameMode === 'teams' ? `GOLD ${gold} TEAL ${teal}` : `ROUND ${match.round}  TO ${match.target}`, W - 121, 1, PAL.bone)
    drawText(ctx, match.gameMode === 'teams' ? `2V2 R${match.round} TO${match.target} L:LIVES` : 'L:LIVES W:WINS', W - 121, 7, PAL.hudDim)
    const elapsed = Math.floor(match.roundTick / 60)
    const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`
    drawText(ctx, clock, W - textWidth(clock) - 5, 4, PAL.bone)
    let status = ''
    if (net?.desyncTick !== undefined && net.desyncTick >= 0) status = 'DESYNC'
    else if (net?.hostGone) status = 'THE HOST LEFT'
    else if (net && stallT > 12) status = 'WAITING FOR PLAYERS'
    if (status) drawText(ctx, status, 5, HUD_H + 4, PAL.red)
    return
  }
  const pips = 5
  const slotW = hudSlotWidth(pips)
  players.forEach((p, i) => {
    const x = 5 + i * slotW
    const col = PLAYER_COLORS[p.color]
    ctx.fillStyle = PAL.outline
    ctx.fillRect(x - 1, 3, 8, 8)
    ctx.fillStyle = p.state === 'dead' ? PAL.hudDim : col
    ctx.fillRect(x, 4, 6, 6)
    if (p.gone) {
      // left: a line through the box
      ctx.fillStyle = PAL.outline
      ctx.fillRect(x, 6, 6, 2)
    }
    if (p.id === localId) {
      ctx.fillStyle = PAL.white
      ctx.fillRect(x + 2, 12, 2, 1)
    }
    for (let k = 0; k < pips; k++) {
      ctx.fillStyle = k < p.score ? col : PAL.hudLine
      ctx.fillRect(x + 10 + k * 4, 6, 3, 3)
    }
    // the held power-ups, oldest first, in the three slots after the pips
    for (let k = 0; k < POWERUP_CAP; k++) {
      const sx = x + 12 + pips * 4 + k * 8
      const kind = p.powers[k]
      if (kind) drawSprite(powerIcons[kind], sx, 3)
      else {
        ctx.fillStyle = PAL.hudLine
        ctx.fillRect(sx + 3, 7, 3, 1)
      }
    }
  })

  // the clock: a rolling minute in practice, the round's in a match (held through the intro and the results)
  const played = match.on ? (match.phase === 'intro' ? 0 : match.roundTick) : tick % (ROUND_SECONDS * 60)
  const remaining = Math.max(0, ROUND_SECONDS - Math.floor(played / 60))
  const timer = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
  const timerX = W / 2 - textWidth(timer) / 2
  drawText(ctx, timer, timerX, 4, remaining <= 10 && match.phase !== 'over' ? PAL.red : PAL.bone)

  const p0 = local()
  const infoX = 5 + players.length * slotW + 4
  if (!match.on) {
    // movement feel readout for the local player, when there is room before the timer
    const sp = len(p0.vx + p0.slideX, p0.vy + p0.slideY) // what the feet actually do: walk plus slide
    const parts = [p0.state.toUpperCase(), `${sp.toFixed(2)} PX/T`]
    if (p0.anim !== 'none') parts.push(p0.anim.toUpperCase())
    if (p0.windup > 0 && sp === 0) parts.push(`WINDUP ${p0.windup}/${START_WINDUP}`)
    if (p0.slideX !== 0 || p0.slideY !== 0) parts.push(`SLIDE ${len(p0.slideX, p0.slideY).toFixed(2)}`)
    if (p0.state !== 'dead' && onIce(p0.x, p0.y)) parts.push('ICE')
    const hanging = booms.find((b) => b.owner === localId && b.state === 'hang')
    if (hanging?.hovering) parts.push(`HOVER ${hanging.hangT}/${BOOM_HOVER_MAX}`)
    else if (p0.dashCd > 0) parts.push(`DASH CD ${p0.dashCd}`)
    const feel = parts.join('  ')
    if (infoX + textWidth(feel) < timerX - 8) drawText(ctx, feel, infoX, 4, PAL.hudDim)
  } else if (net) {
    // the connection, when it has something to say
    let status = ''
    let color: string = PAL.hudDim
    if (net.desyncTick >= 0) {
      status = 'DESYNC'
      color = PAL.red
    } else if (net.hostGone) {
      status = 'THE HOST LEFT'
      color = PAL.red
    } else if (stallT > 12) {
      const who = net.waitingOn(netTick + 1)
      status = who.length ? `WAITING FOR ${who.join(', ')}` : 'WAITING'
    }
    if (status && infoX + textWidth(status) < timerX - 8) drawText(ctx, status, infoX, 4, color)
  }

  // the room you are in, between < > arrows that cycle the roster in practice (click, or Tab), then the title
  const title = 'BOOMERANGEON'
  const titleX = W - textWidth(title) - 5
  drawText(ctx, title, titleX, 4, PAL.hudDim)
  const entry = arenaEntry()
  const zone = zoneName(p0.x) || arenaName.toUpperCase()
  const label = match.on ? `${zone}   ROUND ${match.round}   FIRST TO ${match.target}` : entry ? `${zone} ${arenaIndex + 1}/${ARENA_LIST.length}` : zone
  const lw = textWidth(label)
  const labelX = titleX - lw - 18
  hudArenaBox = { x0: labelX - 8, x1: labelX + lw + 8 }
  if (!match.on) {
    const over = scriptedTicks < 0 && !overlay && mouseY < HUD_H && mouseX >= hudArenaBox.x0 && mouseX <= hudArenaBox.x1
    const overBack = over && mouseX < labelX + lw / 2
    drawText(ctx, '<', labelX - 6, 4, overBack ? PAL.white : PAL.hudDim)
    drawText(ctx, '>', labelX + lw + 3, 4, over && !overBack ? PAL.white : PAL.hudDim)
  }
  drawText(ctx, label, labelX, 4, PAL.bone)
  if (!options.lighting) drawText(ctx, 'LIGHTS OFF', hudArenaBox.x0 - 44, 4, PAL.hudDim)
}

// The room card: title, what the room is for, how to move on. Shown for the first 2.5 s of a room
// (the tick count restarts when one loads) and never in scripted stills. A match shows it through
// the intro instead, with the round and READY in place of the practice keys.
const BANNER_TICKS = 150
function drawBanner() {
  if (scriptedTicks >= 0) return
  let fade: number
  let hint: string
  if (match.on) {
    if (match.phase !== 'intro') return
    fade = Math.min(1, (MATCH_INTRO - match.phaseT) / 15)
    hint = `${match.gameMode === 'teams' ? '2V2   ' : ''}ROUND ${match.round}   ${match.lives} LIVES EACH   FIRST TO ${match.target}`
  } else {
    if (tick >= BANNER_TICKS) return
    fade = Math.min(1, (BANNER_TICKS - tick) / 30)
    hint = `${arenaEntry() ? `ROOM ${arenaIndex + 1}/${ARENA_LIST.length}   ` : ''}TAB: NEXT ROOM   SHIFT-TAB: BACK   B: ADD A BOT   SHIFT-B: REMOVE ONE   ESC: MENU`
  }
  const entry = arenaEntry()
  const title = (entry?.title ?? arenaName).toUpperCase()
  const blurb = entry ? entry.blurb.toUpperCase() : ''
  const ready = match.on && match.phaseT >= MATCH_INTRO - 60
  const bandH = (blurb ? 44 : 34) + (ready ? 16 : 0)
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
  if (ready) {
    y += 10
    const pulse = (match.phaseT >> 3) & 1 ? PAL.white : PAL.cream
    drawText(ctx, 'READY', W / 2 - textWidth('READY', 2) / 2, y, pulse, 2)
  }
  ctx.globalAlpha = 1
}

/** The big word over the world: GO, who took the round, DRAW. */
function drawCallout() {
  if (!callout) return
  const a = Math.min(1, callout.ttl / 12)
  const scale = textWidth(callout.text, 2) > W - 20 ? 1 : 2
  const y = HUD_H + Math.round(WORLD_H / 2) - 24
  ctx.globalAlpha = a
  drawText(ctx, callout.text, Math.round(W / 2 - textWidth(callout.text, scale) / 2) + scale, y + scale, PAL.outline, scale)
  drawText(ctx, callout.text, Math.round(W / 2 - textWidth(callout.text, scale) / 2), y, callout.color, scale)
  ctx.globalAlpha = 1
}

/** Small fading lines under the HUD: who left. */
function drawNotices() {
  const p = local()
  if (match.on && match.phase === 'play' && p.state === 'dead') {
    const label = p.lives > 0 ? `RESPAWNING IN ${(Math.max(0, p.respawnT) / 60).toFixed(1)}` : 'OUT THIS ROUND'
    const x = Math.round((W - textWidth(label)) / 2)
    ctx.fillStyle = PAL.hud
    ctx.fillRect(x - 5, H - 20, textWidth(label) + 10, 13)
    drawText(ctx, label, x, H - 16, PAL.bone)
  }
  let y = HUD_H + 4
  for (let i = notices.length - 1; i >= 0; i--) {
    const n = notices[i]
    if (--n.ttl <= 0) {
      notices.splice(i, 1)
      continue
    }
    ctx.globalAlpha = Math.min(1, n.ttl / 30)
    drawText(ctx, n.text, 5, y, PAL.bone)
    y += 8
  }
  ctx.globalAlpha = 1
}

/** The podium (docs/01 §10): rounds won, then kills; the winner's name on top; how to go on. */
function drawResults() {
  if (!match.on || match.phase !== 'over') return
  const order = standings()
  const winner = playerById(match.lastWinner) ?? order[0]
  const rowH = 10
  const w = 190
  const h = 34 + order.length * rowH + 16
  const x = Math.round(W / 2 - w / 2)
  const y = Math.round(HUD_H + WORLD_H / 2 - h / 2)
  ctx.fillStyle = rgba(PAL.outline, 0.45)
  ctx.fillRect(0, HUD_H, W, WORLD_H)
  drawPanel(ctx, x, y, w, h, 0.94)
  const headline = `${sideName(winner)} WINS`
  drawText(ctx, headline, Math.round(W / 2 - textWidth(headline, 2) / 2), y + 7, PLAYER_COLORS[winner.color], 2)
  drawText(ctx, 'ROUNDS', x + w - 70, y + 24, PAL.hudDim)
  drawText(ctx, 'KILLS', x + w - 30, y + 24, PAL.hudDim)
  let ry = y + 34
  order.forEach((p, i) => {
    const col = p.gone ? PAL.hudDim : PLAYER_COLORS[p.color]
    ctx.fillStyle = PAL.outline
    ctx.fillRect(x + 8, ry - 1, 7, 7)
    ctx.fillStyle = col
    ctx.fillRect(x + 9, ry, 5, 5)
    drawText(ctx, `${i + 1}.`, x + 18, ry, PAL.hudDim)
    drawText(ctx, displayName(p) + (p.gone ? ' (LEFT)' : ''), x + 30, ry, p.gone ? PAL.hudDim : PAL.bone)
    drawText(ctx, String(p.score), x + w - 60, ry, PAL.cream)
    drawText(ctx, String(p.kills), x + w - 22, ry, PAL.cream)
    ry += rowH
  })
  const canCall = match.phaseT >= RESULTS_HOLD
  let foot: string
  if (net && net.role !== 'host') foot = net.hostGone ? 'THE HOST LEFT   ESC: LEAVE' : 'WAITING FOR THE HOST   ESC: LEAVE'
  else if (!canCall) foot = ''
  else foot = net ? 'ENTER: REMATCH   ESC: LEAVE' : 'ENTER: REMATCH   ESC: MENU'
  if (foot) drawText(ctx, foot, Math.round(W / 2 - textWidth(foot) / 2), y + h - 10, canCall ? PAL.cream : PAL.hudDim)
}

/** A player's name over their head in a match, so you know who you are throwing at. */
function drawName(p: Player) {
  const name = displayName(p)
  const nx = Math.round(p.x - textWidth(name) / 2)
  const ny = Math.round(p.y - 27)
  ctx.globalAlpha = p.id === localId ? 0.5 : 0.85
  drawText(ctx, name, nx + 1, ny + 1, PAL.outline)
  drawText(ctx, name, nx, ny, p.id === localId ? PAL.bone : PLAYER_COLORS[p.color])
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
  const chars = sheet === 'all' ? CHARACTERS.map((_, i) => i) : [localChar]
  const sheetW = chars.length * 198 + 8, sheetH = 356
  if (screen.canvas.width !== sheetW || screen.canvas.height !== sheetH) screen.resize(sheetW, sheetH)
  ctx.fillStyle = PAL.floor[0]
  ctx.fillRect(0, 0, sheetW, sheetH)
  const rows: [string, (s: CharSet) => Sprite[]][] = [
    ['STAND', (s) => [s.stand.down[0], s.stand.sideR[0], s.stand.up[0]]],
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
  chars.forEach((c, ci) => {
    const x0 = 6 + ci * 198
    drawText(ctx, CHARACTERS[c].name, x0, 4, PAL.bone)
    rows.forEach(([label, frames], ri) => {
      const y = 14 + ri * 24
      drawText(ctx, label, x0, y + 7, PAL.hudDim)
      frames(charSets[c][ci % PLAYER_COLORS.length]).forEach((s, i) => {
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
  // screen shake moves the whole world layer by whole pixels; the HUD, banner and cursor stay put
  const [shx, shy] = options.shake ? vfx.shakeOffset(tick) : [0, 0]

  ctx.fillStyle = PAL.bg
  ctx.fillRect(0, 0, W, H)
  ctx.save()
  ctx.translate(-cx + shx, HUD_H + shy)
  ctx.drawImage(staticLayer, x0 - 8, 0, W + 16, WORLD_H, x0 - 8, 0, W + 16, WORLD_H)

  // a sky room's pits are windows onto open air: a sky gradient and two cloud layers drifting at
  // different parallax, clipped to the pit cells (minus the rock skirt the static layer drew)
  if (look.sky && cloudStrips) {
    ctx.save()
    ctx.beginPath()
    for (let r = 0; r < arena.rows; r++)
      for (let c = c0; c <= c1; c++) {
        if (tileAt(arena, c, r) !== TileKind.Pit) continue
        const skirt = tileAt(arena, c, r - 1) !== TileKind.Pit ? 8 : 0
        ctx.rect(c * TILE, r * TILE + skirt, TILE, TILE - skirt)
      }
    ctx.clip()
    const grad = ctx.createLinearGradient(0, 0, 0, WORLD_H)
    grad.addColorStop(0, '#4a9fe8')
    grad.addColorStop(1, '#aee0f8')
    ctx.fillStyle = grad
    ctx.fillRect(x0 - 8, 0, W + 16, WORLD_H)
    for (let layer = 0; layer < 2; layer++) {
      const strip = cloudStrips[layer]
      const par = layer === 0 ? 0.25 : 0.5 // of the camera; the rest of the shift pins it below
      const auto = layer === 0 ? 0.06 : 0.12 // px/tick of wind
      const shift = Math.floor(cx * (1 - par) - tick * auto)
      const first = x0 - 8 - ((((x0 - 8 - shift) % strip.width) + strip.width) % strip.width)
      ctx.globalAlpha = layer === 0 ? 0.8 : 1
      for (let sx = first; sx < x1 + 8; sx += strip.width) ctx.drawImage(strip, sx, 0)
    }
    ctx.globalAlpha = 1
    ctx.restore()
  }

  // the dance floor pulses through its hues on the music's beat — hue only, never value: the
  // 'color' composite keeps the checker's own near-black luminosity under whatever we lay on it
  if (look.floorCycle) {
    const beats = music.beatPhase() ?? tick / 33
    const beat = Math.floor(beats)
    const env = 1 - (beats - beat) // snaps bright on the beat, dies into the next
    ctx.save()
    ctx.globalCompositeOperation = 'color'
    for (let r = 0; r < arena.rows; r++)
      for (let c = c0; c <= c1; c++) {
        const k = tileAt(arena, c, r)
        if (k !== TileKind.Floor && k !== TileKind.Crumble) continue
        const par = (c + r) & 1
        ctx.fillStyle = rgba(look.floorCycle[(beat + par * 2) % look.floorCycle.length], (0.25 + 0.4 * env) * (par ? 1 : 0.7))
        ctx.fillRect(c * TILE, r * TILE, TILE, TILE)
      }
    ctx.restore()
  }

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

  // the clockwork's gears, half-sunk in the wall faces, click forward one step per spike phase —
  // the room telegraphs the hazard's rhythm; per frame so they can turn, hash-placed like the faces
  if (look.wall === 'gears') {
    const ph = tick % (SPIKE_CYCLE.off + SPIKE_CYCLE.warn + SPIKE_CYCLE.on)
    const step = ph >= SPIKE_CYCLE.off + SPIKE_CYCLE.warn ? 2 : ph >= SPIKE_CYCLE.off ? 1 : 0
    for (let r = 0; r < arena.rows; r++)
      for (let c = c0; c <= c1; c++) {
        if (tileAt(arena, c, r) !== TileKind.Wall || tileAt(arena, c, r + 1) === TileKind.Wall) continue
        if (!gearAt(c, r, seed)) continue
        if (arena.props.some((p) => p.kind === 'torch' && p.c === c && p.r === r)) continue
        drawGear(ctx, c * TILE, r * TILE, step, look)
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

  // fixtures (torch, paper lantern or wall lamp, by the look) sit on wall faces; animated, so not
  // in the static layer
  const fixFrames = look.fixture === 'lantern' ? lanternFrames : look.fixture === 'lamp' ? lampFrames : torchFrames
  arena.props.forEach((pr, i) => {
    if (pr.kind !== 'torch' || !vis(pr.c * TILE, 120)) return
    const x = pr.c * TILE + 4
    const y = pr.r * TILE + 3
    const frame = Math.floor(tick / 6 + i * 1.7) % 3
    drawSprite(fixFrames[frame], x, y)
    const flick = hash2(tick >> 2, i, 99) * 6
    lights.push({
      x: x + 3,
      y: y + 12,
      r: (look.fixture === 'lantern' ? 84 : 100) + flick,
      a: 1,
      glow: look.fixture === 'lantern' ? 'rgba(255,190,110,0.26)' : 'rgba(255,150,60,0.24)',
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
      if (left > 0) lights.push({ x: ch.x, y: ch.y, r: 36, a: 0.6 * left, glow: look.mirror ? `rgba(190,210,255,${0.25 * left})` : rgba(PAL.flameO, 0.25 * left), glowR: 24 })
    } else {
      const height = ch.state === 'fall' ? CHANDELIER_HEIGHT * (1 - ch.t / CHANDELIER_FALL) : CHANDELIER_HEIGHT
      const jitter = ch.state === 'creak' ? (((ch.t >> 1) & 1) ? 1 : -1) : 0
      // where the chandeliers are the only lights they throw further
      const r = def.lightSource === 'chandeliers' ? 100 : 72
      if (look.mirror) {
        overhead.push(() => art.drawMirrorBall(ctx, ch.x, ch.y, height, ch.ay, jitter, tick))
        lights.push({ x: ch.x, y: ch.y - height, r, a: 0.9, glow: 'rgba(190,210,255,0.26)', glowR: r * 0.6 })
        // its pale spots wheel slowly across the floor around it, never up a wall or into a pit
        for (let s = 0; s < 3; s++) {
          const a = (tick / (210 + s * 40)) * Math.PI * 2 * (s === 1 ? -1 : 1) + s * 2.1 + ch.x * 0.3
          const sx = ch.x + Math.cos(a) * (24 + s * 14)
          const sy = ch.y + Math.sin(a) * (10 + s * 6)
          const t = tileAt(arena, Math.floor(sx / TILE), Math.floor(sy / TILE))
          if (t === TileKind.Wall || t === TileKind.Pit) continue
          ctx.fillStyle = 'rgba(214,226,255,0.13)'
          ctx.beginPath()
          ctx.ellipse(sx, sy, 7, 3, 0, 0, Math.PI * 2)
          ctx.fill()
        }
      } else {
        overhead.push(() => art.drawChandelier(ctx, ch.x, ch.y, height, ch.ay, jitter, tick))
        lights.push({ x: ch.x, y: ch.y - height, r, a: 0.9, glow: rgba(PAL.flameO, 0.28), glowR: r * 0.6 })
      }
    }
  }
  for (const bl of barrels) {
    if (!bl.alive || !bl.lit) continue
    art.drawFuseGlow(ctx, bl.c * TILE + 8, bl.r * TILE + 13, bl.fuse)
  }
  // laid ice, under the floor marks so the skid scratches sit on top of it; it thins over its last quarter
  for (const i of iceList) {
    const c = i % arena.cols
    const r = Math.floor(i / arena.cols)
    if (!vis(c * TILE)) continue
    part.drawFloorIce(ctx, c * TILE, r * TILE, 1 - (tick - iceAt[i]) / ICE_TTL, tick, i)
  }
  // floor marks (smears, prints, scratches, scorches, splats, settled snow) and debris lying still
  vfx.drawGround(ctx, vis)
  // burning floor, with a glow per tile that dies with it
  for (const i of fireList) {
    const c = i % arena.cols
    const r = Math.floor(i / arena.cols)
    if (!vis(c * TILE)) continue
    const life = 1 - (tick - fireAt[i]) / FIRE_TTL
    part.drawFloorFire(ctx, c * TILE, r * TILE, life, tick, i)
    lights.push({ x: c * TILE + 8, y: r * TILE + 6, r: 30, a: 0.7 * Math.min(1, life * 2), glow: rgba(PAL.flameO, 0.3 * life), glowR: 20 })
  }
  // pickups: the point glows and sparks while one is on its way, then the badge floats over it
  for (const pk of pickups) {
    if (!vis(pk.x)) continue
    const info = POWERS[pk.kind]
    if (!pk.ready) {
      part.drawSpawnWarn(ctx, pk.x, pk.y, pk.t / POWERUP_WARN, tick, info.color)
      continue
    }
    part.drawPickupBase(ctx, pk.x, pk.y, tick, info.color)
    const bob = Math.round(Math.sin(tick / 12) * 1.5)
    const fade = pk.t > POWERUP_TTL - 90 && (tick & 4) === 0 ? 0.4 : 1 // blinks for its last 1.5 s
    drawables.push({ y: pk.y + 4, draw: () => drawSprite(powerIcons[pk.kind], pk.x - 4, pk.y - 12 - bob, fade) })
    lights.push({ x: pk.x, y: pk.y - 6, r: 26, a: 0.6, glow: rgba(info.color, 0.25), glowR: 14 })
  }
  for (const b of booms) if (b.state === 'dropped' && vis(b.x)) drawBoomerang(b)
  for (const p of players) {
    if (p.state === 'dead' || !vis(p.x)) continue
    if (inGrass(p.x, p.y) && p.id !== localId) continue
    drawSprite(shadowDude, p.x - 5, p.y - 2)
  }
  for (const b of booms) {
    if (b.state === 'dropped' || !vis(b.x)) continue
    if (b.powers.has('big')) drawSpriteScaled(shadowBoom, b.x, b.y, BIG_SCALE, 0.8)
    else drawSprite(shadowBoom, b.x - 3, b.y - 1, b.phantom ? 0.6 : 1)
  }
  for (const s of sinks) {
    if (!vis(s.x)) continue
    const t = s.ttl / s.max
    const h = Math.max(1, Math.round(s.s.h * t))
    // a hit body flashes solid white for its first frames (docs/01 §8); a fall just drops away
    const img = s.flash && s.max - s.ttl < HIT_FLASH ? sil(s.s, PAL.white).img : s.s.img
    ctx.globalAlpha = 0.35 + t * 0.65
    ctx.drawImage(img, 0, 0, s.s.w, h, s.x, s.y + (s.s.h - h), s.s.w, h)
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
    if (match.on && !inGrass(p.x, p.y)) overhead.push(() => drawName(p))
    const strength = p.id === localId ? 0.5 : 0.35
    // dropping in, the body carries a glow in its colour that fades as it lands
    if (p.spawnT > 0) {
      const k = p.spawnT / SPAWN_DROP
      lights.push({ x: p.x, y: p.y - 8, r: 44 + 30 * k, a: 1, glow: rgba(PLAYER_COLORS[p.color], 0.35 * k + 0.1), glowR: 24 + 12 * k })
    } else lights.push({ x: p.x, y: p.y - 8, r: 44, a: strength })
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
        // the hit-flash (docs/01 §8): both halves solid white for the first frames, then the body
        const img = h.max - h.ttl < HIT_FLASH ? sil(h.s, PAL.white).img : h.s.img
        ctx.globalAlpha = Math.min(1, (h.ttl / h.max) * 1.6)
        ctx.drawImage(img, h.sx, h.sy, h.sw, h.sh, Math.round(h.x), Math.round(h.y), h.sw, h.sh)
        ctx.globalAlpha = 1
      },
    })
  }
  drawables.sort((a, b) => a.y - b.y)
  for (const d of drawables) d.draw()

  // everything in the air: particles, the weather, rings; then the slashes and blasts over them
  vfx.drawAir(ctx, vis, tick)
  for (const s of slashes) drawSlash(s)
  for (const bl of blasts) if (vis(bl.x, bl.r + 40)) drawBlast(bl)
  for (const o of overhead) o()
  ctx.restore()

  if (options.lighting) {
    // the lightmap is screen-sized: shift the lights by the camera and drop the ones out of view
    const onScreen: Light[] = []
    for (const l of lights) {
      const reach = Math.max(l.r, l.glowR ?? 0)
      if (l.x + reach < x0 || l.x - reach > x1) continue
      onScreen.push({ ...l, x: l.x - cx })
    }
    lightmap.render(onScreen, ambientAt(cx + W / 2), 0.5)
    ctx.save()
    ctx.translate(shx, HUD_H + shy)
    lightmap.compose(ctx, onScreen)
    ctx.restore()
  }

  // a blast's white flash, over the lit world (off with the shake: the same people mind both)
  const flashA = options.shake ? vfx.flashAlpha() : 0
  if (flashA > 0) {
    ctx.fillStyle = rgba(PAL.white, flashA)
    ctx.fillRect(0, HUD_H, W, WORLD_H)
  }

  ctx.save()
  ctx.translate(-cx + shx, HUD_H + shy)
  for (const p of players) {
    if (p.state === 'dead' || !vis(p.x, 240)) continue
    if (p.id !== localId && inGrass(p.x, p.y)) continue
    drawAimIndicator(p)
  }
  ctx.restore()

  // a fresh room comes up from black (live play only; a still wants the whole picture)
  if (scriptedTicks < 0 && tick < FADE_IN) {
    ctx.fillStyle = rgba(PAL.outline, 1 - tick / FADE_IN)
    ctx.fillRect(0, HUD_H, W, WORLD_H)
  }

  const view = deathView()
  if (view.zoom > 1) {
    if (!deathFrame) deathFrame = document.createElement('canvas')
    if (deathFrame.width !== W || deathFrame.height !== WORLD_H) { deathFrame.width = W; deathFrame.height = WORLD_H }
    ctx2d(deathFrame).drawImage(screen.canvas, 0, HUD_H, W, WORLD_H, 0, 0, W, WORLD_H)
    ctx.drawImage(deathFrame, view.sx, view.sy, W / view.zoom, WORLD_H / view.zoom, 0, HUD_H, W, WORLD_H)
  }
  drawBanner()
  drawCallout()
  drawResults()
  drawHud()
  drawNotices()
  drawOverlay()
  drawCursor()
  screen.present()
}

// ---------------------------------------------------------------- loop
function frameInputs(scripted: boolean): Input[] {
  const inputs: Input[] = []
  for (const p of players) inputs[p.id] = p.ai ? aiInput(p) : scripted ? scriptedInput(tick, p) : readLocalInput()
  return inputs
}

/** Who is in the game and how it is run. The shell (game/app.ts) builds one from the menu or the lobby. */
export interface GameConfig {
  /** practice: the demo as it stands, bots from the URL, rooms cycle on Tab. match: rounds, a target, a podium (docs/01 §10). */
  mode: 'practice' | 'match'
  /** the slot this browser plays */
  localSlot: number
  /** a match's roster, bots included; practice ignores it and reads the URL */
  players: { slot: number; name: string; char: number; color: number; ai: boolean; team?: Team }[]
  /** a match's seed, the same on every client; practice keeps ?seed= */
  seed?: number
  /** the first room of a match, by roster key */
  arenaKey?: string
  rules?: { target: number; rooms: RoomOrder; lives: number; gameMode?: MatchKind }
  /** an online match's lockstep session; absent, the match is local */
  net?: NetSession
}

let started = false

/**
 * Starts the game in the #game mount. Called once: the module keeps its state at module level, so a
 * second game means a fresh page (quitToMenu). Scripted runs (?t=) take the practice path and never
 * touch the audio engine; the shell imports this module only when a game is about to start.
 */
export function startGame(cfg: GameConfig) {
  if (started) throw new Error('startGame called twice')
  started = true
  localId = cfg.localSlot
  if (cfg.seed !== undefined && cfg.seed !== seed) {
    seed = cfg.seed
    rng = mulberry32(seed)
    vfx = new Fx(seed * 7919 + 1)
  }

  const mount = document.getElementById('game')!
  screen = createScreen(W, H, mount)
  ctx = screen.ctx
  lightmap = new Lightmap(W, WORLD_H)
  installListeners()
  initAudio()

  if (cfg.mode === 'match') {
    // slot order on every client, so the sim walks the players (and the bots draw on the rng) the same way everywhere
    const roster = cfg.players.slice().sort((a, b) => a.slot - b.slot)
    for (const q of roster) players.push(makePlayer(q.slot, q.char, q.color, q.ai, q.name, q.team))
    if (cfg.net) {
      net = cfg.net
      net.primeNeutral()
      // closing the tab tells the others at once instead of leaving them waiting on our input
      window.addEventListener('pagehide', () => net?.close())
    }
    const first = Math.max(0, ARENA_LIST.findIndex((a) => a.key === (cfg.arenaKey ?? arenaName)))
    startMatch(cfg.rules?.target ?? 5, cfg.rules?.rooms ?? 'cycle', first, cfg.rules?.lives ?? 3, cfg.rules?.gameMode ?? 'ffa')
  } else {
    seatPracticePlayers()
    for (const k of giveList) givePower(local(), k)
  }
  updateCamera(true)

  const hint = document.getElementById('hint')
  if (hint && scriptedTicks < 0) {
    hint.innerHTML =
      '<b>WASD</b> move · <b>mouse</b> aim · <b>LMB</b> throw, hold again to hover once anywhere, release to return · <b>RMB</b>/<b>F</b> melee · <b>Space</b> dash · <b>L</b> lighting · <b>M</b> mute · <b>Esc</b> menu' +
      (cfg.mode === 'practice' ? ' · <b>1–7</b> character · <b>Tab</b> next arena (<b>Shift+Tab</b> back, or click the <b>&lt; &gt;</b> in the HUD) · <b>B</b> add a bot (<b>Shift+B</b> remove)' : '')
  }

  if (scriptedTicks >= 0) {
    try {
      // ?swap=K: press Tab K times (Shift+Tab for negative K) before the scene runs, to still a swap
      const swap = Number(params.get('swap') ?? 0) || 0
      for (let i = 0; i < Math.abs(swap); i++) switchArena(swap > 0 ? 1 : -1)
      for (let i = 0; i < scriptedTicks; i++) {
        advance(() => frameInputs(true))
        if (trace) {
          const p0 = local()
          const bs = boomTrace()
          const slide = len(p0.slideX, p0.slideY)
          const flags = `${slide ? ` slide${slide.toFixed(2)}` : ''}${p0.windup ? ` windup${p0.windup}` : ''}${p0.anim !== 'none' ? ` ${p0.anim}${p0.animT}` : ''}`
          console.log(`T${tick} P0 ${p0.state}${flags} ${p0.x.toFixed(1)},${p0.y.toFixed(1)} v=${len(p0.vx + p0.slideX, p0.vy + p0.slideY).toFixed(2)} walk=${len(p0.vx, p0.vy).toFixed(2)} ${bs}`)
        }
      }
      updateCamera(true)
      render()
      // one line the screenshot script can grep: where the local player ended up and what happened
      const p0 = local()
      console.log(`END t${tick} P0 ${p0.state} ${p0.x.toFixed(1)},${p0.y.toFixed(1)} tile ${Math.floor(p0.x / TILE)},${Math.floor(p0.y / TILE)} cam ${Math.round(camX)} | ${eventLog.join(' · ') || 'no events'}`)
      document.title = `boomerangeon t=${tick}`
      document.getElementById('hint')!.textContent = `scripted frame t=${tick} · ${zoneName(p0.x)} · ${booms.length} boomerangs · ${eventLog.join(' · ') || 'no events yet'}`
      // headless screenshots only pick up canvas content presented inside an animation frame
      requestAnimationFrame(() => render())
    } catch (err) {
      reportError(err instanceof Error ? `${err.message}\n${err.stack}` : String(err))
    }
    return
  }

  document.title = pageTitle()
  let last = performance.now()
  let acc = 0
  const DT = 1000 / 60
  const step = () => {
    // Use one clock for both animation frames and incoming network events. rAF's timestamp can
    // precede a network event that already stepped this frame.
    const now = performance.now()
    acc += Math.min(100, now - last)
    last = now
    while (acc >= DT / gameSpeed()) {
      const tickTime = DT / gameSpeed()
      if (paused) {
        acc -= tickTime
        continue
      }
      // Death slow-motion is derived from shared sim state, never local picture options.
      if (net) {
        if (!netStep()) {
          // Keep one due tick ready for its packet, but discard the rest of a network stall.
          // Otherwise a background packet can arrive just after we spent its time budget and
          // the whole pipeline has to wait for a throttled timer to wake it again.
          acc = tickTime
          break
        }
      }
      else advance(() => frameInputs(false))
      acc -= tickTime
    }
  }
  if (net) {
    // Browsers stop rAF in hidden tabs. Respond to the visible players' incoming traffic instead;
    // the same real-time accumulator still caps the pace, even when every tab is hidden. A timer
    // restarts the pipeline if everyone is hidden or the last packet arrived just before a tick
    // was due. Timers alone are insufficient: browsers throttle them in background tabs too.
    const backgroundStep = () => { if (document.hidden) step() }
    net.onActivity = backgroundStep
    const timer = window.setInterval(backgroundStep, DT)
    window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true })
  }
  const loop = () => {
    step()
    updateCamera(false)
    render()
    audioFrame()
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

/**
 * The continuous side of the soundtrack, once per rendered frame (docs/07 §4.4, §6.4): where the
 * listener is, which things are making a sound right now, and how much of the arrangement plays.
 */
function audioFrame() {
  setListener(camX + W / 2, W)
  for (let i = 0; i < booms.length; i++) {
    const b = booms[i]
    if (b.phantom || b.state === 'dropped') continue
    const key = `boom${i}`
    if (b.state === 'hang') {
      if (b.armed) loop(key, 'fuse', b.x)
      else if (b.hovering) loop(key, 'hover', b.x)
    } else loop(key, 'flight', b.x, (b.state === 'return' ? -1 : 1) * Math.min(1, len(b.vx, b.vy) / BOOM_RETURN_SPEED))
  }
  for (let i = 0; i < crushers.length; i++) {
    const cr = crushers[i]
    if (cr.look === 'saw') loop(`crusher${i}`, 'saw', cr.pos.x, 0, cr.pos.moving ? 1 : 0.5)
    else if (cr.look === 'boulder') {
      if (cr.pos.moving) loop(`crusher${i}`, 'boulder', cr.pos.x)
    } else loop(`crusher${i}`, 'pendulum', cr.pos.x, cr.pos.length > 0 ? cr.pos.dist / cr.pos.length : 0)
  }
  for (let i = 0; i < carts.length; i++) if (carts[i].pos.moving) loop(`cart${i}`, 'cart', carts[i].pos.x)
  for (let i = 0; i < barrels.length; i++) {
    const bl = barrels[i]
    if (bl.alive && bl.lit) loop(`barrel${i}`, 'fuse', bl.c * TILE + 8, 0, 0.8)
  }
  endFrame()
}
