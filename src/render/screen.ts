import { ctx2d, makeCanvas } from './pixelart.ts'

export interface Screen {
  /** Internal-resolution canvas everything is drawn to. */
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  /** The visible canvas, scaled to fill the window. */
  display: HTMLCanvasElement
  /** CSS pixels per internal pixel (fractional). */
  readonly scale: number
  present(): void
  /** Change the internal resolution (a different-sized arena); the display rescales to fit. */
  resize(w: number, h: number): void
  toInternal(clientX: number, clientY: number): [number, number]
  /** Take the display canvas out of the page and stop listening for resizes (the shell hands over to the game). */
  destroy(): void
}

/**
 * Creates an internal canvas plus a display canvas that fills the window (less `reserveBottom` CSS px
 * for the hint line), whatever the ratio. Pixel art hates fractional nearest-neighbour scaling (uneven
 * pixel columns), so the frame goes up in two steps: nearest-neighbour to the next whole multiple,
 * then a bilinear shrink down to the exact size ("sharp bilinear"). The shrink is never more than one
 * multiple, so the softening is a sub-pixel blur and the pixel columns stay even. The display canvas
 * is sized in device pixels so it is sharp on a Retina screen.
 */
export function createScreen(w: number, h: number, mount: HTMLElement, reserveBottom = 28): Screen {
  const canvas = makeCanvas(w, h)
  const ctx = ctx2d(canvas)
  const display = document.createElement('canvas')
  mount.appendChild(display)
  const dctx = ctx2d(display)
  // the whole-multiple step
  const mid = makeCanvas(w, h)
  const mctx = ctx2d(mid)
  let scale = 1 // CSS px per internal px
  let whole = 1 // the nearest-neighbour multiple

  function present() {
    if (mid.width === display.width && mid.height === display.height) {
      // a whole multiple: one nearest-neighbour blit
      dctx.imageSmoothingEnabled = false
      dctx.drawImage(canvas, 0, 0, display.width, display.height)
      return
    }
    mctx.imageSmoothingEnabled = false
    mctx.drawImage(canvas, 0, 0, mid.width, mid.height)
    dctx.imageSmoothingEnabled = true
    dctx.imageSmoothingQuality = 'high'
    dctx.drawImage(mid, 0, 0, display.width, display.height)
  }

  // Resizing a canvas clears it, so re-present immediately rather than waiting for the next frame.
  function fit() {
    const sw = window.innerWidth
    const sh = Math.max(1, window.innerHeight - reserveBottom)
    scale = Math.max(0.5, Math.min(sw / w, sh / h))
    const dpr = window.devicePixelRatio || 1
    const cssW = Math.floor(w * scale)
    const cssH = Math.floor(h * scale)
    whole = Math.max(1, Math.ceil(scale * dpr - 1e-6))
    mid.width = w * whole
    mid.height = h * whole
    display.width = Math.round(cssW * dpr)
    display.height = Math.round(cssH * dpr)
    display.style.width = `${cssW}px`
    display.style.height = `${cssH}px`
    present()
  }
  window.addEventListener('resize', fit)
  fit()

  return {
    canvas,
    ctx,
    display,
    get scale() {
      return scale
    },
    present,
    resize(nw, nh) {
      if (nw === w && nh === h) return
      w = nw
      h = nh
      canvas.width = w // clears it; the caller renders the next frame right after
      canvas.height = h
      ctx.imageSmoothingEnabled = false
      fit()
    },
    toInternal(clientX, clientY) {
      const r = display.getBoundingClientRect()
      return [((clientX - r.left) / r.width) * w, ((clientY - r.top) / r.height) * h]
    },
    destroy() {
      window.removeEventListener('resize', fit)
      display.remove()
    },
  }
}
