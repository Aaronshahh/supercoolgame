// Deterministic full-game traces: brake anywhere, hover once per throw, return from rest, and the cap.
// node scripts/hover-smoke.mjs [site URL]
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { Browser, buildAndServe } from './lib/headless.mjs'

async function freePort() {
  const socket = createServer()
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  return port
}

const browser = new Browser(`hover-${Date.now()}`, await freePort())
let server
const timeout = setTimeout(() => { console.error('FAIL: hover test timed out'); process.exit(1) }, 60000)
process.on('exit', () => { browser.close(); server?.kill() })

try {
  let base = process.argv[2]
  if (!base) {
    const port = await freePort()
    server = await buildAndServe(port)
    base = `http://127.0.0.1:${port}/`
  }
  const cases = [
    ['ordinary throw', ''],
    ['early outbound hold', '20,30'],
    ['late outbound hold', '40,50'],
    ['hold on return', '70,85'],
    ['repeated hold on return', '20,30;40,50'],
    ['brief hold', '20,21'],
    ['release and re-hold during braking', '20,21;23,50'],
    ['re-hold after cap', '20,80;82,110'],
    ['hover duration cap', '20,110'],
    ['launch click stays held', '10,75'],
  ]
  let launched = false
  let ordinary
  for (const [label, holds] of cases) {
    const url = new URL(base)
    for (const [k, v] of new URLSearchParams('arena=floor&walk=1,0,0&bots=0&seed=3&t=180&trace=1&mute=1&powerups=0')) url.searchParams.set(k, v)
    url.searchParams.set('hover', holds)
    browser.log = []
    if (!launched) { await browser.launch(url.href); launched = true }
    else await browser.send('Page.navigate', { url: url.href })
    assert.ok(await browser.waitFor(/^END t180 /, 10000), `${label}: scripted match completed`)
    assert.ok(!browser.log.some((l) => /Uncaught|Error:/.test(l)), `${label}: no runtime error`)
    const trace = browser.log.flatMap((line) => {
      const m = /^T(\d+) .* P0 (out|hang|return)(\d+)?(\((?:hover|brake)\))? ([-\d.]+),([-\d.]+) v=([\d.]+)/.exec(line)
      return m ? [{ t: +m[1], state: m[2], hover: m[4] === '(hover)', brake: m[4] === '(brake)', x: +m[5], y: +m[6], speed: +m[7] }] : []
    })
    assert.ok(trace.length > 20, `${label}: captured flight`)
    if (!holds) {
      ordinary = trace
      assert.ok(trace.some((p) => p.state === 'return'), 'Ordinary throw returns')
      assert.ok(!trace.some((p) => p.hover), 'Ordinary throw does not hover')
    } else {
      const windows = holds.split(';').map((s) => s.split(',').map(Number))
      if (label === 'launch click stays held') {
        assert.ok(trace.filter((p) => p.t >= 10 && p.t < 40).every((p) => p.state === 'out'), 'Launch click does not immediately stop its own throw')
      } else {
        const [start, end] = windows[0]
        const first = trace.find((p) => p.t >= start && p.brake)
        assert.ok(first && first.t <= start + 1, `${label}: starts braking immediately`)
        const before = trace.find((p) => p.t === first.t - 1)
        assert.ok(first.speed > 0 && first.speed < before.speed, `${label}: slows without snapping to zero`)
        const stopped = trace.find((p) => p.t > first.t && p.state === 'hang' && p.hover)
        assert.ok(stopped && stopped.t <= first.t + 6, `${label}: stops within 100 ms`)
        const braking = trace.filter((p) => p.t >= first.t && p.t <= stopped.t)
        assert.ok(braking.every((p, i) => !i || p.speed < braking[i - 1].speed), `${label}: speed falls steadily`)
        assert.equal(stopped.speed, 0, `${label}: finishes at rest`)
        const stationary = trace.filter((p) => p.state === 'hang' && p.hover)
        assert.ok(stationary.every((p) => p.speed === 0 && p.x === stopped.x && p.y === stopped.y), `${label}: hover stays in one place`)
        assert.ok(!trace.some((p) => p.t > stopped.t && p.brake), `${label}: no second hover`)
        if (end <= first.t + 6) {
          const released = trace.find((p) => p.t > stopped.t)
          assert.equal(released.state, 'return', `${label}: release during braking commits to return`)
        }
      }
      assert.ok(trace.some((p) => p.hover), `${label}: exercised a hover`)
    }
    const returns = trace.filter((p, i) => p.state === 'return' && trace[i - 1]?.state === 'hang')
    assert.ok(returns.length === (label === 'hold on return' ? 2 : 1), `${label}: returns after every stop`)
    for (const restart of returns) {
      assert.equal(restart.speed, 0, `${label}: return starts at rest`)
      const next = trace.find((p) => p.t === restart.t + 1)
      assert.ok(next.speed > 0 && next.speed < 0.3, `${label}: first return tick accelerates normally (${next.speed})`)
      const second = trace.find((p) => p.t === restart.t + 2)
      assert.ok(second.speed > next.speed && second.speed < 0.5, `${label}: gradual acceleration continues`)
    }
    if (label === 'hover duration cap') {
      assert.ok(returns[0].t >= 69 && returns[0].t <= 71, '45-tick hover cap still applies')
      assert.ok(!trace.some((p) => p.t > returns[0].t && p.hover), 'Still holding after the cap cannot immediately re-hover')
    }
    if (label === 'hold on return') {
      assert.equal(ordinary.find((p) => p.t === 69).state, 'return', 'Hold intercepted the return leg')
    }
    console.log(`PASS ${label}: ${returns.length} smooth return${returns.length === 1 ? '' : 's'} from zero speed`)
  }
} catch (error) {
  console.error(browser.log.filter((l) => /^T(1[5-9]|[2-9]\d)|Uncaught|Error:/.test(l)).slice(0, 25).join('\n'))
  throw error
} finally {
  clearTimeout(timeout)
  browser.close()
  server?.kill()
}
process.exit(0)
