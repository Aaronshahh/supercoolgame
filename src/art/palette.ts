/**
 * The game palette. Dark, desaturated purples and browns for the environment,
 * saturated accents for anything that matters (players, fire, projectiles).
 */
export const PAL = {
  outline: '#140c14',
  white: '#f2eef5',
  bone: '#e6dccb',
  boneDark: '#b8a992',
  cream: '#efd9b0',
  creamDark: '#c9ab7a',
  red: '#d8506a',
  grey: '#3a3340',

  wood: '#8a5a32',
  woodLight: '#a8743f',
  woodDark: '#5c3a1f',
  metal: '#6d6d7a',
  metalLight: '#9a9aa8',

  flameY: '#ffd86b',
  flameO: '#ff9a2e',
  flameR: '#e8531e',

  floor: ['#3d3240', '#433745', '#392e3c', '#403443'],
  floorLight: '#4d3f50',
  floorMortar: '#241c26',
  floorCrack: '#2a2129',
  floorSpeck: '#564657',

  wallCap: '#2a2330',
  wallCapLight: '#3b3242',
  wallCapEdge: '#5a4e60',
  wallCapJoint: '#1f1924',
  wallCapDark: '#16111a',

  brick: ['#9c6a42', '#a8744a', '#8d5e3a', '#b07c4e'],
  brickLight: '#c08a58',
  brickMortar: '#3a2418',

  pit: '#0b0810',
  pitWall: '#4a3f52',
  pitWallDark: '#2d2533',

  grassBase: '#2f4a2c',
  grass: ['#4f7a3a', '#6a9a48', '#3f6530'],
  grassCut: '#26381f',

  bg: '#0a080c',
  hud: '#0e0a12',
  hudLine: '#2a2330',
  hudDim: '#4a3f52',
} as const

export const PLAYER_COLORS = ['#f4c542', '#46c8e6', '#e65aa8', '#7ad24a', '#ff7f3b', '#e8e4f0']

export type PaletteKey = Record<string, string>

/**
 * Palette shared by every character sprite. P/p/h (primary colour) are added per player.
 * T/t are the boomerang's wood, for the catch frames that have it baked into the pose.
 */
export const CHAR_KEY: PaletteKey = {
  o: PAL.outline,
  k: PAL.outline,
  w: PAL.white,
  b: PAL.bone,
  d: PAL.boneDark,
  c: PAL.cream,
  C: PAL.creamDark,
  r: PAL.red,
  g: PAL.grey,
  T: PAL.woodLight,
  t: PAL.wood,
}

export const PROP_KEY: PaletteKey = {
  o: PAL.outline,
  k: PAL.outline,
  T: PAL.woodLight,
  t: PAL.wood,
  u: PAL.woodDark,
  m: PAL.metal,
  M: PAL.metalLight,
  g: PAL.grey,
  y: PAL.flameY,
  O: PAL.flameO,
  R: PAL.flameR,
  b: PAL.bone,
  d: PAL.boneDark,
  s: 'rgba(8,5,12,0.45)',
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t)
}

/** Darken toward a purple-black rather than pure black; keeps shadows in the palette's family. */
export function darken(hex: string, t: number): string {
  return mix(hex, '#1a0f1e', t)
}

export function lighten(hex: string, t: number): string {
  return mix(hex, '#fff6e0', t)
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

export function withPrimary(key: PaletteKey, primary: string): PaletteKey {
  return { ...key, P: primary, p: darken(primary, 0.4), h: lighten(primary, 0.4) }
}
