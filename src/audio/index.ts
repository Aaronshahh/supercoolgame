/**
 * The audio layer's door (docs/07). Render-side only: the sim calls `sfx()` at the moment something
 * happens and the render loop keeps `loop()` voices alive; nothing in here is read back.
 */
import './samples.ts'
export { engine } from './engine.ts'
export { sfx, loop, endFrame, stopLoops, setListener, loadSamples, assignSamples } from './sfx.ts'
export type { SfxName, LoopName } from './sfx.ts'
export { music } from './music.ts'
