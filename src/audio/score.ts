/** Original room compositions and instruments, used only to render music assets and in audio tests. */
import { getBuffer } from './buffers.ts'
import { noiseBuffer } from './synth.ts'

export type InstName =
  // leads, stabs, pads
  | 'supersaw'
  | 'lead'
  | 'arp'
  | 'stab'
  | 'horn'
  | 'strings'
  | 'choir'
  | 'pad'
  | 'organ'
  | 'bell'
  | 'pluck'
  | 'glass'
  | 'piano'
  // bass and guitar
  | 'bass'
  | 'dbass'
  | 'reese'
  | 'sub'
  | 'guitar'
  | 'guitarLead'
  // drums and hits (sampled when a recording is assigned, synthesized otherwise)
  | 'kick'
  | 'kick808'
  | 'snare'
  | 'clap'
  | 'hat'
  | 'ohat'
  | 'ride'
  | 'crash'
  | 'tom'
  | 'taiko'
  | 'orchHit'
  | 'impact'
  | 'rev'
  | 'riser'
  | 'anvil'
  | 'clang'
  | 'tick'
  | 'shaker'
  | 'timp'

export interface Track {
  inst: InstName
  gain: number
  /** −1..1 */
  pan?: number
  /** Arrangement layer; the renderer mixes the top accent layer lower. */
  layer?: number
  /** fraction of a step a note holds before release (default 0.9) */
  gate?: number
  /** octaves up or down */
  oct?: number
  /** reverb send 0..1 (default 0.2) */
  send?: number
  /** this track's hits drive the song's sidechain pump */
  pump?: boolean
  /** this track dips under the pump */
  pumped?: boolean
  /** heavy drum kit, used by the fixed recording */
  heavy?: boolean
  /** only in the light drum kit */
  light?: boolean
  seq: string
  /** the same length as `seq`; played instead of it on every other pass of the form (the second B section) */
  alt?: string
}

export interface Song {
  key: string
  title: string
  /** quarter-note tempo */
  bpm: number
  /** steps per 4/4 bar: 16 = sixteenths, 8 = eighths, 12 = a 12/8 feel */
  steps: number
  /** tokens per bar when the meter is not 4/4 (7 for 7/8 at eighths, 6 for 6/8); the checker's bar, default `steps` */
  bar?: number
  /** 0..0.4: every odd step is late by this fraction of a step */
  swing?: number
  /** room tone handed to the engine: seconds, brightness */
  reverb: [number, number]
  /** sidechain depth 0..1 for `pumped` tracks under the `pump` track's hits */
  pump?: number
  /** the key's root, e.g. 'd1': the kicks are tuned to it (folded into 41–82 Hz) */
  root?: string
  /** the signature hit played at the midpoint of the cross-fade into this room */
  hit?: { inst: InstName; notes?: string; gain?: number }
  tracks: Track[]
}

interface Token {
  /** frequencies, empty for a rest; drums use the inst's own pitch */
  f: number[]
  vel: number
  /** steps this note holds (ties folded in) */
  len: number
  rest: boolean
  tie: boolean
}

const NOTE_RE = /^([a-g])(#|b)?(-?\d)$/

const SEMI: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }

