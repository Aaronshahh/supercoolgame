/**
 * Which recordings play for which event and which drum (docs/07 §5, provenance in
 * docs/audio-credits.md). The files are the output of scripts/fetch-sfx.sh: CC0 recordings of real
 * things, cut to single takes. The method is the old foley trick: an object with the right *shape* of
 * sound stands in for the thing on screen (a whip crack is the throw, a ball into a leather glove is
 * the catch, a melon is the body, a gun cocking is the bomb arming). Every recording plays over an
 * `under` layer from the impact kit (src/audio/synth.ts) that supplies what a close recording seldom
 * carries: the sub, the first millisecond, the ring of the material, the air moving afterwards.
 * Where an event has several takes they rotate so no two hits are alike. Events not listed here stay
 * fully synthesized (beep, and all the loops).
 */
import { assignSamples, type Synth } from './sfx.ts'
import * as S from './synth.ts'

const layers =
  (...ls: Synth[]): Synth =>
  (o, t, v) => {
    for (const l of ls) l(o, t, v)
  }
/** a thump that follows the take's pitch: the weight behind the hit */
const weight =
  (f0: number, f1: number, gain: number, decay: number): Synth =>
  (o, t, v) =>
    S.thump(o, t, f0 * v.p, f1 * v.p, 0.03, gain, decay)
/** a fixed sine under everything: the floor, always in the same place */
const floor =
  (f: number, gain: number, decay: number): Synth =>
  (o, t) =>
    S.sub(o, t, f, gain, decay)
/** the first millisecond, which both the microphone and the encoder soften */
const edge =
  (gain: number, f: number): Synth =>
  (o, t, v) =>
    S.click(o, t, gain, f * v.p, 0.004)
/** the ring of the material struck; `fixed` ignores the take's pitch (a signature note) */
const ring =
  (f: number, ratios: number[], gain: number, decay: number, fixed = false): Synth =>
  (o, t, v) =>
    S.modal(o, t + 0.003, fixed ? f : f * v.p, ratios, gain, decay)
/** the air moving after the hit */
const air =
  (dur: number, gain: number, f0: number, f1: number): Synth =>
  (o, t) =>
    S.bloom(o, t + 0.01, dur, gain, f0, f1)

// --- the boomerang ------------------------------------------------------------------------------
// the release is a whip crack / a bullwhip swung / a bowstring let go, with the arm's weight under it
assignSamples('throw', ['throw1', 'throw2', 'throw3'], 0.9, weight(170, 90, 0.25, 0.07))
// a staff or stick swung, with a body behind it
assignSamples('swing', ['swing1', 'swing2', 'swing3'], 0.8, (o, t, v) => S.smack(o, t + 0.02, 0.25, 'lowpass', 900 * v.p, 300 * v.p, 1, 0.06))
// a ball into a leather glove, a glove slap; the blade's faint ring says it is the boomerang
assignSamples('catch', ['catch1', 'catch2', 'catch3'], 1, layers(edge(0.2, 3000), weight(150, 70, 0.35, 0.09), ring(1900, S.METAL, 0.05, 0.12)))
// the parry: real steel on steel over a fixed anvil note (the signature) and the redirected flight
assignSamples(
  'deflect',
  ['deflect1', 'deflect2'],
  1,
  layers(edge(0.3, 4000), ring(1150, S.ANVIL, 0.25, 0.35, true), weight(120, 60, 0.3, 0.1), (o, t) => S.whoosh(o, t + 0.02, 0.12, 1800, 400, 0.25, 1.2, 0.3)),
)
// the bomb arming is a gun being cocked (one take, so it is always recognisable), with a sub that
// settles in and a rising saw that says "live"
assignSamples('arm', ['arm'], 1, (o, t) => {
  S.sub(o, t, 52, 0.4, 0.3)
  S.modal(o, t + 0.003, 420, S.IRON, 0.18, 0.25)
  S.sweep(o, t + 0.05, 60, 130, 0.5, 0.12, 'sawtooth', 0.02, 0.3)
  S.modal(o, t + 0.4, 760, S.IRON, 0.1, 0.3)
})
// a rock on wood, a clack, a metal ping: the wall bounce; the sim raises the pitch each bounce
assignSamples('bounce', ['bounce1', 'bounce2', 'bounce3'], 0.9, layers(edge(0.25, 3200), weight(190, 90, 0.3, 0.05)))
// a basketball: the rubber ring and a little launch under it
assignSamples(
  'bumper',
  ['bumper1', 'bumper2', 'bumper3'],
  1,
  layers(weight(160, 70, 0.5, 0.12), ring(190, [1, 1.5, 2.7], 0.2, 0.2), (o, t, v) => S.sweep(o, t + 0.02, 90 * v.p, 150 * v.p, 0.12, 0.2, 'sine', 0.01, 0.2)),
)
// a body hit, a full bottle on a counter
assignSamples('shove', ['shove1', 'shove2', 'shove3'], 1, layers(weight(140, 55, 0.45, 0.1), air(0.25, 0.15, 1200, 200)))
// cloth: a roll on the floor, a jacket, a drag; a scuff of the floor under it
assignSamples('dash', ['dash1', 'dash2', 'dash3'], 0.8, layers(weight(120, 60, 0.25, 0.06), (o, t, v) => S.scrape(o, t, 0.12, 0.08, 700 * v.p, 5, 25)))
// a suction cup pulled off: the phantom boomerang going
assignSamples('phantomPop', ['phantomPop1', 'phantomPop2'], 0.9, floor(90, 0.3, 0.12))

