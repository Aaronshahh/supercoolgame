import { ctx2d, makeCanvas } from './pixelart.ts'

export interface Screen {
  /** Internal-resolution canvas everything is drawn to. */
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  /** The visible, integer-scaled canvas. */
  display: HTMLCanvasElement
  readonly scale: number
  present(): void
  /** Change the internal resolution (a different-sized arena); the display rescales to fit. */
  resize(w: number, h: number): void
  toInternal(clientX: number, clientY: number): [number, number]
}

/** Creates an internal canvas plus a display canvas scaled by the largest integer factor that fits. */
export function createScreen(w: number, h: number, mount: HTMLElement, reserveBottom = 40): Screen {
  const canvas = makeCanvas(w, h)
  const ctx = ctx2d(canvas)
  const display = document.createElement('canvas')
  mount.appendChild(display)
  const dctx = ctx2d(display)
  let scale = 1

  function present() {
    dctx.imageSmoothingEnabled = false
    dctx.drawImage(canvas, 0, 0, display.width, display.height)
  }

  // Resizing a canvas clears it, so re-present immediately rather than waiting for the next frame.
  function fit() {
    const sw = window.innerWidth
    const sh = window.innerHeight - reserveBottom
    scale = Math.max(1, Math.floor(Math.min(sw / w, sh / h)))
    display.width = w * scale
    display.height = h * scale
    display.style.width = `${w * scale}px`
    display.style.height = `${h * scale}px`
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
      return [(clientX - r.left) / scale, (clientY - r.top) / scale]
    },
  }
}
