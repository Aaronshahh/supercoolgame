import { FONT, FONT_H, FONT_W } from '../art/font.ts'

const ADVANCE = FONT_W + 1

export function textWidth(text: string): number {
  return text.length * ADVANCE - 1
}

export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
  ctx.fillStyle = color
  let cx = Math.round(x)
  const cy = Math.round(y)
  for (const ch of text.toUpperCase()) {
    const glyph = FONT[ch] ?? FONT['?'] ?? FONT[' ']
    for (let gy = 0; gy < FONT_H; gy++) {
      const row = glyph[gy]
      for (let gx = 0; gx < FONT_W; gx++) {
        if (row[gx] === '#') ctx.fillRect(cx + gx, cy + gy, 1, 1)
      }
    }
    cx += ADVANCE
  }
}

/** Text with a 1px dark drop shadow, for use over busy backgrounds. */
export function drawTextShadowed(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  shadow = '#140c14',
): void {
  drawText(ctx, text, x + 1, y + 1, shadow)
  drawText(ctx, text, x, y, color)
}
