#!/usr/bin/env node
// A screenshot of the live page (menus, lobby, a running match) after some keys and some real time,
// which Chrome's own --screenshot cannot do. Prints the page's console.
// Usage: node scripts/live-shot.mjs <name> [query] [seconds=1] [keys...]
//   node scripts/live-shot.mjs menu-character "" 1 ArrowDown ArrowDown ArrowDown Enter
//   node scripts/live-shot.mjs lobby-host "test=host&code=SHOT1&bots=1" 4
import { Browser, buildAndServe, sleep } from './lib/headless.mjs'

const [name, query = '', secs = '1', ...keys] = process.argv.slice(2)
if (!name) {
  console.log('usage: node scripts/live-shot.mjs <name> [query] [seconds] [keys...]')
  process.exit(2)
}
const PORT = 4797
const server = await buildAndServe(PORT)
const b = new Browser(`shot-${name}`, 9313)
process.on('exit', () => {
  b.close()
  server.kill()
})

await b.launch(`http://127.0.0.1:${PORT}/index.html${query ? `?${query}` : ''}`)
await sleep(1200)
for (const k of keys) {
  await b.key(k)
  await sleep(120)
}
await sleep(Number(secs) * 1000)
await b.shot(`shots/${name}.png`)
for (const l of b.log) console.log(l)
console.log(`shots/${name}.png`)
process.exit(0) // the DevTools socket and the child processes would keep the loop alive
