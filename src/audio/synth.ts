/**
 * The impact kit (docs/07 §4): the layers a satisfying hit is built from, as oscillators and noise.
 * Every contact sound in the game is a stack of some of: a transient (`click`), a body (`thump`,
 * `smack`), a sub (`sub`), a resonance (`modal` with metal, wood or glass partials) and a tail
 * (`bloom`, `debris`, `crackle`, `shatter`, `rattle`). The air sounds are `whoosh`, `hiss`, `inhale`,
 * `rumble` and `scrape`; the few electronic or tonal ones `sweep`, `pip` and `tone`. `drive` puts a
 * saturation stage in front of a destination so a layer can be pushed. Every voice takes a
 * destination (the event's pan/gain chain) and a start time, builds its nodes, schedules them and
 * lets them stop themselves. Nothing here keeps a reference afterwards.
 *
 * These are the fallbacks for every sound event and the only source for the ones no CC0 recording
 * covers; `sfx.ts` decides which plays. The build-time music instruments live in `score.ts`.
 */

export interface Out {
  ctx: AudioContext
  dest: AudioNode
}

export type Wave = OscillatorType

const R = Math.random

let noiseBuf: AudioBuffer | null = null
let noiseFor: BaseAudioContext | null = null

/** Two seconds of white noise, shared. */
export function noiseBuffer(ac: BaseAudioContext): AudioBuffer {
  if (noiseBuf && noiseFor === ac) return noiseBuf
  const n = ac.sampleRate * 2
  const buf = ac.createBuffer(1, n, ac.sampleRate)
  const d = buf.getChannelData(0)
  let seed = 22222
  for (let i = 0; i < n; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    d[i] = seed / 2147483648 - 1
  }
  noiseBuf = buf
  noiseFor = ac
  return buf
}

/** An oscillator with a gain envelope, started at `t`, stopped at `t + dur`. Returns the nodes for pitch/filter tweaks. */
export function osc(o: Out, t: number, type: Wave, f: number, dur: number, gain: number, attack = 0.004, release = 0.6) {
  const s = o.ctx.createOscillator()
  s.type = type
  s.frequency.setValueAtTime(Math.max(1, f), t)
  const g = o.ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + attack)
  const relStart = t + Math.max(attack, dur * (1 - release))
  g.gain.setValueAtTime(gain, relStart)
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur)
  s.connect(g).connect(o.dest)
  s.start(t)
  s.stop(t + dur + 0.02)
  return { s, g }
}

/** A noise burst through a filter, with an envelope. */
export function noise(o: Out, t: number, dur: number, gain: number, shape: BiquadFilterType, f0: number, f1 = f0, q = 1, attack = 0.003, release = 0.7) {
  const src = o.ctx.createBufferSource()
  src.buffer = noiseBuffer(o.ctx)
  src.loop = true
  const flt = o.ctx.createBiquadFilter()
  flt.type = shape
  flt.Q.value = q
  flt.frequency.setValueAtTime(Math.max(20, f0), t)
  if (f1 !== f0) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
  const g = o.ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + attack)
  const relStart = t + Math.max(attack, dur * (1 - release))
  g.gain.setValueAtTime(gain, relStart)
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur)
  src.connect(flt).connect(g).connect(o.dest)
  src.start(t, R() * 1.5)
  src.stop(t + dur + 0.02)
  return { src, flt, g }
}

/** Frequency curve helper: a Float32Array of `n` values from fn(0..1). */
export function curve(n: number, fn: (u: number) => number): Float32Array {
  const a = new Float32Array(n)
  for (let i = 0; i < n; i++) a[i] = fn(i / (n - 1))
  return a
}

// ---------------------------------------------------------------- saturation

const shapes = new Map<string, Float32Array<ArrayBuffer>>()

function shapeCurve(kind: 'soft' | 'hard', k: number): Float32Array<ArrayBuffer> {
  const key = `${kind}${k}`
  let c = shapes.get(key)
  if (c) return c
  const N = 2048
  c = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 2 - 1
    c[i] = kind === 'soft' ? Math.tanh(k * x) : Math.max(-0.85, Math.min(0.85, Math.tanh(k * x) * 1.25))
  }
  shapes.set(key, c)
  return c
}

