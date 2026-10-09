import { ctx2d, makeCanvas } from './pixelart.ts'

export interface Light {
  x: number
  y: number
  /** Radius of the carved-out brightness. */
  r: number
  /** Peak brightness 0..1. */
  a: number
  /** Optional additive coloured glow (css rgba string) drawn on top of the scene. */
  glow?: string
  glowR?: number
}

/**
 * Screen-space lightmap: a darkness layer with vignette, with lights carved out of it.
 * Rendered at internal resolution so the gradients stay chunky when scaled up.
 */
export class Lightmap {
  private readonly cv: HTMLCanvasElement
  private readonly g: CanvasRenderingContext2D

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.cv = makeCanvas(w, h)
    this.g = ctx2d(this.cv)
  }

  render(lights: readonly Light[], ambient: number, vignette: number): void {
    const { g, w, h } = this
    g.globalCompositeOperation = 'source-over'
    g.clearRect(0, 0, w, h)
    g.fillStyle = `rgba(8,5,12,${ambient})`
    g.fillRect(0, 0, w, h)

    const vg = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.62)
    vg.addColorStop(0, 'rgba(8,5,12,0)')
    vg.addColorStop(1, `rgba(8,5,12,${vignette})`)
    g.fillStyle = vg
    g.fillRect(0, 0, w, h)

    g.globalCompositeOperation = 'destination-out'
    for (const l of lights) {
      const rg = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r)
      rg.addColorStop(0, `rgba(255,255,255,${l.a})`)
      rg.addColorStop(0.45, `rgba(255,255,255,${l.a * 0.5})`)
      rg.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = rg
      g.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2)
    }
  }

  /** Draws the darkness over the scene, then the additive glows. */
  compose(ctx: CanvasRenderingContext2D, lights: readonly Light[]): void {
    ctx.drawImage(this.cv, 0, 0)
    ctx.globalCompositeOperation = 'lighter'
    for (const l of lights) {
      if (!l.glow) continue
      const r = l.glowR ?? l.r * 0.8
      const rg = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r)
      rg.addColorStop(0, l.glow)
      rg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = rg
      ctx.fillRect(l.x - r, l.y - r, r * 2, r * 2)
    }
    ctx.globalCompositeOperation = 'source-over'
  }
}
