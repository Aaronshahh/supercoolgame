/**
 * The power-up roster (docs/03 §5): kinds, names, colours, one-line blurbs. Pure data, shared by the
 * sim, the renderer and the HUD. The rules live in main.ts next to the mechanics they change.
 */
import { PAL } from '../art/palette.ts'
import { POWER_GLYPHS } from '../art/powerups.ts'

export type PowerKind = 'fire' | 'bomb' | 'big' | 'triple' | 'ice' | 'speed' | 'shield' | 'blink'

export const POWER_KINDS: PowerKind[] = ['fire', 'bomb', 'big', 'triple', 'ice', 'speed', 'shield', 'blink']

export interface PowerInfo {
  name: string
  /** Trail, glow and particle colour. */
  color: string
  /** True for a boomerang flag (copied onto the boomerang at throw time), false for a body power-up. */
  boomerang: boolean
  blurb: string
}

export const POWERS: Record<PowerKind, PowerInfo> = {
  fire: { name: 'Fire', color: PAL.flameR, boomerang: true, blurb: 'The throw leaves a line of fire behind it. Grass catches.' },
  bomb: { name: 'Bomb', color: PAL.flameO, boomerang: true, blurb: 'The boomerang blows up where it stops, then comes back.' },
  big: { name: 'Big', color: PAL.bone, boomerang: true, blurb: 'Twice the size: twice the reach, and it smashes what it passes.' },
  triple: { name: 'Triple', color: PAL.white, boomerang: true, blurb: 'Two phantom boomerangs fly out beside yours and fade at the end.' },
  ice: { name: 'Ice', color: PAL.iceLight, boomerang: true, blurb: 'The throw leaves a trail of ice behind it. Everyone slides on it, you included. Fire and ice cancel.' },
  speed: { name: 'Speed', color: PAL.flameY, boomerang: false, blurb: 'Run faster, dash more often.' },
  shield: { name: 'Shield', color: PAL.teal, boomerang: false, blurb: 'Takes one hit for you. Not the floor: pits, spikes, vents and fire still get you.' },
  blink: { name: 'Blink', color: PAL.violet, boomerang: false, blurb: 'Dash while empty-handed to teleport to your boomerang and catch it.' },
}

export function isPowerKind(s: string): s is PowerKind {
  return (POWER_KINDS as string[]).includes(s)
}

for (const k of POWER_KINDS) if (!POWER_GLYPHS[k]) throw new Error(`power-up ${k} has no icon glyph`)
