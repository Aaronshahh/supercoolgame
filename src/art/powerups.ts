/**
 * Power-up icons (docs/03 §9): one 7×7 glyph per kind, drawn on a 9×9 dark badge so the same sprite
 * reads on the floor, over a player's head and in the HUD. Each kind has one hue nothing else in
 * the room uses in that shape: fire is a red flame, the bomb a grey ball with a spark, "big" a fat
 * bone chevron, "triple" a white trident, ice an ice-blue snowflake, speed a yellow double
 * chevron, the shield a teal heater and blink a violet star.
 */
import { PAL, type PaletteKey } from './palette.ts'

export const POWER_KEY: PaletteKey = {
  o: PAL.outline,
  w: PAL.white,
  b: PAL.bone,
  d: PAL.boneDark,
  R: PAL.flameR,
  O: PAL.flameO,
  y: PAL.flameY,
  m: PAL.metal,
  M: PAL.metalLight,
  g: PAL.grey,
  i: PAL.iceLight,
  I: PAL.iceDark,
  t: PAL.teal,
  T: PAL.tealDark,
  v: PAL.violet,
  V: PAL.violetDark,
}

export const GLYPH_SIZE = 7
export const BADGE_SIZE = 9

/** The 7×7 glyphs, keyed by power-up kind (src/demo/powerups.ts asserts every kind has one). */
export const POWER_GLYPHS: Record<string, string[]> = {
  fire: [
    '...R...',
    '..RR...',
    '..RRR..',
    '.RROR..',
    '.ROyOR.',
    '.ROyOR.',
    '..OyO..',
  ],
  bomb: [
    '.....y.',
    '....g..',
    '..mmm..',
    '.mMmmm.',
    '.mmmmm.',
    '.mmmmm.',
    '..mmm..',
  ],
  big: [
    '.bbb...',
    '.bbbb..',
    '..bbbb.',
    '...bbbb',
    '..bbbb.',
    '.bbbb..',
    '.bbb...',
  ],
  triple: [
    'w..w..w',
    'w..w..w',
    '.w.w.w.',
    '..www..',
    '...w...',
    '...w...',
    '...w...',
  ],
  ice: [
    '...i...',
    '.i.i.i.',
    '..iii..',
    'iiiwiii',
    '..iii..',
    '.i.i.i.',
    '...i...',
  ],
  speed: [
    'y..y...',
    '.y..y..',
    '..y..y.',
    '...y..y',
    '..y..y.',
    '.y..y..',
    'y..y...',
  ],
  shield: [
    'ttttttt',
    'tTtttTt',
    'tttwttt',
    'tttwttt',
    '.ttttt.',
    '..ttt..',
    '...t...',
  ],
  blink: [
    '...v...',
    '...v...',
    '.v.w.v.',
    'vvwwwvv',
    '.v.w.v.',
    '...v...',
    '...v...',
  ],
}

/** A glyph on its badge: a 9×9 dark rounded square with the 7×7 glyph centred on it. */
export function badgeRows(glyph: string[]): string[] {
  const rows: string[] = []
  for (let y = 0; y < BADGE_SIZE; y++) {
    let row = ''
    for (let x = 0; x < BADGE_SIZE; x++) {
      const corner = (x === 0 || x === BADGE_SIZE - 1) && (y === 0 || y === BADGE_SIZE - 1)
      const inner = glyph[y - 1]?.[x - 1]
      row += corner ? '.' : inner && inner !== '.' ? inner : 'o'
    }
    rows.push(row)
  }
  return rows
}
