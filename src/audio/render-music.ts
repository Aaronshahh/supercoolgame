/** Build-time only: render the original arrangements to seamless, steady soundtrack loops. */
import './music-drums.ts'
import { SONGS } from './songs.ts'
import { drumSampleNames, parseSeq, playInst, rootHz } from './score.ts'
import { engine, roomImpulse } from './engine.ts'
import { getBuffer, loadBuffers } from './buffers.ts'

export async function renderSong(key: string) {
  const song = SONGS.find(s => s.key === key)!
  const sr = 44100
  const stepSeconds = 240 / song.bpm / song.steps
  const parsed = song.tracks.map(t => ({ t, seq: parseSeq(t.seq, t.oct), alt: t.alt ? parseSeq(t.alt, t.oct) : null }))
  const form = Math.max(...parsed.map(t => t.seq.length))
  const steps = form * (parsed.some(t => t.alt) ? 2 : 1)
  const length = Math.round(steps * stepSeconds * sr)
  // A whole previous form establishes held notes, reverb, and compressor state at the loop join.
  const warmSteps = form
  const warmFrames = Math.round(warmSteps * stepSeconds * sr)
  const ac = new OfflineAudioContext(2, warmFrames + length, sr)
  engine.ctx = ac as unknown as AudioContext
  const names = [...new Set(drumSampleNames())]
  loadBuffers(names)
  for (let i = 0; i < 200 && names.some(n => !getBuffer(n)); i++) await new Promise(r => setTimeout(r, 50))
  const missing = names.filter(n => !getBuffer(n))
  if (missing.length) throw Error(`Missing drum samples: ${missing.join(', ')}`)
  const master = ac.createGain()
  const notch = ac.createBiquadFilter()
  notch.type = 'peaking'; notch.frequency.value = 3000; notch.Q.value = 0.9; notch.gain.value = -4
  const comp = ac.createDynamicsCompressor()
  comp.threshold.value = -18; comp.knee.value = 18; comp.ratio.value = 4
  comp.attack.value = 0.004; comp.release.value = 0.18
  master.connect(notch).connect(comp).connect(ac.destination)
  const verb = ac.createConvolver()
  verb.buffer = roomImpulse(ac, song.reverb[0], song.reverb[1])
  verb.connect(master)
  const tracks = parsed.filter(({t}) => !t.light).map(p => {
    const gain = ac.createGain(); gain.gain.value = p.t.gain * (p.t.layer === 3 ? 0.55 : 1)
    const pan = ac.createStereoPanner(); pan.pan.value = p.t.pan ?? 0
    gain.connect(pan).connect(master)
    const send = ac.createGain(); send.gain.value = (p.t.send ?? 0.2) * 0.6
    gain.connect(send).connect(verb)
    return {...p, gain}
  })
  // Queue small chunks during offline rendering to bound the graph's memory use.
  const queue = (from: number, to: number) => {
    for (let step = from; step < to; step++) {
      const logical = step - warmSteps
      const position = ((logical % steps) + steps) % steps
      const second = Math.floor(position / form) % 2 === 1
      const time = step * stepSeconds + (position % 2 ? (song.swing ?? 0) * stepSeconds : 0)
      for (const { t, seq, alt, gain } of tracks) {
        const tokens = second && alt ? alt : seq
        const token = tokens[position % tokens.length]
        if (token.rest || token.tie) continue
        const dur = Math.max(0.03, (token.len - (1 - (t.gate ?? 0.9))) * stepSeconds)
        playInst(t.inst, { ac, dest: gain, t: time, dur, vel: token.vel, root: rootHz(song.root) }, token.f)
      }
    }
  }
  const totalSteps = warmSteps + steps
  const chunk = song.steps * 2
  queue(0, Math.min(chunk, totalSteps))
  let suspension: Promise<void> | null = chunk < totalSteps ? ac.suspend(chunk * stepSeconds - 0.02) : null
  const rendering = ac.startRendering()
  for (let from = chunk; from < totalSteps; from += chunk) {
    await suspension
    queue(from, Math.min(from + chunk, totalSteps))
    suspension = from + chunk < totalSteps ? ac.suspend((from + chunk) * stepSeconds - 0.02) : null
    await ac.resume()
  }
  const rendered = await rendering
  const channels = [0,1].map(ch => rendered.getChannelData(ch).slice(warmFrames, warmFrames + length))
  let peak = 0, sum = 0
  for (const channel of channels) for (const v of channel) { peak = Math.max(peak, Math.abs(v)); sum += v*v }
  const rms = Math.sqrt(sum / (length * 2))
  const scale = Math.min(0.16 / rms, 0.8 / peak)
  // A 5 ms correction at the seam removes any residual mismatch from random drum takes/tails.
  const seam = Math.round(sr * 0.005)
  for (const channel of channels) {
    const delta = channel[length - 1] - channel[0]
    for (let i = 0; i < seam; i++) channel[i] += delta * (1 - i / seam)
  }
  const wav = new ArrayBuffer(44 + length * 4)
  const view = new DataView(wav)
  const text = (at: number, s: string) => [...s].forEach((c,i) => view.setUint8(at+i,c.charCodeAt(0)))
  text(0,'RIFF'); view.setUint32(4,wav.byteLength-8,true); text(8,'WAVEfmt ')
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,2,true)
  view.setUint32(24,sr,true); view.setUint32(28,sr*4,true); view.setUint16(32,4,true); view.setUint16(34,16,true)
  text(36,'data'); view.setUint32(40,length*4,true)
  for (let i=0;i<length;i++) for(let ch=0;ch<2;ch++) view.setInt16(44+(i*2+ch)*2,Math.round(Math.max(-1,Math.min(1,channels[ch][i]*scale))*32767),true)
  const bytes = new Uint8Array(wav)
  let binary = ''
  for (let i=0;i<bytes.length;i+=32768) binary += String.fromCharCode(...bytes.subarray(i,i+32768))
  return { key, title:song.title, reverb:song.reverb, seconds:length/sr, peak:peak*scale, rms:rms*scale, wav:btoa(binary) }
}