function noteFreq(name: string): number | null {
  const m = NOTE_RE.exec(name)
  if (!m) return null
  let n = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
  const oct = Number(m[3])
  const midi = 12 * (oct + 1) + n
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/** The kick's tuning for a song: its root folded into 41–82 Hz (E1–E2), 48 Hz when it names none. */
export function rootHz(root: string | undefined): number {
  if (!root) return 48
  let f = noteFreq(root)
  if (f === null) throw new Error(`bad root "${root}"`)
  while (f < 41) f *= 2
  while (f >= 82) f /= 2
  return f
}

/** The pattern string → tokens. Public so a song can be validated by a script. */
export function parseSeq(seq: string, oct = 0): Token[] {
  const raw = seq.split(/\s+/).filter((s) => s && s !== '|')
  const toks: Token[] = raw.map((s) => {
    if (s === '-') return { f: [], vel: 0, len: 1, rest: true, tie: false }
    if (s === '.') return { f: [], vel: 0, len: 1, rest: false, tie: true }
    if (s === 'x') return { f: [], vel: 0.8, len: 1, rest: false, tie: false }
    if (s === 'o') return { f: [], vel: 1.1, len: 1, rest: false, tie: false }
    if (s === 'g') return { f: [], vel: 0.45, len: 1, rest: false, tie: false } // ghost
    const parts = s.split('+')
    const f: number[] = []
    let vel = 0.9
    for (const p of parts) {
      if (p === '!') {
        vel = 1.15
        continue
      }
      if (p === '?') {
        vel = 0.55
        continue
      }
      const fr = noteFreq(p)
      if (fr === null) throw new Error(`bad note token "${s}" in "${seq.slice(0, 40)}…"`)
      f.push(fr * Math.pow(2, oct))
    }
    return { f, vel, len: 1, rest: false, tie: false }
  })
  // fold ties into the note before them (wrapping, so a note at the end can hold into the loop start)
  const n = toks.length
  for (let i = 0; i < n; i++) {
    const tk = toks[i]
    if (tk.rest || tk.tie) continue
    let len = 1
    while (len < n && toks[(i + len) % n].tie) len++
    tk.len = len
  }
  return toks
}

// ---------------------------------------------------------------- shared pieces

const R = Math.random
/** the JP-8000 supersaw's seven offsets in cents at a half-turned detune knob (Szabo 2010, notes §7) */
const SZABO = [-19, -11, -3.3, 0, 3.4, 10, 17]
let pickCount = 0

const waves = new Map<string, PeriodicWave>()
function pulseWave(ac: BaseAudioContext, duty: number): PeriodicWave {
  const key = `${duty}`
  let w = waves.get(key)
  if (w) return w
  const N = 48
  const real = new Float32Array(N)
  const imag = new Float32Array(N)
  for (let k = 1; k < N; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty)
  w = ac.createPeriodicWave(real, imag)
  waves.set(key, w)
  return w
}

const curves = new Map<string, Float32Array>()
/**
 * A waveshaper curve: 'soft' is tanh, 'hard' a clipped tanh (guitar), 'fold' a wavefolder, 'asym' a
 * tanh pushed off centre so even harmonics come out (the Argent bass; it leaves DC, highpass after it).
 */
function shaper(ac: BaseAudioContext, kind: 'soft' | 'hard' | 'fold' | 'asym', k: number): WaveShaperNode {
  const key = `${kind}${k}`
  let c = curves.get(key)
  if (!c) {
    const N = 2048
    c = new Float32Array(N)
    const bias = Math.tanh(0.4)
    const span = Math.abs(Math.tanh(-k + 0.4) - bias)
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1
      let y: number
      if (kind === 'soft') y = Math.tanh(k * x)
      else if (kind === 'hard') y = Math.max(-0.8, Math.min(0.8, Math.tanh(k * x) * 1.3))
      else if (kind === 'asym') y = (Math.tanh(k * x + 0.4) - bias) / span
      else y = Math.sin(k * x * 1.5)
      c[i] = y
    }
    curves.set(key, c)
  }
  const ws = ac.createWaveShaper()
  ws.curve = c as Float32Array<ArrayBuffer>
  ws.oversample = '2x'
  return ws
}

const plucks = new Map<number, AudioBuffer>()
/** Karplus-Strong rendered once per pitch: a noise burst in a lossy delay line. */
function pluckBuffer(ac: BaseAudioContext, f: number): AudioBuffer {
  const key = Math.round(f * 2)
  let b = plucks.get(key)
  if (b) return b
  const sr = ac.sampleRate
  const N = Math.max(2, Math.round(sr / f))
  const dur = Math.min(1.4, 0.4 + 120 / f)
  const len = Math.floor(sr * dur)
  b = ac.createBuffer(1, len, sr)
  const d = b.getChannelData(0)
  const ring = new Float32Array(N)
  let seed = 777 + key
  for (let i = 0; i < N; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    ring[i] = seed / 2147483648 - 1
  }
  const loss = f < 150 ? 0.994 : 0.9965
  let p = 0
  for (let i = 0; i < len; i++) {
    const a = ring[p]
    const nb = ring[(p + 1) % N]
    const v = 0.5 * (a + nb) * loss
    d[i] = a
    ring[p] = v
    p = (p + 1) % N
  }
  plucks.set(key, b)
  return b
}

interface Voice {
  ac: BaseAudioContext
  dest: AudioNode
  t: number
  dur: number
  vel: number
  /** the song's kick tuning, Hz (drums only) */
  root?: number
}

function env(v: Voice, peak: number, a: number, r: number, sustain = 1): GainNode {
  const g = v.ac.createGain()
  const end = v.t + Math.max(a + 0.01, v.dur)
  g.gain.value = 0 // silent until the attack, so an oscillator started early for its phase makes no sound
  g.gain.setValueAtTime(0.0001, v.t)
  g.gain.linearRampToValueAtTime(peak * v.vel, v.t + a)
  if (sustain < 1) g.gain.exponentialRampToValueAtTime(Math.max(0.0005, peak * v.vel * sustain), end)
  else g.gain.setValueAtTime(peak * v.vel, end)
  g.gain.exponentialRampToValueAtTime(0.0005, end + r)
  g.connect(v.dest)
  return g
}

/** An oscillator for the note; `pre` starts it that many seconds early, which is the only way to give it a phase. */
function tone(v: Voice, type: OscillatorType | PeriodicWave, f: number, g: AudioNode, release: number, detune = 0, pre = 0): OscillatorNode {
  const o = v.ac.createOscillator()
  if (typeof type === 'string') o.type = type as OscillatorType
  else o.setPeriodicWave(type)
  o.frequency.value = f
  o.detune.value = detune
  o.connect(g)
  o.start(pre > 0 ? Math.max(v.ac.currentTime, v.t - pre) : v.t)
  o.stop(v.t + Math.max(0.02, v.dur) + release + 0.05)
  return o
}

