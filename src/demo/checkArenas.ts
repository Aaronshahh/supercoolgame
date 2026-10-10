/**
 * Validates the arena roster without a browser (docs/02 §2): canvas size and open-tile budget,
 * wall ring, torches over open floor, spawn rules, connectivity, rails on legal tiles, movers that
 * cannot meet, portal mouths in walls, and a symmetry warning. Also prints the layout numbers the
 * design rules in docs/notes-arena-design.md are stated in (size, open tiles against the budget,
 * blocks, longest sightline, spawn spacing).
 * Run: npm run check-arenas   (bundled through esbuild first: tiles.ts has an enum, which Node's
 * plain type-stripping refuses)
 */
import { ARENA_LIST, MAX_COLS, MAX_ROWS, OPEN_BUDGET, OPEN_TOLERANCE, type ArenaEntry } from './arenas.ts'
import { parseArena, tileAt, TileKind, type ArenaMap } from '../render/tiles.ts'
import type { HazardDef, TilePt } from './arena.ts'

let problems = 0
let warnings = 0
const fail = (a: string, msg: string) => {
  console.error(`${a}: ${msg}`)
  problems++
}
const warn = (a: string, msg: string) => {
  console.warn(`${a}: warning: ${msg}`)
  warnings++
}

const key = (c: number, r: number) => r * 1000 + c
const LETHAL = new Set([TileKind.Spikes, TileKind.Vent, TileKind.Pit, TileKind.Crumble])

/** Tiles a hazard sweeps or occupies, for spawn distance and mover-collision checks. */
function sweptTiles(h: HazardDef): Set<number> {
  const out = new Set<number>()
  const segs = (pts: TilePt[], w = 1, hgt = 1) => {
    for (let i = 0; i < pts.length; i++) {
      const [c0, r0] = pts[i]
      const [c1, r1] = pts[Math.min(i + 1, pts.length - 1)]
      const dc = Math.sign(c1 - c0)
      const dr = Math.sign(r1 - r0)
      let c = c0
      let r = r0
      for (;;) {
        for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) out.add(key(c + x, r + y))
        if (c === c1 && r === r1) break
        c += dc
        r += dr
      }
    }
  }
  switch (h.kind) {
    case 'platform':
      segs(h.rail, h.w, h.h)
      break
    case 'crusher':
    case 'cart':
      segs(h.rail)
      break
    case 'gate':
      for (const [c, r] of h.tiles) out.add(key(c, r))
      break
    case 'chandelier':
      out.add(key(h.c, h.r))
      break
    case 'portal':
    case 'dark':
      break
  }
  return out
}

function checkRail(a: string, what: string, rail: TilePt[], m: ArenaMap, allowed: TileKind[], w = 1, hgt = 1) {
  if (rail.length < 2) fail(a, `${what}: a rail needs two points`)
  for (let i = 1; i < rail.length; i++) {
    if (rail[i][0] !== rail[i - 1][0] && rail[i][1] !== rail[i - 1][1]) fail(a, `${what}: rail segment ${i} is diagonal (${rail[i - 1]} → ${rail[i]})`)
  }
  for (const k of sweptTiles({ kind: 'platform', rail, w, h: hgt })) {
    const c = k % 1000
    const r = Math.floor(k / 1000)
    const t = tileAt(m, c, r)
    if (!allowed.includes(t)) fail(a, `${what}: rail crosses ${TileKind[t]} at ${c},${r}`)
  }
}

