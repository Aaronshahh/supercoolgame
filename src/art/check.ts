/**
 * Validates every sprite's dimensions and palette characters without needing a browser.
 * Run: node src/art/check.ts
 */
import { CHARACTERS, CHAR_H, CHAR_W } from './characters.ts'
import { BARREL, BOOMERANG, CRATE, DEBRIS, SHADOW_BOOM, SHADOW_DUDE, TORCH } from './props.ts'
import { FONT, FONT_H, FONT_W } from './font.ts'
import { CHAR_KEY, PROP_KEY } from './palette.ts'
import { GLYPH_SIZE, POWER_GLYPHS, POWER_KEY } from './powerups.ts'

let problems = 0

function check(name: string, rows: string[], allowed: Set<string>, w?: number, h?: number) {
  const width = rows[0]?.length ?? 0
  if (h !== undefined && rows.length !== h) {
    console.error(`${name}: expected ${h} rows, got ${rows.length}`)
    problems++
  }
  if (w !== undefined && width !== w) {
    console.error(`${name}: expected width ${w}, got ${width}`)
    problems++
  }
  rows.forEach((row, i) => {
    if (row.length !== width) {
      console.error(`${name}: row ${i} has width ${row.length}, expected ${width}: "${row}"`)
      problems++
    }
    for (const ch of row) {
      if (ch !== '.' && !allowed.has(ch)) {
        console.error(`${name}: row ${i} has unknown char "${ch}"`)
        problems++
      }
    }
  })
}

const charChars = new Set([...Object.keys(CHAR_KEY), 'P', 'p', 'h'])
const propChars = new Set([...Object.keys(PROP_KEY), 'P'])

// Character frames also need the feet on the last row, or the sprite floats above its shadow.
function checkChar(name: string, rows: string[]) {
  check(name, rows, charChars, CHAR_W, CHAR_H)
  if (rows[CHAR_H - 1] !== undefined && !/[^.]/.test(rows[CHAR_H - 1])) {
    console.error(`${name}: bottom row is empty (feet must touch the last row)`)
    problems++
  }
}

const ACTIONS = ['stand', 'run', 'throw', 'catch', 'melee'] as const
const FACINGS = ['down', 'side', 'up'] as const
let charFrames = 0
for (const c of CHARACTERS) {
  for (const action of ACTIONS) {
    for (const facing of FACINGS) {
      const frames = c[action][facing]
      if (frames.length === 0) {
        console.error(`${c.name}.${action}.${facing}: no frames`)
        problems++
      }
      frames.forEach((f, i) => checkChar(`${c.name}.${action}.${facing}[${i}]`, f))
      charFrames += frames.length
    }
  }
  c.roll.forEach((f, i) => checkChar(`${c.name}.roll[${i}]`, f))
  charFrames += c.roll.length
  // The run cycle is indexed by one counter for every facing, and the lift table has to cover it.
  const n = c.run.down.length
  if (c.run.side.length !== n || c.run.up.length !== n) {
    console.error(`${c.name}.run: facings have different frame counts (${n}/${c.run.side.length}/${c.run.up.length})`)
    problems++
  }
  if (c.runLift.length !== n) {
    console.error(`${c.name}.runLift: ${c.runLift.length} entries for ${n} run frames`)
    problems++
  }
  for (const [action, durations] of [['stand', c.idleTicks], ['run', c.runTicks], ['throw', c.throwTicks]] as const) {
    if (!durations) continue
    const frames=c[action]
    if (durations.length !== frames.down.length || durations.some(n => !Number.isInteger(n) || n < 1)) {
      console.error(`${c.name}.${action}: invalid authored frame holds`)
      problems++
    }
    if (FACINGS.some(f => frames[f].length !== durations.length)) {
      console.error(`${c.name}.${action}: facing lengths differ`)
      problems++
    }
    if (action === 'throw' && durations.reduce((sum, n) => sum + n, 0) !== 24) {
      console.error(`${c.name}.throw: frame holds must span the 24-tick throw animation`)
      problems++
    }
  }
  if (c.landingFrame !== undefined && (c.landingFrame < 0 || c.landingFrame >= n || c.runLift[c.landingFrame] !== 0)) {
    console.error(`${c.name}: landing must name a grounded run pose`)
    problems++
  }
  if (!(c.runPeriod >= 1)) {
    console.error(`${c.name}.runPeriod: ${c.runPeriod}`)
    problems++
  }
}
check('BOOMERANG', BOOMERANG, propChars, 11, 11)
check('CRATE', CRATE, propChars, 14, 14)
check('BARREL', BARREL, propChars, 12, 14)
TORCH.forEach((f, i) => check(`TORCH[${i}]`, f, propChars, 7, 11))
check('SHADOW_DUDE', SHADOW_DUDE, propChars, 10, 4)
check('SHADOW_BOOM', SHADOW_BOOM, propChars, 6, 2)
for (const [k, v] of Object.entries(DEBRIS)) check(`DEBRIS.${k}`, v, propChars)
for (const [k, v] of Object.entries(FONT)) check(`FONT["${k}"]`, v, new Set(['#']), FONT_W, FONT_H)
// power-up glyphs sit on a dark badge, so 'o' (the badge colour) must not appear inside one
const powerChars = new Set(Object.keys(POWER_KEY).filter((c) => c !== 'o'))
for (const [k, v] of Object.entries(POWER_GLYPHS)) check(`POWER_GLYPHS.${k}`, v, powerChars, GLYPH_SIZE, GLYPH_SIZE)

if (problems) throw new Error(`${problems} art problem(s)`)
console.log(`art ok: ${CHARACTERS.length} characters (${charFrames} frames), ${Object.keys(FONT).length} glyphs, ${Object.keys(POWER_GLYPHS).length} power-up icons`)
