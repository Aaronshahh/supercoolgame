/** Original compositions used by the offline music renderer. Layer/kit/pump annotations describe
 * the source arrangement; runtime playback uses a fixed recorded mix, never live game events. */
import type { Song } from './score.ts'

// ------------------------------------------------------------------ pattern helpers

const rep = (bar: string, n: number) => Array.from({ length: n }, () => bar).join(' | ')
const hold = (tok: string, n: number) => `${tok} ${Array.from({ length: n - 1 }, () => '.').join(' ')}`
const rest = (n: number) => Array.from({ length: n }, () => '-').join(' ')
const bars = (...b: string[]) => b.join(' | ')
/** one chord per bar, each held the whole bar; '-' is a bar of rest */
const holds = (bar: number, ...chords: string[]) => bars(...chords.map((c) => (c === '-' ? rest(bar) : hold(c, bar))))
/** a stab on the "and" of every beat, in sixteenths */
const offbeats = (ch: string) => `- - ${ch} - - - ${ch} - - - ${ch} - - - ${ch} -`
const eighths16 = (n: string) => `${n} - ${n} - ${n} - ${n} - ${n} - ${n} - ${n} - ${n} -`
const quarters16 = (n: string) => `${n} - - - ${n} - - - ${n} - - - ${n} - - -`
const gallop16 = (n: string) => `${n} - ${n} ${n} ${n} - ${n} ${n} ${n} - ${n} ${n} ${n} - ${n} ${n}`
/** the first half of the bar held, the second silent (a sub that leaves room) */
const subBar = (n: string) => `${hold(n, 8)} ${rest(8)}`

