/**
 * The Options rows, shared by the main menu's Options screen and the in-game pause menu so a change
 * made in either lands in the same `options` object and is saved the same way.
 */
import { engine } from '../audio/index.ts'
import { applyAudioOptions, options, saveOptions } from './options.ts'
import type { Item } from './ui.ts'

export function optionsItems(back: () => void): Item[] {
  const audio = () => {
    applyAudioOptions()
    saveOptions()
  }
  const save = () => saveOptions()
  return [
    { kind: 'label', label: 'SOUND' },
    { kind: 'slider', label: 'MUSIC', min: 0, max: 10, get: () => options.musicVol, set: (v) => ((options.musicVol = v), audio()), hint: 'LEFT / RIGHT TO ADJUST' },
    { kind: 'slider', label: 'EFFECTS', min: 0, max: 10, get: () => options.sfxVol, set: (v) => ((options.sfxVol = v), audio()), hint: 'LEFT / RIGHT TO ADJUST' },
    { kind: 'toggle', label: 'MUTE', get: () => options.mute, set: (v) => ((options.mute = v), engine.setMuted(v), save()), hint: 'M IN THE GAME DOES THE SAME' },
    { kind: 'gap' },
    { kind: 'label', label: 'PICTURE' },
    { kind: 'toggle', label: 'SCREEN SHAKE', get: () => options.shake, set: (v) => ((options.shake = v), save()), hint: 'SHAKE AND THE WHITE FLASH ON A BLAST' },
    { kind: 'toggle', label: 'DEATH ZOOM', get: () => options.hitstop, set: (v) => ((options.hitstop = v), save()), hint: 'A BRIEF CAMERA ZOOM ON A DEATH' },
    { kind: 'toggle', label: 'LIGHTING', get: () => options.lighting, set: (v) => ((options.lighting = v), save()), hint: 'TORCHLIGHT AND SHADOW; OFF IS FLAT AND BRIGHT' },
    { kind: 'gap' },
    { kind: 'button', label: 'BACK', onSelect: back },
  ]
}
