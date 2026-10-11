/**
 * Sound events (docs/07 §4–5). The sim says *what* happened and *where*; this file decides what it
 * sounds like: a CC0 recording from `public/sfx/` when one is loaded, with synthesized layers under
 * it (the sub, the transient, the tail the recording lacks), or the impact kit alone otherwise.
 * Every event is panned by its x against the camera, fades with distance, varies in pitch so no two
 * hits are identical. The music continues independently of these events.
 *
 * Continuous sounds (a boomerang's spin, a saw's grind, a cart's rumble) are `loop()` voices the
 * render loop refreshes every frame; one it stops refreshing fades out in `endFrame()`.
 */
import { engine } from './engine.ts'
import { getBuffer, loadBuffers } from './buffers.ts'
import * as S from './synth.ts'

export type SfxName =
  | 'throw'
  | 'catch'
  | 'deflect'
  | 'arm'
  | 'swing'
  | 'dash'
  | 'shove'
  | 'bounce'
  | 'bumper'
  | 'slice'
  | 'burn'
  | 'fall'
  | 'squash'
  | 'blast'
  | 'beep'
  | 'crate'
  | 'barrelLit'
  | 'grass'
  | 'pickupGlow'
  | 'pickupLand'
  | 'pickupTake'
  | 'pickupLost'
  | 'pickupFizzle'
  | 'shieldPop'
  | 'blink'
  | 'ice'
  | 'steam'
  | 'spikes'
  | 'vent'
  | 'gate'
  | 'creak'
  | 'chandelierFall'
  | 'chandelierLand'
  | 'crumble'
  | 'warp'
  | 'spawnDrop'
  | 'spawnLand'
  | 'phantomPop'
  | 'ready'
  | 'win'

export interface Variant {
  /** frequency multiplier from the per-play pitch variation (and the caller's `pitch`) */
  p: number
  rng: () => number
}

export type Synth = (o: S.Out, t: number, v: Variant) => void

interface SfxDef {
  synth: Synth
  gain: number
  /** files under public/sfx/, round-robin, the synth being the fallback until they load */
  samples?: string[]
  sampleGain?: number
  /** synth layers played *with* a recording: the weight and the transient a recording rarely carries */
  under?: Synth
  /** ± semitones of random pitch per play */
  pitchVar?: number
  /** ms before the same event may play again */
  minGap?: number
  /** reverb send 0..1 */
  send?: number
}

const R = Math.random