/** A saturation stage in front of `o.dest`: feed the returned `Out` and the layer comes out pushed. */
export function drive(o: Out, k: number, kind: 'soft' | 'hard' = 'soft', trim = 1): Out {
  const ws = o.ctx.createWaveShaper()
  ws.curve = shapeCurve(kind, k)
  ws.oversample = '2x'
  const out = o.ctx.createGain()
  out.gain.value = trim
  ws.connect(out).connect(o.dest)
  return { ctx: o.ctx, dest: ws }
}

// ---------------------------------------------------------------- the layers of a hit

/** The transient: a few milliseconds of bright noise and one cycle of a sine at `f`. Every impact starts with one. */
export function click(o: Out, t: number, gain = 0.5, f = 3500, dur = 0.006) {
  noise(o, t, dur, gain, 'highpass', f * 0.6, f * 0.6, 0.7, 0.0005, 0.95)
  const s = o.ctx.createOscillator()
  s.frequency.value = f
  const g = o.ctx.createGain()
  g.gain.setValueAtTime(gain * 0.8, t)
  g.gain.exponentialRampToValueAtTime(0.0005, t + 2 / f + 0.002)
  s.connect(g).connect(o.dest)
  s.start(t)
  s.stop(t + 2 / f + 0.01)
}

/** The body: a sine dropping from `f0` to `f1` in `slide` seconds, decaying over `decay`. The thump of every impact. */
export function thump(o: Out, t: number, f0: number, f1: number, slide: number, gain: number, decay: number, type: Wave = 'sine') {
  const s = o.ctx.createOscillator()
  s.type = type
  s.frequency.setValueAtTime(Math.max(10, f0), t)
  s.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + slide)
  const g = o.ctx.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0005, t + decay)
  s.connect(g).connect(o.dest)
  s.start(t)
  s.stop(t + decay + 0.02)
}

/** The sub: a sine at `f` with a touch of saturation so small speakers still hear its edge. */
export function sub(o: Out, t: number, f: number, gain: number, decay: number) {
  thump(drive(o, 1.6), t, f * 1.15, f, 0.03, gain, decay)
}

/** Filtered noise with an immediate decay: the smack of contact, the slap of a glove, a wet body. */
export function smack(o: Out, t: number, gain: number, type: BiquadFilterType, f0: number, f1: number, q: number, decay: number) {
  return noise(o, t, decay, gain, type, f0, f1, q, 0.001, 0.97)
}

/** Partial ratios for `modal`: what the struck thing is made of. */
export const METAL = [1, 1.47, 2.09, 2.56, 3.3, 4.2]
export const ANVIL = [1, 1.59, 2.14, 2.78, 3.6]
export const IRON = [1, 1.38, 1.9, 2.7]
export const WOOD = [1, 1.9, 2.75, 3.6]
export const GLASS = [1, 2.32, 4.1, 5.9, 7.3]
export const BELL = [0.5, 1, 1.183, 1.506, 2.0, 2.514, 2.662, 3.011]

/**
 * A struck resonator: `ratios` × `f`, each partial with its own decay. `bright` 0..1 is how much the
 * upper partials keep up with the fundamental (0: dull and short, 1: all equal and long).
 */
export function modal(o: Out, t: number, f: number, ratios: number[], gain: number, decay: number, bright = 0.5, type: Wave = 'sine') {
  ratios.forEach((r, i) => {
    if (f * r > 18000) return
    const amp = gain / (1 + i * (1 - bright) * 1.5)
    const dec = Math.max(0.01, decay * (1 - 0.6 * (i / ratios.length) * (1 - bright)))
    const s = o.ctx.createOscillator()
    s.type = type
    s.frequency.value = f * r * (1 + (R() - 0.5) * 0.004)
    const g = o.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(amp, t + 0.0015)
    g.gain.exponentialRampToValueAtTime(0.0005, t + dec)
    s.connect(g).connect(o.dest)
    s.start(t)
    s.stop(t + dec + 0.02)
  })
}