const NAMES = ['c', 'c#', 'd', 'eb', 'e', 'f', 'f#', 'g', 'ab', 'a', 'bb', 'b']
const SEMI: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
function midi(n: string): number {
  const m = /^([a-g])(#|b)?(-?\d)$/.exec(n)
  if (!m) throw new Error(`bad note ${n}`)
  return 12 * (Number(m[3]) + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
}
const name = (m: number) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`
const up = (n: string, s: number) => name(midi(n) + s)
/** a power chord: root and fifth */
const pc = (n: string) => `${n}+${up(n, 7)}`
/** root, fifth, octave: the organ's and the brass's open voicing */
const p5 = (n: string) => `${n}+${up(n, 7)}+${up(n, 12)}`
const min3 = (r: string) => `${r}+${up(r, 3)}+${up(r, 7)}`
const maj3 = (r: string) => `${r}+${up(r, 4)}+${up(r, 7)}`
const dim3 = (r: string) => `${r}+${up(r, 3)}+${up(r, 6)}`
/** single-letter tokens in a pattern replaced by the chords in the map (never x, o, g: those are drum hits) */
const sub = (pattern: string, map: Record<string, string>) =>
  pattern
    .split(/\s+/)
    .map((t) => map[t] ?? t)
    .join(' ')
/** a sixteenth arpeggio bar: root, octave, fifth, third, four times */
const arp4 = (r: string, third: string, fifth: string) => Array.from({ length: 4 }, () => `${r} ${up(r, 12)} ${fifth} ${third}`).join(' ')

// ------------------------------------------------------------------ Cellar: "Stonework"
// D minor, 150. A: straight drive, guitar sixteenths on a D pedal, four kicks a bar, supersaw stabs
// on the offbeats, the motif as the lead; i – i – VI – V, i – i – iv – motif. B1: the Phrygian lean,
// a gallop on E♭ (♭II) back down to D, out through B♭ – C – A. B2: the breakdown, chords on the
// downbeats with the hands off the strings between, climbing D – F – G – A into sixteenths on the V.
const cellar: Song = (() => {
  const L = { R: pc('d3'), F: pc('f3'), N: pc('g3'), B: pc('bb2'), A: pc('a2'), E: pc('eb3'), K: pc('c3'), G: pc('g2'), a: pc('a3'), b: pc('bb3'), e: pc('e3'), H: pc('c#3') }
  const gtrA = sub(
    bars(
      'R R R R R R F R R R R R R R N F',
      'R R R R R R F R R R a b a R R -',
      'B B B B B B R B B B B B B B K B',
      'A A A A A A H A A A A A e . A -',
      'R R R R R R F R R R R R R R N F',
      'R R R R R R F R R R a b a R R -',
      'G G G G G G b G G G G G G G A G',
      'R - - - a - - - b - a - R . . .',
    ),
    L,
  )
  const gtrB1 = sub(
    bars(
      'E - E E E - E E E - E E E - E E',
      'E - E E E - E E E - E E R . . .',
      'R - R R R - R R R - R R R - R R',
      'R - R R R - R R b . . . a . . .',
      'B - B B B - B B B - B B B - B B',
      'K - K K K - K K K - K K K - K K',
      'A - A A A - A A A - A A A - A A',
      'A . . . . . . . e . . . H . . .',
    ),
    L,
  )
  const gtrB2 = sub(
    bars(
      'R . . . - - R R R . . . - - - -',
      'R . . . - - R R F . . . - - - -',
      'F . . . - - F F F . . . - - - -',
      'F . . . - - F F G . . . - - - -',
      'G . . . - - G G G . . . - - - -',
      'G . . . - - G G A . . . - - - -',
      'A . . . . . . . A . . . . . . .',
      'A A A A A A A A A A A A A A A A',
    ),
    L,
  )
  const bassA = bars(
    'd2 - d2 - d2 - d2 - d2 - d2 - d2 - d2 -',
    'd2 - d2 - d2 - d2 - d2 - a2 - bb2 a2 d2 -',
    'bb1 - bb1 - bb1 - bb1 - bb1 - bb1 - bb1 - c2 bb1',
    'a1 - a1 - a1 - a1 - a1 - a1 - e2 - a1 -',
    'd2 - d2 - d2 - d2 - d2 - d2 - d2 - d2 -',
    'd2 - d2 - d2 - d2 - d2 - a2 - bb2 a2 d2 -',
    'g1 - g1 - g1 - g1 - g1 - g1 - g1 - bb1 g1',
    'd2 - - - a2 - - - bb2 - a2 - d2 . . .',
  )
  const bassB1 = bars(
    gallop16('eb2'),
    'eb2 - eb2 eb2 eb2 - eb2 eb2 eb2 - eb2 eb2 d2 . . .',
    gallop16('d2'),
    'd2 - d2 d2 d2 - d2 d2 bb2 . . . a2 . . .',
    gallop16('bb1'),
    gallop16('c2'),
    gallop16('a1'),
    'a1 . . . . . . . e2 . . . c#2 . . .',
  )
  const bassB2 = bars(
    'd2 . . . . . . . d2 . . . . . . .',
    'd2 . . . . . . . f2 . . . . . . .',
    'f2 . . . . . . . f2 . . . . . . .',
    'f2 . . . . . . . g2 . . . . . . .',
    'g2 . . . . . . . g2 . . . . . . .',
    'g2 . . . . . . . a2 . . . . . . .',
    'a1 . . . . . . . a1 . . . . . . .',
    'a1 - a1 - a1 - a1 - a1 a1 a1 a1 a1 a1 a1 a1',
  )
  const Dm = min3('d4'), Bb = maj3('bb3'), Am = maj3('a3'), Gm = min3('g3'), Eb = maj3('eb4'), C = maj3('c4'), F = maj3('f4')
  const sawA = bars(offbeats(Dm), offbeats(Dm), offbeats(Bb), offbeats(Am), offbeats(Dm), offbeats(Dm), offbeats(Gm), `- - ${Am} - - - ${Am} - - - ${Am} - - - - -`)
  const sawB1 = bars(offbeats(Eb), offbeats(Eb), offbeats(Dm), offbeats(Dm), offbeats(Bb), offbeats(C), offbeats(Am), offbeats(Am))
  const sawB2 = holds(16, Dm, Dm, F, F, Gm, Gm, Am, Am)
  const leadA = bars(
    'd5 . . . a5 . . . bb5 . . . a5 . . .',
    'd5 . . . . . . . - - - - f5 . g5 .',
    'bb5 . . . a5 . g5 . f5 . . . . . . .',
    'e5 . . . . . . . c#5 . . . e5 . . .',
    'd5 . . . a5 . . . bb5 . . . a5 . . .',
    'd5 . . . . . . . f5 . g5 . a5 . bb5 .',
    'a5 . . . g5 . . . f5 . . . d5 . . .',
    'e5 . . . . . . . c#5 . . . . . . .',
  )
  const leadB1 = bars(
    'd5 . . . g5 . . . f5 . . . g5 . . .',
    'd5 . . . . . . . - - - - eb5 . f5 .',
    'd5 . . . g5 . . . f5 . . . g5 . . .',
    'd5 . . . . . . . bb5 . . . a5 . . .',
    'f5 . . . . . . . d5 . . . f5 . . .',
    'g5 . . . . . . . e5 . . . g5 . . .',
    'a5 . . . . . . . e5 . . . c#5 . . .',
    'e5 . . . . . . . . . . . . . . .',
  )
  const leadB2 = holds(16, 'd5', 'f5', 'a5', 'g5', 'bb5', 'a5', 'e5', '-')
  const Dm3 = min3('d3'), Bb3 = maj3('bb2'), A3 = maj3('a2'), Gm3 = min3('g2'), Eb3 = maj3('eb3'), C3 = maj3('c3'), F3 = maj3('f3')
  const choirA = holds(16, Dm3, Dm3, Bb3, A3, Dm3, Dm3, Gm3, A3)
  const choirB1 = holds(16, Eb3, Eb3, Dm3, Dm3, Bb3, C3, A3, A3)
  const choirB2 = holds(16, Dm3, Dm3, F3, F3, Gm3, Gm3, A3, A3)
  return {
    key: 'cellar',
    title: 'Stonework',
    bpm: 150,
    steps: 16,
    reverb: [1.2, 0.4],
    pump: 0.5,
    root: 'd1',
    hit: { inst: 'orchHit', notes: 'd2+a2+d3' },
    tracks: [
      { inst: 'kick', gain: 0.8, pump: true, light: true, seq: bars('o - - - x - - - o - - - x - - -', 'o - - - x - - - o - - - x - x -') },
      { inst: 'kick', gain: 0.8, pump: true, heavy: true, seq: bars('o - x - o - x - o - x - o - x -', 'o - x - o - x - o x - x o - x x') },
      { inst: 'snare', gain: 0.6, light: true, seq: bars('- - - - x - - - - - - - x - - -', '- - - - x - - - - - - - x - - g') },
      { inst: 'snare', gain: 0.6, heavy: true, seq: 'x - - - x - - - x - - - x - - g' },
      { inst: 'hat', gain: 0.3, layer: 1, pan: 0.3, seq: 'x g x g x g x g x g x g x g x g' },
      { inst: 'crash', gain: 0.5, layer: 1, seq: `o ${rest(15)} | ${rep(rest(16), 7)}` },
      { inst: 'rev', gain: 0.5, layer: 2, seq: `${rep(rest(16), 15)} | ${rest(8)} ${hold('x', 8)}` },
      { inst: 'guitar', gain: 0.8, gate: 0.6, pumped: true, pan: -0.2, seq: bars(gtrA, gtrB1), alt: bars(gtrA, gtrB2) },
      { inst: 'dbass', gain: 0.55, gate: 0.8, pumped: true, seq: bars(bassA, bassB1), alt: bars(bassA, bassB2) },
      { inst: 'supersaw', gain: 0.4, gate: 0.5, layer: 1, pumped: true, send: 0.3, seq: bars(sawA, sawB1), alt: bars(sawA, sawB2) },
      { inst: 'lead', gain: 0.42, gate: 0.95, layer: 2, pan: 0.15, send: 0.35, seq: bars(leadA, leadB1), alt: bars(leadA, leadB2) },
      { inst: 'choir', gain: 0.5, layer: 3, send: 0.5, seq: bars(choirA, choirB1), alt: bars(choirA, choirB2) },
    ],
  }
})()

// ------------------------------------------------------------------ Pits: "The Drop"
// E Phrygian, 140, half-time, swung. A: an 808 on one and the back of three, a reese growl, a sub
// only on the downbeat, a pad in the dark, the motif in the reese at bar 8. B1: the drop proper, the
// reese on F (♭II) and down through C and D (♭VII). B2: the stutter, the reese chopped into
// sixteenths over E – G – Am – F, the sub out, the arpeggio running. Heavy kit: a two-step.
const pits: Song = (() => {
  const reeseA = bars(
    'e2 . . . . . . . - - e2 . . . f2 .',
    'e2 . . . . . . g2 . . f2 . . . e2 .',
    'e2 . . . . . . . - - e2 . . . f2 .',
    'e2 . . . . . . d2 . . f2 . . . e2 .',
    'e2 . . . . . . . - - e2 . . . f2 .',
    'e2 . . . . . . g2 . . f2 . . . e2 .',
    'e2 . . . . . . . - - e2 . . . f2 .',
    'e2 . . . b2 . . . c3 . . . b2 . e2 .',
  )
  const reeseB1 = bars(
    'f2 . . . . . . . - - f2 . . . g2 .',
    'f2 . . . . . . a2 . . g2 . . . f2 .',
    'e2 . . . . . . . - - e2 . . . f2 .',
    'e2 . . . . . . g2 . . f2 . . . e2 .',
    'c2 . . . . . . . - - c2 . . . d2 .',
    'c2 . . . . . . e2 . . d2 . . . c2 .',
    'd2 . . . . . . . - - d2 . . . e2 .',
    'd2 . . . . . . f2 . . e2 . . . d2 .',
  )
  const reeseB2 = bars(
    'e2 - e2 - e2 . . . - - e2 e2 - e2 . .',
    'e2 - e2 - e2 . . . g2 . . . f2 . . .',
    'g2 - g2 - g2 . . . - - g2 g2 - g2 . .',
    'g2 - g2 - g2 . . . b2 . . . a2 . . .',
    'a2 - a2 - a2 . . . - - a2 a2 - a2 . .',
    'a2 - a2 - a2 . . . c3 . . . b2 . . .',
    'f2 - f2 - f2 . . . - - f2 f2 - f2 . .',
    'f2 . . . . . . . . . . . - - - -',
  )
  const subA = bars(...Array.from({ length: 8 }, () => subBar('e1')))
  const subB1 = bars(...['f1', 'f1', 'e1', 'e1', 'c2', 'c2', 'd2', 'd2'].map(subBar))
  const subB2 = rep(rest(16), 8)
  const padA = hold('e2+b2', 128)
  const padB1 = holds(16, 'f2+c3', 'f2+c3', 'e2+b2', 'e2+b2', 'c2+g2', 'c2+g2', 'd2+a2', 'd2+a2')
  const padB2 = holds(16, 'e2+b2', 'e2+b2', 'g2+d3', 'g2+d3', 'a2+e3', 'a2+e3', 'f2+c3', 'f2+c3')
  const Em = min3('e3'), F = maj3('f3'), C = maj3('c3'), Dm = min3('d3'), G = maj3('g3'), Am = min3('a3')
  const strA = bars(hold(Em, 32), hold(F, 16), hold(Em, 16), hold(Em, 32), hold(F, 16), hold(Em, 16))
  const strB1 = holds(16, F, F, Em, Em, C, C, Dm, Dm)
  const strB2 = bars(hold('e4', 32), hold('g4', 32), hold('a4', 32), hold('f4', 32))
  const arpBar = (n: string[]) => `${n[0]} - ${n[1]} - ${n[2]} - ${n[3]} - ${n[4]} - ${n[5]} - ${n[6]} - ${n[7]} -`
  const arpE = arpBar(['e4', 'g4', 'b4', 'e5', 'd5', 'b4', 'g4', 'f4'])
  const arpE2 = arpBar(['e4', 'g4', 'b4', 'e5', 'f5', 'd5', 'b4', 'g4'])
  const arpF = arpBar(['f4', 'a4', 'c5', 'f5', 'e5', 'c5', 'a4', 'g4'])
  const arpC = arpBar(['c4', 'e4', 'g4', 'c5', 'b4', 'g4', 'e4', 'd4'])
  const arpD = arpBar(['d4', 'f4', 'a4', 'd5', 'c5', 'a4', 'f4', 'e4'])
  const arpG = arpBar(['g4', 'b4', 'd5', 'g5', 'f5', 'd5', 'b4', 'a4'])
  const arpA = arpBar(['a4', 'c5', 'e5', 'a5', 'g5', 'e5', 'c5', 'b4'])
  const arpSecA = rep(bars(arpE, arpE2), 4)
  const arpB1 = bars(arpF, arpF, arpE, arpE2, arpC, arpC, arpD, arpD)
  const arpB2 = bars(arpE, arpE2, arpG, arpG, arpA, arpA, arpF, arpF)
  const hornA = rep(bars('e3 . . . . . . . b3 . . . . . . .', 'c4 . . . . . . . b3 . . . . . . .', hold('e3', 16), rest(16)), 2)
  const hornB1 = holds(16, 'f3', 'f3', 'e3', '-', 'c3', 'c3', 'd3', '-')
  const hornB2 = holds(16, 'e3', '-', 'g3', '-', 'a3', '-', 'f3', 'f3')
  return {
    key: 'pits',
    title: 'The Drop',
    bpm: 140,
    steps: 16,
    swing: 0.08,
    reverb: [2.2, 0.3],
    pump: 0.6,
    root: 'e1',
    hit: { inst: 'impact' },
    tracks: [
      { inst: 'kick808', gain: 0.85, pump: true, light: true, seq: bars('o - - - - - - - - - x - - - - -', 'o - - - - - - - - - x - - - x -') },
      { inst: 'kick808', gain: 0.85, pump: true, heavy: true, seq: bars('o - - - - - x - - - o - - - - -', 'o - - - - - x - - - o - - - x -') },
      { inst: 'snare', gain: 0.6, send: 0.35, light: true, seq: bars('- - - - - - - - x - - - - - - -', '- - - - - - - - x - - - - - g -') },
      { inst: 'snare', gain: 0.6, send: 0.3, heavy: true, seq: '- - - - x - - - - - - - x - - g' },
      { inst: 'hat', gain: 0.28, layer: 1, pan: -0.3, light: true, seq: 'x - x - x - x x x - x - x - x -' },
      { inst: 'hat', gain: 0.28, pan: -0.3, heavy: true, seq: 'x g x g x g x g x g x g x g x g' },
      { inst: 'impact', gain: 0.7, send: 0.6, seq: `x ${rest(15)} | ${rep(rest(16), 7)}` },
      { inst: 'rev', gain: 0.4, layer: 1, seq: `${rep(rest(16), 15)} | ${rest(8)} ${hold('x', 8)}` },
      { inst: 'pad', gain: 0.5, send: 0.5, seq: bars(padA, padB1), alt: bars(padA, padB2) },
      { inst: 'sub', gain: 0.6, pumped: true, seq: bars(subA, subB1), alt: bars(subA, subB2) },
      { inst: 'reese', gain: 0.5, gate: 0.95, pumped: true, seq: bars(reeseA, reeseB1), alt: bars(reeseA, reeseB2) },
      { inst: 'taiko', gain: 0.7, layer: 1, send: 0.4, seq: bars('- - - - - - - - - - - - - - x x', '- - - - x - - - - - - - - - - -') },
      { inst: 'strings', gain: 0.4, layer: 2, send: 0.5, seq: bars(strA, strB1), alt: bars(strA, strB2) },
      { inst: 'arp', gain: 0.3, gate: 0.5, layer: 2, pan: 0.35, send: 0.3, seq: bars(arpSecA, arpB1), alt: bars(arpSecA, arpB2) },
      { inst: 'horn', gain: 0.5, layer: 3, send: 0.4, seq: bars(hornA, hornB1), alt: bars(hornA, hornB2) },
    ],
  }
})()

// ------------------------------------------------------------------ Greenhouse: "Undergrowth"
// G minor, 150 in 12/8. A: a gallop, triplet guitar on a G pedal, a shuffle kit, a stalking pluck in
// twos against the threes; i – i – iv – V. B1: E♭ (♭VI) and D, then C minor and D, the riff in pairs.
// B2: the gallop stops; the Andalusian descent G – F – E♭ – D twice, chords held, ending on sixteenths on D.
const greenhouse: Song = (() => {
  const L = { R: pc('g3'), b: pc('bb3'), a: pc('a3'), D: pc('d4'), E: pc('eb4'), K: pc('c4'), d: pc('d3'), e: pc('eb3'), c: pc('c3'), f: pc('f3') }
  const gtrA = sub(
    bars(
      'R R R R R R R R b R R a',
      'R R R R R R D . E D . R',
      'K K K K K K K K E K K b',
      'D D D D D D E . D . - -',
      'R R R R R R R R b R R a',
      'R R R R R R D . E D . R',
      'K K K K K K K K E K K b',
      'R - - d - - e - d - R .',
    ),
    L,
  )
  const gtrB1 = sub(
    bars(
      'e - e e - e e - e e - e',
      'e - e e - e e - e d . .',
      'd - d d - d d - d d - d',
      'd - d d - d d - d e . .',
      'c - c c - c c - c c - c',
      'c - c c - c c - c c - c',
      'd - d d - d d - d d - d',
      'd . . . . . d . . . . .',
    ),
    L,
  )
  const gtrB2 = sub(
    bars(
      'R . . . . . - - R - R -',
      'f . . . . . - - f - f -',
      'e . . . . . - - e - e -',
      'd . . . . . - - d - d -',
      'R . . . . . - - R - R -',
      'f . . . . . - - f - f -',
      'e . . . . . - - e - e -',
      'd d d d d d d d d d d d',
    ),
    L,
  )
  const bassA = bars(
    'g2 - - g2 - - g2 - - g2 - -',
    'g2 - - g2 - - d3 - eb3 d3 - g2',
    'c2 - - c2 - - c2 - - c2 - -',
    'd2 - - d2 - - d2 - - d2 d2 d2',
    'g2 - - g2 - - g2 - - g2 - -',
    'g2 - - g2 - - d3 - eb3 d3 - g2',
    'c2 - - c2 - - c2 - - c2 - -',
    'g2 - - d3 - - eb3 - d3 - g2 .',
  )
  const pair12 = (n: string) => `${n} - ${n} ${n} - ${n} ${n} - ${n} ${n} - ${n}`
  const bassB1 = bars(
    pair12('eb2'),
    'eb2 - eb2 eb2 - eb2 eb2 - eb2 d2 . .',
    pair12('d2'),
    'd2 - d2 d2 - d2 d2 - d2 eb2 . .',
    pair12('c2'),
    pair12('c2'),
    pair12('d2'),
    'd2 . . . . . d2 . . . . .',
  )
  const bassB2 = bars(hold('g2', 12), hold('f2', 12), hold('eb2', 12), hold('d2', 12), hold('g2', 12), hold('f2', 12), hold('eb2', 12), 'd2 d2 d2 d2 d2 d2 d2 d2 d2 d2 d2 d2')
  const pl = (a: string, b: string, c: string) => `${a} - ${b} - ${c} - ${a} - ${b} - ${c} -`
  const plA = rep(bars(pl('g4', 'd5', 'bb4'), pl('g4', 'd5', 'bb4'), pl('c5', 'g5', 'eb5'), pl('d5', 'a5', 'f#5')), 2)
  const plB1 = bars(pl('eb5', 'bb5', 'g5'), pl('eb5', 'bb5', 'g5'), pl('d5', 'a5', 'f#5'), pl('d5', 'a5', 'f#5'), pl('c5', 'g5', 'eb5'), pl('c5', 'g5', 'eb5'), pl('d5', 'a5', 'f#5'), pl('d5', 'a5', 'f#5'))
  const plB2 = rep(bars(pl('g4', 'd5', 'bb4'), pl('f4', 'c5', 'a4'), pl('eb4', 'bb4', 'g4'), pl('d4', 'a4', 'f#4')), 2)
  const Gm = min3('g3'), Cm = min3('c3'), D = maj3('d3'), Eb = maj3('eb3'), F = maj3('f3')
  const strA = rep(bars(hold(Gm, 24), hold(Cm, 12), hold(D, 12)), 2)
  const strB1 = holds(12, Eb, Eb, D, D, Cm, Cm, D, D)
  const strB2 = rep(holds(12, Gm, F, Eb, D), 2)
  const leadA = bars(
    'g4 . . . . . d5 . . . . .',
    'eb5 . . d5 . . g4 . . . . .',
    'c5 . . . . . eb5 . . . . .',
    'd5 . . . . . f#5 . . a5 . .',
    'g4 . . . . . d5 . . . . .',
    'eb5 . . d5 . . c5 . . bb4 . .',
    'c5 . . . . . g5 . . eb5 . .',
    'd5 . . . . . . . . . . .',
  )
  const leadB1 = bars(
    'g4 . . . . . c5 . . . . .',
    'bb4 . . c5 . . g4 . . . . .',
    'g4 . . . . . c5 . . . . .',
    'bb4 . . c5 . . d5 . . . . .',
    'eb5 . . . . . c5 . . . . .',
    'eb5 . . d5 . . c5 . . . . .',
    'd5 . . . . . a4 . . . . .',
    'f#5 . . . . . . . . . . .',
  )
  const leadB2 = holds(12, 'd5', 'c5', 'bb4', 'a4', 'g5', 'f5', 'eb5', 'f#5')
  return {
    key: 'greenhouse',
    title: 'Undergrowth',
    bpm: 150,
    steps: 12,
    reverb: [1.6, 0.6],
    pump: 0.45,
    root: 'g1',
    hit: { inst: 'taiko' },
    tracks: [
      { inst: 'kick', gain: 0.8, pump: true, light: true, seq: bars('o - - x - - o - - x - -', 'o - - x - - o - x o - x') },
      { inst: 'kick', gain: 0.8, pump: true, heavy: true, seq: bars('o - x o - x o - x o - x', 'o - x o - x o x x o - x') },
      { inst: 'snare', gain: 0.6, light: true, seq: '- - - x - - - - - x - -' },
      { inst: 'snare', gain: 0.6, heavy: true, seq: 'x - - x - - x - - x - -' },
      { inst: 'hat', gain: 0.3, layer: 1, pan: 0.3, seq: 'x g g x g g x g g x g g' },
      { inst: 'taiko', gain: 0.6, layer: 1, send: 0.4, seq: bars('- - - - - - - - - - x -', '- - - - - - - - - x x -') },
      { inst: 'crash', gain: 0.5, layer: 1, seq: `o ${rest(11)} | ${rep(rest(12), 7)}` },
      { inst: 'rev', gain: 0.45, layer: 2, seq: `${rep(rest(12), 15)} | ${rest(6)} ${hold('x', 6)}` },
      { inst: 'guitar', gain: 0.8, gate: 0.6, pumped: true, pan: -0.2, seq: bars(gtrA, gtrB1), alt: bars(gtrA, gtrB2) },
      { inst: 'dbass', gain: 0.55, gate: 0.8, pumped: true, seq: bars(bassA, bassB1), alt: bars(bassA, bassB2) },
      { inst: 'pluck', gain: 0.45, pan: 0.3, send: 0.3, seq: bars(plA, plB1), alt: bars(plA, plB2) },
      { inst: 'strings', gain: 0.4, layer: 2, send: 0.5, seq: bars(strA, strB1), alt: bars(strA, strB2) },
      { inst: 'lead', gain: 0.4, gate: 0.95, layer: 3, pan: 0.1, send: 0.35, seq: bars(leadA, leadB1), alt: bars(leadA, leadB2) },
    ],
  }
})()

// ------------------------------------------------------------------ Forge: "Hammerfall"
// A harmonic minor, 140. A: anvils on two and four, taikos and a kick, a galloping guitar, brass
// stabs, low horns, a lead on the leading tone; i – i – VI – V, the motif in unison at bar 8. B1:
// D minor (iv) to E, F to E, the gallop on. B2: the climb, one power chord a bar up the chromatic
// scale A – B♭ – B – C – C♯ – D – E♭ – E under a horn pedal on E, sixteenths on the top step.
const forge: Song = (() => {
  const L = { R: pc('a3'), K: pc('c4'), e: pc('e4'), f: pc('f4'), F: pc('f3'), E: pc('e3'), G: pc('g#3'), W: pc('g3'), D: pc('d3'), A: pc('a2'), B: pc('bb2'), N: pc('b2'), C: pc('c3'), H: pc('c#3'), S: pc('eb3') }
  const gtrA = sub(
    bars(
      'R - R R R - R R R - R R K - R R',
      'R - R R R - R R e . f . e . R -',
      'F - F F F - F F F - F F W - F F',
      'E - E E E - E E G - G G E . . -',
      'R - R R R - R R R - R R K - R R',
      'R - R R R - R R e . f . e . R -',
      'F - F F F - F F F - F F W - F F',
      'R - - - E - - - F - E - R . . .',
    ),
    L,
  )
  const gtrB1 = sub(
    bars(
      'D - D D D - D D D - D D D - D D',
      'D - D D D - D D F . . . E . . .',
      'E - E E E - E E E - E E E - E E',
      'E - E E E - E E G . . . E . . .',
      'F - F F F - F F F - F F F - F F',
      'F - F F F - F F W . . . F . . .',
      'E - E E E - E E E - E E E - E E',
      'E . . . . . . . G . . . . . . .',
    ),
    L,
  )
  const gtrB2 = sub(bars(gallop16('A'), gallop16('B'), gallop16('N'), gallop16('C'), gallop16('H'), gallop16('D'), gallop16('S'), rep('E', 16).replace(/ \| /g, ' ')), L)
  const bassA = bars(
    eighths16('a2'),
    'a2 - a2 - a2 - a2 - e2 - f2 - e2 - a2 -',
    'f2 - f2 - f2 - f2 - f2 - f2 - g2 - f2 -',
    'e2 - e2 - e2 - e2 - g#2 - g#2 - e2 - - -',
    eighths16('a2'),
    'a2 - a2 - a2 - a2 - e2 - f2 - e2 - a2 -',
    'f2 - f2 - f2 - f2 - f2 - f2 - g2 - f2 -',
    'a2 - - - e2 - - - f2 - e2 - a2 . . .',
  )
  const bassB1 = bars(
    gallop16('d2'),
    'd2 - d2 d2 d2 - d2 d2 f2 . . . e2 . . .',
    gallop16('e2'),
    'e2 - e2 e2 e2 - e2 e2 g#2 . . . e2 . . .',
    gallop16('f2'),
    'f2 - f2 f2 f2 - f2 f2 g2 . . . f2 . . .',
    gallop16('e2'),
    'e2 . . . . . . . g#2 . . . . . . .',
  )
  const bassB2 = bars(...['a1', 'bb1', 'b1', 'c2', 'c#2', 'd2', 'eb2'].map(gallop16), Array.from({ length: 16 }, () => 'e2').join(' '))
  const Am = min3('a3'), F = maj3('f3'), E = maj3('e3'), Dm = min3('d3')
  const stabA = rep(
    bars(
      `${Am} - - - - - ${Am} - - - - - - - - -`,
      `${Am} - - - - - ${Am} - - - - - ${Am} - - -`,
      `${F} - - - - - ${F} - - - - - - - - -`,
      `${E} - - - - - ${E} - - - - - ${E} - ${E} -`,
    ),
    2,
  )
  const stab2 = (c: string) => `${c} - - - - - ${c} - - - - - - - - -`
  const stabB1 = bars(stab2(Dm), stab2(Dm), stab2(E), stab2(E), stab2(F), stab2(F), stab2(E), `${E} - - - - - - - ${E} - - - - - - -`)
  const stabB2 = bars(...['a3', 'bb3', 'b3', 'c4', 'c#4', 'd4', 'eb4', 'e4'].map((n) => `${p5(n)} - - - - - - - ${p5(n)} - - - - - - -`))
  const hornA = rep(bars('a2 . . . . . . . e3 . . . . . . .', 'f3 . . . . . . . e3 . . . . . . .', hold('f3', 16), 'e3 . . . . . . . g#3 . . . . . . .'), 2)
  const hornB1 = holds(16, 'd3', 'f3', 'e3', 'g#3', 'f3', 'a3', 'e3', 'g#3')
  const hornB2 = hold('e3', 128)
  const leadA = bars(
    'a4 . g#4 . a4 . b4 . c5 . b4 . a4 . g#4 .',
    'a4 . . . e4 . . . f4 . . . e4 . . .',
    'f4 . e4 . f4 . g4 . a4 . g4 . f4 . e4 .',
    'g#4 . . . . . . . e4 . . . . . . .',
    'a4 . . . e4 . . . f4 . . . e4 . . .',
    'a4 . . . . . . . c5 . . . b4 . a4 .',
    'f4 . . . . . . . g4 . . . a4 . . .',
    'g#4 . . . . . . . . . . . - - - -',
  )
  const leadB1 = bars(
    'a4 . . . d5 . . . c5 . . . d5 . . .',
    'a4 . . . . . . . f4 . . . e4 . . .',
    'a4 . . . d5 . . . c5 . . . d5 . . .',
    'a4 . . . . . . . g#4 . . . b4 . . .',
    'c5 . . . . . . . a4 . . . f4 . . .',
    'f4 . . . g4 . . . a4 . . . c5 . . .',
    'b4 . . . . . . . g#4 . . . e4 . . .',
    'g#4 . . . . . . . . . . . . . . .',
  )
  const leadB2 = holds(16, 'e5', 'f5', 'f#5', 'g5', 'g#5', 'a5', 'bb5', 'b5')
  return {
    key: 'forge',
    title: 'Hammerfall',
    bpm: 140,
    steps: 16,
    reverb: [0.9, 0.7],
    pump: 0.45,
    root: 'a1',
    hit: { inst: 'anvil', gain: 0.7 },
    tracks: [
      { inst: 'anvil', gain: 0.45, pan: 0.4, send: 0.4, seq: '- - - - x - - - - - - - x - - -' },
      { inst: 'taiko', gain: 0.75, send: 0.3, seq: bars('o - - - - - x - o - - - - - x -', 'o - - - - - x - o - - x - - x x') },
      { inst: 'kick', gain: 0.7, pump: true, light: true, seq: bars('o - - - - - - - o - - - - - - -', 'o - - - - - - - o - - x - - - -') },
      { inst: 'kick', gain: 0.75, pump: true, heavy: true, seq: bars('o - x x o - x x o - x x o - x x', 'o - x x o - x x o - x x o x x x') },
      { inst: 'snare', gain: 0.55, layer: 1, light: true, seq: '- - - - x - - - - - - - x - - -' },
      { inst: 'snare', gain: 0.6, heavy: true, seq: 'x - - - x - - - x - - - x - - -' },
      { inst: 'hat', gain: 0.25, layer: 2, pan: -0.3, seq: 'x - x - x - x - x - x - x - x -' },
      { inst: 'crash', gain: 0.5, layer: 1, seq: `o ${rest(15)} | ${rep(rest(16), 7)}` },
      { inst: 'rev', gain: 0.45, layer: 2, seq: `${rep(rest(16), 15)} | ${rest(8)} ${hold('x', 8)}` },
      { inst: 'guitar', gain: 0.8, gate: 0.6, pumped: true, pan: -0.2, seq: bars(gtrA, gtrB1), alt: bars(gtrA, gtrB2) },
      { inst: 'dbass', gain: 0.55, gate: 0.8, pumped: true, seq: bars(bassA, bassB1), alt: bars(bassA, bassB2) },
      { inst: 'stab', gain: 0.45, gate: 0.5, layer: 1, send: 0.3, seq: bars(stabA, stabB1), alt: bars(stabA, stabB2) },
      { inst: 'horn', gain: 0.5, layer: 2, send: 0.4, seq: bars(hornA, hornB1), alt: bars(hornA, hornB2) },
      { inst: 'lead', gain: 0.42, gate: 0.95, layer: 3, pan: 0.15, send: 0.35, seq: bars(leadA, leadB1), alt: bars(leadA, leadB2) },
    ],
  }
})()

// ------------------------------------------------------------------ Lab: "Containment Breach"
// C minor, 168. A: electronic, a sixteenth arpeggio that never stops, four on the floor pumping
// everything, distorted bass, supersaw chords, the motif on the lead, a riser into every eighth bar.
// B1: F minor (iv) to C, A♭ – B♭ – G. B2: E♭ and F minor, then D♭ (♭II) into G, the saws in stabs.
const lab: Song = (() => {
  const arpSecA = rep(
    bars(
      'c4 c5 g4 eb4 c4 c5 g4 eb4 c4 c5 g4 f4 c4 c5 g4 eb4',
      'c4 c5 g4 eb4 c4 c5 g4 eb4 ab3 c5 g4 eb4 ab3 c5 g4 eb4',
      'ab3 ab4 eb4 c4 ab3 ab4 eb4 c4 f3 f4 c4 ab3 f3 f4 c4 ab3',
      'g3 g4 d4 b3 g3 g4 d4 b3 g3 g4 d4 b3 g3 g4 d4 b3',
    ),
    2,
  )
  const aFm = arp4('f3', 'ab3', 'c4'), aCm = arp4('c4', 'eb4', 'g4'), aAb = arp4('ab3', 'c4', 'eb4'), aBb = arp4('bb3', 'd4', 'f4'), aG = arp4('g3', 'b3', 'd4')
  const aEb = arp4('eb3', 'g3', 'bb3'), aDb = arp4('db3', 'f3', 'ab3')
  const arpB1 = bars(aFm, aFm, aCm, aCm, aAb, aBb, aG, aG)
  const arpB2 = bars(aEb, aEb, aFm, aFm, aDb, aDb, aG, aG)
  const bassA = rep(
    bars(
      eighths16('c2'),
      'c2 - c2 - c2 - c2 - ab2 - ab2 - ab2 - ab2 -',
      'ab2 - ab2 - ab2 - ab2 - f2 - f2 - f2 - f2 -',
      'g2 - g2 - g2 - g2 - g2 - g2 - g2 g2 g2 -',
    ),
    2,
  ).replace(/g2 - g2 - g2 - g2 - g2 - g2 - g2 g2 g2 -$/, 'c2 - - - g2 - - - ab2 - g2 - c2 . . .')
  const bassB1 = bars(eighths16('f2'), eighths16('f2'), eighths16('c2'), eighths16('c2'), eighths16('ab2'), eighths16('bb2'), eighths16('g2'), 'g2 - g2 - g2 - g2 - g2 g2 g2 g2 g2 g2 g2 g2')
  const bassB2 = bars(eighths16('eb2'), eighths16('eb2'), eighths16('f2'), eighths16('f2'), eighths16('db2'), eighths16('db2'), eighths16('g2'), 'g2 . . . . . . . g2 . . . . . . .')
  const Cm = min3('c4'), Ab = maj3('ab3'), G = maj3('g3'), Fm = min3('f3'), Bb = maj3('bb3'), Eb = maj3('eb4'), Db = maj3('db4')
  const sawA = holds(16, Cm, Cm, Ab, G, Cm, Cm, Ab, G)
  const sawB1 = holds(16, Fm, Fm, Cm, Cm, Ab, Bb, G, G)
  const sawB2 = bars(offbeats(Eb), offbeats(Eb), offbeats(Fm), offbeats(Fm), offbeats(Db), offbeats(Db), offbeats(G), offbeats(G))
  const leadA = rep(
    bars(
      'c5 . . . g5 . . . ab5 . . . g5 . . .',
      'c5 . . . . . . . - - - - eb5 . f5 .',
      'ab5 . . . g5 . f5 . eb5 . . . c5 . . .',
      'd5 . . . . . . . b4 . . . d5 . . .',
    ),
    2,
  )
  const leadB1 = bars(
    'c5 . . . f5 . . . eb5 . . . f5 . . .',
    'c5 . . . . . . . - - - - ab4 . bb4 .',
    'c5 . . . f5 . . . eb5 . . . f5 . . .',
    'c5 . . . . . . . g5 . . . f5 . . .',
    'ab5 . . . . . . . eb5 . . . c5 . . .',
    'bb5 . . . . . . . f5 . . . d5 . . .',
    'g5 . . . . . . . d5 . . . b4 . . .',
    'g5 . . . . . . . . . . . . . . .',
  )
  const leadB2 = holds(16, 'g5', 'g5', 'ab5', 'ab5', 'f5', 'f5', 'g5', 'd5')
  const Cm3 = min3('c3'), Ab3 = maj3('ab2'), G3 = maj3('g2'), Fm3 = min3('f3'), Bb3 = maj3('bb2'), Eb3 = maj3('eb3'), Db3 = maj3('db3')
  const choirA = holds(16, Cm3, Cm3, Ab3, G3, Cm3, Cm3, Ab3, G3)
  const choirB1 = holds(16, Fm3, Fm3, Cm3, Cm3, Ab3, Bb3, G3, G3)
  const choirB2 = holds(16, Eb3, Eb3, Fm3, Fm3, Db3, Db3, G3, G3)
  return {
    key: 'lab',
    title: 'Containment Breach',
    bpm: 168,
    steps: 16,
    reverb: [0.8, 0.8],
    pump: 0.65,
    root: 'c2',
    hit: { inst: 'impact' },
    tracks: [
      { inst: 'kick', gain: 0.85, pump: true, light: true, seq: bars('o - - - o - - - o - - - o - - -', 'o - - - o - - - o - - - o - o -') },
      { inst: 'kick', gain: 0.85, pump: true, heavy: true, seq: bars('o - - - o - x - o - - - o - x -', 'o - - - o - x - o - - - o x - x') },
      { inst: 'clap', gain: 0.5, send: 0.3, light: true, seq: '- - - - x - - - - - - - x - - -' },
      { inst: 'clap', gain: 0.5, send: 0.3, heavy: true, seq: 'x - - - x - - - x - - - x - - -' },
      { inst: 'hat', gain: 0.3, pan: 0.3, seq: '- - x - - - x - - - x - - - x -' },
      { inst: 'shaker', gain: 0.25, layer: 1, pan: -0.3, seq: 'x g x g x g x g x g x g x g x g' },
      { inst: 'impact', gain: 0.6, layer: 1, send: 0.5, seq: `x ${rest(15)} | ${rep(rest(16), 7)}` },
      { inst: 'riser', gain: 0.5, layer: 2, pan: 0, seq: `${rep(rest(16), 6)} | ${hold('c3', 32)}` },
      { inst: 'arp', gain: 0.42, gate: 0.5, pumped: true, pan: 0.2, send: 0.25, seq: bars(arpSecA, arpB1), alt: bars(arpSecA, arpB2) },
      { inst: 'dbass', gain: 0.55, gate: 0.7, pumped: true, seq: bars(bassA, bassB1), alt: bars(bassA, bassB2) },
      { inst: 'supersaw', gain: 0.38, layer: 1, pumped: true, send: 0.35, seq: bars(sawA, sawB1), alt: bars(sawA, sawB2) },
      { inst: 'lead', gain: 0.4, gate: 0.95, layer: 2, pan: -0.15, send: 0.35, seq: bars(leadA, leadB1), alt: bars(leadA, leadB2) },
      { inst: 'choir', gain: 0.45, layer: 3, send: 0.5, seq: bars(choirA, choirB1), alt: bars(choirA, choirB2) },
    ],
  }
})()

// ------------------------------------------------------------------ Armoury: "Seven Sharp"
// E harmonic minor in 7/8 (2+2+3), 172. A: a riff that lands a step early every bar, kicks on the
// groups, stabs on one and four; i – i – i – VI→V, the motif in bar 8. B1: A minor (iv) and E, then
// C – D♯dim – B, the riff in pairs. B2: G – A minor – C – B in long chords, sevens on the B at the end.
const armoury: Song = (() => {
  const L = { R: pc('e3'), W: pc('g3'), S: pc('f#3'), B: pc('b3'), K: pc('c4'), C: pc('c3'), D: pc('d#3'), N: pc('b2'), a: pc('a2'), G: pc('g2') }
  const gtrA = sub(bars('R R R R W R S', 'R R R R B K B', 'R R R R W R S', 'C C C C D . N', 'R R R R W R S', 'R R R R B K B', 'R R R R W R S', 'R - B - K B R'), L)
  const gtrB1 = sub(bars('a a - a a - a', 'a a - a a - a', 'R R - R R - R', 'R R - R R W S', 'C C - C C - C', 'D D - D D - D', 'N N - N N - N', 'N . . . . . .'), L)
  const gtrB2 = sub(bars('G . . . - - G', 'G . . . - G G', 'a . . . - - a', 'a . . . - a a', 'C . . . - - C', 'C . . . - C C', 'N . . . . . .', 'N N N N N N N'), L)
  const bassA = bars('e2 - e2 - e2 - -', 'e2 - e2 - b2 c3 b2', 'e2 - e2 - e2 - -', 'c2 - c2 - d#2 - b1', 'e2 - e2 - e2 - -', 'e2 - e2 - b2 c3 b2', 'e2 - e2 - e2 - -', 'e2 - b2 - c3 b2 e2')
  const pair7 = (n: string) => `${n} ${n} - ${n} ${n} - ${n}`
  const bassB1 = bars(pair7('a1'), pair7('a1'), pair7('e2'), 'e2 e2 - e2 e2 g2 f#2', pair7('c2'), pair7('d#2'), pair7('b1'), 'b1 . . . . . .')
  const bassB2 = bars('g1 . . . . . .', 'g1 . . . - g1 g1', 'a1 . . . . . .', 'a1 . . . - a1 a1', 'c2 . . . . . .', 'c2 . . . - c2 c2', 'b1 . . . . . .', 'b1 b1 b1 b1 b1 b1 b1')
  const Em = min3('e3'), C = maj3('c3'), B = maj3('b2'), Am = min3('a3'), Ddim = dim3('d#3'), G = maj3('g3')
  const stabA = rep(bars(`${Em} - - - ${Em} - -`, `${Em} - - - ${Em} - -`, `${Em} - - - ${Em} - -`, `${C} - - - ${B} - -`), 2)
  const stabB1 = bars(...[Am, Am, Em, Em, C, Ddim, B, B].map((c) => `${c} - - - ${c} - -`))
  const stabB2 = bars(...[G, G, Am, Am, C, C, B, B].map((c) => `${c} - - - - - -`))
  const leadA = bars('e4 . . . b4 . .', 'c5 . b4 . e4 . .', 'e4 . . . g4 . f#4', 'e4 . . . d#4 . .', 'e4 . . . b4 . .', 'c5 . b4 . a4 . g4', 'f#4 . . . g4 . a4', 'b4 . . . d#4 . .')
  const leadB1 = bars('e4 . . . a4 . .', 'g4 . a4 . e4 . .', 'e4 . . . a4 . .', 'g4 . a4 . b4 . .', 'c5 . . . g4 . .', 'd#5 . . . f#4 . .', 'b4 . . . d#5 . .', 'b4 . . . . . .')
  const leadB2 = holds(7, 'g4', 'b4', 'a4', 'c5', 'c5', 'e5', 'd#5', 'b4')
  const strA = rep(bars(hold(Em, 14), hold(Em, 7), `${C} . . . ${B} . .`), 2)
  const strB1 = holds(7, Am, Am, Em, Em, C, Ddim, B, B)
  const strB2 = holds(7, G, G, Am, Am, C, C, B, B)
  return {
    key: 'armoury',
    title: 'Seven Sharp',
    bpm: 172,
    steps: 8,
    bar: 7,
    reverb: [0.7, 0.6],
    pump: 0.4,
    root: 'e1',
    hit: { inst: 'clang', notes: 'b4', gain: 0.7 },
    tracks: [
      { inst: 'kick', gain: 0.8, pump: true, light: true, seq: bars('o - x - o - -', 'o - x - o - x') },
      { inst: 'kick', gain: 0.8, pump: true, heavy: true, seq: 'o - o - o - o' },
      { inst: 'snare', gain: 0.6, light: true, seq: bars('- - - - x - -', '- - - - x - g') },
      { inst: 'snare', gain: 0.6, heavy: true, seq: '- x - x - x -' },
      { inst: 'hat', gain: 0.3, layer: 1, pan: 0.3, seq: 'x x x x x x x' },
      { inst: 'ride', gain: 0.25, layer: 2, pan: -0.3, seq: 'x - x - x - x' },
      { inst: 'crash', gain: 0.5, layer: 1, seq: `o ${rest(6)} | ${rep(rest(7), 7)}` },
      { inst: 'rev', gain: 0.45, layer: 2, seq: `${rep(rest(7), 15)} | ${rest(3)} ${hold('x', 4)}` },
      { inst: 'guitar', gain: 0.8, gate: 0.6, pumped: true, pan: -0.2, seq: bars(gtrA, gtrB1), alt: bars(gtrA, gtrB2) },
      { inst: 'dbass', gain: 0.55, gate: 0.8, pumped: true, seq: bars(bassA, bassB1), alt: bars(bassA, bassB2) },
      { inst: 'stab', gain: 0.45, gate: 0.5, layer: 1, send: 0.3, seq: bars(stabA, stabB1), alt: bars(stabA, stabB2) },
      { inst: 'lead', gain: 0.42, gate: 0.95, layer: 2, pan: 0.15, send: 0.35, seq: bars(leadA, leadB1), alt: bars(leadA, leadB2) },
      { inst: 'strings', gain: 0.4, layer: 3, send: 0.5, seq: bars(strA, strB1), alt: bars(strA, strB2) },
    ],
  }
})()

// ------------------------------------------------------------------ Icebox: "Black Ice"
// D minor in 6/8, 150. A: taikos on the two big beats, a saw arpeggio in eighths, glass with the
// motif in long notes over it; guitar and horns at two thirds, the choir at full; i – i – iv – V, the
// motif in the bass at bar 8. B1: B♭ (♭VI) and A, G minor and A, the riff in pairs. B2: the thaw,
// D – F – G minor – A in long chords and the glass answering the motif, sixes on the A at the end.
const icebox: Song = (() => {
  const L = { R: pc('d3'), b: pc('bb3'), a: pc('a3'), G: pc('g3'), H: pc('c#4'), B: pc('bb2'), A: pc('a2'), F: pc('f3') }
  const gtrA = sub(bars('R R R R R R', 'R R R b . a', 'G G G G G G', 'a a a a H .', 'R R R R R R', 'R R R b . a', 'G G G G G G', 'R - A B A R'), L)
  const gtrB1 = sub(bars('B - B B - B', 'B - B B - B', 'A - A A - A', 'A - A A - A', 'G - G G - G', 'G - G G - G', 'A - A A - A', 'A . . . . .'), L)
  const gtrB2 = sub(bars('R . . - - R', 'R . . - - -', 'F . . - - F', 'F . . - - -', 'G . . - - G', 'G . . - - -', 'A . . . . .', 'A A A A A A'), L)
  const bassA = bars('d2 - - d2 - -', 'd2 - - d2 - d2', 'g2 - - g2 - -', 'a2 - - a2 - a2', 'd2 - - d2 - -', 'd2 - - d2 - d2', 'g2 - - g2 - -', 'd2 - a2 bb2 a2 d2')
  const pair6 = (n: string) => `${n} - ${n} ${n} - ${n}`
  const bassB1 = bars(pair6('bb1'), pair6('bb1'), pair6('a1'), pair6('a1'), pair6('g1'), pair6('g1'), pair6('a1'), 'a1 . . . . .')
  const bassB2 = bars('d2 . . . . .', 'd2 . . - - d2', 'f2 . . . . .', 'f2 . . - - f2', 'g2 . . . . .', 'g2 . . - - g2', 'a1 . . . . .', 'a1 a1 a1 a1 a1 a1')
  const arpSecA = rep(bars('d3 f3 a3 d4 a3 f3', 'd3 f3 a3 bb3 a3 f3', 'g3 bb3 d4 g4 d4 bb3', 'a3 c#4 e4 a4 e4 c#4'), 2)
  const arpB1 = bars('bb3 d4 f4 bb4 f4 d4', 'bb3 d4 f4 bb4 f4 d4', 'a3 c#4 e4 a4 e4 c#4', 'a3 c#4 e4 a4 e4 c#4', 'g3 bb3 d4 g4 d4 bb3', 'g3 bb3 d4 g4 d4 bb3', 'a3 c#4 e4 a4 e4 c#4', 'a3 c#4 e4 a4 e4 c#4')
  const arpB2 = bars('d3 f3 a3 d4 a3 f3', 'd3 f3 a3 d4 a3 f3', 'f3 a3 c4 f4 c4 a3', 'f3 a3 c4 f4 c4 a3', 'g3 bb3 d4 g4 d4 bb3', 'g3 bb3 d4 g4 d4 bb3', 'a3 c#4 e4 a4 e4 c#4', 'a3 c#4 e4 a4 e4 c#4')
  const glassA = bars(hold('d5', 6), hold('a5', 6), hold('bb5', 6), hold('a5', 6), hold('d5', 12), rest(12))
  const glassB1 = holds(6, 'd5', 'g5', 'f5', 'g5', 'd5', 'd5', '-', '-')
  const glassB2 = holds(6, 'a5', 'a5', 'c6', 'c6', 'bb5', 'bb5', 'e5', '-')
  const hornA = rep(bars(hold('d3', 12), hold('g3', 6), hold('a3', 6)), 2)
  const hornB1 = holds(6, 'bb2', 'bb2', 'a2', 'a2', 'g2', 'g2', 'a2', '-')
  const hornB2 = holds(6, 'd3', 'd3', 'f3', 'f3', 'g3', 'g3', 'a3', 'a3')
  const Dm = min3('d3'), Gm = min3('g3'), A = maj3('a3'), Bb = maj3('bb2'), F = maj3('f3')
  const choirA = rep(bars(hold(Dm, 12), hold(Gm, 6), hold(A, 6)), 2)
  const choirB1 = holds(6, Bb, Bb, A, A, Gm, Gm, A, A)
  const choirB2 = holds(6, Dm, Dm, F, F, Gm, Gm, A, A)
  return {
    key: 'icebox',
    title: 'Black Ice',
    bpm: 150,
    steps: 8,
    bar: 6,
    reverb: [2.0, 0.9],
    pump: 0.4,
    root: 'd1',
    hit: { inst: 'bell', notes: 'd4', gain: 0.9 },
    tracks: [
      { inst: 'taiko', gain: 0.8, pump: true, send: 0.35, light: true, seq: bars('o - - x - -', 'o - - x - x') },
      { inst: 'taiko', gain: 0.8, pump: true, send: 0.3, heavy: true, seq: bars('o - x o - x', 'o x x o - x') },
      { inst: 'kick', gain: 0.6, heavy: true, seq: 'o - - o - -' },
      { inst: 'snare', gain: 0.5, layer: 1, light: true, seq: bars('- - - x - -', '- - - x - x') },
      { inst: 'snare', gain: 0.55, heavy: true, seq: 'x - - x - g' },
      { inst: 'hat', gain: 0.28, layer: 1, pan: 0.3, seq: 'x g g x g g' },
      { inst: 'crash', gain: 0.5, layer: 1, seq: `o ${rest(5)} | ${rep(rest(6), 7)}` },
      { inst: 'rev', gain: 0.45, layer: 2, seq: `${rep(rest(6), 15)} | ${hold('x', 6)}` },
      { inst: 'arp', gain: 0.4, gate: 0.55, pan: 0.25, send: 0.35, pumped: true, seq: bars(arpSecA, arpB1), alt: bars(arpSecA, arpB2) },
      { inst: 'glass', gain: 0.45, pan: -0.2, send: 0.6, seq: bars(glassA, glassB1), alt: bars(glassA, glassB2) },
      { inst: 'dbass', gain: 0.55, gate: 0.8, pumped: true, seq: bars(bassA, bassB1), alt: bars(bassA, bassB2) },
      { inst: 'guitar', gain: 0.75, gate: 0.6, layer: 2, pumped: true, pan: -0.25, seq: bars(gtrA, gtrB1), alt: bars(gtrA, gtrB2) },
      { inst: 'horn', gain: 0.5, layer: 2, send: 0.4, seq: bars(hornA, hornB1), alt: bars(hornA, hornB2) },
      { inst: 'choir', gain: 0.5, layer: 3, send: 0.55, seq: bars(choirA, choirB1), alt: bars(choirA, choirB2) },
    ],
  }
})()

// ------------------------------------------------------------------ Gatehouse: "Siege"
// G Phrygian, 128, a half-time march. A: taikos and timpani, low brass with the motif, strings, then
// the snare line, a choir and a chug when hot; the ♭2 (A♭) leans on every fourth bar. B1: E♭ (♭VI)
// and D, C minor and D, the chug in eighths. B2: F minor (♭VII) – E♭ – C minor – A♭ (♭II) in half
// notes, the choir answering the motif in open fifths, sixteenths on the A♭ into the drop.
const gatehouse: Song = (() => {
  const L = { R: pc('g3'), b: pc('ab3'), D: pc('d4'), E: pc('eb4'), K: pc('c4'), e: pc('eb3'), d: pc('d3'), c: pc('c3'), f: pc('f3') }
  const gtrA = sub(
    bars(
      'R - R - R - R - R - R - b - R -',
      'R - R - R - R - D . E . D . R -',
      'K - K - K - K - K - K - E - K -',
      'b - b - b - b - R . . . . . . -',
      'R - R - R - R - R - R - b - R -',
      'R - R - R - R - D . E . D . R -',
      'K - K - K - K - K - K - E - K -',
      'R - - - D - - - E - D - R . . .',
    ),
    L,
  )
  const gtrB1 = sub(
    bars(
      eighths16('e'),
      'e - e - e - e - e - e - d . . .',
      eighths16('d'),
      'd - d - d - d - d - d - e . . .',
      eighths16('c'),
      eighths16('c'),
      eighths16('d'),
      'd . . . . . . . d . . . . . . .',
    ),
    L,
  )
  const gtrB2 = sub(
    bars(
      'f . . . . . . . f . . . - - - -',
      'f . . . . . . . e . . . - - - -',
      'e . . . . . . . e . . . - - - -',
      'e . . . . . . . c . . . - - - -',
      'c . . . . . . . c . . . - - - -',
      'c . . . . . . . b . . . - - - -',
      'b . . . . . . . b . . . . . . .',
      Array.from({ length: 16 }, () => 'b').join(' '),
    ),
    L,
  )
  const hornA = bars(
    'g2 . . . . . . . d3 . . . . . . .',
    'eb3 . . . . . . . d3 . . . . . . .',
    hold('g2', 16),
    'ab2 . . . . . . . g2 . . . . . . .',
    'g2 . . . . . . . d3 . . . . . . .',
    'eb3 . . . . . . . d3 . . . . . . .',
    hold('g2', 16),
    'g2 . . . d3 . . . eb3 . d3 . g2 . . .',
  )
  const hornB1 = holds(16, 'eb3', 'eb3', 'd3', 'd3', 'c3', 'c3', 'd3', '-')
  const hornB2 = holds(16, 'f3', 'f3', 'eb3', 'eb3', 'c3', 'c3', 'ab2', 'ab2')
  const subA = rep(bars(subBar('g1'), subBar('g1'), subBar('c2'), `${hold('ab1', 8)} ${hold('g1', 8)}`), 2)
  const subB1 = bars(...['eb2', 'eb2', 'd2', 'd2', 'c2', 'c2', 'd2', 'd2'].map(subBar))
  const subB2 = bars(...['f1', 'f1', 'eb2', 'eb2', 'c2', 'c2', 'ab1', 'ab1'].map(subBar))
  const bassA = rep(bars(quarters16('g2'), quarters16('g2'), quarters16('c2'), 'ab2 - - - ab2 - - - g2 - - - g2 - - -'), 2).replace(
    /ab2 - - - ab2 - - - g2 - - - g2 - - -$/,
    'g2 - - - d3 - - - eb3 - d3 - g2 . . .',
  )
  const bassB1 = bars(quarters16('eb2'), quarters16('eb2'), quarters16('d2'), quarters16('d2'), quarters16('c2'), quarters16('c2'), quarters16('d2'), 'd2 . . . . . . . d2 . . . . . . .')
  const bassB2 = bars(
    'f2 . . . . . . . f2 . . . . . . .',
    'f2 . . . . . . . eb2 . . . . . . .',
    'eb2 . . . . . . . eb2 . . . . . . .',
    'eb2 . . . . . . . c2 . . . . . . .',
    'c2 . . . . . . . c2 . . . . . . .',
    'c2 . . . . . . . ab2 . . . . . . .',
    'ab2 . . . . . . . ab2 . . . . . . .',
    eighths16('ab2'),
  )
  const Gm = min3('g3'), Cm = min3('c3'), Ab = maj3('ab3'), Eb = maj3('eb3'), Dm = min3('d3'), Fm = min3('f3'), Ab2 = maj3('ab2')
  const strA = rep(bars(hold(Gm, 32), hold(Cm, 16), `${Ab} . . . . . . . ${Gm} . . . . . . .`), 2)
  const strB1 = holds(16, Eb, Eb, Dm, Dm, Cm, Cm, Dm, Dm)
  const strB2 = holds(16, Fm, Fm, Eb, Eb, Cm, Cm, Ab2, Ab2)
  const choirA = strA
  const choirB1 = holds(16, 'g3+d4', 'c4+g4', 'bb3+f4', 'c4+g4', 'g3+d4', 'g3+d4', 'd4+a4', 'd4+a4')
  const choirB2 = strB2
  return {
    key: 'gatehouse',
    title: 'Siege',
    bpm: 128,
    steps: 16,
    reverb: [2.5, 0.5],
    pump: 0.35,
    root: 'g1',
    hit: { inst: 'orchHit', notes: 'g2+d3+g3' },
    tracks: [
      { inst: 'taiko', gain: 0.85, pump: true, send: 0.35, light: true, seq: bars('o - - - - - - - x - - - - - x -', 'o - - - - - - - x - - - x - x x') },
      { inst: 'taiko', gain: 0.85, pump: true, send: 0.3, heavy: true, seq: bars('o - - - x - - - o - - - x - x -', 'o - - - x - - - o - x - x x x -') },
      { inst: 'timp', gain: 0.5, layer: 1, send: 0.4, seq: bars(rest(16), '- - - - - - - - - - - - g g x -') },
      { inst: 'snare', gain: 0.5, layer: 2, pan: 0.2, light: true, seq: bars('- - - - x - - - - - - - x - g g', '- - - - x - - - - - g g x - g g') },
      { inst: 'snare', gain: 0.55, pan: 0.2, heavy: true, seq: 'x - g g x - g g x - g g x g g g' },
      { inst: 'crash', gain: 0.5, layer: 1, seq: `o ${rest(15)} | ${rep(rest(16), 7)}` },
      { inst: 'rev', gain: 0.45, layer: 2, seq: `${rep(rest(16), 15)} | ${rest(8)} ${hold('x', 8)}` },
      { inst: 'orchHit', gain: 0.5, layer: 1, send: 0.5, seq: `g3+bb3+d4 ${rest(15)} | ${rep(rest(16), 3)}` },
      { inst: 'sub', gain: 0.55, pumped: true, seq: bars(subA, subB1), alt: bars(subA, subB2) },
      { inst: 'horn', gain: 0.55, send: 0.45, seq: bars(hornA, hornB1), alt: bars(hornA, hornB2) },
      { inst: 'dbass', gain: 0.5, gate: 0.8, pumped: true, seq: bars(bassA, bassB1), alt: bars(bassA, bassB2) },
      { inst: 'strings', gain: 0.42, layer: 1, send: 0.5, seq: bars(strA, strB1), alt: bars(strA, strB2) },
      { inst: 'choir', gain: 0.45, layer: 2, send: 0.55, seq: bars(choirA, choirB1), alt: bars(choirA, choirB2) },
      { inst: 'guitar', gain: 0.7, gate: 0.6, layer: 3, pumped: true, pan: -0.2, seq: bars(gtrA, gtrB1), alt: bars(gtrA, gtrB2) },
    ],
  }
})()

// ------------------------------------------------------------------ Chapel: "Requiem"
// E Phrygian, 110. Organ pedal and bells always; the choir is the first voice lost, then the strings
// and drums, then the guitar and the high line: each chandelier dropped takes a third of the room's
// light and a layer with it, so this room has no kits. A: i – i – ♭II – i, i – i – ♭VII – i. B1: A
// minor (iv) – G – F – D minor, the bells answering the motif. B2: C – D minor – F, out on the ♭II.
const chapel: Song = (() => {
  const Em = p5('e2'), Fo = p5('f2'), Do = p5('d2'), Ao = p5('a2'), Go = p5('g2'), Co = p5('c2')
  const orgA = bars(hold(Em, 32), hold(Fo, 16), hold(Em, 16), hold(Em, 32), hold(Do, 16), hold(Em, 16))
  const orgB1 = holds(16, Ao, Ao, Go, Go, Fo, Fo, Do, Do)
  const orgB2 = holds(16, Co, Co, Do, Do, Fo, Fo, Fo, Fo)
  const bellA = rep(bars('e4 . . . . . . . b4 . . . . . . .', 'c5 . . . . . . . b4 . . . . . . .', hold('e4', 16), rest(16)), 2)
  const bellB1 = bars('e4 . . . . . . . a4 . . . . . . .', 'g4 . . . . . . . a4 . . . . . . .', hold('e4', 16), rest(16), 'c5 . . . . . . . g4 . . . . . . .', 'f4 . . . . . . . a4 . . . . . . .', hold('d4', 16), rest(16))
  const bellB2 = holds(16, 'g4', 'e4', 'f4', 'd4', 'a4', 'f4', 'c5', '-')
  const Em3 = min3('e3'), F3 = maj3('f3'), Am3 = min3('a3'), G3 = maj3('g3'), Dm3 = min3('d3'), C3 = maj3('c3')
  const choirA = rep(bars(hold(Em3, 32), hold(F3, 16), hold(Em3, 16)), 2)
  const choirB1 = holds(16, Am3, Am3, G3, G3, F3, F3, Dm3, Dm3)
  const choirB2 = holds(16, C3, C3, Dm3, Dm3, F3, F3, F3, F3)
  const bassA = bars(
    'e2 . . . . . . . e2 . . . . . . .',
    'e2 . . . . . . . e2 . . . . . . .',
    hold('f2', 16),
    hold('e2', 16),
    'e2 . . . . . . . e2 . . . . . . .',
    'e2 . . . . . . . e2 . . . . . . .',
    hold('d2', 16),
    'e2 . . b2 . . c3 . . . b2 . . e2 . .',
  )
  const bassB1 = bars('a1 . . . . . . . a1 . . . . . . .', hold('a1', 16), 'g1 . . . . . . . g1 . . . . . . .', hold('g1', 16), 'f2 . . . . . . . f2 . . . . . . .', hold('f2', 16), 'd2 . . . . . . . d2 . . . . . . .', hold('d2', 16))
  const bassB2 = bars(hold('c2', 32), hold('d2', 32), hold('f2', 48), 'f2 . . . . . . . f2 . . . . . . .')
  const strA = rep(bars('b3 . . . . . . . c4 . . . . . . .', 'b3 . . . . . . . g3 . . . . . . .', hold('a3', 16), 'g3 . . . . . . . f3 . . . . . . .'), 2)
  const strB1 = holds(16, 'c4', 'e4', 'd4', 'b3', 'a3', 'c4', 'f3', 'a3')
  const strB2 = holds(16, 'e4', 'g4', 'f4', 'a4', 'c4', 'a3', 'f3', 'c4')
  const L = { R: pc('e3'), W: pc('g3'), F: pc('f3'), B: pc('b3'), K: pc('c4'), a: pc('a3'), A: pc('a2'), G: pc('g2'), D: pc('d3'), C: pc('c3') }
  const gtrA = sub(
    rep(
      bars(
        'R - R - R - R - R - R - W - F -',
        'R - R - R - R - B . K . B . R -',
        'F - F - F - F - F - F - a - F -',
        'R - R - R - R - R . . . . . . -',
      ),
      2,
    ).replace(/R - R - R - R - R \. \. \. \. \. \. -$/, 'R - - - B - - - K - B - R . . .'),
    L,
  )
  const gtrB1 = sub(bars(eighths16('A'), eighths16('A'), eighths16('G'), eighths16('G'), eighths16('F'), eighths16('F'), eighths16('D'), 'D . . . . . . . D . . . . . . .'), L)
  const gtrB2 = sub(bars(hold('C', 16), hold('C', 16), hold('D', 16), hold('D', 16), hold('F', 16), hold('F', 16), hold('F', 16), eighths16('F')), L)
  const leadA = rep(bars('e5 . . . . . . . . . . . b4 . . .', 'c5 . . . . . . . b4 . . . g4 . . .', 'a4 . . . . . . . . . . . b4 . . .', hold('e4', 16)), 2)
  const leadB1 = holds(16, 'e5', 'c5', 'd5', 'b4', 'a4', 'c5', 'a4', 'f4')
  const leadB2 = holds(16, 'g5', 'e5', 'f5', 'a5', 'c5', 'a4', 'f4', '-')
  return {
    key: 'chapel',
    title: 'Requiem',
    bpm: 110,
    steps: 16,
    reverb: [3.5, 0.5],
    pump: 0.3,
    root: 'e1',
    hit: { inst: 'bell', notes: 'e4', gain: 0.9 },
    tracks: [
      { inst: 'taiko', gain: 0.75, pump: true, send: 0.5, seq: bars('o - - - - - - - - - - - x - - -', 'o - - - - - - - x - - - - - - -') },
      { inst: 'organ', gain: 0.5, send: 0.5, seq: bars(orgA, orgB1), alt: bars(orgA, orgB2) },
      { inst: 'bell', gain: 0.35, pan: 0.2, send: 0.6, seq: bars(bellA, bellB1), alt: bars(bellA, bellB2) },
      { inst: 'choir', gain: 0.5, layer: 1, send: 0.6, seq: bars(choirA, choirB1), alt: bars(choirA, choirB2) },
      { inst: 'dbass', gain: 0.45, gate: 0.9, layer: 1, pumped: true, seq: bars(bassA, bassB1), alt: bars(bassA, bassB2) },
      { inst: 'strings', gain: 0.4, layer: 2, send: 0.5, seq: bars(strA, strB1), alt: bars(strA, strB2) },
      { inst: 'kick', gain: 0.65, layer: 2, seq: 'o - - - - - - - o - - - - - - -' },
      { inst: 'snare', gain: 0.5, layer: 2, send: 0.4, seq: '- - - - x - - - - - - - x - - -' },
      { inst: 'orchHit', gain: 0.5, layer: 2, send: 0.6, seq: `e3+g3+b3 ${rest(15)} | ${rep(rest(16), 3)}` },
      { inst: 'guitar', gain: 0.7, gate: 0.6, layer: 3, pumped: true, pan: -0.2, seq: bars(gtrA, gtrB1), alt: bars(gtrA, gtrB2) },
      { inst: 'lead', gain: 0.38, gate: 0.95, layer: 3, pan: 0.15, send: 0.5, seq: bars(leadA, leadB1), alt: bars(leadA, leadB2) },
    ],
  }
})()

export const SONGS: Song[] = [cellar, pits, greenhouse, forge, lab, armoury, icebox, gatehouse, chapel]
