/**
 * The menus' widgets, drawn on the game canvas in the pixel font so the shell looks like the game
 * (docs/05 §6). A Menu is a column of items with one selection, driven by keyboard (arrows or WASD
 * to move, left/right to adjust, Enter to activate) and mouse (hover selects, click activates or
 * sets). Render-only: nothing here touches the simulation.
 */
import { PAL } from '../art/palette.ts'
import { drawText, textWidth } from '../render/text.ts'

interface Common {
  label: string
  hint?: string
  disabled?: boolean
}
export type Item =
  | (Common & { kind: 'button'; onSelect: () => void; color?: string })
  | (Common & { kind: 'toggle'; get: () => boolean; set: (v: boolean) => void })
  | (Common & { kind: 'slider'; min: number; max: number; get: () => number; set: (v: number) => void })
  | (Common & { kind: 'select'; values: string[]; get: () => number; set: (i: number) => void })
  | (Common & { kind: 'text'; get: () => string; set: (v: string) => void; max: number; allowed?: RegExp; onEnter?: () => void; placeholder?: string })
  | { kind: 'label'; label: string; color?: string; hint?: undefined; disabled?: undefined }
  | { kind: 'gap'; label?: undefined; hint?: undefined; disabled?: undefined }

interface Row {
  x: number
  y: number
  w: number
  h: number
}

export interface MenuStyle {
  rowH: number
  /** px reserved on the right for the value column */
  valueW: number
  scale: number
}

const DEFAULT_STYLE: MenuStyle = { rowH: 12, valueW: 64, scale: 1 }
const SLIDER_CELLS = 10

export class Menu {
  items: Item[]
  sel = 0
  /** the layout from the last draw, for mouse hit-testing */
  private rows: Row[] = []
  private blinkT = 0

  constructor(items: Item[]) {
    this.items = items
    this.sel = this.firstSelectable()
  }

  private firstSelectable(): number {
    const i = this.items.findIndex((it) => this.selectable(it))
    return i < 0 ? 0 : i
  }

  private selectable(it: Item): boolean {
    return it.kind !== 'label' && it.kind !== 'gap' && !it.disabled
  }

  get current(): Item | undefined {
    return this.items[this.sel]
  }

  /** The selected item's hint line, if any. */
  hint(): string {
    return this.current?.hint ?? ''
  }

  /** Replace the items, keeping the selection on the same label where possible. */
  setItems(items: Item[]): void {
    const label = this.current?.label
    this.items = items
    const i = label ? items.findIndex((it) => it.label === label && this.selectable(it)) : -1
    this.sel = i >= 0 ? i : this.firstSelectable()
  }

  select(i: number): void {
    if (i >= 0 && i < this.items.length && this.selectable(this.items[i])) this.sel = i
  }

