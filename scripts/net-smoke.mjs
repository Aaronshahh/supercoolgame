#!/usr/bin/env node
// Two headless Chromes play one lockstep match against each other (docs/05 §8): the first hosts
// under a fixed room code and starts as soon as the second joins; both log a state hash every 30
// ticks (`NET t<tick> hash <h>`) and this script compares them tick for tick, and checks that the
// match ran at real time (about 60 ticks a second). Needs the PeerJS public cloud (or ?signal=) to
// be reachable; the data channel itself is local.
// Usage: node scripts/net-smoke.mjs [seconds of play=20] [extra query for the host, e.g. 'bots=1&delay=2']
import { Browser, buildAndServe, sleep } from './lib/headless.mjs'

const SECS = Number(process.argv[2] ?? 20)
const EXTRA = process.argv[3] ?? 'bots=1'
const PORT = 4796
const CODE = 'SMOKE'

const server = await buildAndServe(PORT)
const host = new Browser('net-host', 9311)
const guest = new Browser('net-guest', 9312)
const browsers = [host, guest]
process.on('exit', () => {
  for (const b of browsers) b.close(`shots/${b.name}.log`)
  server.kill()
})
process.on('SIGINT', () => process.exit(130))

await host.launch(`http://127.0.0.1:${PORT}/index.html?test=host&code=${CODE}&target=3&${EXTRA}`)
if (!(await host.waitFor(/NET lobby host open/, 15000))) {
  console.log(host.log.join('\n'))
  console.log('FAIL: the host never opened its room (signaling server unreachable?)')
  process.exit(1)
}
await guest.launch(`http://127.0.0.1:${PORT}/index.html?test=join&room=${CODE}`)
const started = await guest.waitFor(/NET start/, 15000)
const t0 = Date.now()
if (started) await sleep(SECS * 1000)
const played = (Date.now() - t0) / 1000
await host.shot('shots/net-host.png')
await guest.shot('shots/net-guest.png')

const hashes = (log) => new Map(log.flatMap((l) => (/NET t(\d+) hash (\d+)/.exec(l) ? [[Number(RegExp.$1), RegExp.$2]] : [])))
for (const b of browsers) {
  console.log(`--- ${b.name}`)
  for (const l of b.log.filter((l) => /NET (lobby|start|desync)|Uncaught/.test(l)).slice(0, 10)) console.log(l)
  console.log(`hash lines: ${hashes(b.log).size}`)
}
console.log('--- compare')
const h = hashes(host.log)
const g = hashes(guest.log)
let ok = 0
let bad = 0
for (const [t, v] of [...h].sort((a, b) => a[0] - b[0])) {
  if (!g.has(t)) continue
  if (g.get(t) === v) ok++
  else {
    bad++
    console.log(`MISMATCH t${t} host ${v} guest ${g.get(t)}`)
  }
}
const lastTick = Math.max(0, ...h.keys())
const rate = lastTick / played
console.log(`${ok + bad} ticks compared, ${ok} agree, ${bad} differ; reached t${lastTick} in ${played.toFixed(1)} s (${rate.toFixed(0)} ticks/s)`)
const pace = rate > 45 && rate < 75
if (!pace) console.log('FAIL: the match did not run at real time')
process.exit(bad > 0 || ok === 0 || !pace ? 1 : 0)
