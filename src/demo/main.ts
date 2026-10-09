/**
 * Visual style demo. Not the real simulation — a stand-in with the same feel
 * (60 Hz fixed step, spec constants) so the art can be judged in motion.
 *
 * URL params: ?t=N render tick N of a scripted scene and stop (for screenshots),
 *             ?seed=N, ?light=0 to disable the lightmap, ?char=0-3 local character,
 *             ?bots=0-3 number of AI opponents (default 0), ?arena=brawl for the small
 *             look-demo layout instead of the open movement test floor, ?trace=1 per-tick log,
 *             ?sheet=1 (or sheet=all) shows every animation frame of the character(s) instead.
 */
import { CHARACTERS, type FacingFrames } from '../art/characters.ts'
import { CHAR_KEY, PAL, PLAYER_COLORS, PROP_KEY, darken, lighten, rgba, withPrimary } from '../art/palette.ts'
import { BARREL, BOOMERANG, CRATE, SHADOW_BOOM, SHADOW_DUDE, TORCH } from '../art/props.ts'
import { Lightmap, type Light } from '../render/lighting.ts'
import { flipX, rotate90, silhouette, spriteFromRows, type Sprite } from '../render/pixelart.ts'
import { createScreen } from '../render/screen.ts'
import { drawText, drawTextShadowed, textWidth } from '../render/text.ts'
import { TILE, TileKind, parseArena, renderArenaStatic, tileAt } from '../render/tiles.ts'
import { hash2, mulberry32 } from '../util/rng.ts'
import { ARENA, ARENA_BRAWL } from './arena.ts'
import { sfxBeep, sfxBlast, unlockAudio } from './sfx.ts'

// ---------------------------------------------------------------- constants
const HUD_H = 14
// W, H and WORLD_H follow the arena; they are defined right after it is parsed below.

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
// the dash lets go into a slide instead of stopping: low grip, input only nudges the heading
const DASH_SLIDE_SPEED = 4
const DASH_SLIDE_TICKS = 14
const DASH_SLIDE_FRICTION = 0.86
const DASH_SLIDE_STEER = 0.3

const DASH_SPEED = 6
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

const RESPAWN_TICKS = 90
const SPAWN_PROTECT = 40
const ROUND_SECONDS = 60

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
let lightingOn = params.get('light') !== '0'
const localChar = Math.min(3, Math.max(0, Number(params.get('char') ?? 0)))
const sheet = params.get('sheet') // '1' = the local character's frames, 'all' = every character

const rng = mulberry32(seed)
const arena = parseArena(params.get('arena') === 'brawl' ? ARENA_BRAWL : ARENA)
const W = arena.cols * TILE
const H = HUD_H + arena.rows * TILE
const WORLD_H = H - HUD_H
const staticLayer = renderArenaStatic(arena, seed)

const solid = new Uint8Array(arena.cols * arena.rows)
for (let i = 0; i < arena.tiles.length; i++) solid[i] = arena.tiles[i] === TileKind.Wall ? 1 : 0
for (const p of arena.props) if (p.kind !== 'torch') solid[p.r * arena.cols + p.c] = 1

function isSolid(c: number, r: number): boolean {
  if (c < 0 || r < 0 || c >= arena.cols || r >= arena.rows) return true
  return solid[r * arena.cols + c] === 1
}
function isPit(c: number, r: number): boolean {
  return tileAt(arena, c, r) === TileKind.Pit
}
function blocksWalk(c: number, r: number): boolean {
  return isSolid(c, r) || isPit(c, r)
}
function inGrass(x: number, y: number): boolean {
  return tileAt(arena, Math.floor(x / TILE), Math.floor(y / TILE)) === TileKind.Grass
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
  slide: number // ticks of post-dash slide left
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
let tick = 0
const eventLog: string[] = []

function makePlayer(id: number, char: number, color: number, ai: boolean): Player {
  const sp = arena.spawns[id] ?? { c: 3, r: 3 }
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
    slide: 0,
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
    ai: ai ? { tx: x, ty: y, retarget: 0, throwT: 60 + Math.floor(rng() * 120) } : null,
  }
}

