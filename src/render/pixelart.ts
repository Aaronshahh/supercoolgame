import type { PaletteKey } from '../art/palette.ts'

export interface Sprite {
  w: number
  h: number
  img: HTMLCanvasElement
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  ctx.imageSmoothingEnabled = false
  return ctx
}

/** Build a sprite from ASCII rows. '.' is transparent; every other char must be in `key`. */
export function spriteFromRows(rows: string[], key: PaletteKey, name = 'sprite'): Sprite {
  const h = rows.length
  const w = rows[0]?.length ?? 0
  const img = makeCanvas(w, h)
  const g = ctx2d(img)
  for (let y = 0; y < h; y++) {
    const row = rows[y]
    if (row.length !== w) throw new Error(`${name}: row ${y} width ${row.length} != ${w}`)
    for (let x = 0; x < w; x++) {
      const ch = row[x]
      if (ch === '.') continue
      const color = key[ch]
      if (color === undefined) throw new Error(`${name}: unknown palette char "${ch}" at ${x},${y}`)
      g.fillStyle = color
      g.fillRect(x, y, 1, 1)
    }
  }
  return { w, h, img }
}

export function flipX(s: Sprite): Sprite {
  const img = makeCanvas(s.w, s.h)
  const g = ctx2d(img)
  g.translate(s.w, 0)
  g.scale(-1, 1)
  g.drawImage(s.img, 0, 0)
  return { w: s.w, h: s.h, img }
}

/** Exact 90° clockwise rotation done per-pixel so nothing gets resampled. */
export function rotate90(s: Sprite): Sprite {
  const src = ctx2d(s.img).getImageData(0, 0, s.w, s.h)
  const img = makeCanvas(s.h, s.w)
  const g = ctx2d(img)
  const dst = g.createImageData(s.h, s.w)
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const si = (y * s.w + x) * 4
      const dx = s.h - 1 - y
      const dy = x
      const di = (dy * s.h + dx) * 4
      dst.data[di] = src.data[si]
      dst.data[di + 1] = src.data[si + 1]
      dst.data[di + 2] = src.data[si + 2]
      dst.data[di + 3] = src.data[si + 3]
    }
  }
  g.putImageData(dst, 0, 0)
  return { w: s.h, h: s.w, img }
}

/** Solid single-colour copy of a sprite's silhouette (for afterimages and flashes). */
export function silhouette(s: Sprite, color: string): Sprite {
  const img = makeCanvas(s.w, s.h)
  const g = ctx2d(img)
  g.drawImage(s.img, 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = color
  g.fillRect(0, 0, s.w, s.h)
  return { w: s.w, h: s.h, img }
}