// --- deaths: the recording is the flesh, the fruit, the fire; the kit under it is the weight that --
// makes a kill land
assignSamples('slice', ['slice1', 'slice2', 'slice3'], 1, (o, t, v) => {
  S.whoosh(o, t, 0.09, 900 * v.p, 3000 * v.p, 0.3, 1.4, 0.3)
  S.thump(o, t + 0.03, 110, 45, 0.04, 0.6, 0.18)
  S.sub(o, t + 0.03, 48, 0.5, 0.3)
  S.bloom(o, t + 0.05, 0.4, 0.2, 1800, 150)
})
assignSamples('burn', ['burn1', 'burn2'], 1, (o, t) => {
  S.sub(o, t, 55, 0.45, 0.4)
  S.bloom(o, t, 0.5, 0.3, 2500, 200, 0.03)
  S.crackle(o, t + 0.1, 0.6, 0.12, 30, 2500)
})
// a whoosh fading out: no landing is ever heard
assignSamples('fall', ['fall1', 'fall2'], 0.9, (o, t) => {
  S.rumble(o, t, 0.5, 0.2, 60, 8)
  S.hiss(o, t, 0.6, 0.15, 1400, 180, 0.05)
})
// an egg underfoot, a lemon crushed, a crunch; the press's own clank and weight under it
assignSamples('squash', ['squash1', 'squash2', 'squash3'], 1, (o, t, v) => {
  S.thump(o, t, 170, 40, 0.04, 0.7, 0.2)
  S.sub(o, t, 42, 0.5, 0.35)
  S.modal(o, t + 0.003, 300 * v.p, S.METAL, 0.08, 0.3)
  S.debris(o, t + 0.04, 6, 0.3, 0.12, 1800, 'stone')
})
// a real explosion and two firework reports, with the sub and the rumble a small speaker needs
assignSamples('blast', ['blast1', 'blast2', 'blast3'], 1, (o, t) => {
  S.thump(o, t, 140, 22, 0.08, 0.8, 0.3)
  S.sub(o, t, 30, 0.7, 0.6)
  S.rumble(o, t + 0.05, 0.8, 0.3, 50, 6)
})

// --- the room -----------------------------------------------------------------------------------
assignSamples('crate', ['crate1', 'crate2', 'crate3'], 0.9, layers(weight(150, 70, 0.35, 0.08), ring(210, S.WOOD, 0.12, 0.15)))
assignSamples('barrelLit', ['barrelLit1', 'barrelLit2'], 0.8, (o, t) => {
  S.hiss(o, t, 0.4, 0.1, 800, 2500, 0.05)
  S.crackle(o, t + 0.05, 0.5, 0.1, 30, 3000)
})
assignSamples('grass', ['grass1', 'grass2'], 0.8, (o, t, v) => S.smack(o, t, 0.15, 'lowpass', 600 * v.p, 200 * v.p, 1, 0.08))
// ice cracking (one take recorded from inside the block): a deep crack and a glassy ring
assignSamples('ice', ['ice1', 'ice2', 'ice3'], 0.9, layers(floor(70, 0.25, 0.2), ring(2400, S.GLASS, 0.05, 0.3)))
assignSamples('steam', ['steam1', 'steam2'], 0.8, layers(air(0.3, 0.15, 1500, 300), floor(58, 0.15, 0.3)))
// a trap snapping shut, a blade unsheathed, a knife slash
assignSamples('spikes', ['spikes1', 'spikes2', 'spikes3'], 0.9, layers(edge(0.3, 3500), weight(200, 80, 0.3, 0.06), ring(1600, S.METAL, 0.06, 0.2)))
// a blowtorch, a flamethrower burst
assignSamples('vent', ['vent1', 'vent2'], 0.8, layers(floor(58, 0.3, 0.5), air(0.4, 0.2, 2000, 300)))
// a heavy chain pulley, a chain pulled, a gate swung shut; the gate's own iron note under them
assignSamples('gate', ['gate1', 'gate2', 'gate3'], 0.9, layers(ring(165, S.IRON, 0.25, 0.5, true), weight(120, 45, 0.5, 0.15)))
assignSamples('creak', ['creak1', 'creak2', 'creak3'], 0.8, (o, t) => S.rumble(o, t, 0.4, 0.12, 60, 10))
// a rope cut, a chain dropping; then glass: a prop chandelier shattering, a bottle smashed
assignSamples('chandelierFall', ['chandelierFall1', 'chandelierFall2'], 0.8, (o, t) => {
  S.whoosh(o, t, 0.3, 1400, 300, 0.2, 1.2, 0.4)
  S.rattle(o, t + 0.05, 6, 0.3, 0.15, 1800)
})
assignSamples('chandelierLand', ['chandelierLand1', 'chandelierLand2', 'chandelierLand3'], 1, (o, t) => {
  S.thump(o, t, 150, 35, 0.05, 0.7, 0.25)
  S.sub(o, t, 40, 0.5, 0.4)
  S.modal(o, t + 0.003, 420, S.METAL, 0.15, 0.5)
  S.bloom(o, t + 0.02, 0.5, 0.2, 3000, 300)
})
assignSamples('crumble', ['crumble1', 'crumble2', 'crumble3'], 0.9, (o, t) => {
  S.rumble(o, t, 0.6, 0.3, 55, 8)
  S.thump(o, t, 100, 40, 0.06, 0.5, 0.2)
  S.sub(o, t, 45, 0.35, 0.4)
})
// a whoosh played backwards (the swell is the arrival), with a sub where it lands
assignSamples('warp', ['warp1', 'warp2'], 0.9, (o, t, v) => {
  S.sweep(o, t, 2400 * v.p, 200 * v.p, 0.35, 0.12, 'sine', 0.02, 0.2)
  S.sub(o, t + 0.4, 70, 0.3, 0.25)
})