// ---------------------------------------------------------------- the table
// Each recipe is a stack of layers in the order a hit arrives: transient, body, sub, resonance,
// tail (docs/notes-audio-design.md §5). Short for the frequent events, long only for the rare ones.
const DEFS: Record<SfxName, SfxDef> = {
  // the release: a snap of the wrist, air cut by the blade, a little weight behind it
  throw: {
    gain: 0.55,
    pitchVar: 1.2,
    send: 0.08,
    synth(o, t, v) {
      S.click(o, t, 0.35, 2600 * v.p, 0.005)
      S.whoosh(o, t, 0.14, 500 * v.p, 2600 * v.p, 0.45, 1.4, 0.3)
      S.thump(o, t, 170 * v.p, 90 * v.p, 0.03, 0.25, 0.07)
    },
  },
  // the glove slap, a tick, a thump in the palm and the blade's faint ring
  catch: {
    gain: 0.55,
    pitchVar: 1,
    send: 0.1,
    synth(o, t, v) {
      S.smack(o, t, 0.5, 'lowpass', 1400 * v.p, 350 * v.p, 1, 0.05)
      S.click(o, t, 0.3, 3000 * v.p, 0.004)
      S.thump(o, t, 150 * v.p, 70 * v.p, 0.03, 0.35, 0.09)
      S.modal(o, t + 0.004, 1900 * v.p, S.METAL, 0.06, 0.12)
    },
  },
  // steel on steel: the parry rings, and the redirected flight cuts away. A signature sound: always
  // the same note, so a parry is recognisable from across the room (notes §5), and it dips the music
  deflect: {
    gain: 0.6,
    pitchVar: 0,
    send: 0.3,
    synth(o, t, v) {
      S.click(o, t, 0.5, 4000 * v.p, 0.005)
      S.modal(o, t, 1150 * v.p, S.ANVIL, 0.35, 0.42, 0.6)
      S.smack(o, t, 0.35, 'bandpass', 2500 * v.p, 1200 * v.p, 1, 0.06)
      S.whoosh(o, t + 0.03, 0.2, 1800 * v.p, 600 * v.p, 0.25, 1.2, 0.2)
      S.thump(o, t, 200 * v.p, 80 * v.p, 0.04, 0.3, 0.12)
    },
  },
  // the safety comes off: a heavy latch, a pulse in the floor, a ratchet winding over a charge that
  // builds to a fixed pitch (no variation: arming must be identifiable from anywhere)
  arm: {
    gain: 0.6,
    pitchVar: 0,
    send: 0.25,
    synth(o, t) {
      S.click(o, t, 0.45, 2400, 0.006)
      S.modal(o, t, 420, S.IRON, 0.3, 0.3, 0.4)
      S.sub(o, t + 0.02, 52, 0.5, 0.35)
      S.sweep(o, t + 0.04, 60, 130, 0.32, 0.14, 'sawtooth', 0.05, 0.4)
      for (let i = 0; i < 4; i++) {
        const at = t + 0.09 + i * 0.065
        S.click(o, at, 0.22, 1900 + i * 150, 0.004)
        S.modal(o, at, 1100 + i * 90, S.IRON, 0.07, 0.045, 0.3)
      }
      S.modal(o, t + 0.36, 760, S.IRON, 0.18, 0.12, 0.5)
    },
  },
  // a melee swing: darker, heavier air than the throw, cloth behind it
  swing: {
    gain: 0.45,
    pitchVar: 1.2,
    minGap: 60,
    synth(o, t, v) {
      S.whoosh(o, t, 0.12, 350 * v.p, 1500 * v.p, 0.4, 1, 0.35)
      S.smack(o, t, 0.15, 'lowpass', 600, 200, 1, 0.08)
    },
  },
  // a roll: shoulder, hip and feet meeting the floor in turn, weight on the first, grit on the slide
  dash: {
    gain: 0.45,
    minGap: 80,
    pitchVar: 0.8,
    synth(o, t, v) {
      S.smack(o, t, 0.4, 'lowpass', 900 * v.p, 250 * v.p, 1, 0.07)
      S.thump(o, t, 120, 60, 0.04, 0.3, 0.1)
      S.smack(o, t + 0.045, 0.28, 'lowpass', 750 * v.p, 220 * v.p, 1, 0.06)
      S.smack(o, t + 0.09, 0.2, 'lowpass', 650 * v.p, 200 * v.p, 1, 0.05)
      S.scrape(o, t + 0.1, 0.1, 0.12, 700 * v.p, 4, 20)
    },
  },
  // two bodies meeting: a dull thump and the air leaving one of them
  shove: {
    gain: 0.55,
    pitchVar: 1,
    minGap: 90,
    synth(o, t, v) {
      S.click(o, t, 0.2, 1800, 0.005)
      S.thump(o, t, 140 * v.p, 55 * v.p, 0.06, 0.6, 0.16)
      S.smack(o, t, 0.5, 'lowpass', 1100 * v.p, 200 * v.p, 1, 0.09)
      S.bloom(o, t, 0.18, 0.2, 800, 200, 0.01)
    },
  },
  // hardwood with a steel edge meeting stone: a knock with a ring (a semitone higher per bounce, from the caller)
  bounce: {
    gain: 0.5,
    pitchVar: 0.7,
    minGap: 40,
    send: 0.15,
    synth(o, t, v) {
      S.click(o, t, 0.45, 3200 * v.p, 0.005)
      S.modal(o, t, 760 * v.p, S.WOOD, 0.3, 0.14, 0.4)
      S.modal(o, t, 2100 * v.p, S.METAL, 0.08, 0.1, 0.6)
      S.smack(o, t, 0.25, 'bandpass', 1500 * v.p, 900 * v.p, 1.5, 0.04)
      S.thump(o, t, 220 * v.p, 110 * v.p, 0.02, 0.2, 0.06)
      // the zing of a struck cable, quiet: the boomerang keeps its energy
      S.sweep(o, t + 0.004, 2600 * v.p, 1900 * v.p, 0.08, 0.06, 'sine', 0.002, 0.8)
    },
  },
  // a sprung steel plate: a deep thump, a low resonance and the push back out
  bumper: {
    gain: 0.55,
    pitchVar: 0.8,
    minGap: 60,
    send: 0.2,
    synth(o, t, v) {
      S.thump(o, t, 160 * v.p, 70 * v.p, 0.08, 0.6, 0.22)
      S.modal(o, t, 190 * v.p, [1, 1.5, 2.7], 0.3, 0.3, 0.3)
      S.smack(o, t, 0.3, 'lowpass', 1800 * v.p, 300 * v.p, 1, 0.06)
      S.sweep(o, t, 90 * v.p, 150 * v.p, 0.12, 0.15, 'sine', 0.01, 0.5)
    },
  },
  // the kill, the game's signature: cut, crack, drop. The blade's hiss and a hard edge into a wet
  // body, a bony crack inside it, then the halves hitting the floor 60 ms later with the sub. Dry,
  // close, fixed pitch
  slice: {
    gain: 0.7,
    pitchVar: 0,
    send: 0.15,
    synth(o, t) {
      S.whoosh(o, t, 0.05, 2500, 6000, 0.35, 1.5, 0.2)
      S.click(o, t + 0.015, 0.65, 4500, 0.006)
      S.smack(o, t + 0.015, 0.6, 'lowpass', 1500, 250, 1, 0.08)
      S.debris(o, t + 0.03, 3, 0.025, 0.35, 900, 'wood')
      S.modal(o, t + 0.02, 2600, S.METAL, 0.1, 0.3, 0.7)
      S.thump(o, t + 0.075, 110, 45, 0.05, 0.85, 0.22)
      S.sub(o, t + 0.075, 48, 0.55, 0.3)
      S.smack(o, t + 0.075, 0.35, 'lowpass', 600, 150, 1, 0.1)
      S.bloom(o, t + 0.1, 0.3, 0.2, 900, 150, 0.03)
    },
  },
  // fire takes someone: a whoomp of ignition, a sub, the crackle and the hiss that follow
  burn: {
    gain: 0.65,
    send: 0.3,
    synth(o, t) {
      S.bloom(o, t, 0.45, 0.6, 250, 1800, 0.06)
      S.sub(o, t, 55, 0.45, 0.4)
      S.crackle(o, t + 0.1, 0.7, 0.3, 45, 2500)
      S.hiss(o, t + 0.05, 0.6, 0.15, 3000, 6000, 0.05)
    },
  },
  // a pit: the air going away, the lowpass closing over it, a thread of cold air from below, and
  // then no landing. The missing thump is the point (notes §5); the music barely dips
  fall: {
    gain: 0.6,
    pitchVar: 0.5,
    send: 0.5,
    synth(o, t, v) {
      S.whoosh(o, t, 0.5, 1400 * v.p, 180 * v.p, 0.45, 1.2, 0.12)
      S.smack(o, t, 0.15, 'highpass', 2000, 2000, 0.7, 0.05)
      S.rumble(o, t, 0.45, 0.15, 200, 10)
      S.hiss(o, t + 0.2, 0.6, 0.05, 250, 120, 0.2)
    },
  },
  // crushed: the biggest body in the kit, the crusher's own ring and the debris it sends up
  squash: {
    gain: 0.7,
    pitchVar: 0.6,
    send: 0.3,
    synth(o, t, v) {
      S.click(o, t, 0.5, 2500 * v.p, 0.006)
      S.debris(o, t + 0.004, 4, 0.04, 0.35, 700, 'wood')
      S.thump(o, t, 170 * v.p, 40 * v.p, 0.08, 0.9, 0.3)
      S.sub(o, t, 42, 0.6, 0.45)
      S.smack(o, t, 0.6, 'lowpass', 1300 * v.p, 180 * v.p, 1, 0.12)
      S.modal(o, t, 300 * v.p, S.METAL, 0.25, 0.4, 0.4)
      S.debris(o, t + 0.08, 8, 0.5, 0.2, 1200, 'stone')
      S.bloom(o, t + 0.04, 0.5, 0.3, 700, 120, 0.03)
    },
  },
  // the bomb: a crack, a sub that keeps falling, a pressure bloom through saturation, debris, a rumble
  blast: {
    gain: 0.75,
    send: 0.5,
    synth(o, t) {
      const d = S.drive(o, 2.5, 'soft', 0.8)
      S.click(o, t, 0.7, 3000, 0.008)
      S.thump(d, t, 140, 22, 0.5, 1, 1.1)
      S.sub(o, t, 30, 0.7, 0.9)
      S.bloom(d, t, 0.9, 0.8, 3500, 90, 0.012)
      S.debris(o, t + 0.15, 12, 0.9, 0.25, 1500, 'stone')
      S.crackle(o, t + 0.2, 0.6, 0.12, 25, 1800)
      S.rumble(o, t + 0.1, 1.2, 0.3, 120, 8)
    },
  },
  // the bomb's warning: a struck steel bar, damped at once, with a hard edge; the second a major
  // third higher (from the caller). Each beep dips the music, and the second's dip holds until the
  // blast: the held breath before it (notes §5)
  beep: {
    gain: 0.45,
    send: 0.1,
    synth(o, t, v) {
      S.click(o, t, 0.3, 4000, 0.003)
      S.modal(o, t, 1320 * v.p, [1, 2.76, 5.4], 0.35, 0.09, 0.6)
      S.pip(o, t, 1320 * v.p, 0.05, 0.12)
    },
  },
  // a crate breaking: the box's own knock, splintering, the pieces landing
  crate: {
    gain: 0.65,
    pitchVar: 1,
    send: 0.2,
    synth(o, t, v) {
      S.click(o, t, 0.4, 2200 * v.p, 0.006)
      S.modal(o, t, 210 * v.p, S.WOOD, 0.5, 0.22, 0.4)
      S.thump(o, t, 130 * v.p, 60 * v.p, 0.04, 0.45, 0.14)
      S.crackle(o, t + 0.01, 0.18, 0.35, 70, 2200)
      S.debris(o, t + 0.06, 7, 0.45, 0.25, 1600, 'wood')
      S.bloom(o, t + 0.02, 0.3, 0.15, 600, 150, 0.02)
    },
  },
  // a fuse lit: the strike, the flare, the hiss settling in
  barrelLit: {
    gain: 0.5,
    pitchVar: 0.8,
    synth(o, t, v) {
      S.click(o, t, 0.2, 1500, 0.005)
      S.scrape(o, t, 0.08, 0.4, 2800 * v.p, 3, 80)
      S.crackle(o, t + 0.06, 0.25, 0.25, 60, 3500)
      S.hiss(o, t + 0.08, 0.4, 0.2, 2500, 5000, 0.03)
    },
  },
  // grass cut: a swish and the stalks going down
  grass: {
    gain: 0.45,
    pitchVar: 1.5,
    minGap: 40,
    synth(o, t, v) {
      S.whoosh(o, t, 0.09, 1800 * v.p, 3500 * v.p, 0.35, 1, 0.3)
      S.crackle(o, t + 0.02, 0.12, 0.15, 50, 4000)
      S.smack(o, t + 0.01, 0.15, 'bandpass', 900 * v.p, 500 * v.p, 1, 0.08)
    },
  },
  // something is coming: a low swell and a shimmer of air over it
  pickupGlow: {
    gain: 0.4,
    send: 0.5,
    synth(o, t) {
      S.tone(o, t, 82, 1.2, 0.25, 'sine', 0.5, 0.5)
      S.tone(o, t, 123, 1.2, 0.08, 'sine', 0.6, 0.5)
      S.hiss(o, t, 1.1, 0.08, 2000, 6000, 0.5)
    },
  },
  // the item lands: metal on stone, with a little scatter
  pickupLand: {
    gain: 0.55,
    pitchVar: 0.8,
    send: 0.3,
    synth(o, t, v) {
      S.click(o, t, 0.4, 2800 * v.p, 0.005)
      S.thump(o, t, 140 * v.p, 60 * v.p, 0.04, 0.4, 0.14)
      S.modal(o, t, 640 * v.p, S.METAL, 0.3, 0.4, 0.5)
      S.debris(o, t + 0.05, 4, 0.3, 0.15, 1800, 'metal')
    },
  },
  // taken: snapped up, a hard chime, weight under it
  pickupTake: {
    gain: 0.55,
    pitchVar: 0.6,
    send: 0.3,
    synth(o, t, v) {
      S.click(o, t, 0.4, 3500, 0.004)
      S.sweep(o, t, 300 * v.p, 1200 * v.p, 0.09, 0.2, 'triangle', 0.005, 0.5)
      S.modal(o, t + 0.03, 1320 * v.p, S.BELL, 0.22, 0.35, 0.5)
      S.sub(o, t, 60, 0.35, 0.2)
    },
  },
  // lost: the same thing in reverse, muffled
  pickupLost: {
    gain: 0.5,
    pitchVar: 0.6,
    synth(o, t, v) {
      S.sweep(o, t, 900 * v.p, 250 * v.p, 0.25, 0.15, 'triangle', 0.01, 0.6)
      S.smack(o, t + 0.2, 0.3, 'lowpass', 500, 120, 1, 0.12)
    },
  },
  // unclaimed: a short electrical fizz dying out
  pickupFizzle: {
    gain: 0.45,
    pitchVar: 1,
    synth(o, t, v) {
      S.crackle(o, t, 0.35, 0.3, 120, 3200 * v.p)
      S.sweep(o, t, 400 * v.p, 120 * v.p, 0.35, 0.08, 'sawtooth', 0.01, 0.7)
    },
  },
  // a shield taking the hit: the kill's transient with the wet layers taken out and glass put in
  // their place, so the ear hears "that landed, and it did not count". Fixed pitch, dips the music
  shieldPop: {
    gain: 0.6,
    pitchVar: 0,
    send: 0.3,
    synth(o, t) {
      S.click(o, t, 0.6, 4200, 0.005)
      S.shatter(o, t, 0.35, 7, 2600)
      S.smack(o, t, 0.4, 'bandpass', 1800, 700, 1.2, 0.07)
      S.thump(o, t, 130, 60, 0.04, 0.4, 0.12)
      S.sub(o, t, 75, 0.35, 0.1)
    },
  },
  // blink: a pull of air, then the snap of arriving
  blink: {
    gain: 0.55,
    pitchVar: 0.8,
    send: 0.25,
    synth(o, t, v) {
      S.inhale(o, t, 0.06, 0.35, 400 * v.p, 6000 * v.p)
      S.click(o, t + 0.06, 0.4, 3000, 0.005)
      S.thump(o, t + 0.06, 160, 70, 0.03, 0.3, 0.1)
      S.sweep(o, t + 0.06, 2200 * v.p, 300 * v.p, 0.12, 0.1, 'sine', 0.002, 0.7)
    },
  },
  // ice forming: cracks running, a crystalline ring
  ice: {
    gain: 0.45,
    pitchVar: 1,
    synth(o, t, v) {
      S.crackle(o, t, 0.3, 0.3, 60, 4500)
      S.modal(o, t + 0.02, 2400 * v.p, S.GLASS, 0.12, 0.4, 0.6)
      S.hiss(o, t, 0.25, 0.08, 5000, 9000, 0.02)
    },
  },
  // steam: a burst of it
  steam: {
    gain: 0.5,
    pitchVar: 0.8,
    synth(o, t, v) {
      S.hiss(o, t, 0.45, 0.5, 2500 * v.p, 1200 * v.p, 0.01)
      S.bloom(o, t, 0.2, 0.2, 1500, 400, 0.005)
    },
  },
  // spikes coming up: steel in a stone slot
  spikes: {
    gain: 0.5,
    pitchVar: 1,
    synth(o, t, v) {
      S.click(o, t, 0.5, 3500 * v.p, 0.005)
      S.modal(o, t, 1600 * v.p, S.METAL, 0.3, 0.25, 0.5)
      S.scrape(o, t, 0.07, 0.25, 1400 * v.p, 5, 60)
      S.thump(o, t, 180 * v.p, 90 * v.p, 0.03, 0.25, 0.08)
    },
  },
  // a fire vent lighting: whoomp and gas
  vent: {
    gain: 0.55,
    pitchVar: 0.6,
    synth(o, t) {
      S.bloom(o, t, 0.35, 0.55, 200, 2200, 0.04)
      S.hiss(o, t + 0.04, 0.4, 0.2, 2500, 4500, 0.05)
      S.sub(o, t, 58, 0.3, 0.25)
    },
  },
  // an iron gate slamming home: big iron, a thump, the chain rattling after
  gate: {
    gain: 0.6,
    pitchVar: 0.6,
    send: 0.35,
    synth(o, t, v) {
      S.click(o, t, 0.4, 2000 * v.p, 0.006)
      S.modal(o, t, 165 * v.p, S.IRON, 0.5, 0.7, 0.6)
      S.thump(o, t, 110 * v.p, 50 * v.p, 0.06, 0.6, 0.25)
      S.rattle(o, t + 0.05, 6, 0.3, 0.2, 1600)
      S.bloom(o, t + 0.02, 0.3, 0.2, 500, 120, 0.02)
    },
  },
  // a chandelier's rope taking strain
  creak: {
    gain: 0.45,
    pitchVar: 1.5,
    synth(o, t, v) {
      S.scrape(o, t, 0.45, 0.3, 320 * v.p, 8, 80)
      S.rumble(o, t, 0.4, 0.12, 120, 6)
    },
  },
  // the chain lets go: links rattling, air moving
  chandelierFall: {
    gain: 0.55,
    synth(o, t) {
      S.rattle(o, t, 14, 0.35, 0.35, 2200)
      S.whoosh(o, t, 0.3, 900, 300, 0.3, 1, 0.5)
    },
  },
  // the chandelier lands: iron, glass, dust and the room shaking
  chandelierLand: {
    gain: 0.7,
    pitchVar: 0.5,
    send: 0.4,
    synth(o, t, v) {
      S.click(o, t, 0.6, 3000, 0.007)
      S.thump(o, t, 150, 35, 0.1, 0.9, 0.4)
      S.sub(o, t, 40, 0.5, 0.5)
      S.modal(o, t, 420 * v.p, S.METAL, 0.45, 0.8, 0.5)
      S.shatter(o, t + 0.01, 0.4, 10, 3000)
      S.debris(o, t + 0.1, 10, 0.8, 0.25, 2200, 'glass')
      S.bloom(o, t + 0.03, 0.6, 0.3, 800, 120, 0.03)
    },
  },
  // floor giving way: stone grinding, falling, landing below
  crumble: {
    gain: 0.55,
    pitchVar: 0.8,
    synth(o, t) {
      S.rumble(o, t, 0.4, 0.4, 220, 14)
      S.debris(o, t + 0.02, 9, 0.45, 0.35, 900, 'stone')
      S.thump(o, t + 0.05, 90, 40, 0.1, 0.4, 0.3)
      S.bloom(o, t + 0.1, 0.4, 0.25, 500, 100, 0.05)
    },
  },
  // a portal: a snap of displaced air with a falling electric tail
  warp: {
    gain: 0.5,
    pitchVar: 0.8,
    send: 0.3,
    synth(o, t, v) {
      S.click(o, t, 0.3, 2500, 0.004)
      S.sweep(o, t, 2400 * v.p, 200 * v.p, 0.18, 0.25, 'sine', 0.002, 0.7)
      S.bloom(o, t, 0.15, 0.2, 2000, 400, 0.005)
      S.sub(o, t, 70, 0.3, 0.12)
    },
  },
  // a body falling in from above: air, getting louder as it comes
  spawnDrop: {
    gain: 0.45,
    synth(o, t) {
      S.whoosh(o, t, 0.28, 500, 1800, 0.3, 1, 0.8)
    },
  },
  // and landing
  spawnLand: {
    gain: 0.6,
    pitchVar: 0.6,
    synth(o, t, v) {
      S.click(o, t, 0.2, 2000, 0.005)
      S.thump(o, t, 150 * v.p, 55 * v.p, 0.05, 0.7, 0.18)
      S.smack(o, t, 0.4, 'lowpass', 1000 * v.p, 200 * v.p, 1, 0.08)
      S.bloom(o, t + 0.02, 0.25, 0.2, 600, 150, 0.02)
    },
  },
  // a phantom boomerang winking out: a small airy pop
  phantomPop: {
    gain: 0.45,
    pitchVar: 1.5,
    synth(o, t, v) {
      S.click(o, t, 0.3, 2800 * v.p, 0.004)
      S.smack(o, t, 0.3, 'bandpass', 1400 * v.p, 700 * v.p, 1.5, 0.05)
      S.sub(o, t, 90, 0.15, 0.1)
    },
  },
  // round start (hook, docs/07 §9): one heavy hit in the room
  ready: {
    gain: 0.7,
    send: 0.5,
    synth(o, t) {
      S.click(o, t, 0.5, 2500, 0.007)
      S.thump(o, t, 120, 40, 0.1, 0.9, 0.5)
      S.sub(o, t, 41, 0.6, 0.6)
      S.modal(o, t, 220, S.METAL, 0.4, 1, 0.6)
      S.bloom(o, t, 0.8, 0.4, 2500, 150, 0.01)
    },
  },
  // round won (hook): the hit, then a fifth swelling out of it
  win: {
    gain: 0.7,
    send: 0.6,
    synth(o, t) {
      S.click(o, t, 0.5, 2500, 0.007)
      S.thump(o, t, 120, 40, 0.1, 0.9, 0.6)
      S.sub(o, t, 41, 0.6, 0.7)
      S.modal(o, t, 330, S.BELL, 0.3, 1.4, 0.5)
      S.tone(o, t + 0.1, 110, 1.4, 0.12, 'triangle', 0.4, 0.5)
      S.tone(o, t + 0.1, 165, 1.4, 0.1, 'triangle', 0.5, 0.5, 4)
      S.bloom(o, t, 1, 0.3, 2500, 150, 0.01)
    },
  },
}

