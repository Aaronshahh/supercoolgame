/**
 * Character sprites, 14×18, feet on the bottom row. One file per character in chars/.
 * The renderer compiles the pixel grids into coloured and mirrored canvases.
 * Side frames face right; up/down action frames mirror with aim. Roll frames mirror
 * for leftward dashes. Optional frame holds give the three new animals their own gait.
 * See docs/notes-character-motion.md for the original seven-character roster.
 */
import { OCTOPUS } from './chars/octopus.ts'
import { HEDGEHOG } from './chars/hedgehog.ts'
import { FISH } from './chars/fish.ts'
import { FROG } from './chars/frog.ts'
import { SHROOM } from './chars/shroom.ts'
import { SKELETON } from './chars/skully.ts'
import { SLIME } from './chars/slime.ts'

export const CHAR_W = 14
export const CHAR_H = 18

export type Facing = 'down' | 'side' | 'up'

export interface FacingFrames {
  down: string[][]
  side: string[][]
  up: string[][]
}

export interface CharacterArt {
  name: string
  /** A short description shown with the animated character preview. */
  style?: string
  portraitFacing?: Facing
  /** Authored holds in simulation ticks; these only choose drawings, never alter movement. */
  idleTicks?: number[]
  runTicks?: number[]
  throwTicks?: number[]
  /** Run pose that lands with a small dust puff. */
  landingFrame?: number
  stand: FacingFrames
  run: FacingFrames
  runPeriod: number
  runLift: number[]
  leavesTrail?: boolean
  throw: FacingFrames
  catch: FacingFrames
  melee: FacingFrames
  roll: string[][]
}

export const CHARACTERS: CharacterArt[] = [SLIME, SKELETON, SHROOM, FROG, OCTOPUS, HEDGEHOG, FISH]

/** The same character range is used by profile storage, URL shortcuts and multiplayer messages. */
export function characterIndex(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(CHARACTERS.length - 1, Math.round(value))) : 0
}

/** Variable frame holds let a planted foot linger and a snap move quickly. */
export function timedFrame(tick: number, durations: readonly number[], loop = true): number {
  const total = durations.reduce((sum, n) => sum + n, 0)
  let t = loop ? ((tick % total) + total) % total : Math.max(0, Math.min(total - 1, tick))
  for (let i = 0; i < durations.length; i++) {
    if (t < durations[i]) return i
    t -= durations[i]
  }
  return durations.length - 1
}
