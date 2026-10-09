/**
 * Character sprites, 14×18, feet on the bottom row. Pure data — built into canvases by
 * render/pixelart.ts. One file per character under ./chars/.
 *
 * Key: . transparent  o outline  P primary  p primary-dark  h primary-light
 *      w white  k pupil  b bone  d bone-dark  c cream  C cream-dark  r red  g grey
 *      T wood-light  t wood  (the boomerang baked into catch frames)
 *
 * `side` frames face RIGHT; the renderer mirrors them for left. `down`/`up` action frames put
 * the arm on the RIGHT and are mirrored when the aim points left. `roll` frames tumble to the
 * right and are mirrored for leftward dashes.
 *
 * Frame meanings (the sim maps its timers onto these indices in demo/main.ts playerSprite):
 *   stand [one idle pose per facing]
 *   run   [a 4-frame cycle per facing, each character's own gait: the slime sloshes along like a
 *          slug, Skully does a shuffling dance, the shroom walks on stubby legs, the frog hops.
 *          `runPeriod` is ticks per frame; `runLift[i]` is how many px frame i is drawn above
 *          the shadow (0 = feet on the ground). `leavesTrail` marks a character that smears the
 *          floor as it goes (the slime).]
 *   throw [release (arm out toward the aim), follow-through]
 *   catch [reach (boomerang about to arrive), clutch (just caught, boomerang in the hands)]
 *   melee [windup, swing, recover]
 *   roll  [tuck, ¼, ½, ¾]  — one tumble over the 8-tick dash, no facing variants
 */
import { FROG } from './chars/frog.ts'
import { SHROOM } from './chars/shroom.ts'
import { SKELETON } from './chars/skully.ts'
import { SLIME } from './chars/slime.ts'

export const CHAR_W = 14
export const CHAR_H = 18

export interface FacingFrames {
  down: string[][]
  side: string[][]
  up: string[][]
}

export interface CharacterArt {
  name: string
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

export const CHARACTERS: CharacterArt[] = [SLIME, SKELETON, SHROOM, FROG]