/** A lowpass whose cutoff opens to `f1` in `a` seconds then settles to `f2` by the end of the note. */
function filterEnv(v: Voice, f0: number, f1: number, f2: number, a: number, q = 1): BiquadFilterNode {
  const flt = v.ac.createBiquadFilter()
  flt.type = 'lowpass'
  flt.Q.value = q
  flt.frequency.setValueAtTime(Math.max(40, f0), v.t)
  flt.frequency.exponentialRampToValueAtTime(Math.min(16000, Math.max(40, f1)), v.t + a)
  flt.frequency.exponentialRampToValueAtTime(Math.min(16000, Math.max(40, f2)), v.t + Math.max(a + 0.02, v.dur))
  flt.connect(v.dest)
  return flt
}

/** `n` detuned copies of a wave spread over ±`spread` cents and across the stereo field. */
function unison(v: Voice, type: OscillatorType | PeriodicWave, f: number, dest: AudioNode, n: number, spread: number, release: number, width = 0.6) {
  for (let i = 0; i < n; i++) {
    const pos = n === 1 ? 0 : (i / (n - 1)) * 2 - 1
    const pan = v.ac.createStereoPanner()
    pan.pan.value = pos * width
    const g = v.ac.createGain()
    g.gain.value = 1 / Math.sqrt(n)
    g.connect(pan).connect(dest)
    tone(v, type, f, g, release, pos * spread + (R() - 0.5) * 2)
  }
}

function vibrato(v: Voice, oscs: OscillatorNode[], rate: number, cents: number, delay: number) {
  const lfo = v.ac.createOscillator()
  lfo.frequency.value = rate
  const depth = v.ac.createGain()
  depth.gain.setValueAtTime(0, v.t)
  depth.gain.linearRampToValueAtTime(cents, v.t + delay)
  lfo.connect(depth)
  for (const o of oscs) depth.connect(o.detune)
  lfo.start(v.t)
  lfo.stop(v.t + v.dur + 1)
}

function noiseHit(v: Voice, peak: number, type: BiquadFilterType, f0: number, f1: number, q: number, dur: number, dest = v.dest) {
  const src = v.ac.createBufferSource()
  src.buffer = noiseBuffer(v.ac)
  src.loop = true
  const flt = v.ac.createBiquadFilter()
  flt.type = type
  flt.Q.value = q
  flt.frequency.setValueAtTime(f0, v.t)
  if (f1 !== f0) flt.frequency.exponentialRampToValueAtTime(f1, v.t + dur)
  const g = v.ac.createGain()
  g.gain.setValueAtTime(peak * v.vel, v.t)
  g.gain.exponentialRampToValueAtTime(0.0005, v.t + dur)
  src.connect(flt).connect(g).connect(dest)
  src.start(v.t, (v.t * 7.3) % 1.5)
  src.stop(v.t + dur + 0.02)
}

function fm(v: Voice, f: number, ratio: number, index: number, peak: number, decay: number, tail: number) {
  const g = env(v, peak, 0.002, tail, 0.08)
  const car = tone(v, 'sine', f, g, tail)
  const mod = v.ac.createOscillator()
  mod.frequency.value = f * ratio
  const idx = v.ac.createGain()
  idx.gain.setValueAtTime(f * index, v.t)
  idx.gain.exponentialRampToValueAtTime(f * 0.02, v.t + decay)
  mod.connect(idx).connect(car.frequency)
  mod.start(v.t)
  mod.stop(v.t + Math.max(0.02, v.dur) + tail + 0.05)
}

/** A sine that drops in pitch: the body of every drum. */
function drop(v: Voice, f0: number, f1: number, slide: number, peak: number, decay: number, dest = v.dest) {
  const g = v.ac.createGain()
  g.gain.setValueAtTime(peak * v.vel, v.t)
  g.gain.exponentialRampToValueAtTime(0.0005, v.t + decay)
  g.connect(dest)
  const o = v.ac.createOscillator()
  o.frequency.setValueAtTime(f0, v.t)
  o.frequency.exponentialRampToValueAtTime(f1, v.t + slide)
  o.connect(g)
  o.start(v.t)
  o.stop(v.t + decay + 0.05)
}

// ---------------------------------------------------------------- sampled drums

const drumFiles = new Map<InstName, string[]>()
const lastDrumTake = new Map<InstName, number>()

/** Point a drum instrument at one-shot recordings (round-robin). Provenance in docs/audio-credits.md. */
export function assignDrum(inst: InstName, files: string[]): void {
  drumFiles.set(inst, files)
}

/** Every recording the drums want loaded. */
export function drumSampleNames(): string[] {
  const out: string[] = []
  for (const files of drumFiles.values()) out.push(...files)
  return out
}

