/**
 * Audio smoke test, `?audio=test`: unlocks the engine without a gesture, plays every sound event,
 * every loop, every instrument and the first steps of every song, and reports the number of
 * uncaught errors to the console. For headless Chrome (scripts/audio-smoke.sh), which has no ears
 * but does throw on a bad AudioParam ramp. Not part of the game.
 */
import { engine } from './engine.ts'
import { endFrame, loop, sfx, type LoopName, type SfxName } from './sfx.ts'
import { music, MUSIC_TRACKS } from './music.ts'
import { playInst, type InstName } from './score.ts'

const SFX: SfxName[] = [
  'throw', 'catch', 'deflect', 'arm', 'swing', 'dash', 'shove', 'bounce', 'bumper', 'slice', 'burn', 'fall',
  'squash', 'blast', 'beep', 'crate', 'barrelLit', 'grass', 'pickupGlow', 'pickupLand', 'pickupTake', 'pickupLost',
  'pickupFizzle', 'shieldPop', 'blink', 'ice', 'steam', 'spikes', 'vent', 'gate', 'creak', 'chandelierFall',
  'chandelierLand', 'crumble', 'warp', 'spawnDrop', 'spawnLand', 'phantomPop', 'ready', 'win',
]
const LOOPS: LoopName[] = ['flight', 'hover', 'saw', 'cart', 'boulder', 'pendulum', 'fuse']
/** Give the final track time to load and exercise its brief slowdown. */
const HOLD = 60
const INSTS: InstName[] = [
  'supersaw', 'lead', 'arp', 'stab', 'horn', 'strings', 'choir', 'pad', 'organ', 'bell', 'pluck', 'glass', 'piano',
  'bass', 'dbass', 'reese', 'sub', 'guitar', 'guitarLead',
  'kick', 'kick808', 'snare', 'clap', 'hat', 'ohat', 'ride', 'crash', 'tom', 'taiko', 'orchHit', 'impact', 'rev',
  'riser', 'anvil', 'clang', 'tick', 'shaker', 'timp',
]

export function runAudioSmoke(): void {
  let errors = 0
  const seen: string[] = []
  window.addEventListener('error', (e) => {
    errors++
    seen.push(String(e.message))
  })
  window.addEventListener('unhandledrejection', (e) => {
    errors++
    seen.push(String(e.reason))
  })
  engine.unlock()
  let step = 0
  const start = performance.now()
  const timer = window.setInterval(() => {
    const ac = engine.ctx
    if (!ac || !engine.running) {
      if (performance.now() - start > 4000) {
        window.clearInterval(timer)
        console.log(`AUDIO SMOKE: context never ran (state ${ac?.state ?? 'none'})`)
      }
      return
    }
    try {
      if (step < SFX.length) sfx(SFX[step], undefined, { pitch: 1 + (step % 3) * 0.1 })
      else if (step < SFX.length + LOOPS.length) {
        const name = LOOPS[step - SFX.length]
        for (let i = 0; i < 3; i++) {
          loop(`smoke-${name}`, name, 100 * i, i / 2, 1)
          endFrame()
        }
      } else if (step < SFX.length + LOOPS.length + INSTS.length) {
        const inst = INSTS[step - SFX.length - LOOPS.length]
        const v = { ac, dest: engine.music, t: ac.currentTime + 0.01, dur: 0.25, vel: 1 }
        playInst(inst, v, [220, 329.6, 440])
        playInst(inst, { ...v, dur: 0.05 }, [])
      } else if (step < SFX.length + LOOPS.length + INSTS.length + MUSIC_TRACKS.length) {
        // Exercise rapid room changes; the latest loaded track wins.
        const i = step - SFX.length - LOOPS.length - INSTS.length
        const song = MUSIC_TRACKS[MUSIC_TRACKS.length - 1 - i]
        music.playRoom(song.key, 0.05)
      } else if (step < SFX.length + LOOPS.length + INSTS.length + MUSIC_TRACKS.length + HOLD) {
        const i = step - SFX.length - LOOPS.length - INSTS.length - MUSIC_TRACKS.length
        if (i === 10) music.deathSlow()
        if (i === HOLD - 1 && music.current()?.key !== 'cellar') throw new Error('last room did not finish loading')
      } else {
        window.clearInterval(timer)
        music.stop(0.05)
        console.log(`AUDIO SMOKE: ${errors} error(s); context ${ac.state} at ${ac.currentTime.toFixed(2)} s; ${step} steps${seen.length ? '\n' + seen.join('\n') : ''}`)
      }
    } catch (e) {
      errors++
      seen.push(`step ${step}: ${(e as Error).message}`)
    }
    step++
  }, 60)
}