// ---------------------------------------------------------------- listener, pan, distance
let listenerX = 0
let halfView = 320
/** Full volume within the view; gone this far past its edge. */
const FADE_PAST_VIEW = 260

export function setListener(centerX: number, viewW: number) {
  listenerX = centerX
  halfView = viewW / 2
}

function attenuation(x: number | undefined): number {
  if (x === undefined) return 1
  const d = Math.abs(x - listenerX) - halfView
  if (d <= 0) return 1
  return Math.max(0, 1 - d / FADE_PAST_VIEW)
}

function panOf(x: number | undefined): number {
  if (x === undefined) return 0
  return Math.max(-1, Math.min(1, (x - listenerX) / halfView)) * 0.75
}

function chain(x: number | undefined, gain: number, send: number): S.Out | null {
  const ac = engine.ctx
  if (!ac || !engine.running) return null
  const att = attenuation(x)
  if (att <= 0.01) return null
  const g = ac.createGain()
  g.gain.value = gain * att
  const p = ac.createStereoPanner()
  p.pan.value = panOf(x)
  g.connect(p).connect(engine.sfx)
  if (send > 0) {
    const s = ac.createGain()
    s.gain.value = send * att
    p.connect(s).connect(engine.verbIn)
  }
  return { ctx: ac, dest: g }
}