players.push(makePlayer(0, localChar, 0, false))
// bots are off by default so the floor is free for feel-testing; ?bots=1-3 brings them back
const botCount = Math.min(3, Math.max(0, Number(params.get('bots') ?? 0) || 0))
for (let i = 1; i <= botCount; i++) players.push(makePlayer(i, (i + localChar) % 4, i, true))

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
  if (e.code === 'Space') e.preventDefault()
})
window.addEventListener('keyup', (e) => keys.delete(e.code))
window.addEventListener('mousemove', (e) => {
  ;[mouseX, mouseY] = screen.toInternal(e.clientX, e.clientY)
})
window.addEventListener('mousedown', (e) => {
  unlockAudio()
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
    cursorX: mouseX,
    cursorY: mouseY - HUD_H,
  }
  throwQueued = meleeQueued = dashQueued = false
  return inp
}

/** Deterministic input for screenshot mode. */
function scriptedInput(t: number, p: Player): Input {
  // the second throw is held down: it hovers at the top of its flight, then is recalled
  const inp: Input = { mx: 0, my: 0, throw: false, melee: false, dash: false, hold: t >= 222 && t < 290, cursorX: p.x + 120, cursorY: p.y + 10 }
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

function killSlice(p: Player, dx: number, dy: number, killer: number) {
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
  if (killer !== p.id) players[killer].score++
  eventLog.push(`t${tick} P${killer} sliced P${p.id}`)
}

function killPit(p: Player) {
  const s = playerSprite(p)
  sinks.push({ s, x: Math.round(p.x) - 7, y: Math.round(p.y) - 17, ttl: 28, max: 28 })
  die(p)
  eventLog.push(`t${tick} P${p.id} fell`)
}

function die(p: Player) {
  p.state = 'dead'
  p.stateT = 0
  p.respawnT = RESPAWN_TICKS
  p.held = false
  p.vx = p.vy = p.kbx = p.kby = 0
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
  p.slide = 0
  p.windup = 0
}

// Where a throw leaves the hand: a little in front of the body, or at the feet when the player is
// pressed against a wall so the boomerang never starts inside a tile.
function throwOrigin(p: Player): { x: number; y: number } {
  const x = p.x + p.aimX * THROW_OFFSET
  const y = p.y + p.aimY * THROW_OFFSET
  return circleBlocked(x, y, BOOM_WALL_RADIUS, isSolid) ? { x: p.x, y: p.y } : { x, y }
}

function throwBoomerang(p: Player) {
  const o = throwOrigin(p)
  booms.push({
    owner: p.id,
    x: o.x,
    y: o.y,
    vx: p.aimX * BOOM_SPEED,
    vy: p.aimY * BOOM_SPEED,
    state: 'out',
    range: THROW_RANGE,
    traveled: 0,
    decel: flightDecel(BOOM_SPEED, THROW_RANGE),
    recall: false,
    hangT: 0,
    armed: false,
    bounces: 0,
    flight: 0,
    spin: 0,
    trail: [],
    hit: new Set(),
  })
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

// One outbound tick: the speed drops by the throw's decel every tick from the moment it leaves the
// hand, so it drifts to rest exactly at the end of its range (clamped to the path left so it never
// overshoots). Wall hits reflect the velocity and keep counting distance. Returns true on the tick
// it comes to rest. Shared by the sim and the aim-indicator preview (fx=false: no sparks, so the
// render side never touches the sim rng).
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
    if (moveX(b, b.vx / steps, BOOM_WALL_RADIUS, isSolid)) {
      b.vx = -b.vx
      b.bounces++
      if (fx) spawnBurst(b.x, b.y - 4, PAL.boneDark, 3, 0.9)
    }
    if (moveY(b, b.vy / steps, BOOM_WALL_RADIUS, isSolid)) {
      b.vy = -b.vy
      b.bounces++
      if (fx) spawnBurst(b.x, b.y - 4, PAL.boneDark, 3, 0.9)
    }
  }
  if (sp <= 0) {
    b.vx = b.vy = 0
    return true
  }
  return false
}

// A melee swing connecting with an airborne boomerang. A steal keeps an armed boomerang armed;
// smacking a boomerang you already own arms it: it relaunches at double speed over BOMB_RANGE,
// sits, beeps twice, shrinks and blows up.
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
  sfxBeep()
}

