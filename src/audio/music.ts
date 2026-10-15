/** One continuous, pre-rendered loop per room. No note timer or per-frame music events. */
import { engine } from './engine.ts'
import tracks from './music-tracks.json'

export const MUSIC_TRACKS = tracks
type MusicTrack = (typeof tracks)[number]
interface Playing {
  track: MusicTrack
  source: AudioBufferSourceNode
  gain: GainNode
  /** AudioContext time the source started, for beatPhase. */
  startAt: number
}

let playing: Playing | null = null
let wanted: string | null = null
let request = 0
const buffers = new Map<string, AudioBuffer>()
const loads = new Map<string, Promise<AudioBuffer>>()

async function load(track: MusicTrack): Promise<AudioBuffer> {
  const cached = buffers.get(track.key)
  if (cached) {
    buffers.delete(track.key)
    buffers.set(track.key, cached)
    return cached
  }
  const existing = loads.get(track.key)
  if (existing) return existing
  const loading = (async () => {
    // A transient network failure gets one retry. The old song keeps playing throughout.
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(`./music/${track.file}`, { signal: AbortSignal.timeout(15000) })
        if (!response.ok) throw new Error(`Music ${track.key}: HTTP ${response.status}`)
        const buffer = await engine.ctx!.decodeAudioData(await response.arrayBuffer())
        buffers.set(track.key, buffer)
        // Bound decoded memory. Playing sources retain their own buffers when evicted here.
        if (buffers.size > 3) buffers.delete(buffers.keys().next().value!)
        return buffer
      } catch (error) {
        if (attempt === 1) throw error
      }
    }
  })()
  loads.set(track.key, loading)
  try { return await loading } finally { loads.delete(track.key) }
}

function fadeOut(p: Playing, seconds: number) {
  const now = engine.now()
  p.gain.gain.cancelAndHoldAtTime(now)
  p.gain.gain.linearRampToValueAtTime(0, now + seconds)
  p.source.stop(now + seconds + 0.02)
  p.source.onended = () => { p.source.disconnect(); p.gain.disconnect() }
}

export const music = {
  playRoom(key: string, fade = 0.8): void {
    const track = tracks.find(t => t.key === key)
    if (!track || wanted === key) return
    wanted = key
    const id = ++request
    if (playing?.track.key === key) return
    engine.onUnlock(() => {
      if (id !== request) return
      void load(track).then(buffer => {
        if (id !== request) return // a slower download must not replace a newer room
        const ac = engine.ctx!
        const at = ac.currentTime + 0.02
        const seconds = Math.max(0.02, fade)
        const source = ac.createBufferSource()
        source.buffer = buffer
        source.loop = true
        const gain = ac.createGain()
        gain.gain.setValueAtTime(0, at)
        gain.gain.linearRampToValueAtTime(1, at + seconds)
        source.connect(gain).connect(engine.music)
        source.start(at)
        if (playing) fadeOut(playing, seconds)
        playing = { track, source, gain, startAt: at }
        engine.setRoomTone(track.reverb[0], track.reverb[1])
      }).catch(error => {
        if (id === request) wanted = null // a later request can retry
        console.warn('Music could not load; keeping the current track.', error)
      })
    })
  },

  stop(fade = 0.5): void {
    ++request
    wanted = null
    if (playing) fadeOut(playing, Math.max(0.02, fade))
    playing = null
  },

  /** A small, smooth tape slowdown; the loop never stops or restarts. */
  deathSlow(): void {
    if (!playing || !engine.running) return
    const rate = playing.source.playbackRate
    const now = engine.now()
    rate.cancelAndHoldAtTime(now)
    rate.linearRampToValueAtTime(0.9, now + 0.04)
    rate.setValueAtTime(0.9, now + 0.4)
    rate.linearRampToValueAtTime(1, now + 0.6)
  },

  clearDeathSlow(): void {
    if (!playing) return
    const rate = playing.source.playbackRate
    const now = engine.now()
    rate.cancelAndHoldAtTime(now)
    rate.linearRampToValueAtTime(1, now + 0.04)
  },

  current(): MusicTrack | null { return playing?.track ?? null },

  /**
   * Beats elapsed since the playing track started, for visuals synced to the music (the dance
   * floor). Null when nothing plays yet; drifts a hair during the deathSlow dip, which no one
   * will see. The loop length is a whole number of bars, so phase survives the loop join.
   */
  beatPhase(): number | null {
    if (!playing || !engine.running) return null
    const elapsed = engine.now() - playing.startAt
    if (elapsed < 0) return null
    return elapsed * (playing.track.bpm / 60)
  },
}