/** The next take for `inst` (round-robin, never the last one), or null if none is loaded. */
function take(inst: InstName): AudioBuffer | null {
  const files = drumFiles.get(inst)
  if (!files || !files.length) return null
  let i = Math.floor(R() * files.length)
  const prev = lastDrumTake.get(inst)
  if (files.length > 1 && i === prev) i = (i + 1) % files.length
  const buf = getBuffer(files[i])
  if (buf) lastDrumTake.set(inst, i)
  return buf ?? null
}

/** Play the drum's recording if it is loaded. `rate` 1 is as recorded. */
function sampled(inst: InstName, v: Voice, gain: number, rate = 1): boolean {
  const buf = take(inst)
  if (!buf) return false
  const src = v.ac.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = rate * (1 + (R() - 0.5) * 0.03)
  const g = v.ac.createGain()
  g.gain.value = gain * v.vel
  src.connect(g).connect(v.dest)
  src.start(v.t)
  return true
}

/**
 * Play the drum's recording so that it *ends* where the note ends: a reversed cymbal swelling into
 * the downbeat. A take longer than the note skips its quiet start; a shorter one starts late.
 */
function sampledTail(inst: InstName, v: Voice, gain: number): boolean {
  const buf = take(inst)
  if (!buf) return false
  const dur = Math.max(0.2, v.dur)
  const src = v.ac.createBufferSource()
  src.buffer = buf
  const g = v.ac.createGain()
  g.gain.value = gain * v.vel
  src.connect(g).connect(v.dest)
  if (buf.duration > dur) {
    g.gain.setValueAtTime(0, v.t)
    g.gain.linearRampToValueAtTime(gain * v.vel, v.t + 0.03)
    src.start(v.t, buf.duration - dur)
  } else src.start(v.t + dur - buf.duration)
  return true
}

// ---------------------------------------------------------------- instruments

