// Exercise the normal lobby/START path, two human controls, and actual background tabs.
// node scripts/lobby-smoke.mjs [site URL] (without a URL, builds and serves the working copy).
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { Browser, buildAndServe, sleep } from './lib/headless.mjs'

async function freePort() {
  const socket = createServer()
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  return port
}

const teams = process.argv.includes('--teams')
const newCharacters = process.argv.includes('--characters')
const combatOnly = process.argv.includes('--combat-only')
const seedArg = process.argv.find(a => a.startsWith('--seed='))
const replaySeed = seedArg ? Number(seedArg.slice(7)) : null
if (combatOnly) assert.ok(teams, '--combat-only requires --teams')
if (replaySeed !== null) assert.ok(Number.isInteger(replaySeed) && replaySeed > 0 && replaySeed < 2 ** 31, 'Replay seed is valid')
const stamp = Date.now()
const host = new Browser(`lobby-host-${stamp}`, await freePort())
const guest = new Browser(`lobby-guest-${stamp}`, await freePort())
const browsers = [host, guest]
const extras = teams ? [new Browser(`team-third-${stamp}`, await freePort()), new Browser(`team-fourth-${stamp}`, await freePort())] : []
const clients = [...browsers, ...extras]
let server
const timeout = setTimeout(() => { console.error('FAIL: lobby smoke timed out'); process.exit(1) }, teams ? 180000 : 120000)
process.on('exit', () => {
  for (const b of clients) b.close()
  server?.kill()
})

