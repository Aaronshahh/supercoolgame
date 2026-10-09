/**
 * Placeholder sound for the demo: a couple of Web Audio blips so the armed boomerang can beep and
 * bang. Everything is synthesized, no samples. The context is only created on the first user
 * gesture (browsers refuse to start audio before one), so scripted headless runs stay silent and
 * never touch it. The real audio spec is docs/07.
 */

let ac: AudioContext | null = null

/** Call from a user-gesture handler (mousedown, keydown). Safe to call every time. */
export function unlockAudio() {
  if (!ac) {
    try {
      ac = new AudioContext()
    } catch {
      ac = null
      return
    }
  }
  if (ac.state === 'suspended') void ac.resume()
}

function tone(freq: number, endFreq: number, dur: number, type: OscillatorType, gain: number) {
  if (!ac || ac.state !== 'running') return
  const t0 = ac.currentTime
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur)
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  osc.connect(g).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur)
}

/** The fuse beep: a short, high square-wave blip. */
export function sfxBeep() {
  tone(1320, 1320, 0.07, 'square', 0.1)
}

/** The blast: a burst of low-passed noise under a pitch drop. */
export function sfxBlast() {
  if (!ac || ac.state !== 'running') return
  const t0 = ac.currentTime
  const dur = 0.45
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2
  const src = ac.createBufferSource()
  src.buffer = buf
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(900, t0)
  lp.frequency.exponentialRampToValueAtTime(120, t0 + dur)
  const g = ac.createGain()
  g.gain.setValueAtTime(0.5, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  src.connect(lp).connect(g).connect(ac.destination)
  src.start(t0)
  tone(160, 40, 0.3, 'sine', 0.35)
}