/** One note (or chord, for the instruments whose distortion should bind the notes) of `inst`. */
export function playInst(inst: InstName, v: Voice, fs: number[]) {
  const { ac } = v
  const f = fs[0] ?? 0
  switch (inst) {
    // ---- leads, stabs, pads
    case 'supersaw': {
      // Szabo's seven (notes §7): the side saws at the JP-8000's measured offsets for a half-turned
      // detune knob, the centre saw louder than the sides, every saw highpassed at its own pitch so the
      // beating never piles up under the bass, and every saw started at its own phase so a chord has
      // no click where seven phase-locked ramps would all begin together
      for (const fr of fs) {
        const flt = filterEnv(v, fr * 2, Math.min(9000, fr * 14), fr * 5, 0.04, 0.8)
        const g = env({ ...v, dest: flt }, 0.15, 0.012, 0.12, 0.8)
        SZABO.forEach((cents, i) => {
          const hp = ac.createBiquadFilter()
          hp.type = 'highpass'
          hp.frequency.value = fr * 0.9
          hp.Q.value = 0
          const sg = ac.createGain()
          sg.gain.value = (i === 3 ? 0.72 : 0.5) / 2.2
          const pan = ac.createStereoPanner()
          pan.pan.value = ((i / 6) * 2 - 1) * 0.7
          hp.connect(sg).connect(pan).connect(g)
          tone(v, 'sawtooth', fr, hp, 0.12, cents + (R() - 0.5), R() / fr)
        })
      }
      return
    }
    case 'lead': {
      // three saws and a square an octave down, bright filter, vibrato after the attack: the solo voice
      const flt = filterEnv(v, f * 3, Math.min(11000, f * 16), f * 7, 0.02, 1.2)
      const dist = shaper(ac, 'soft', 1.6)
      dist.connect(flt)
      const g = env({ ...v, dest: dist }, 0.13, 0.008, 0.1, 0.85)
      const oscs: OscillatorNode[] = []
      for (const d of [-9, 0, 9]) oscs.push(tone(v, 'sawtooth', f, g, 0.1, d))
      oscs.push(tone(v, 'square', f / 2, g, 0.1, 0))
      vibrato(v, oscs, 5.5, 14, 0.18)
      return
    }
    case 'arp': {
      // the plucky saw of a sequenced arpeggio: filter snaps shut in 90 ms
      for (const fr of fs) {
        const flt = filterEnv(v, Math.min(12000, fr * 12), fr * 3, fr * 2.2, 0.09, 2)
        const g = env({ ...v, dest: flt }, 0.16, 0.003, 0.08, 0.5)
        unison(v, 'sawtooth', fr, g, 2, 9, 0.08, 0.4)
      }
      return
    }
    case 'stab': {
      // brass-section stab: four saws, hard filter bite, short
      for (const fr of fs) {
        const flt = filterEnv(v, fr * 1.5, Math.min(9000, fr * 10), fr * 2.5, 0.03, 2.5)
        const g = env({ ...v, dest: flt }, 0.12, 0.006, 0.06, 0.5)
        unison(v, 'sawtooth', fr, g, 4, 12, 0.06, 0.5)
      }
      return
    }
    case 'horn': {
      // low brass: slow filter swell, a touch of saturation, detuned pair plus a sub octave
      for (const fr of fs) {
        const flt = filterEnv(v, fr * 1.2, Math.min(6000, fr * 7), fr * 4, 0.09, 1.5)
        const dist = shaper(ac, 'soft', 1.8)
        dist.connect(flt)
        const g = env({ ...v, dest: dist }, 0.12, 0.05, 0.14, 0.9)
        tone(v, 'sawtooth', fr, g, 0.14, -7)
        tone(v, 'sawtooth', fr, g, 0.14, 7)
        const g2 = env({ ...v, dest: dist }, 0.05, 0.05, 0.14, 0.9)
        tone(v, 'sawtooth', fr / 2, g2, 0.14, 0)
      }
      return
    }
    case 'strings': {
      // a section: five saws, slow attack, gentle lowpass, slow wide vibrato
      for (const fr of fs) {
        const flt = filterEnv(v, fr * 2, Math.min(7000, fr * 9), fr * 6, 0.25, 0.6)
        const g = env({ ...v, dest: flt }, 0.09, 0.16, 0.35, 0.95)
        const oscs: OscillatorNode[] = []
        for (const d of [-14, -6, 0, 6, 14]) oscs.push(tone(v, 'sawtooth', fr, g, 0.35, d))
        vibrato(v, oscs, 4.8, 9, 0.4)
      }
      return
    }
    case 'choir': {
      // three formants of "ah" over a detuned saw stack, slow in and out
      for (const fr of fs) {
        const mix = ac.createGain()
        mix.connect(v.dest)
        const g = env({ ...v, dest: mix }, 0.22, 0.18, 0.4, 0.95)
        g.disconnect()
        for (const [fc, q, a] of [
          [700, 4, 1],
          [1150, 6, 0.6],
          [2500, 8, 0.25],
        ]) {
          const flt = ac.createBiquadFilter()
          flt.type = 'bandpass'
          flt.frequency.value = fc
          flt.Q.value = q
          const fg = ac.createGain()
          fg.gain.value = a
          g.connect(flt).connect(fg).connect(mix)
        }
        for (const d of [-10, -3, 4, 11]) tone(v, 'sawtooth', fr, g, 0.4, d)
        tone(v, 'sawtooth', fr * 2, g, 0.4, 2)
      }
      return
    }
    case 'pad': {
      // dark pad: four saws under a slow low filter, slow attack
      for (const fr of fs) {
        const flt = filterEnv(v, fr * 1.2, fr * 3.5, fr * 2.5, 0.5, 0.7)
        const g = env({ ...v, dest: flt }, 0.1, 0.3, 0.6, 0.95)
        unison(v, 'sawtooth', fr, g, 4, 16, 0.6, 0.7)
      }
      return
    }
    case 'organ': {
      for (const fr of fs) {
        const g = env(v, 0.1, 0.02, 0.09)
        for (const [h, a] of [
          [1, 1],
          [2, 0.55],
          [3, 0.3],
          [4, 0.22],
        ]) {
          const hg = ac.createGain()
          hg.gain.value = a
          hg.connect(g)
          tone({ ...v, dest: hg }, 'sine', fr * h, hg, 0.09)
        }
      }
      return
    }
    case 'bell':
      for (const fr of fs) fm(v, fr, 3.5, 2.2, 0.3, 0.25, Math.min(1.6, v.dur + 0.9))
      return
    case 'pluck':
      for (const fr of fs) {
        const src = ac.createBufferSource()
        src.buffer = pluckBuffer(ac, fr)
        const g = env(v, 0.5, 0.001, 0.25, 0.3)
        src.connect(g)
        src.start(v.t)
        src.stop(v.t + Math.max(0.02, v.dur) + 0.3)
      }
      return
    case 'glass':
      for (const fr of fs) {
        const g = env(v, 0.18, 0.06, 0.5)
        tone(v, 'sine', fr, g, 0.5)
        const g2 = env(v, 0.05, 0.08, 0.4)
        tone(v, 'sine', fr * 3.01, g2, 0.4)
        const g3 = env(v, 0.07, 0.04, 0.45)
        tone(v, 'triangle', fr * 2, g3, 0.45)
      }
      return
    case 'piano': {
      // a hard, percussive electric piano: FM with a fast index decay and a struck transient
      for (const fr of fs) {
        fm(v, fr, 1, 2.6, 0.3, 0.08, Math.min(1.2, v.dur + 0.5))
        fm(v, fr * 2, 1, 1.2, 0.08, 0.05, 0.4)
        noiseHit(v, 0.05, 'highpass', 4000, 4000, 0.7, 0.008)
      }
      return
    }

    // ---- bass and guitar
    case 'bass': {
      // clean synth bass: saw plus square octave down, filter snap
      const flt = filterEnv(v, f * 1.5, Math.min(3000, f * 9), f * 3, 0.03, 2)
      const g = env({ ...v, dest: flt }, 0.3, 0.004, 0.06, 0.7)
      tone(v, 'sawtooth', f, g, 0.06)
      tone(v, 'square', f / 2, g, 0.06)
      return
    }
    case 'dbass': {
      // the Argent bass (Gordon's Doom method, notes §7): sines rather than saws into an asymmetric
      // shaper so the even harmonics come out, a formant lift around the sixth harmonic into a second
      // shaper, a breath of bandpassed noise for grit, and the whole distorted half highpassed at 100 Hz
      // so it never fights the clean sine that carries the weight underneath (the split-band rule)
      const flt = filterEnv(v, f * 4, Math.min(5000, f * 24), f * 7, 0.02, 1)
      const hp2 = ac.createBiquadFilter()
      hp2.type = 'highpass'
      hp2.frequency.value = 100
      hp2.Q.value = 0
      hp2.connect(flt)
      const dist2 = shaper(ac, 'soft', 3)
      dist2.connect(hp2)
      const formant = ac.createBiquadFilter()
      formant.type = 'peaking'
      formant.frequency.value = Math.min(4000, f * 6)
      formant.Q.value = 1.2
      formant.gain.value = 9
      formant.connect(dist2)
      const hp1 = ac.createBiquadFilter() // the off-centre clip leaves DC; out it goes before the second stage
      hp1.type = 'highpass'
      hp1.frequency.value = 60
      hp1.Q.value = 0
      hp1.connect(formant)
      const dist1 = shaper(ac, 'asym', 3)
      dist1.connect(hp1)
      const g = env({ ...v, dest: dist1 }, 0.8, 0.004, 0.06, 0.75)
      tone(v, 'sine', f, g, 0.06)
      const g8 = ac.createGain()
      g8.gain.value = 0.5
      g8.connect(g)
      tone(v, 'sine', f * 2, g8, 0.06)
      const gsaw = ac.createGain()
      gsaw.gain.value = 0.2
      gsaw.connect(g)
      tone(v, 'sawtooth', f, gsaw, 0.06, 4)
      noiseHit(v, 0.12, 'bandpass', Math.min(6000, f * 8), Math.min(6000, f * 5), 2, Math.min(0.3, Math.max(0.05, v.dur)), dist1)
      const gs = env(v, 0.34, 0.006, 0.06, 0.8)
      tone(v, 'sine', f, gs, 0.06)
      return
    }
    case 'reese': {
      // two saws 22 cents apart through a slow lowpass: the drum-and-bass growl
      const flt = filterEnv(v, f * 2, f * 6, f * 3.5, 0.3, 1)
      const dist = shaper(ac, 'soft', 2.2)
      dist.connect(flt)
      const g = env({ ...v, dest: dist }, 0.36, 0.01, 0.1, 0.9)
      tone(v, 'sawtooth', f, g, 0.1, -11)
      tone(v, 'sawtooth', f, g, 0.1, 11)
      const gs = env(v, 0.25, 0.01, 0.1, 0.9)
      tone(v, 'sine', f, gs, 0.1)
      return
    }
    case 'sub': {
      const dist = shaper(ac, 'soft', 1.4)
      dist.connect(v.dest)
      const g = env({ ...v, dest: dist }, 0.55, 0.008, 0.08, 0.8)
      tone(v, 'sine', f, g, 0.08)
      return
    }
    case 'guitar':
    case 'guitarLead': {
      // the chug: every note of the chord into one high-gain shaper so the fifth beats against the
      // root the way a power chord does, then a cabinet (highpass, a −8 dB scoop at 450 Hz where a
      // 4×12 goes boxy, lowpass, a presence bump), and a pick-noise transient. Short notes are
      // palm-muted: the envelope collapses in 120 ms. Down- and up-picks alternate: every other note
      // sits three cents the other side of pitch and the level wanders ±10 %, so a run of sixteenths
      // is a hand, not a loop.
      const lead = inst === 'guitarLead'
      const cab1 = ac.createBiquadFilter()
      cab1.type = 'highpass'
      cab1.frequency.value = 95
      const scoop = ac.createBiquadFilter()
      scoop.type = 'peaking'
      scoop.frequency.value = 450
      scoop.Q.value = 1.5
      scoop.gain.value = -8
      const cab2 = ac.createBiquadFilter()
      cab2.type = 'lowpass'
      cab2.frequency.value = lead ? 5200 : 4300
      cab2.Q.value = 0.8
      const pres = ac.createBiquadFilter()
      pres.type = 'peaking'
      pres.frequency.value = lead ? 2400 : 1700
      pres.Q.value = 1.2
      pres.gain.value = 4
      const out = ac.createGain()
      out.gain.value = (lead ? 0.2 : 0.28) * (0.9 + R() * 0.2)
      cab1.connect(scoop).connect(cab2).connect(pres).connect(out).connect(v.dest)
      const dist = shaper(ac, 'hard', lead ? 14 : 20)
      dist.connect(cab1)
      const pre = ac.createGain()
      pre.gain.value = 1
      pre.connect(dist)
      const muted = !lead && v.dur < 0.2
      const pick = (pickCount++ & 1) === 0 ? 3 : -3
      const g = env({ ...v, dest: pre }, 0.9, 0.003, muted ? 0.05 : 0.18, muted ? 0.25 : lead ? 0.9 : 0.7)
      const oscs: OscillatorNode[] = []
      for (const fr of fs) {
        oscs.push(tone(v, 'sawtooth', fr, g, 0.18, pick - 5))
        oscs.push(tone(v, 'sawtooth', fr, g, 0.18, pick + 5))
        oscs.push(tone(v, pulseWave(ac, 0.3), fr, g, 0.18, pick))
      }
      if (lead) vibrato(v, oscs, 5.2, 18, 0.25)
      noiseHit(v, 0.25, 'highpass', 2500, 2500, 0.7, 0.012, pre)
      return
    }

    // ---- drums
    case 'kick': {
      if (sampled(inst, v, 1.0)) return
      // layered: a click, a sweeping body through light saturation, and a sub thump; the body lands
      // on the song's root so the kick is a bass note, not a thud in some other key
      const root = v.root ?? 48
      const dist = shaper(ac, 'soft', 2.4)
      dist.connect(v.dest)
      drop(v, root * 3.7, root, 0.07, 0.9, 0.26, dist)
      drop(v, root * 1.3, root * 0.92, 0.05, 0.5, 0.3)
      noiseHit(v, 0.35, 'lowpass', 2800, 300, 1, 0.018)
      return
    }
    case 'kick808': {
      if (sampled(inst, v, 1.0)) return
      const root = v.root ?? 48
      drop(v, root * 2.5, root, 0.09, 0.9, 0.7)
      noiseHit(v, 0.2, 'lowpass', 1800, 200, 1, 0.015)
      return
    }
    case 'snare': {
      if (sampled(inst, v, 0.9)) return
      // skin tone, a second tone a fifth up, a bright noise burst, and a short room via the send
      drop(v, 240, 170, 0.04, 0.45, 0.12)
      drop(v, 360, 250, 0.03, 0.2, 0.08)
      noiseHit(v, 0.6, 'bandpass', 2600, 1800, 0.6, 0.19)
      noiseHit(v, 0.3, 'highpass', 6000, 6000, 0.7, 0.05)
      return
    }
    case 'clap': {
      if (sampled(inst, v, 0.8)) return
      for (let i = 0; i < 4; i++) noiseHit({ ...v, t: v.t + i * 0.009 }, 0.32 - i * 0.05, 'bandpass', 1500, 1200, 1.4, i === 3 ? 0.16 : 0.03)
      return
    }
    case 'hat':
      if (sampled(inst, v, 0.6)) return
      noiseHit(v, 0.22, 'highpass', 8000, 8000, 0.7, 0.04)
      return
    case 'ohat':
      if (sampled(inst, v, 0.6)) return
      noiseHit(v, 0.2, 'highpass', 7000, 7000, 0.7, 0.22)
      return
    case 'ride': {
      if (sampled(inst, v, 0.6)) return
      noiseHit(v, 0.12, 'bandpass', 6500, 6500, 2, 0.5)
      for (const r of [1, 1.47, 2.09]) {
        const g = env({ ...v, dur: 0.01 }, 0.05 / r, 0.001, 0.6)
        tone({ ...v, dur: 0.01 }, 'sine', 3100 * r, g, 0.6)
      }
      return
    }
    case 'crash': {
      if (sampled(inst, v, 0.7)) return
      noiseHit(v, 0.4, 'highpass', 4500, 3500, 0.5, 1.6)
      for (const r of [1, 1.31, 1.72, 2.4]) {
        const g = env({ ...v, dur: 0.01 }, 0.06 / r, 0.002, 1.5)
        tone({ ...v, dur: 0.01 }, 'sine', 2300 * r, g, 1.5)
      }
      return
    }
    case 'tom': {
      const base = f > 0 && f < 1000 ? f : 160
      if (sampled(inst, v, 0.9, base / 160)) return
      drop(v, base * 1.6, base * 0.85, 0.1, 0.7, 0.3)
      noiseHit(v, 0.15, 'lowpass', 1500, 300, 1, 0.05)
      return
    }
    case 'taiko': {
      const base = f > 0 && f < 500 ? f : 70
      if (sampled(inst, v, 1.0, base / 70)) return
      // a big skin: deep body with a slow pitch fall, a slap of noise, a long decay
      drop(v, base * 2.2, base, 0.12, 0.95, 0.75)
      noiseHit(v, 0.45, 'lowpass', 2200, 250, 0.8, 0.07)
      noiseHit(v, 0.2, 'bandpass', 700, 300, 1, 0.3)
      return
    }
    case 'orchHit': {
      if (sampled(inst, v, 0.9)) return
      // the whole orchestra on one chord: saw stacks, a timpani thump, a cymbal, and a long reverb send
      const chord = fs.length ? fs : [110, 164.8, 220]
      for (const fr of chord) {
        const flt = filterEnv(v, fr * 2, Math.min(8000, fr * 12), fr * 3, 0.03, 0.8)
        const g = env({ ...v, dest: flt, dur: 0.1 }, 0.14, 0.006, 0.6, 0.3)
        unison(v, 'sawtooth', fr, g, 5, 14, 0.6, 0.8)
      }
      drop(v, 120, 50, 0.12, 0.7, 0.5)
      noiseHit(v, 0.3, 'highpass', 3000, 2500, 0.5, 0.8)
      return
    }
    case 'impact': {
      if (sampled(inst, v, 1.0)) return
      // the sub drop: a thump that keeps falling, with a dull noise bloom
      drop(v, 90, 28, 0.6, 1.0, 1.2)
      noiseHit(v, 0.35, 'lowpass', 1200, 90, 1, 0.5)
      return
    }
    case 'rev': {
      if (sampledTail(inst, v, 0.8)) return
      // a cymbal in reverse over the note's length: noise swelling into the downbeat
      const dur = Math.max(0.2, v.dur)
      const src = ac.createBufferSource()
      src.buffer = noiseBuffer(ac)
      src.loop = true
      const flt = ac.createBiquadFilter()
      flt.type = 'highpass'
      flt.frequency.setValueAtTime(1200, v.t)
      flt.frequency.exponentialRampToValueAtTime(6000, v.t + dur)
      const g = ac.createGain()
      g.gain.setValueAtTime(0.0005, v.t)
      g.gain.exponentialRampToValueAtTime(0.35 * v.vel, v.t + dur)
      g.gain.linearRampToValueAtTime(0, v.t + dur + 0.03)
      src.connect(flt).connect(g).connect(v.dest)
      src.start(v.t, (v.t * 3.1) % 1.5)
      src.stop(v.t + dur + 0.05)
      return
    }
    case 'riser': {
      // a pitched riser: a saw climbing an octave through an opening filter over the note
      const dur = Math.max(0.3, v.dur)
      const base = f > 0 ? f : 110
      const flt = ac.createBiquadFilter()
      flt.type = 'lowpass'
      flt.Q.value = 3
      flt.frequency.setValueAtTime(base * 2, v.t)
      flt.frequency.exponentialRampToValueAtTime(base * 24, v.t + dur)
      flt.connect(v.dest)
      const g = ac.createGain()
      g.gain.setValueAtTime(0.001, v.t)
      g.gain.exponentialRampToValueAtTime(0.18 * v.vel, v.t + dur)
      g.gain.linearRampToValueAtTime(0, v.t + dur + 0.03)
      g.connect(flt)
      for (const d of [-8, 8]) {
        const o = ac.createOscillator()
        o.type = 'sawtooth'
        o.detune.value = d
        o.frequency.setValueAtTime(base, v.t)
        o.frequency.exponentialRampToValueAtTime(base * 2, v.t + dur)
        o.connect(g)
        o.start(v.t)
        o.stop(v.t + dur + 0.05)
      }
      return
    }
    case 'anvil':
    case 'clang': {
      if (sampled(inst, v, 0.8)) return
      const base = f > 0 && f < 4000 && f > 200 ? f : inst === 'anvil' ? 1250 : 820
      noiseHit(v, 0.3, 'highpass', 2500, 2500, 0.7, 0.03)
      const parts = inst === 'anvil' ? [1, 1.59, 2.14, 2.78] : [1, 1.35, 2.07, 3.3]
      parts.forEach((r, i) => {
        const g = env({ ...v, dur: 0.01 }, 0.22 / (1 + i), 0.001, inst === 'anvil' ? 0.55 - i * 0.1 : 0.9 - i * 0.15)
        tone({ ...v, dur: 0.01 }, 'sine', base * r, g, inst === 'anvil' ? 0.55 : 0.9)
      })
      return
    }
    case 'tick':
      if (sampled(inst, v, 0.7)) return
      noiseHit(v, 0.35, 'bandpass', 3200, 3200, 6, 0.02)
      return
    case 'shaker':
      if (sampled(inst, v, 0.6)) return
      noiseHit(v, 0.14, 'bandpass', 5500, 4500, 1.2, 0.07)
      return
    case 'timp': {
      const base = f > 0 && f < 1000 ? f : 82
      if (sampled(inst, v, 0.9, base / 82)) return
      drop(v, base * 1.5, base, 0.08, 0.8, 0.7)
      noiseHit(v, 0.2, 'lowpass', 500, 90, 1, 0.1)
      return
    }
  }
}
