/**
 * Player-side settings and profile, kept in localStorage so they survive a reload. Everything here
 * is render- or audio-side (docs/04 §9 accessibility toggles, docs/07 levels) or lobby identity;
 * nothing the simulation reads. The game reads `options` live, so the pause menu's changes apply at
 * once; URL params (`?shake=0`, `?light=0`, `?mute=1` …) override for the page without being saved.
 */
import { characterIndex } from '../art/characters.ts'
import { engine } from '../audio/index.ts'

export interface Options {
  /** 0..10 */
  musicVol: number
  /** 0..10 */
  sfxVol: number
  mute: boolean
  shake: boolean
  hitstop: boolean
  lighting: boolean
  /** lobby name, 1–8 characters of the pixel font */
  name: string
  /** Index into CHARACTERS. */
  char: number
}

export const NAME_MAX = 8
const KEY = 'boomerangeon.options.v1'

const DEFAULTS: Options = { musicVol: 7, sfxVol: 8, mute: false, shake: true, hitstop: true, lighting: true, name: '', char: 0 }

function load(): Options {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const o = JSON.parse(raw) as Partial<Options>
    return {
      musicVol: clampInt(o.musicVol, 0, 10, DEFAULTS.musicVol),
      sfxVol: clampInt(o.sfxVol, 0, 10, DEFAULTS.sfxVol),
      mute: typeof o.mute === 'boolean' ? o.mute : DEFAULTS.mute,
      shake: typeof o.shake === 'boolean' ? o.shake : DEFAULTS.shake,
      hitstop: typeof o.hitstop === 'boolean' ? o.hitstop : DEFAULTS.hitstop,
      lighting: typeof o.lighting === 'boolean' ? o.lighting : DEFAULTS.lighting,
      name: typeof o.name === 'string' ? cleanName(o.name) : '',
      char: characterIndex(o.char),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function clampInt(v: unknown, lo: number, hi: number, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : dflt
}

/** Upper-case letters, digits, space and dash only (what the font has), at most NAME_MAX of them. */
export function cleanName(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9 \-]/g, '')
    .replace(/\s+/g, ' ')
    .trimStart()
    .slice(0, NAME_MAX)
}

/** The live settings. Mutate, then call saveOptions() (and applyAudioOptions() for the sound ones). */
export const options: Options = load()

export function saveOptions(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(options))
  } catch {
    // private mode or no storage: the page keeps its values for the session
  }
}

/** Push the audio side of the options into the engine (safe before the AudioContext exists). */
export function applyAudioOptions(): void {
  engine.setMuted(options.mute)
  engine.setMusicVolume(options.musicVol / 10)
  engine.setSfxVolume(options.sfxVol / 10)
}
