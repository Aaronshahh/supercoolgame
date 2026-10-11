/** One gesture-unlocked context. Effects/reverb have their own compressor; looping music has a
 * steady gain. Both meet at the master volume and final peak limiter. */
export type UnlockCallback = () => void

class Engine {
  ctx: AudioContext | null = null
  master!: GainNode
  sfx!: GainNode
  music!: GainNode
  /** the current room's convolver (older ones ring out and are dropped) */
  verb!: ConvolverNode
  verbIn!: GainNode
  private comp!: DynamicsCompressorNode
  private limiter!: DynamicsCompressorNode
  private clip!: WaveShaperNode
  private verbs: { conv: ConvolverNode; gain: GainNode; seconds: number }[] = []
  private muted = false
  private musicOn = true
  private sfxOn = true
  /** bus levels 0..1 from the options screen; the on/off switches above sit on top of them */
  private musicVol = 1
  private sfxVol = 1
  private cbs: UnlockCallback[] = []
  private roomTone = -1

  /** Call from a user-gesture handler (mousedown, keydown). Safe to call every time. */
  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext()
      } catch {
        this.ctx = null
        return
      }
      this.build()
      this.ctx.addEventListener('statechange', () => this.flush())
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.resume()
      })
    }
    this.resume()
    this.flush()
  }

  private resume() {
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') {
      void this.ctx.resume().catch(() => {}) // another gesture can retry if the browser blocks it
    }
  }

  /** True once sound can actually be made. */
  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running'
  }

  /** Run `cb` as soon as the context is running (now, if it already is). */
  onUnlock(cb: UnlockCallback): void {
    if (this.running) cb()
    else this.cbs.push(cb)
  }

  private flush() {
    if (!this.running) return
    const cbs = this.cbs
    this.cbs = []
    for (const cb of cbs) cb()
  }

  private build() {
    const ac = this.ctx!
    this.master = ac.createGain()
    this.master.gain.value = this.muted ? 0 : 0.85
    // glue: slow enough to leave transients alone, fast enough to hold a dense bar together
    this.comp = ac.createDynamicsCompressor()
    this.comp.threshold.value = -14
    this.comp.knee.value = 18
    this.comp.ratio.value = 4
    this.comp.attack.value = 0.004
    this.comp.release.value = 0.18
    // the brick wall: a kill stack over the music's downbeat is the loudest thing we make
    this.limiter = ac.createDynamicsCompressor()
    this.limiter.threshold.value = -3
    this.limiter.knee.value = 0
    this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.001
    this.limiter.release.value = 0.08
    // Keep normal samples unchanged. Saturating the entire mix added grit to every sound.
    // Only peaks above 0.9 are rounded off; the limiter does the normal level control.
    this.clip = ac.createWaveShaper()
    const N = 2048
    const curve = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1
      const a = Math.abs(x)
      curve[i] = a <= 0.9 ? x : Math.sign(x) * (0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1))
    }
    this.clip.curve = curve
    this.clip.oversample = '2x'
    this.master.connect(this.limiter).connect(this.clip).connect(ac.destination)
    this.sfx = ac.createGain()
    this.sfx.gain.value = this.sfxOn ? this.sfxVol : 0
    this.sfx.connect(this.comp).connect(this.master)
    // The soundtrack keeps a steady level; effects are compressed on their own bus.
    this.music = ac.createGain()
    this.music.gain.value = this.musicOn ? this.musicVol : 0
    this.music.connect(this.master)
    this.verbIn = ac.createGain()
    this.verbIn.gain.value = 0.6
    this.setRoomTone(1.2, 0.5)
  }

  now(): number {
    return this.ctx ? this.ctx.currentTime : 0
  }

  setMuted(m: boolean): void {
    this.muted = m
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.now(), 0.02)
  }
  get isMuted(): boolean {
    return this.muted
  }

  setMusicOn(on: boolean): void {
    this.musicOn = on
    if (this.music) this.music.gain.setTargetAtTime(on ? this.musicVol : 0, this.now(), 0.05)
  }
  setSfxOn(on: boolean): void {
    this.sfxOn = on
    if (this.sfx) this.sfx.gain.setTargetAtTime(on ? this.sfxVol : 0, this.now(), 0.02)
  }
  /** Music bus level, 0..1 (the options slider). */
  setMusicVolume(v: number): void {
    this.musicVol = Math.max(0, Math.min(1, v))
    if (this.music) this.music.gain.setTargetAtTime(this.musicOn ? this.musicVol : 0, this.now(), 0.05)
  }
  /** Sound-effects bus level, 0..1. */
  setSfxVolume(v: number): void {
    this.sfxVol = Math.max(0, Math.min(1, v))
    if (this.sfx) this.sfx.gain.setTargetAtTime(this.sfxOn ? this.sfxVol : 0, this.now(), 0.02)
  }

  /**
   * The room's reverb: a generated impulse, `seconds` long, `bright` 0..1 (how much top end the walls
   * give back: stone 0.5, ice 0.9, a bamboo grove 0.2). A new room gets a new convolver; the old one
   * stops being fed and rings out its own tail before it is dropped. Regenerated only on a change.
   */
  setRoomTone(seconds: number, bright: number): void {
    const ac = this.ctx
    if (!ac) return
    const key = Math.round(seconds * 10) * 10 + Math.round(bright * 9)
    if (key === this.roomTone) return
    this.roomTone = key
    const buf = roomImpulse(ac, seconds, bright)
    for (const old of this.verbs) {
      this.verbIn.disconnect(old.conv)
      window.setTimeout(() => old.gain.disconnect(), old.seconds * 1000 + 500)
    }
    const conv = ac.createConvolver()
    conv.buffer = buf
    const gain = ac.createGain()
    gain.gain.value = 1
    this.verbIn.connect(conv).connect(gain).connect(this.comp)
    this.verbs = [{ conv, gain, seconds }]
    this.verb = conv
  }

}

export const engine = new Engine()

/** Shared with the offline soundtrack renderer. */
export function roomImpulse(ac: BaseAudioContext, seconds: number, bright: number): AudioBuffer {
  const sr = ac.sampleRate
  const n = Math.max(1, Math.floor(sr * seconds))
  const buf = ac.createBuffer(2, n, sr)
  // one-pole low-pass in the generation loop darkens the tail; the coefficient follows `bright`
  const k = 0.15 + 0.8 * bright
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let y = 0
    let seed = 1234567 + ch * 99991
    for (let i = 0; i < n; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      const white = seed / 2147483648 - 1
      y += k * (white - y)
      const env = Math.exp((-6.9 * i) / n) // −60 dB at the end
      // a few early reflections stand out of the diffuse tail
      d[i] = y * env * (i < sr * 0.03 ? 0.4 : 1)
    }
    for (let i = 0; i < 6; i++) {
      const at = Math.floor(sr * (0.008 + i * 0.011 + ch * 0.003))
      if (at < n) d[at] += 0.35 * (1 - i / 6)
    }
  }
  return buf
}