// --- power-ups and players ----------------------------------------------------------------------
// a meditation chime, with the pad's hum under it
assignSamples('pickupGlow', ['pickupGlow'], 0.7, (o, t) => {
  S.tone(o, t, 82, 1.2, 0.08, 'sine', 0.3, 0.6)
  S.tone(o, t, 123, 1.2, 0.05, 'sine', 0.3, 0.6)
})
// a coin dropped, a thin clank
assignSamples('pickupLand', ['pickupLand1', 'pickupLand2'], 0.9, layers(weight(160, 80, 0.3, 0.06), ring(640, S.METAL, 0.05, 0.2)))
// a desk bell, a glass tapped: the pickup, with a lift under it
assignSamples('pickupTake', ['pickupTake1', 'pickupTake2'], 0.9, (o, t, v) => {
  S.sub(o, t, 60, 0.3, 0.25)
  S.sweep(o, t, 300 * v.p, 1200 * v.p, 0.12, 0.1, 'sine', 0.005, 0.2)
})
// a hand cymbal choked: the power-up taken away
assignSamples('pickupLost', ['pickupLost'], 0.9, (o, t, v) => {
  S.sweep(o, t, 400 * v.p, 120 * v.p, 0.25, 0.15, 'triangle', 0.005, 0.3)
  S.smack(o, t, 0.2, 'lowpass', 1200, 300, 1, 0.08)
})
// a lit match dropped in water
assignSamples('pickupFizzle', ['pickupFizzle'], 0.8, (o, t, v) => S.sweep(o, t, 220 * v.p, 90 * v.p, 0.5, 0.08, 'sawtooth', 0.02, 0.4))
// a balloon pop over the glass of the shield breaking (a signature: fixed pitch in the table)
assignSamples('shieldPop', ['shieldPop1', 'shieldPop2'], 1, (o, t) => {
  S.shatter(o, t + 0.005, 0.3, 8, 2800)
  S.thump(o, t, 150, 60, 0.03, 0.4, 0.1)
  S.sub(o, t, 75, 0.3, 0.2)
})
// an air burst, with the inward pull before it
assignSamples('blink', ['blink1', 'blink2'], 0.9, (o, t, v) => {
  S.inhale(o, t, 0.12, 0.2, 300 * v.p, 2400 * v.p)
  S.click(o, t + 0.12, 0.3, 3000 * v.p, 0.004)
  S.sweep(o, t + 0.12, 1800 * v.p, 300 * v.p, 0.15, 0.1, 'sine', 0.005, 0.2)
})
assignSamples('spawnDrop', ['spawnDrop'], 0.8, (o, t) => S.hiss(o, t, 0.5, 0.1, 500, 1800, 0.1))
// a body on the ground, a pillow into a wall, a thud
assignSamples('spawnLand', ['spawnLand1', 'spawnLand2', 'spawnLand3'], 1, layers(edge(0.2, 2500), weight(130, 50, 0.5, 0.12), air(0.3, 0.15, 1500, 200)))
// a big timpani hit: the round starts
assignSamples('ready', ['ready'], 1, (o, t) => {
  S.sub(o, t, 41, 0.5, 0.5)
  S.modal(o, t + 0.003, 220, S.METAL, 0.1, 0.6)
  S.bloom(o, t + 0.02, 0.6, 0.15, 2000, 200)
})
// orchestral cymbals and bass drum, one hit: the round is won
assignSamples('win', ['win'], 1, (o, t) => {
  S.sub(o, t, 41, 0.5, 0.8)
  S.modal(o, t + 0.003, 330, S.BELL, 0.1, 0.8)
  S.bloom(o, t + 0.02, 0.8, 0.15, 2500, 200)
})