  move(dir: 1 | -1): void {
    const n = this.items.length
    if (!n) return
    let i = this.sel
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n
      if (this.selectable(this.items[i])) {
        this.sel = i
        return
      }
    }
  }

  adjust(dir: 1 | -1): boolean {
    const it = this.current
    if (!it || it.disabled) return false
    switch (it.kind) {
      case 'toggle':
        it.set(!it.get())
        return true
      case 'slider':
        it.set(Math.max(it.min, Math.min(it.max, it.get() + dir)))
        return true
      case 'select':
        it.set((it.get() + dir + it.values.length) % it.values.length)
        return true
      default:
        return false
    }
  }

  activate(): boolean {
    const it = this.current
    if (!it || it.disabled) return false
    switch (it.kind) {
      case 'button':
        it.onSelect()
        return true
      case 'toggle':
      case 'select':
        return this.adjust(1)
      case 'text':
        it.onEnter?.()
        return true
      default:
        return false
    }
  }

  /** Feed a keydown. Returns true if the menu used it (so the caller leaves it alone). */
  key(e: KeyboardEvent): boolean {
    const it = this.current
    const typing = it?.kind === 'text' && !it.disabled
    switch (e.code) {
      case 'ArrowUp':
        this.move(-1)
        return true
      case 'ArrowDown':
        this.move(1)
        return true
      case 'Tab':
        this.move(e.shiftKey ? -1 : 1)
        return true
      case 'ArrowLeft':
        return typing ? true : this.adjust(-1)
      case 'ArrowRight':
        return typing ? true : this.adjust(1)
      case 'Enter':
      case 'NumpadEnter':
        return this.activate()
      case 'Space':
        if (typing) break
        return this.activate()
    }
    if (typing) {
      const t = it as Extract<Item, { kind: 'text' }>
      if (e.code === 'Backspace') {
        t.set(t.get().slice(0, -1))
        return true
      }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const ch = e.key.toUpperCase()
        if ((t.allowed ?? /^[A-Z0-9 \-]$/).test(ch) && t.get().length < t.max) t.set(t.get() + ch)
        return true
      }
      return false
    }
    // WASD doubles for the arrows when nothing is being typed
    switch (e.code) {
      case 'KeyW':
        this.move(-1)
        return true
      case 'KeyS':
        this.move(1)
        return true
      case 'KeyA':
        return this.adjust(-1)
      case 'KeyD':
        return this.adjust(1)
    }
    return false
  }

  /** Pasted text goes into the selected text field. */
  paste(text: string): boolean {
    const it = this.current
    if (it?.kind !== 'text' || it.disabled) return false
    const allowed = it.allowed ?? /^[A-Z0-9 \-]$/
    const clean = Array.from(text.toUpperCase())
      .filter((ch) => allowed.test(ch))
      .join('')
      .slice(0, it.max)
    it.set(clean)
    return true
  }

  private rowAt(x: number, y: number): number {
    for (let i = 0; i < this.rows.length; i++) {
      const r = this.rows[i]
      if (r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h && this.selectable(this.items[i])) return i
    }
    return -1
  }

  /** Hover selects. */
  mouseMove(x: number, y: number): void {
    const i = this.rowAt(x, y)
    if (i >= 0) this.sel = i
  }

  /** A click activates what is under it; on a slider it sets the value by position, on a select the half decides the direction. */
  click(x: number, y: number): boolean {
    const i = this.rowAt(x, y)
    if (i < 0) return false
    this.sel = i
    const it = this.items[i]
    const r = this.rows[i]
    if (it.kind === 'slider') {
      const vx0 = r.x + r.w - this.lastStyle.valueW
      const cell = this.lastStyle.valueW / (SLIDER_CELLS + 2)
      const v = Math.round(((x - vx0 - cell) / (cell * SLIDER_CELLS)) * (it.max - it.min)) + it.min
      it.set(Math.max(it.min, Math.min(it.max, x < vx0 ? it.get() : v)))
      return true
    }
    if (it.kind === 'select') {
      const vx0 = r.x + r.w - this.lastStyle.valueW
      return this.adjust(x >= vx0 && x < vx0 + this.lastStyle.valueW / 2 ? -1 : 1)
    }
    return this.activate()
  }

  private lastStyle: MenuStyle = DEFAULT_STYLE

  /** Draw at (x, y) with width w; returns the height used. */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, style: Partial<MenuStyle> = {}): number {
    const st = { ...DEFAULT_STYLE, ...style }
    this.lastStyle = st
    this.blinkT++
    this.rows = []
    let cy = y
    this.items.forEach((it, i) => {
      if (it.kind === 'gap') {
        this.rows[i] = { x, y: cy, w, h: st.rowH / 2 }
        cy += st.rowH / 2
        return
      }
      const selected = i === this.sel
      const h = st.rowH
      this.rows[i] = { x, y: cy, w, h }
      const ty = cy + Math.round((h - 5 * st.scale) / 2)
      if (it.kind === 'label') {
        drawText(ctx, it.label, x + 8, ty, it.color ?? PAL.hudDim, st.scale)
        cy += h
        return
      }
      const col = it.disabled ? PAL.hudDim : selected ? PAL.white : PAL.bone
      if (selected) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)'
        ctx.fillRect(x, cy, w, h)
        drawText(ctx, '>', x + 1, ty, PAL.cream, st.scale)
      }
      drawText(ctx, it.label, x + 8, ty, it.kind === 'button' && it.color && !it.disabled ? it.color : col, st.scale)
      const vx = x + w - st.valueW
      const vcol = it.disabled ? PAL.hudDim : PAL.cream
      switch (it.kind) {
        case 'toggle':
          drawText(ctx, it.get() ? 'ON' : 'OFF', x + w - textWidth(it.get() ? 'ON' : 'OFF', st.scale), ty, it.get() ? vcol : PAL.hudDim, st.scale)
          break
        case 'slider': {
          const cell = st.valueW / (SLIDER_CELLS + 2)
          const v = (it.get() - it.min) / (it.max - it.min)
          const filled = Math.round(v * SLIDER_CELLS)
          drawText(ctx, '<', vx, ty, selected ? PAL.hudDim : 'transparent', st.scale)
          for (let k = 0; k < SLIDER_CELLS; k++) {
            ctx.fillStyle = k < filled ? vcol : PAL.hudLine
            ctx.fillRect(Math.round(vx + cell * (k + 1)) + 1, ty, Math.max(1, Math.round(cell) - 2), 5 * st.scale)
          }
          drawText(ctx, '>', vx + st.valueW - 3 * st.scale, ty, selected ? PAL.hudDim : 'transparent', st.scale)
          break
        }
        case 'select': {
          const v = it.values[it.get()] ?? ''
          drawText(ctx, '<', vx, ty, selected && !it.disabled ? PAL.hudDim : 'transparent', st.scale)
          drawText(ctx, v, vx + st.valueW / 2 - textWidth(v, st.scale) / 2, ty, vcol, st.scale)
          drawText(ctx, '>', vx + st.valueW - 3 * st.scale, ty, selected && !it.disabled ? PAL.hudDim : 'transparent', st.scale)
          break
        }
        case 'text': {
          const v = it.get()
          const show = v || (selected ? '' : (it.placeholder ?? ''))
          const caret = selected && !it.disabled && (this.blinkT & 32) === 0
          ctx.fillStyle = PAL.hudLine
          ctx.fillRect(vx, cy + h - 2, st.valueW, 1)
          drawText(ctx, show + (caret ? '_' : ''), vx + 2, ty, v ? vcol : PAL.hudDim, st.scale)
          break
        }
      }
      cy += h
    })
    return cy - y
  }
}