/** A dust or debris bloom: lowpass noise swelling in `attack` then dying over the rest of `dur`. */
export function bloom(o: Out, t: number, dur: number, gain: number, f0: number, f1: number, attack = 0.02) {
  return noise(o, t, dur, gain, 'lowpass', f0, f1, 0.8, attack, 1 - attack / dur)
}

/** `n` fragments scattered over `dur`, dense first then sparse, each the material's own small knock. */
export function debris(o: Out, t: number, n: number, dur: number, gain: number, f = 2000, kind: 'wood' | 'stone' | 'glass' | 'metal' = 'stone') {
  for (let i = 0; i < n; i++) {
    const u = Math.pow(R(), 0.7)
    const at = t + u * dur
    const g = gain * (1 - u * 0.7) * (0.5 + R() * 0.5)
    const fr = f * (0.6 + R() * 0.9)
    switch (kind) {
      case 'wood':
        modal(o, at, fr * 0.4, WOOD, g, 0.06, 0.3)
        break
      case 'glass':
        modal(o, at, fr * 1.5, GLASS, g * 0.6, 0.12, 0.8)
        break
      case 'metal':
        modal(o, at, fr, METAL, g * 0.6, 0.15, 0.7)
        break
      default:
        noise(o, at, 0.025, g, 'bandpass', fr, fr * 0.7, 3, 0.001, 0.9)
    }
  }
}

/** Fire or splintering: `density` tiny band-passed pops a second over `dur`, thinning towards the end. */
export function crackle(o: Out, t: number, dur: number, gain: number, density = 40, f = 2500) {
  const n = Math.round(density * dur)
  for (let i = 0; i < n; i++) {
    const u = R()
    const at = t + u * dur
    const g = gain * (0.3 + R() * 0.7) * (1 - u * 0.5)
    noise(o, at, 0.004 + R() * 0.01, g, 'bandpass', f * (0.5 + R()), f * 0.8, 2, 0.0005, 0.9)
  }
}

/** Glass giving way: a bright burst and `n` high sines with random short decays. */
export function shatter(o: Out, t: number, gain: number, n = 8, f = 2800) {
  noise(o, t, 0.06, gain * 0.8, 'highpass', 3000, 5000, 0.7, 0.001, 0.9)
  for (let i = 0; i < n; i++) {
    const fr = f * (0.7 + R() * 1.6)
    const at = t + R() * 0.03
    const dec = 0.08 + R() * 0.3
    tone(o, at, fr, dec, (gain * (0.25 + R() * 0.35)) / (1 + i * 0.1), 'sine', 0.001, 0.95)
  }
}

/** A chain or loose metal: `n` small metal knocks spread over `dur`. */
export function rattle(o: Out, t: number, n: number, dur: number, gain: number, f = 1800) {
  for (let i = 0; i < n; i++) {
    const at = t + (i / n) * dur + R() * (dur / n) * 0.6
    modal(o, at, f * (0.8 + R() * 0.5), METAL, gain * (0.5 + R() * 0.5), 0.05 + R() * 0.06, 0.6)
  }
}

// ---------------------------------------------------------------- air

/** Moving air: band-passed noise sweeping `f0`→`f1` over `dur`, loudest `peak` (0..1) of the way through. */
export function whoosh(o: Out, t: number, dur: number, f0: number, f1: number, gain: number, q = 1.2, peak = 0.35) {
  const src = o.ctx.createBufferSource()
  src.buffer = noiseBuffer(o.ctx)
  src.loop = true
  const flt = o.ctx.createBiquadFilter()
  flt.type = 'bandpass'
  flt.Q.value = q
  flt.frequency.setValueAtTime(Math.max(20, f0), t)
  flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
  const g = o.ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + Math.max(0.003, dur * peak))
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur)
  src.connect(flt).connect(g).connect(o.dest)
  src.start(t, R() * 1.5)
  src.stop(t + dur + 0.02)
  return { flt, g }
}