// An armed boomerang at the end of its fuse: everyone in the blast radius dies, the owner included,
// and the boomerang drops where it went off, disarmed.
function explode(b: Boomerang) {
  for (const q of players) {
    if (q.state === 'dead' || q.invuln > 0) continue
    const dx = q.x - b.x
    const dy = q.y - b.y
    const d = len(dx, dy)
    if (d < BOMB_HIT_RADIUS + HURT_RADIUS) {
      const [nx, ny] = d > 1e-6 ? norm(dx, dy) : [0, -1]
      eventLog.push(`t${tick} P${b.owner} blew up P${q.id}`)
      killSlice(q, nx, ny, b.owner)
    }
  }
  blasts.push({ x: b.x, y: b.y - 4, r: BOMB_RADIUS, ttl: BLAST_TTL, max: BLAST_TTL })
  spawnBurst(b.x, b.y - 4, PAL.flameO, 22, 3)
  spawnBurst(b.x, b.y - 4, PAL.flameY, 10, 1.8)
  sfxBlast()
  b.state = 'dropped'
  b.armed = false
  b.vx = b.vy = 0
  b.hit.clear()
}

// Dry run of a throw from where the player stands: the per-tick ground positions of the outbound
// flight, bounces included, ending where it will stop and hang. Drives the aim indicator.
function previewThrow(p: Player): { x: number; y: number }[] {
  const o = throwOrigin(p)
  const d: Boomerang = {
    owner: p.id,
    x: o.x,
    y: o.y,
    vx: p.aimX * BOOM_SPEED,
    vy: p.aimY * BOOM_SPEED,
    state: 'out',
    range: THROW_RANGE,
    traveled: 0,
    decel: flightDecel(BOOM_SPEED, THROW_RANGE),
    recall: false,
    hangT: 0,
    armed: false,
    bounces: 0,
    flight: 0,
    spin: 0,
    trail: [],
    hit: new Set(),
  }
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

function randomWalkTarget(): [number, number] {
  for (let i = 0; i < 50; i++) {
    const c = 1 + Math.floor(rng() * (arena.cols - 2))
    const r = 2 + Math.floor(rng() * (arena.rows - 3))
    if (!blocksWalk(c, r) && !blocksWalk(c - 1, r) && !blocksWalk(c + 1, r) && !blocksWalk(c, r - 1) && !blocksWalk(c, r + 1))
      return [c * TILE + 8, r * TILE + 8]
  }
  return [W / 2, WORLD_H / 2]
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
function step(inputs: Input[]) {
  tick++

  for (const p of players) {
    const inp = inputs[p.id]
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
        // the dash doesn't stop so much as let go: carry speed into a low-grip slide
        p.state = 'idle'
        p.slide = DASH_SLIDE_TICKS
        p.vx = p.dashX * DASH_SLIDE_SPEED
        p.vy = p.dashY * DASH_SLIDE_SPEED
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
    if (p.state === 'dash') {
      p.vx = p.dashX * DASH_SPEED
      p.vy = p.dashY * DASH_SPEED
      p.moving = true
    } else if (p.slide > 0) {
      // sliding out of a dash: friction does the stopping, input only nudges the heading
      p.slide--
      p.vx *= DASH_SLIDE_FRICTION
      p.vy *= DASH_SLIDE_FRICTION
      if (len(inp.mx, inp.my) > 0.1) {
        const [ix, iy] = norm(inp.mx, inp.my)
        p.vx += ix * DASH_SLIDE_STEER
        p.vy += iy * DASH_SLIDE_STEER
      }
      const ss = len(p.vx, p.vy)
      if (p.slide === 0 && ss < 0.3) p.vx = p.vy = 0
      if (ss > 1.2 && p.slide % 3 === 0) spawnBurst(p.x - (p.vx / ss) * 4, p.y, PAL.boneDark, 1, 0.3) // skid dust
      p.moving = false // feet planted while sliding
      p.windup = 0
    } else {
      const il = len(inp.mx, inp.my)
      const mult = p.state === 'melee' ? MELEE_SPEED_MULT : 1
      if (il > 0.1) {
        const [ix, iy] = norm(inp.mx, inp.my)
        const cur = len(p.vx, p.vy)
        if (cur === 0 && p.windup < START_WINDUP) {
          // standing start: run in place until the feet find grip, then go
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

    const hitX = moveX(p, p.vx, PLAYER_RADIUS, blocksWalk)
    const hitY = moveY(p, p.vy, PLAYER_RADIUS, blocksWalk)
    if (p.state === 'dash' && (hitX || hitY)) {
      p.state = 'idle'
      p.slide = 0
      p.vx = p.vy = 0
      spawnBurst(p.x + p.dashX * 5, p.y - 4 + p.dashY * 5, PAL.boneDark, 5, 1)
    }

    // knockback ignores pits (that's how you fall in)
    if (p.kbx !== 0 || p.kby !== 0) {
      moveX(p, p.kbx, PLAYER_RADIUS, isSolid)
      moveY(p, p.kby, PLAYER_RADIUS, isSolid)
      p.kbx *= KB_DECAY
      p.kby *= KB_DECAY
      if (len(p.kbx, p.kby) < 0.15) p.kbx = p.kby = 0
      if (isPit(Math.floor(p.x / TILE), Math.floor(p.y / TILE))) {
        killPit(p)
        continue
      }
    }

    // dash afterimages (render-only, but cheap to spawn here)
    if (p.state === 'dash' && p.invuln > 0 && (p.stateT & 1) === 0) {
      afterimages.push({ s: playerSprite(p), x: Math.round(p.x) - 7, y: Math.round(p.y) - 17, ttl: 12, max: 12 })
    }
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
      } else if (b.state === 'dash' && a.state !== 'dash') {
        a.kbx += b.dashX * SHOVE_IMPULSE
        a.kby += b.dashY * SHOVE_IMPULSE
      }
      const push = (minD - d) / 2
      moveX(a, -nx * push, PLAYER_RADIUS, isSolid)
      moveY(a, -ny * push, PLAYER_RADIUS, isSolid)
      moveX(b, nx * push, PLAYER_RADIUS, isSolid)
      moveY(b, ny * push, PLAYER_RADIUS, isSolid)
    }
  }

  // boomerangs
  for (const b of booms) {
    b.spin++
    const owner = players[b.owner]
    if (b.state === 'dropped') {
      b.vx *= DROP_FRICTION
      b.vy *= DROP_FRICTION
      if (len(b.vx, b.vy) < 0.05) b.vx = b.vy = 0
      moveX(b, b.vx, 3, isSolid)
      moveY(b, b.vy, 3, isSolid)
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
const lightmap = new Lightmap(W, WORLD_H)

interface Drawable {
  y: number
  draw: () => void
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
    const a = (b.armed ? 0.8 : 0.55) * (1 - i / b.trail.length)
    ctx.fillStyle = rgba(color, a)
    const sz = (i < 2 ? 3 : 2) + (b.armed ? 1 : 0)
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

/** The colour a boomerang's trail and glow take: its owner's, orange once armed. */
function boomHue(b: Boomerang): string {
  return b.armed ? BOMB_COLOR : PLAYER_COLORS[players[b.owner].color]
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
  const sp = len(p0.vx, p0.vy)
  const parts = [p0.state.toUpperCase(), `${sp.toFixed(2)} PX/T`]
  if (p0.anim !== 'none') parts.push(p0.anim.toUpperCase())
  if (p0.windup > 0 && sp === 0) parts.push(`WINDUP ${p0.windup}/${START_WINDUP}`)
  if (p0.slide > 0) parts.push(`SLIDE ${p0.slide}`)
  const hanging = booms.find((b) => b.owner === 0 && b.state === 'hang')
  if (hanging && hanging.hangT > BOOM_HANG) parts.push(`HOVER ${hanging.hangT}/${BOOM_HOVER_MAX}`)
  else if (p0.dashCd > 0) parts.push(`DASH CD ${p0.dashCd}`)
  const feel = parts.join('  ')
  const feelX = 5 + players.length * 34 + 4
  if (feelX + textWidth(feel) < timerX - 8) drawText(ctx, feel, feelX, 4, PAL.hudDim)

  const title = 'BOOMERANGEON'
  drawText(ctx, title, W - textWidth(title) - 5, 4, PAL.hudDim)
  if (!lightingOn) drawText(ctx, 'LIGHTS OFF', W - textWidth(title) - 5 - 48, 4, PAL.hudDim)
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

function render() {
  if (sheet) return renderSheet()
  ctx.fillStyle = PAL.bg
  ctx.fillRect(0, 0, W, H)
  ctx.save()
  ctx.translate(0, HUD_H)
  ctx.drawImage(staticLayer, 0, 0)

  const lights: Light[] = []
  const drawables: Drawable[] = []

  // torches sit on wall faces; animated, so not in the static layer
  arena.props.forEach((pr, i) => {
    if (pr.kind !== 'torch') return
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

  // ground layer: slime trail, dropped boomerangs, shadows, sinking players, afterimages
  for (const s of smears) {
    const t = s.ttl / s.max
    ctx.fillStyle = rgba(s.color, 0.2 + 0.5 * t)
    ctx.fillRect(Math.round(s.x) - (s.w >> 1), Math.round(s.y), s.w, 1)
  }
  for (const b of booms) if (b.state === 'dropped') drawBoomerang(b)
  for (const p of players) {
    if (p.state === 'dead') continue
    if (inGrass(p.x, p.y) && p.id !== 0) continue
    drawSprite(shadowDude, p.x - 5, p.y - 2)
  }
  for (const b of booms) if (b.state !== 'dropped') drawSprite(shadowBoom, b.x - 3, b.y - 1)
  for (const s of sinks) {
    const t = s.ttl / s.max
    const h = Math.max(1, Math.round(s.s.h * t))
    ctx.globalAlpha = 0.35 + t * 0.65
    ctx.drawImage(s.s.img, 0, 0, s.s.w, h, s.x, s.y + (s.s.h - h), s.s.w, h)
    ctx.globalAlpha = 1
  }
  for (const a of afterimages) {
    const t = a.ttl / a.max
    drawSprite(sil(a.s, lighten(PAL.white, 0)), a.x, a.y, t * 0.55)
  }

  // y-sorted layer
  for (const pr of arena.props) {
    if (pr.kind === 'crate') drawables.push({ y: pr.r * TILE + 15, draw: () => drawSprite(crateSprite, pr.c * TILE + 1, pr.r * TILE + 1) })
    else if (pr.kind === 'barrel') drawables.push({ y: pr.r * TILE + 15, draw: () => drawSprite(barrelSprite, pr.c * TILE + 2, pr.r * TILE + 1) })
  }
  for (const p of players) {
    if (p.state === 'dead') continue
    drawables.push({ y: p.y, draw: () => drawPlayer(p) })
    const strength = p.id === 0 ? 0.5 : 0.35
    lights.push({ x: p.x, y: p.y - 8, r: 44, a: strength })
  }
  for (const b of booms) {
    if (b.state === 'dropped') continue
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
    const t = pt.ttl / pt.max
    ctx.fillStyle = rgba(pt.color, Math.min(1, t * 1.5))
    const sz = pt.ttl > 10 ? 2 : 1
    ctx.fillRect(Math.round(pt.x), Math.round(pt.y), sz, sz)
  }
  for (const s of slashes) drawSlash(s)
  for (const bl of blasts) drawBlast(bl)

  if (lightingOn) {
    lightmap.render(lights, 0.4, 0.5)
    lightmap.compose(ctx, lights)
  }

  for (const p of players) {
    if (p.state === 'dead') continue
    if (p.id !== 0 && inGrass(p.x, p.y)) continue
    drawAimIndicator(p)
  }
  ctx.restore()

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
    for (let i = 0; i < scriptedTicks; i++) {
      step(frameInputs(true))
      if (trace) {
        const p0 = players[0]
        const bs = booms
          .map((b) => `P${b.owner} ${b.state}${b.state === 'hang' ? b.hangT : ''}${b.recall && b.state === 'return' ? '(recall)' : ''}${b.armed ? '*' : ''} ${b.x.toFixed(1)},${b.y.toFixed(1)} v=${len(b.vx, b.vy).toFixed(2)}`)
          .join(' | ')
        const flags = `${p0.slide ? ` slide${p0.slide}` : ''}${p0.windup ? ` windup${p0.windup}` : ''}${p0.anim !== 'none' ? ` ${p0.anim}${p0.animT}` : ''}`
        console.log(`T${tick} P0 ${p0.state}${flags} ${p0.x.toFixed(1)},${p0.y.toFixed(1)} v=${len(p0.vx, p0.vy).toFixed(2)} ${bs}`)
      }
    }
    render()
    document.title = `boomerangeon t=${tick}`
    document.getElementById('hint')!.textContent = `scripted frame t=${tick} · ${booms.length} boomerangs · ${eventLog.join(' · ') || 'no kills yet'}`
    // headless screenshots only pick up canvas content presented inside an animation frame
    requestAnimationFrame(() => render())
  } catch (err) {
    reportError(err instanceof Error ? `${err.message}\n${err.stack}` : String(err))
  }
} else {
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
    render()
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}