// ---------------------------------------------------------------- samples
const lastTake = new Map<SfxName, number>()
const lastAt = new Map<SfxName, number>()

/** Fetch and decode every recording the effects name. Called once the context is running; failures just leave the synth in charge. */
export function loadSamples(): void {
  const names = new Set<string>()
  for (const d of Object.values(DEFS)) for (const s of d.samples ?? []) names.add(s)
  loadBuffers(names)
}

/**
 * Point an event at recordings (samples.ts does this so the table above stays about recipes).
 * `under` is a synth layer that plays alongside the recording: the sub and the transient most
 * recordings lack. Without it the recording replaces the synth entirely.
 */
export function assignSamples(name: SfxName, files: string[], gain = 1, under?: Synth): void {
  DEFS[name].samples = files
  DEFS[name].sampleGain = gain
  DEFS[name].under = under
}

// ---------------------------------------------------------------- play

export interface PlayOpts {
  /** frequency multiplier on top of the random variation (a semitone per wall bounce) */
  pitch?: number
  gain?: number
  /** seconds from now */
  delay?: number
}

/** Play `name` at world x (undefined: centred, full volume). Silent before the first gesture. */
export function sfx(name: SfxName, x?: number, opts: PlayOpts = {}): void {
  const def = DEFS[name]
  const ac = engine.ctx
  if (!ac || !engine.running) return
  const nowMs = performance.now()
  const gap = def.minGap ?? 35
  const last = lastAt.get(name) ?? -1e9
  if (nowMs - last < gap) return
  lastAt.set(name, nowMs)
  const o = chain(x, def.gain * (opts.gain ?? 1), def.send ?? 0)
  if (!o) return
  const t = ac.currentTime + 0.005 + (opts.delay ?? 0)
  const semis = (R() * 2 - 1) * (def.pitchVar ?? 0)
  const p = Math.pow(2, semis / 12) * (opts.pitch ?? 1)

  const files = def.samples
  if (files && files.length) {
    // round-robin that never repeats the last take
    let i = Math.floor(R() * files.length)
    const prev = lastTake.get(name)
    if (files.length > 1 && i === prev) i = (i + 1) % files.length
    const buf = getBuffer(files[i])
    if (buf) {
      lastTake.set(name, i)
      const src = ac.createBufferSource()
      src.buffer = buf
      src.playbackRate.value = p
      const g = ac.createGain()
      g.gain.value = def.sampleGain ?? 1
      src.connect(g).connect(o.dest)
      src.start(t)
      if (def.under) def.under(o, t, { p, rng: R })
      return
    }
  }
  def.synth(o, t, { p, rng: R })
}