/** Steam, gas, air escaping: wide-band noise with a soft envelope. */
export function hiss(o: Out, t: number, dur: number, gain: number, f0: number, f1: number, attack = 0.01) {
  return noise(o, t, dur, gain, 'bandpass', f0, f1, 0.5, attack, 0.6)
}

/** Air pulled in: noise that grows into `t + dur` and cuts there. The moment before a snap. */
export function inhale(o: Out, t: number, dur: number, gain: number, f0: number, f1: number) {
  const src = o.ctx.createBufferSource()
  src.buffer = noiseBuffer(o.ctx)
  src.loop = true
  const flt = o.ctx.createBiquadFilter()
  flt.type = 'bandpass'
  flt.Q.value = 1
  flt.frequency.setValueAtTime(Math.max(20, f0), t)
  flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
  const g = o.ctx.createGain()
  g.gain.setValueAtTime(0.0005, t)
  g.gain.exponentialRampToValueAtTime(gain, t + dur)
  g.gain.linearRampToValueAtTime(0, t + dur + 0.01)
  src.connect(flt).connect(g).connect(o.dest)
  src.start(t, R() * 1.5)
  src.stop(t + dur + 0.03)
}

/** Low noise with a slow amplitude wobble: ground, stone, something heavy moving. */
export function rumble(o: Out, t: number, dur: number, gain: number, f = 160, wobble = 12) {
  const { g } = noise(o, t, dur, gain, 'lowpass', f, f * 0.7, 0.8, 0.02, 0.8)
  const lfo = o.ctx.createOscillator()
  lfo.frequency.value = wobble
  const depth = o.ctx.createGain()
  depth.gain.value = gain * 0.4
  lfo.connect(depth).connect(g.gain)
  lfo.start(t)
  lfo.stop(t + dur + 0.02)
}

/** Something dragged or strained: resonant noise whose centre wanders by ±`wobble` ‰ every 25 ms. */
export function scrape(o: Out, t: number, dur: number, gain: number, f = 900, q = 6, wobble = 30) {
  const { flt } = noise(o, t, dur, gain, 'bandpass', f, f, q, 0.01, 0.5)
  const steps = Math.max(2, Math.round(dur / 0.025))
  let cur = f
  for (let i = 1; i <= steps; i++) {
    cur = Math.max(60, cur * (1 + ((R() - 0.5) * 2 * wobble) / 1000))
    flt.frequency.linearRampToValueAtTime(cur, t + (i / steps) * dur)
  }
}

// ---------------------------------------------------------------- electronic and tonal

/** A pitched sweep `f0`→`f1` through a lowpass that follows it: energy, charge, a portal. */
export function sweep(o: Out, t: number, f0: number, f1: number, dur: number, gain: number, type: Wave = 'sine', attack = 0.005, release = 0.6) {
  const lp = o.ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(Math.max(60, f0 * 3), t)
  lp.frequency.exponentialRampToValueAtTime(Math.max(60, f1 * 3), t + dur)
  lp.connect(o.dest)
  const { s } = osc({ ctx: o.ctx, dest: lp }, t, type, f0, dur, gain, attack, release)
  s.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur)
}

/** A hard electronic pip: a square and a sine at `f`, lowpassed. The bomb's warning. */
export function pip(o: Out, t: number, f: number, dur: number, gain: number) {
  const lp = o.ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = f * 4
  lp.connect(o.dest)
  osc({ ctx: o.ctx, dest: lp }, t, 'square', f, dur, gain * 0.5, 0.002, 0.3)
  osc(o, t, 'sine', f, dur, gain * 0.5, 0.002, 0.3)
}

/** A plain tone with an envelope. Used sparingly: the game's tonal content belongs to the music. */
export function tone(o: Out, t: number, f: number, dur: number, gain: number, type: Wave = 'sine', attack = 0.005, release = 0.6, detune = 0) {
  const { s } = osc(o, t, type, f, dur, gain, attack, release)
  s.detune.value = detune
  return s
}