async function launchClient(browser, url, char) {
  if (!newCharacters) return browser.launch(url)
  await browser.launch('about:blank')
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('boomerangeon.options.v1', JSON.stringify({char:${char},name:'TEST${char}'}))` })
  await browser.send('Page.navigate', {url})
}

async function evaluate(b, expression) {
  const result = await b.send('Runtime.evaluate', { expression, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

async function clickMenu(b, x, y) {
  const point = await evaluate(b, `(() => { const r=document.querySelector('#game canvas').getBoundingClientRect(); return {x:r.left+r.width*${x}/640,y:r.top+r.height*${y}/360} })()`)
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
}

const key = (b, type, k) => b.send('Input.dispatchKeyEvent', {
  type, key: k, code: `Key${k.toUpperCase()}`, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0),
})
const hashes = (b) => new Map(b.log.flatMap((l) => {
  const m = /NET t(\d+) hash (\d+)/.exec(l)
  return m ? [[+m[1], m[2]]] : []
}))
const lastTick = (b) => Math.max(0, ...hashes(b).keys())

async function hide(b) {
  const blank = await b.send('Target.createTarget', { url: 'about:blank' })
  await b.send('Target.activateTarget', { targetId: blank.targetId })
  assert.equal(await evaluate(b, 'document.visibilityState'), 'hidden', 'Test tab is actually hidden')
  return blank.targetId
}

async function show(b, blank) {
  await b.send('Page.bringToFront')
  await b.send('Target.closeTarget', { targetId: blank })
  assert.equal(await evaluate(b, 'document.visibilityState'), 'visible')
}

async function checkPace(label, seconds = 5) {
  const before = browsers.map(lastTick)
  const start = performance.now()
  await sleep(seconds * 1000)
  const elapsed = (performance.now() - start) / 1000
  const paces = browsers.map((b, i) => (lastTick(b) - before[i]) / elapsed)
  for (const pace of paces) assert.ok(pace >= 45 && pace <= 75, `${label}: ${pace.toFixed(1)} ticks/s`)
  console.log(`PASS ${label}: ${paces.map((v) => v.toFixed(1)).join(' / ')} ticks/s`)
}

try {
  mkdirSync('shots', { recursive: true })
  let base = process.argv.slice(2).find(a => !a.startsWith('--'))
  if (!base) {
    const port = await freePort()
    server = await buildAndServe(port)
    base = `http://127.0.0.1:${port}/`
  }
  const gameUrl = (query) => {
    const url = new URL(base)
    for (const [key, value] of new URLSearchParams(query)) url.searchParams.set(key, value)
    return url.href
  }
  await launchClient(host, gameUrl('test=manual&mute=1'), 4)
  await sleep(1500)
  await clickMenu(host, 275, 155)
  assert.ok(await host.waitFor(/NET lobby host open/, 15000), 'Host opens a room through the normal menu')
  const code = /NET lobby host open code=([A-Z0-9]+)/.exec(host.log.join('\n'))[1]
  await launchClient(guest, gameUrl(`test=manual&room=${code}&mute=1${teams ? '&hitstop=0' : ''}`), 5)
  assert.ok(await guest.waitFor(/NET lobby guest open/, 15000), 'Guest joins the room')
  assert.ok(!host.log.some((l) => /NET start/.test(l)), 'Lobby waits for host START')
  for (const lives of [5, 7, 3]) {
    await clickMenu(host, 300, 138)
    assert.ok(await guest.waitFor(new RegExp('NET lobby guest open.*lives=' + lives), 5000), `Guest receives ${lives}-life setting`)
  }
  console.log('PASS host selects 3/5/7 lives; guest receives each setting')
  if (teams) {
    await clickMenu(host, 300, 114)
    assert.ok(await guest.waitFor(/NET lobby guest open.*mode=teams/,5000), 'Guest sees 2v2 mode')
    await clickMenu(guest, 300, 110)
    assert.ok(await host.waitFor(/NET lobby host open.*mode=teams teams=0,0/,5000), 'Guest chooses host team')
    for (const b of extras) {
      await launchClient(b, gameUrl(`test=manual&room=${code}&mute=1`), b === extras[0] ? 6 : 0)
      assert.ok(await b.waitFor(/NET lobby guest open/,15000), 'Other team joins the room')
    }
    assert.ok(await host.waitFor(/NET lobby host open.*teams=0,0,1,1/,5000), 'Two humans on each team')
    console.log('PASS 2v2 mode and guest team selection; four human clients joined')
  }
  await host.shot(teams ? 'shots/teams-lobby.png' : 'shots/lobby-before-start.png')

  // This used to stop at the opening countdown: the hidden guest never supplied further input.
  const hiddenGuest = await hide(guest)
  if (replaySeed !== null) {
    // Fix only the START seed in this isolated browser, preserving the failed spawn layout.
    await evaluate(host, `(() => {const original=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=(array)=>{if(array instanceof Uint32Array && array.length===1){crypto.getRandomValues=original;array[0]=${replaySeed * 2};return array}return original(array)}})()`)
  }
  await clickMenu(host, 100, teams ? 230 : 218)
  assert.ok(await host.waitFor(/NET start/, 10000), 'Host START sends the match')
  assert.ok(await guest.waitFor(/NET start/, 10000), 'Guest receives START')
  for (const b of extras) assert.ok(await b.waitFor(/NET start/, 15000), 'Every teammate receives START before checking the roster')
  assert.ok(browsers.every(b => b.log.some(l => /NET start.*lives=3/.test(l))), 'Both clients start with the selected life count')
  if (replaySeed !== null) assert.ok(host.log.some(l => l.includes(`NET start seed=${replaySeed} `)), 'Failed match seed is reused')
  if (newCharacters) {
    const expected = teams ? '4,5,6,0' : '4,5'
    assert.ok(clients.every(b=>b.log.some(line=>line.includes('NET start')&&line.includes('chars='+expected))), 'New character IDs survive saved profiles, lobby exchange and START')
    console.log('PASS new characters reach every client: '+expected)
  }
  assert.ok(await host.waitFor(/NET t180 hash/, 10000), 'Match clears the countdown with a hidden guest')
  const positionLine = () => host.log.filter((l) => /NET t\d+ hash/.test(l)).at(-1)
  const positions = (line) => /players (.+)/.exec(line)[1].split(' ')
  if (!combatOnly) {
  await checkPace('START with guest hidden')
  await show(guest, hiddenGuest)

  const before = positions(positionLine())
  await Promise.all([key(host, 'keyDown', 'd'), key(guest, 'keyDown', 'a')])
  await sleep(1000)
  await Promise.all([key(host, 'keyUp', 'd'), key(guest, 'keyUp', 'a')])
  await sleep(800)
  const after = positions(positionLine())
  assert.notEqual(before[0], after[0], 'Host moved')
  assert.notEqual(before[1], after[1], 'Guest moved at the same time')
  console.log('PASS simultaneous input from both players')

  // Exercise held mouse input over the real connection, including the new mid-flight hover.
  // The lobby's default Cellar has a 576×318 canvas; aim outward, away from the other player.
  const aimPoints = await Promise.all(browsers.map(async (b, i) => {
    const [x, y] = after[i].split(',').map(Number)
    const otherX = Number(after[1 - i].split(',')[0])
    const left = x < otherX || (x === otherX && i === 0)
    return evaluate(b, `(() => { const r=document.querySelector('#game canvas').getBoundingClientRect(); return {x:r.left+r.width*${left ? 0.02 : 0.98},y:r.top+r.height*${(y + 6) / 318}} })()`)
  }))
  const mouse = (type) => Promise.all(browsers.map((b, i) => b.send('Input.dispatchMouseEvent', {
    type, ...aimPoints[i], button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1,
  })))
  await mouse('mouseMoved')
  await mouse('mousePressed')
  await sleep(40)
  await mouse('mouseReleased')
  await sleep(150)
  await mouse('mousePressed')
  await sleep(600)
  await mouse('mouseReleased')
  for (const b of browsers) {
    assert.ok(await b.waitFor(/^NET booms.*(?=.*P0 hang\d+\(hover\))(?=.*P1 hang\d+\(hover\))/, 2000), 'Both network players hovered their thrown boomerangs')
  }
  await sleep(1000)
  console.log('PASS two players throwing, hovering in flight, and releasing')

  const hiddenHost = await hide(host)
  await checkPace('host hidden during play')
  await show(host, hiddenHost)
  const hiddenGuestAgain = await hide(guest)
  await checkPace('guest hidden during play')

  // Message-driven stepping must still obey the real-time cap; both hidden must not run away.
  const hiddenHostAgain = await hide(host)
  const beforeHidden = browsers.map(lastTick)
  const hiddenAt = performance.now()
  await sleep(2000)
  const hiddenSeconds = (performance.now() - hiddenAt) / 1000
  for (const [i, b] of browsers.entries()) {
    assert.ok((lastTick(b) - beforeHidden[i]) / hiddenSeconds <= 75, 'Both hidden: no runaway simulation')
  }
  await show(host, hiddenHostAgain)
  await show(guest, hiddenGuestAgain)
  await checkPace('both tabs restored')
  } else await show(guest, hiddenGuest)

  if (teams) {
    // Read actual positions instead of assuming wall-clock time equals simulation time.
    // The clear northern corridor is above the crates on the spawn row.
    const pos = slot => positions(positionLine())[slot].split(',').map(Number)
    async function moveUntil(b, keyName, reached, label) {
      if (reached()) return
      const until = performance.now() + 12000
      await key(b, 'keyDown', keyName)
      try {
        while (!reached() && performance.now() < until) await sleep(100)
      } finally { await key(b, 'keyUp', keyName) }
      assert.ok(reached(), label)
      await sleep(700)
    }
    for(const [b,slot] of [[host,0],[extras[0],2]]) {
      const left=pos(slot)[0]<288
      await moveUntil(b,left?'a':'d',()=>left?pos(slot)[0]<=35:pos(slot)[0]>=540,`Player ${slot} reaches the outer corridor`)
      await moveUntil(b, 'w', () => pos(slot)[1] <= 40, `Player ${slot} reaches the clear top corridor`)
    }
    const [hx]=pos(0),[ex]=pos(2)
    const approach=ex>hx?'d':'a'
    await moveUntil(host, approach, () => Math.abs(pos(2)[0]-pos(0)[0]) <= 85, 'Shooter reaches boomerang range')
    // The body can touch the top wall, but the raised boomerang needs a little clearance.
    for (const [b,slot] of [[host,0],[extras[0],2]]) {
      // Hold through the movement startup; short taps can end before the body gets moving.
      await moveUntil(b,'s',()=>pos(slot)[1]>=60,'Player steps away from the top wall')
      assert.ok(pos(slot)[1]>=43 && pos(slot)[1]<125, 'Throw clears the top wall and stays in the open outer lane')
    }
    const [tx,ty]=pos(2)
    const point=await evaluate(host,`(() => {const r=document.querySelector('#game canvas').getBoundingClientRect();return {x:r.left+r.width*${tx}/576,y:r.top+r.height*${ty+6}/318}})()`)
    await host.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point,button:'none'})
    await host.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1})
    await sleep(40)
    await host.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1})
    assert.ok(await host.waitFor(/NET death .*slot=2 lives=2/,5000),'Enemy loses one life from the shot')
    await host.shot('shots/teams-death-zoom.png')
    for(const b of clients) assert.ok(await b.waitFor(/NET death .*slot=2 lives=2/,3000),'All four peers see the same death')
    await sleep(1300)
    console.log('PASS synchronized death and slow-motion across four clients, including one with zoom disabled')
  }

  const h = hashes(host), g = hashes(guest)
  const compared = [...h].filter(([t]) => g.has(t))
  assert.ok(compared.length >= (combatOnly ? 10 : 30), 'Enough matching simulation ticks were exercised')
  for (const [t, value] of compared) assert.equal(g.get(t), value, `Same state at tick ${t}`)
  for (const b of browsers) assert.ok(!b.log.some((l) => /Uncaught|NET desync/.test(l)), 'No runtime errors or desync')
  if (teams) {
    assert.ok(clients.every(b => b.log.some(l => /NET start.*players=4 bots=0.*mode=teams teams=0,0,1,1/.test(l))), 'All four clients use two teammates per side')
    for(const b of extras) {
      const other=hashes(b); const pairs=[...h].filter(([t])=>other.has(t));
      assert.ok(pairs.length>=(combatOnly ? 10 : 30),'Other team exercised enough ticks');
      for(const [t,value] of pairs) assert.equal(other.get(t),value,`Other team agrees at tick ${t}`);
      assert.ok(!b.log.some(l=>/Uncaught|NET desync/.test(l)), 'Other team has no errors');
    }
  }
  await host.shot(teams ? 'shots/teams-match.png' : 'shots/lobby-match.png')
  console.log(`PASS: ${combatOnly ? 'combat recovery with four clients' : 'normal START, two human inputs, background/foreground transitions'}; ${compared.length} state hashes agree`)
} catch (error) {
  for (const b of browsers) console.error(b.name, b.log.slice(-12))
  throw error
} finally {
  clearTimeout(timeout)
  for (const [i,b] of clients.entries()) b.close(`shots/${i === 0 ? 'lobby-host' : i === 1 ? 'lobby-guest' : `lobby-extra-${i}`}.log`)
  server?.kill()
}
process.exit(0)