// ---------------------------------------------------------------- loops

export type LoopName = 'flight' | 'hover' | 'saw' | 'cart' | 'boulder' | 'pendulum' | 'fuse'

interface LoopVoice {
  name: LoopName
  gain: GainNode
  pan: StereoPannerNode
  set: (param: number) => void
  stop: () => void
  seen: number
  base: number
}

const loops = new Map<string, LoopVoice>()
let frame = 0

function makeLoop(name: LoopName, ac: AudioContext, dest: AudioNode): Omit<LoopVoice, 'seen' | 'gain' | 'pan'> & { gain: GainNode; pan: StereoPannerNode } {
  const gain = ac.createGain()
  gain.gain.value = 0
  const pan = ac.createStereoPanner()
  gain.connect(pan).connect(dest)
  const stops: (() => void)[] = []
  const t = ac.currentTime
  const srcNoise = () => {
    const s = ac.createBufferSource()
    s.buffer = S.noiseBuffer(ac)
    s.loop = true
    s.start(t, R() * 1.5)
    stops.push(() => s.stop())
    return s
  }
  const oscN = (type: OscillatorType, f: number) => {
    const o = ac.createOscillator()
    o.type = type
    o.frequency.value = f
    o.start(t)
    stops.push(() => o.stop())
    return o
  }
  let set: (param: number) => void = () => {}
  let base = 0.3
  switch (name) {
    case 'flight': {
      // a blade spinning: band-passed air chopped by the rotation (param 0..1 is speed), and the
      // low whir of its weight going round under it
      const n = srcNoise()
      const bp = ac.createBiquadFilter()
      bp.type = 'bandpass'
      bp.Q.value = 2
      bp.frequency.value = 1000
      const am = ac.createGain()
      am.gain.value = 0.5
      const lfo = oscN('sine', 13)
      const depth = ac.createGain()
      depth.gain.value = 0.5
      lfo.connect(depth).connect(am.gain)
      n.connect(bp).connect(am).connect(gain)
      const n2 = srcNoise()
      const lp = ac.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 320
      const am2 = ac.createGain()
      am2.gain.value = 0.35
      const depth2 = ac.createGain()
      depth2.gain.value = 0.3
      lfo.connect(depth2).connect(am2.gain)
      n2.connect(lp).connect(am2).connect(gain)
      // param is signed speed: positive going out, negative coming home. The Doppler is deliberate
      // and backwards from physics (Burtt moved the mic, we move the filter): higher and brighter
      // leaving the hand, lower and darker returning, so the ear hears effort then weight
      set = (sp) => {
        const s = Math.abs(sp)
        const dop = sp >= 0 ? 1 + 0.1 * s : 1 - 0.12 * s
        lfo.frequency.setTargetAtTime((9 + 12 * s) * dop, ac.currentTime, 0.05)
        bp.frequency.setTargetAtTime((700 + 900 * s) * dop, ac.currentTime, 0.05)
        lp.frequency.setTargetAtTime(320 * dop, ac.currentTime, 0.05)
        am.gain.setTargetAtTime(0.3 + 0.3 * s, ac.currentTime, 0.05)
      }
      base = 0.3
      break
    }
    case 'hover': {
      // held in the air: a low drone a fifth apart, trembling, with a thin shimmer of air above
      const a = oscN('sine', 55)
      const b = oscN('sine', 82.5)
      const trem = ac.createGain()
      trem.gain.value = 0.7
      const lfo = oscN('sine', 6)
      const depth = ac.createGain()
      depth.gain.value = 0.3
      lfo.connect(depth).connect(trem.gain)
      const gb = ac.createGain()
      gb.gain.value = 0.5
      a.connect(trem)
      b.connect(gb).connect(trem)
      trem.connect(gain)
      const n = srcNoise()
      const bp = ac.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 3200
      bp.Q.value = 4
      const ng = ac.createGain()
      ng.gain.value = 0.08
      n.connect(bp).connect(ng).connect(trem)
      base = 0.12
      break
    }
    case 'saw': {
      // an industrial blade: detuned saws pushed into saturation, the teeth as a 31 Hz chop, grit on top
      const a = oscN('sawtooth', 96)
      const b = oscN('sawtooth', 193)
      const dist = ac.createWaveShaper()
      const c = new Float32Array(1024)
      for (let i = 0; i < 1024; i++) c[i] = Math.tanh(((i / 1023) * 2 - 1) * 3)
      dist.curve = c
      const bp = ac.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 1300
      bp.Q.value = 2
      const am = ac.createGain()
      am.gain.value = 0.6
      const lfo = oscN('square', 31)
      const depth = ac.createGain()
      depth.gain.value = 0.4
      lfo.connect(depth).connect(am.gain)
      a.connect(dist)
      b.connect(dist)
      dist.connect(bp).connect(am).connect(gain)
      const n = srcNoise()
      const hp = ac.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 3500
      const ng = ac.createGain()
      ng.gain.value = 0.08
      n.connect(hp).connect(ng).connect(am)
      base = 0.22
      break
    }
    case 'cart':
    case 'boulder': {
      // rumble: low noise clattering at 18 Hz (cart) or 11 Hz (boulder) with a hum underneath
      const n = srcNoise()
      const lp = ac.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = name === 'cart' ? 420 : 260
      const am = ac.createGain()
      am.gain.value = 0.6
      const lfo = oscN('sine', name === 'cart' ? 18 : 11)
      const depth = ac.createGain()
      depth.gain.value = 0.4
      lfo.connect(depth).connect(am.gain)
      n.connect(lp).connect(am).connect(gain)
      const hum = oscN('triangle', name === 'cart' ? 70 : 48)
      const hg = ac.createGain()
      hg.gain.value = 0.25
      hum.connect(hg).connect(gain)
      if (name === 'cart') {
        // wheels over rail joints: a sharp metallic click three times a second
        const cl = srcNoise()
        const cf = ac.createBiquadFilter()
        cf.type = 'bandpass'
        cf.frequency.value = 2600
        cf.Q.value = 5
        const cg = ac.createGain()
        cg.gain.value = 0
        const ramp = oscN('sawtooth', 3.3)
        const gateShape = ac.createWaveShaper()
        const gc = new Float32Array(256)
        for (let i = 0; i < 256; i++) gc[i] = i > 244 ? 0.5 : 0
        gateShape.curve = gc
        ramp.connect(gateShape).connect(cg.gain)
        cl.connect(cf).connect(cg).connect(gain)
      }
      base = 0.3
      break
    }
    case 'pendulum': {
      // a mass swinging: air that is loudest and highest at the bottom of the arc (param 0..1 is
      // where along it the blade is), and the pivot's low complaint
      const n = srcNoise()
      const bp = ac.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 500
      bp.Q.value = 1.2
      const ag = ac.createGain()
      ag.gain.value = 0.4
      n.connect(bp).connect(ag).connect(gain)
      const n2 = srcNoise()
      const piv = ac.createBiquadFilter()
      piv.type = 'bandpass'
      piv.frequency.value = 180
      piv.Q.value = 12
      const pg = ac.createGain()
      pg.gain.value = 0.25
      n2.connect(piv).connect(pg).connect(gain)
      set = (u) => {
        const s = Math.sin(u * Math.PI)
        bp.frequency.setTargetAtTime(350 + 900 * s, ac.currentTime, 0.04)
        ag.gain.setTargetAtTime(0.12 + 0.5 * s, ac.currentTime, 0.04)
        piv.frequency.setTargetAtTime(150 + 60 * (1 - s), ac.currentTime, 0.06)
      }
      base = 0.14
      break
    }
    case 'fuse': {
      // a fuse burning: a hiss with sparks, the sparks an irregular chop of brighter noise
      const n = srcNoise()
      const bp = ac.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 4500
      bp.Q.value = 0.8
      const hg = ac.createGain()
      hg.gain.value = 0.35
      n.connect(bp).connect(hg).connect(gain)
      const sp = srcNoise()
      const hp = ac.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 8000
      const am = ac.createGain()
      am.gain.value = 0.3
      const lfo = oscN('square', 37)
      const lfo2 = oscN('sine', 5.3)
      const depth = ac.createGain()
      depth.gain.value = 0.3
      const depth2 = ac.createGain()
      depth2.gain.value = 0.15
      lfo.connect(depth).connect(am.gain)
      lfo2.connect(depth2).connect(am.gain)
      sp.connect(hp).connect(am).connect(gain)
      base = 0.14
      break
    }
  }
  return {
    name,
    gain,
    pan,
    base,
    set,
    stop: () => {
      for (const s of stops) {
        try {
          s()
        } catch {
          /* already stopped */
        }
      }
      pan.disconnect()
    },
  }
}

