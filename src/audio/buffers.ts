/**
 * Decoded recordings shared by the sound effects and the music's drums. Files live under
 * public/sfx/ and are fetched after the first user gesture; a file that fails to load simply never
 * appears in the map, and whoever asked for it falls back to synthesis.
 */
import { engine } from './engine.ts'

const buffers = new Map<string, AudioBuffer>()
const loading = new Set<string>()

export function loadBuffers(names: Iterable<string>): void {
  const ac = engine.ctx
  if (!ac) return
  for (const name of names) {
    if (buffers.has(name) || loading.has(name)) continue
    loading.add(name)
    fetch(`./sfx/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status} ${name}`))))
      .then((ab) => ac.decodeAudioData(ab))
      .then((buf) => buffers.set(name, buf))
      .catch(() => {})
      .finally(() => loading.delete(name))
  }
}

export function getBuffer(name: string): AudioBuffer | undefined {
  return buffers.get(name)
}
