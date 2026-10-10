import { FONT, FONT_H, FONT_W } from '../art/font.ts'

const ADVANCE = FONT_W + 1

/** Width in pixels; `scale` draws each font pixel as a scale × scale block (whole numbers). */
export function textWidth(text: string, scale = 1): number {
  return (text.length * ADVANCE - 1) * scale
}

export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, scale = 1): void {
  ctx.fillStyle = color
  let cx = Math.round(x)
  const cy = Math.round(y)
  for (const ch of text.toUpperCase()) {
    const glyph = FONT[ch] ?? FONT['?'] ?? FONT[' ']
    for (let gy = 0; gy < FONT_H; gy++) {
      const row = glyph[gy]
      for (let gx = 0; gx < FONT_W; gx++) {
        if (row[gx] === '#') ctx.fillRect(cx + gx * scale, cy + gy * scale, scale, scale)
      }
    }
    cx += ADVANCE * scale
  }
}

/** Text with a dark drop shadow one font pixel down and right, for use over busy backgrounds. */
export function drawTextShadowed(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  shadow = '#140c14',
  scale = 1,
): void {
  drawText(ctx, text, x + scale, y + scale, shadow, scale)
  drawText(ctx, text, x, y, color, scale)
}