/**
 * Keep a continuous sound alive this frame at world x. `key` identifies the thing making it (one
 * voice per boomerang, per saw). `param` is the recipe's knob (flight: speed −1..1, negative on the
 * way back; pendulum: where along the arc, 0..1).
 */
export function loop(key: string, name: LoopName, x: number, param = 0, gain = 1): void {
  const ac = engine.ctx
  if (!ac || !engine.running) return
  const att = attenuation(x)
  let v = loops.get(key)
  if (v && v.name !== name) {
    // The same boomerang changes from air to hover to air. Fade the old recipe out.
    v.gain.gain.setTargetAtTime(0, ac.currentTime, 0.012)
    window.setTimeout(v.stop, 120)
    loops.delete(key)
    v = undefined
  }
  if (!v) {
    if (att <= 0.01) return
    const made = makeLoop(name, ac, engine.sfx)
    v = { ...made, seen: frame }
    loops.set(key, v)
  }
  v.seen = frame
  v.gain.gain.setTargetAtTime(v.base * att * gain, ac.currentTime, 0.04)
  v.pan.pan.setTargetAtTime(panOf(x), ac.currentTime, 0.05)
  v.set(param)
}

/** Call once per rendered frame after the loop() calls: voices nobody refreshed fade out and stop. */
export function endFrame(): void {
  const ac = engine.ctx
  if (!ac) return
  for (const [key, v] of loops) {
    if (v.seen === frame) continue
    loops.delete(key)
    // two ticks: a catch should stop the air dead, the silence after the slap is the reward
    v.gain.gain.setTargetAtTime(0, ac.currentTime, 0.012)
    window.setTimeout(v.stop, 120)
  }
  frame++
}

/** Everything continuous stops now (a room change). */
export function stopLoops(): void {
  const ac = engine.ctx
  for (const [key, v] of loops) {
    loops.delete(key)
    if (ac) v.gain.gain.setTargetAtTime(0, ac.currentTime, 0.02)
    window.setTimeout(v.stop, 120)
  }
}
