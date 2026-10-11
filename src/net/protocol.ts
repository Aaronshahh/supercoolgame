/**
 * What goes over the wire (docs/05 §3, §5). Guests talk only to the host; the host talks to everyone.
 * Messages are JSON tuples with a one-letter tag for the per-tick traffic and a word for the rest.
 */

/** Bump for wire or simulation changes; mixed rules would desync the same inputs. */
export const PROTOCOL_VERSION = 6

/** One player's input for one tick. The sim (demo/main.ts) uses this shape directly. */
export interface Input {
  mx: number
  my: number
  throw: boolean
  melee: boolean
  dash: boolean
  /** throw button currently down: a new hold during flight stops the boomerang */
  hold: boolean
  cursorX: number
  cursorY: number
}

/** [mx, my, flags, cursorX, cursorY]; mx/my to two decimals, cursor to whole pixels */
export type PackedInput = [number, number, number, number, number]

export const NEUTRAL: PackedInput = [0, 0, 0, 0, 0]

export function packInput(i: Input): PackedInput {
  const flags = (i.throw ? 1 : 0) | (i.melee ? 2 : 0) | (i.dash ? 4 : 0) | (i.hold ? 8 : 0)
  return [Math.round(i.mx * 100) / 100, Math.round(i.my * 100) / 100, flags, Math.round(i.cursorX), Math.round(i.cursorY)]
}

export function unpackInput(p: PackedInput): Input {
  return { mx: p[0], my: p[1], throw: (p[2] & 1) !== 0, melee: (p[2] & 2) !== 0, dash: (p[2] & 4) !== 0, hold: (p[2] & 8) !== 0, cursorX: p[3], cursorY: p[4] }
}

export type Team = 0 | 1
export type MatchKind = 'ffa' | 'teams'

export interface LobbyPlayer {
  /** 0 is the host; slots are the sim's player ids and the HUD order */
  slot: number
  name: string
  char: number
  /** index into PLAYER_COLORS; the slot, unless two players would clash */
  color: number
  host: boolean
  team: Team
}

export type RoomOrder = 'cycle' | 'stay'

export interface LobbySettings {
  gameMode: MatchKind
  /** first to this many round wins (docs/01 §10: 3/5/7/10) */
  target: number
  /** lives per player each round: 3, 5 or 7 */
  lives: number
  rooms: RoomOrder
  /** AI opponents added after the humans, 0..3 */
  bots: number
  /** lockstep input delay in ticks (docs/05 §4) */
  delay: number
  /** roster key of the first room */
  arena: string
}

export interface LobbyView {
  players: LobbyPlayer[]
  settings: LobbySettings
  /** the recipient's own slot (filled in per connection by the host) */
  you: number
}

export interface StartMsg {
  seed: number
  players: LobbyPlayer[]
  settings: LobbySettings
}

/** Everyone's inputs for one tick, indexed by slot (bots and gone players are null), plus any host commands. */
export interface Bundle {
  inputs: (PackedInput | null)[]
  cmds?: string[]
}

// guest → host
export type GuestMsg =
  | ['hello', { name: string; char: number; ver: number }]
  | ['set', { name?: string; char?: number; team?: Team }]
  | ['i', number, PackedInput]
  | ['h', number, number]
  | ['w'] // wake background peers while a visible player is waiting for inputs

// host → guest
export type HostMsg =
  | ['lobby', LobbyView]
  | ['bye', string]
  | ['start', StartMsg]
  | ['b', number, (PackedInput | null)[], string[]?]
  | ['d', number]
  | ['w']

export const LIVES = [3, 5, 7]
export function roundLives(value: number): number {
  return LIVES.includes(value) ? value : 3
}

export const TARGETS = [3, 5, 7, 10]
export const DELAYS = [2, 3, 4, 5, 6, 8]
export const MAX_PLAYERS = 6