/** A dark panel with a one-pixel line round it. */
export function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.88): void {
  ctx.globalAlpha = alpha
  ctx.fillStyle = PAL.outline
  ctx.fillRect(x, y, w, h)
  ctx.globalAlpha = 1
  ctx.fillStyle = PAL.hudLine
  ctx.fillRect(x, y, w, 1)
  ctx.fillRect(x, y + h - 1, w, 1)
  ctx.fillRect(x, y, 1, h)
  ctx.fillRect(x + w - 1, y, 1, h)
}

/** Centred text with a drop shadow, for titles over a scene. */
export function drawTitle(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, color: string, scale: number, shadow = '#140c14'): void {
  const x = Math.round(cx - textWidth(text, scale) / 2)
  drawText(ctx, text, x + scale, y + scale, shadow, scale)
  drawText(ctx, text, x, y, color, scale)
}

export function drawCentered(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, color: string, scale = 1): void {
  drawText(ctx, text, Math.round(cx - textWidth(text, scale) / 2), y, color, scale)
}

/** The crosshair the game uses, so the menus and the match share one pointer. */
export function drawPointer(ctx: CanvasRenderingContext2D, mx: number, my: number): void {
  const x = Math.round(mx)
  const y = Math.round(my)
  ctx.fillStyle = PAL.outline
  ctx.fillRect(x - 4, y - 1, 9, 3)
  ctx.fillRect(x - 1, y - 4, 3, 9)
  ctx.fillStyle = PAL.white
  ctx.fillRect(x - 3, y, 2, 1)
  ctx.fillRect(x + 2, y, 2, 1)
  ctx.fillRect(x, y - 3, 1, 2)
  ctx.fillRect(x, y + 2, 1, 2)
}