function checkArena(a: ArenaEntry) {
  const name = a.key
  let m: ArenaMap
  try {
    m = parseArena(a.rows)
  } catch (e) {
    fail(name, String(e))
    return
  }
  // the footprint is the room's own; the canvas cap and the open-tile budget are shared
  if (m.cols > MAX_COLS || m.rows > MAX_ROWS) fail(name, `size ${m.cols}×${m.rows} is over ${MAX_COLS}×${MAX_ROWS}`)
  let open = 0
  for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] !== TileKind.Wall) open++
  const budgetOff = (open - OPEN_BUDGET) / OPEN_BUDGET
  if (Math.abs(budgetOff) > OPEN_TOLERANCE) fail(name, `${open} open tiles, budget ${OPEN_BUDGET} ± ${Math.round(OPEN_TOLERANCE * 100)} %`)
  for (let c = 0; c < m.cols; c++) for (const r of [0, 1, m.rows - 1]) if (tileAt(m, c, r) !== TileKind.Wall) fail(name, `outer ring open at ${c},${r}`)
  for (let r = 0; r < m.rows; r++) for (const c of [0, m.cols - 1]) if (tileAt(m, c, r) !== TileKind.Wall) fail(name, `outer ring open at ${c},${r}`)
  // torches hang on a wall face, so the tile under one must be open
  for (const p of m.props) if (p.kind === 'torch' && tileAt(m, p.c, p.r + 1) === TileKind.Wall) fail(name, `torch at ${p.c},${p.r} is not on a wall face (wall below it)`)
  const torches = m.props.filter((p) => p.kind === 'torch').length
  if (torches === 0 && a.lightSource !== 'chandeliers') warn(name, 'no torches and no other light source')
  if (a.lightSource === 'chandeliers' && !a.hazards.some((h) => h.kind === 'chandelier')) fail(name, 'lit by chandeliers but has none')

  // what each tile holds beyond its kind
  const prop = new Map<number, string>()
  for (const p of m.props) prop.set(key(p.c, p.r), p.kind)
  const swept = new Set<number>()
  for (const h of a.hazards) for (const k of sweptTiles(h)) swept.add(k)

  // spawns: six, on plain floor, clear of hazards, spread out
  const spawns = m.spawns.filter(Boolean)
  if (spawns.length < 6 || m.spawns.length !== 6) fail(name, `${spawns.length} spawns, need 1–6 all present`)
  spawns.forEach((s, i) => {
    const t = tileAt(m, s.c, s.r)
    if (t !== TileKind.Floor || prop.has(key(s.c, s.r))) fail(name, `spawn ${i + 1} at ${s.c},${s.r} is not plain floor`)
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const c = s.c + dc
        const r = s.r + dr
        const k = tileAt(m, c, r)
        if (LETHAL.has(k)) fail(name, `spawn ${i + 1} at ${s.c},${s.r} is within 2 tiles of ${TileKind[k]} at ${c},${r}`)
        if (swept.has(key(c, r))) fail(name, `spawn ${i + 1} at ${s.c},${s.r} is within 2 tiles of a mover or gate at ${c},${r}`)
      }
    }
  })
  let minSpawnGap = Infinity
  for (let i = 0; i < spawns.length; i++) {
    for (let j = i + 1; j < spawns.length; j++) {
      const d = Math.abs(spawns[i].c - spawns[j].c) + Math.abs(spawns[i].r - spawns[j].r)
      minSpawnGap = Math.min(minSpawnGap, d)
      if (d < 6) fail(name, `spawns ${i + 1} and ${j + 1} are only ${d} tiles apart`)
    }
  }
  if (m.powerups.length < 3) warn(name, `${m.powerups.length} power-up points (03 wants 3)`)
  for (const p of m.powerups) if (tileAt(m, p.c, p.r) !== TileKind.Floor || prop.has(key(p.c, p.r))) fail(name, `power-up point at ${p.c},${p.r} is not plain floor`)

  // hazards sit on legal tiles
  for (const h of a.hazards) {
    switch (h.kind) {
      case 'platform':
        checkRail(name, 'platform', h.rail, m, [TileKind.Pit, TileKind.Floor], h.w, h.h)
        break
      case 'crusher':
        checkRail(name, `${h.look}`, h.rail, m, [TileKind.Floor, TileKind.Ice, TileKind.Grass])
        if (h.anchor && tileAt(m, h.anchor[0], h.anchor[1]) !== TileKind.Wall) fail(name, `pendulum anchor ${h.anchor} is not a wall tile`)
        break
      case 'cart':
        checkRail(name, 'cart', h.rail, m, [TileKind.Floor, TileKind.Ice])
        break
      case 'gate': {
        const straight = h.tiles.every(([c]) => c === h.tiles[0][0]) || h.tiles.every(([, r]) => r === h.tiles[0][1])
        if (!straight) fail(name, `gate ${JSON.stringify(h.tiles)} is not a straight line`)
        for (const [c, r] of h.tiles) if (tileAt(m, c, r) !== TileKind.Floor || prop.has(key(c, r))) fail(name, `gate tile ${c},${r} is not plain floor`)
        break
      }
      case 'chandelier':
        if (tileAt(m, h.c, h.r) !== TileKind.Floor) fail(name, `chandelier over ${h.c},${h.r} is not over floor`)
        break
      case 'portal': {
        const DIRS = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] } as const
        for (const [pt, face, hue] of [[h.a, h.aFace, 'blue'], [h.b, h.bFace, 'orange']] as const) {
          const [c, r] = pt
          if (tileAt(m, c, r) !== TileKind.Wall) fail(name, `${hue} portal mouth ${c},${r} is not a wall tile`)
          const open = (['s', 'n', 'e', 'w'] as const).filter((k) => tileAt(m, c + DIRS[k][0], r + DIRS[k][1]) !== TileKind.Wall)
          if (open.length === 0) fail(name, `${hue} portal mouth ${c},${r} has no open side`)
          if (face && !open.includes(face)) fail(name, `${hue} portal mouth ${c},${r} faces ${face} but that side is wall`)
          if (!face && open.length > 1) warn(name, `${hue} portal mouth ${c},${r} is open on ${open.join('/')}; say which it faces`)
        }
        break
      }
      case 'dark':
        if (h.c0 > h.c1 || h.c0 < 0 || h.c1 >= m.cols) fail(name, `dark zone ${h.c0}–${h.c1} is out of range`)
        break
    }
  }
  // no two movers can meet: their swept tiles must not overlap
  const movers = a.hazards.filter((h) => h.kind === 'platform' || h.kind === 'crusher' || h.kind === 'cart')
  for (let i = 0; i < movers.length; i++) {
    const si = sweptTiles(movers[i])
    for (let j = i + 1; j < movers.length; j++) {
      for (const k of sweptTiles(movers[j])) {
        if (si.has(k)) {
          fail(name, `movers ${i} (${movers[i].kind}) and ${j} (${movers[j].kind}) both sweep ${k % 1000},${Math.floor(k / 1000)}`)
          break
        }
      }
    }
  }

  // connectivity: every tile a body can stand on is reachable from every spawn, with gates open,
  // crates and barrels breakable, and platforms counted as floor wherever they go
  const platformTiles = new Set<number>()
  for (const h of a.hazards) if (h.kind === 'platform') for (const k of sweptTiles(h)) platformTiles.add(k)
  const passable = (c: number, r: number) => {
    const t = tileAt(m, c, r)
    if (t === TileKind.Wall) return false
    if (prop.get(key(c, r)) === 'bumper') return false
    if (t === TileKind.Pit) return platformTiles.has(key(c, r))
    return true
  }
  const seen = new Set<number>()
  if (spawns.length) {
    const q = [spawns[0]]
    seen.add(key(spawns[0].c, spawns[0].r))
    while (q.length) {
      const { c, r } = q.pop()!
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc
        const nr = r + dr
        if (!passable(nc, nr) || seen.has(key(nc, nr))) continue
        seen.add(key(nc, nr))
        q.push({ c: nc, r: nr })
      }
    }
  }
  spawns.forEach((s, i) => {
    if (!seen.has(key(s.c, s.r))) fail(name, `spawn ${i + 1} at ${s.c},${s.r} cannot reach spawn 1`)
  })
  let unreachable = 0
  let first = ''
  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) {
      if (passable(c, r) && !seen.has(key(c, r))) {
        unreachable++
        if (!first) first = `${c},${r}`
      }
    }
  }
  if (unreachable) fail(name, `${unreachable} standable tiles are cut off from spawn 1 (first at ${first})`)

  // symmetry: the tile grid (with props) under a mirror or a half turn; a warning, as §2 says
  const cell = (c: number, r: number) => {
    const t = tileAt(m, c, r)
    return `${t}${prop.get(key(c, r)) ?? ''}`
  }
  const same = (f: (c: number, r: number) => [number, number]) => {
    for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
      const [c2, r2] = f(c, r)
      if (cell(c, r) !== cell(c2, r2)) return false
    }
    return true
  }
  const sym = same((c, r) => [m.cols - 1 - c, r]) ? 'mirror ↔' : same((c, r) => [c, m.rows - 1 - r]) ? 'mirror ↕' : same((c, r) => [m.cols - 1 - c, m.rows - 1 - r]) ? 'half turn' : null
  if (!sym) warn(name, 'tile layout is not mirror- or half-turn-symmetric')

  // layout numbers for the design rules. "Blocks" are the wall tiles that stand free of the outer
  // wall mass: everything the ring reaches through other walls is the room's outline, not a block.
  const outline = new Set<number>()
  {
    const q: [number, number][] = []
    for (let c = 0; c < m.cols; c++) for (const r of [0, m.rows - 1]) q.push([c, r])
    for (let r = 0; r < m.rows; r++) for (const c of [0, m.cols - 1]) q.push([c, r])
    for (const [c, r] of q) outline.add(key(c, r))
    while (q.length) {
      const [c, r] = q.pop()!
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc
        const nr = r + dr
        if (nc < 0 || nr < 0 || nc >= m.cols || nr >= m.rows) continue
        if (tileAt(m, nc, nr) !== TileKind.Wall || outline.has(key(nc, nr))) continue
        outline.add(key(nc, nr))
        q.push([nc, nr])
      }
    }
  }
  let pits = 0
  let blocks = 0
  let longest = 0
  for (let r = 0; r < m.rows; r++) {
    let run = 0
    for (let c = 0; c < m.cols; c++) {
      const t = tileAt(m, c, r)
      if (t === TileKind.Wall && !outline.has(key(c, r))) blocks++
      else if (t === TileKind.Pit) pits++
      if (t === TileKind.Wall) run = 0
      else longest = Math.max(longest, ++run)
    }
  }
  for (let c = 0; c < m.cols; c++) {
    let run = 0
    for (let r = 0; r < m.rows; r++) {
      if (tileAt(m, c, r) === TileKind.Wall) run = 0
      else longest = Math.max(longest, ++run)
    }
  }
  const pct = (n: number) => `${Math.round((100 * n) / open)}%`
  const off = `${budgetOff >= 0 ? '+' : '−'}${Math.abs(Math.round(budgetOff * 1000) / 10)} %`
  console.log(`${name.padEnd(10)} ${`${m.cols}×${m.rows}`.padEnd(5)} ${(a.look ?? 'stone').padEnd(8)} ${sym ?? 'asymmetric'}: open ${open} (${off}), pits ${pct(pits)}, wall blocks ${blocks}, longest open line ${longest}, spawn gap ≥ ${minSpawnGap}, ${a.hazards.length} listed hazards`)
}

for (const a of ARENA_LIST) checkArena(a)
if (problems) throw new Error(`${problems} arena problem(s)${warnings ? `, ${warnings} warning(s)` : ''}`)
console.log(`arenas ok: ${ARENA_LIST.length} rooms${warnings ? `, ${warnings} warning(s)` : ''}`)
