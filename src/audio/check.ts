/**
 * Validates the room songs without a browser: every pattern parses, every track is a whole number
 * of bars and divides the song's form (its longest track), every `alt` is the same length as its
 * `seq`, the root and the signature hit's notes parse, a song with a heavy kit has a light one, and
 * the form lengths are reported. Run: npm run check-songs
 */
import { parseSeq, rootHz } from './score.ts'
import { SONGS } from './songs.ts'

let problems = 0

function fail(msg: string) {
  console.error(msg)
  problems++
}

/** Every `|`-separated chunk of a pattern must be whole bars, so one miscounted bar cannot hide behind another. */
function chunks(who: string, seq: string, bar: number) {
  seq.split('|').forEach((chunk, i) => {
    const n = chunk.split(/\s+/).filter(Boolean).length
    if (n % bar !== 0) fail(`${who}: chunk ${i + 1} ("${chunk.trim().slice(0, 40)}…") has ${n} tokens, not a multiple of ${bar}`)
  })
}

for (const song of SONGS) {
  const bar = song.bar ?? song.steps
  const stepSec = ((60 / song.bpm) * 4) / song.steps
  const lens: number[] = []
  const parts: string[] = []
  let alts = 0
  let heavy = 0
  let light = 0
  let pumps = 0
  let pumped = 0
  song.tracks.forEach((t, i) => {
    const who = `${song.key} track ${i} (${t.inst})`
    let n = 0
    try {
      n = parseSeq(t.seq, t.oct ?? 0).length
      chunks(who, t.seq, bar)
      if (t.alt) {
        const m = parseSeq(t.alt, t.oct ?? 0).length
        if (m !== n) fail(`${who}: alt is ${m} steps, seq is ${n}`)
        chunks(`${who} alt`, t.alt, bar)
        alts++
      }
    } catch (e) {
      fail(`${who}: ${(e as Error).message}`)
      return
    }
    if (n === 0 || n % bar !== 0) {
      fail(`${who}: ${n} steps is not a whole number of ${bar}-step bars`)
      return
    }
    if (t.heavy && t.light) fail(`${who}: both heavy and light`)
    if (t.heavy) heavy++
    if (t.light) light++
    if (t.pump) pumps++
    if (t.pumped) pumped++
    lens.push(n)
    parts.push(`${t.inst}${t.layer ? `/L${t.layer}` : ''}${t.heavy ? '/H' : t.light ? '/l' : ''}${t.alt ? '*' : ''}:${n / bar}`)
  })
  const form = Math.max(1, ...lens)
  for (let i = 0; i < lens.length; i++) {
    if (form % lens[i] !== 0) fail(`${song.key} track ${i} (${song.tracks[i].inst}): ${lens[i]} steps does not divide the form of ${form}`)
  }
  if (heavy && !light) fail(`${song.key}: has a heavy kit but no light one`)
  if (light && !heavy) fail(`${song.key}: has a light kit but no heavy one`)
  if (pumped && !pumps) fail(`${song.key}: pumped tracks but nothing marked pump`)
  if (pumped && song.pump === undefined) fail(`${song.key}: pumped tracks but no pump depth`)
  try {
    rootHz(song.root)
  } catch (e) {
    fail(`${song.key}: ${(e as Error).message}`)
  }
  if (song.hit?.notes) {
    try {
      parseSeq(song.hit.notes)
    } catch (e) {
      fail(`${song.key} hit: ${(e as Error).message}`)
    }
  }
  const barSec = stepSec * bar
  const formBars = form / bar
  console.log(
    `${song.key.padEnd(10)} ${song.bpm} bpm, ${bar}-step bars of ${barSec.toFixed(2)} s, form ${formBars} bars = ${(formBars * barSec).toFixed(1)} s` +
      ` (${(2 * formBars * barSec).toFixed(0)} s with the alt pass), kick ${rootHz(song.root).toFixed(1)} Hz, ${alts} alt${alts === 1 ? '' : 's'}, kits ${light}l/${heavy}H` +
      `\n           [${parts.join(' ')}]`,
  )
}

if (problems) throw new Error(`${problems} song problem(s)`)
console.log(`${SONGS.length} songs ok`)
