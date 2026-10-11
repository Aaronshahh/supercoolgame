# 02 — Arenas, Tiles & Hazards

Status: **Draft v1 — everything prototyped in the demo** (2026-10-09; the same day Aaron cut the
trapdoor and added portals, Portal-2 style blue and orange mouths in the walls, §4.8 and §4.10). A catalogue of candidates
with proposed rules and numbers, plus a recommended shortlist and a first arena roster. Aaron's
answer to the shortlist question was to build all of it, so every **core** and **maybe** item below
(except the hurry-up, which is round flow) is playable in the demo's strip arena; §13 lists where the
demo departs from the text. **Cut** items are listed so we remember why not. The remaining open
decisions are in §11.

Scope: everything about the room the fight happens in — the tile grid, static tiles, props,
periodic and moving hazards, the hurry-up escalation, the arena data format and validator, and the
first set of arenas. Power-ups (03) only appear here as spawn points and as the "fire flag" hook;
03 §6 has the full matrix of power-ups against these elements.

---

## 1. Design lens

Every arena element has to earn its place against one of these, or it is set dressing:

1. **It talks to the boomerang.** Boomerangs fly over pits, cut grass, break crates, light barrels,
   ride conveyor belts, bounce off gates. A throw does something a body cannot.
2. **It talks to the dash.** The roll's six i-frames beat movers (saw, pendulum) but not the floor
   (spikes, fire, pits). Dash is the answer to some hazards and a trap against others.
3. **It makes involuntary movement.** Belts, bumpers, carts, departing platforms and knockback are
   the only things that can put a player in a pit, so they turn pits from walls into weapons.
4. **It changes the room over time.** Gates, grass regrowth, crumble: the map at 30 s is
   not the map at 0 s, so camping a spot doesn't work.

Hard rules inherited from 01: one fixed screen, no HP (anything lethal kills in one touch), all
hazards deterministic (phase derived from `tick` with integer arithmetic, rails are polylines at
constant speed, no trig), the renderer learns about hazards only through events.

**Readability** is the overriding constraint at this scale (576×318 up to 640×366): every lethal thing gets a telegraph of at
least `HAZARD_WARN_MIN` = 30 ticks (0.5 s) that is both visual and audible, and nothing lethal is
ever the same colour as the floor.

---

## 2. Arena grid and data format

| Item | Value |
|---|---|
| Grid | Tiles of 16 px under the 14 px HUD. The reference room (The Cellar) is 36 × 19 (576 × 304) — 01 §1, Aaron's call of 2026-10-09: 10 % smaller than the demo's 40 × 21 movement floor. Every other room keeps its **open-tile budget, 520 ± 4 %**, in a footprint of its own (a cave with its corners eaten away, a tall grove, an octagon, an H, a long hall, a rounded pond, two towers and a keep, a cross) inside a canvas of at most **40 × 22** (640 × 352), which still scales 2× in a laptop window. Aaron, 2026-10-09: "the room should not be the same exact formatting size every single time … use the same amount of total squares, but organize them in interesting ways that fit the room's theme" |
| Outer ring | always `wall`, two rows deep along the top (cap + torch face); the wall mass is as thick as the shape needs anywhere else. The Cellar's playable interior is 34 × 16 |
| Look | each theme has an environment of its own (`src/render/looks.ts`): a palette for floor, wall cap, wall face and pit plus a procedural drawing style for each, all generated at load; no hand-drawn tiles. The Cellar keeps the original stone (Aaron: "we can keep the cellar as it is"); see §7 |
| Spawns | ≥ 6 per arena, on plain floor, ≥ 2 tiles from any hazard tile or mover path, never in grass |
| Power-up points (03) | ≥ 3 per arena, marked in the map, on plain floor |
| Symmetry | mirror or 180° rotational; the validator warns (not fails) on asymmetry |
| Connectivity | every floor tile reachable from every spawn with all gates open and all platforms considered floor |

An arena is data: a name, a theme (palette + tileset), the map rows, a list of parameterised
hazards, and flags.

```
Map legend (one char per tile; parameter-free things only) — matches src/render/tiles.ts
  #  wall          T  torch (wall)      .  floor          ~  pit
  "  grass         _  ice               C  crate          B  barrel
  ^  spikes        *  fire vent         o  bumper
  &  spikes        @  fire vent         (half a cycle behind ^ *)
  %  crumbling floor                    < > A V  conveyor belt running left / right / up / down
  1-6 spawn        p  power-up point
Hazards list (anything with a rail, size, anchor or partner) — tile coords, as in src/demo/arena.ts
  { kind: 'platform',   rail: [[c,r],[c,r]], w, h, speed?, dwell?, phase? }   // rail = top-left tile
  { kind: 'crusher',    rail: [[c,r],...], look: 'saw' | 'pendulum' | 'boulder', anchor?, speed?, dwell?, phase? }
  { kind: 'cart',       rail: [[c,r],...], speed?, dwell?, phase? }
  { kind: 'gate',       tiles: [[c,r],...], phase? }
  { kind: 'chandelier', c, r }
  { kind: 'portal',     a: [c,r], b: [c,r], aFace?, bFace? }   // two wall tiles: a blue, b orange; face = 's'|'n'|'e'|'w' when both sides are open
  { kind: 'dark',       c0, c1 }     // render-only: lights go down between these columns
Flags: hurryUp: true | false
```

Belts and phase offsets turned out simpler as tile characters than as rects: a belt is just a floor
tile with a direction, and "half a cycle behind" covers every alternating-corridor layout we have
wanted so far. If an arena ever needs a third phase, a `phase` rect can come back. Darkness is a
hazard entry rather than a flag so one map can have a dark wing (the demo strip's CRYPT).

`npm run check-arenas` (`src/demo/checkArenas.ts`, bundled through esbuild because Node cannot strip
the tile enum) validates size, outer ring, spawn rules, connectivity, that rails lie on floor/pit
tiles, that gates are straight, that portal mouths are wall tiles with an open side, and that no two
movers can collide; it warns on asymmetry and prints the layout numbers the targets in
`docs/notes-arena-design.md` §3 are stated in.

---

## 3. Interaction matrix

How each actor meets each element. "over" means no interaction. Proposals; the per-element
sections below have the detail.

| Element | Walking player | Dashing player | Knocked / carried player | Boomerang in flight | Resting / dropped boomerang | Melee swing | Blast |
|---|---|---|---|---|---|---|---|
| Wall | blocked | blocked | blocked | bounces | — | — | stops |
| Pit | blocked (edge) | blocked | **falls, dies** | over | slides to nearest floor | — | over |
| Grass | hidden, rustle event | hidden, rustle | hidden | **cuts** it | hidden too | **cuts** arc | cuts radius |
| Crate | blocked | blocked | blocked | **breaks**, continues | — | breaks | breaks |
| Barrel | blocked | blocked | blocked | bounces, **lights fuse** | — | lights fuse | lights fuse |
| Ice | slides | longer slide | slides further | over | over | — | — |
| Spikes (up) | **dies** | **dies** | dies | over | over | — | — |
| Fire vent (on) | **dies** | **dies** | dies | over, gains fire flag (03) | over | — | — |
| Portal mouth | **walks through** to the twin, turned to match, speed kept | through, roll continues | through | **through** on the way out only; returns fly over | — (it is in a wall) | — | stops (wall) |
| Belt | pushed `BELT_SPEED` | pushed | pushed | over | **rides** the belt | — | — |
| Platform | carried | carried | carried; **falls if left behind** | over | carried | — | — |
| Gate (closed) | as wall | as wall | as wall; shoved out if caught | bounces | — | — | stops |
| Crusher (saw / pendulum) | **dies** | **safe** (i-frames) | dies | over | over | — | — |
| Cart | **shoved** `CART_SHOVE` | shoved | shoved | bounces | pushed along | — | — |
| Bumper | **shoved** `BUMPER_SHOVE` | shoved | shoved | bounces, no speed loss | — | — | — |
| Darkness | invisible outside light | afterimage shows | — | **glows** | glows faintly | flash | lights the room |

Dash i-frames in one line: they beat things that *come at you* (crushers, boomerangs, slashes,
blasts) and never things you *stand on* (spikes, fire, pits). Consistent with 01 §7.

**Kill credit**: a hazard death credits the last player who applied involuntary movement to the
victim within `HAZARD_CREDIT_TICKS` = 90, else the owner of the boomerang or blast that triggered
the hazard (a barrel chain credits whoever lit the first barrel), else nobody. Only matters for the
podium tiebreak (01 §10).

---

## 4. Static tiles (in the grid)

### 4.1 Pit `~` — core, in 01 already
Blocks voluntary movement at the tile edge; any involuntary movement whose result puts the
player's centre over a pit tile kills them (fall: 28-tick sink, 01 §8). Boomerangs fly over. New
here: a boomerang that would come to **rest or drop** over a pit (hover stop, bomb rest, owner
died) is placed on the nearest floor tile centre instead (deterministic search in tile order) with
a short "clatter" hop, so a boomerang is never lost. A bomb resting over a pit still explodes.

### 4.2 Grass `"` — core, in 01 already
Hides a player completely from everyone else: sprite, shadow, aim chevron, name. The local player
sees themself at 40 % alpha. Entering or leaving grass emits `grassRustle` (particles + sound) and
a dash through grass rustles every tile — the tells. **Cut** by any boomerang passing over the tile
(becomes stubble, hides nothing), by a melee swing (the tiles its arc covers) and by blasts.
Stubble **regrows** after `GRASS_REGROW` = 480 ticks via a 60-tick sprout stage that is visible but
doesn't hide yet. Decision in §11: regrow or not.

### 4.3 Crate `C` — core, in 01 already
Solid to everything. Breaks on: boomerang hit (the boomerang **continues at full speed**, so a crate
is one-shot cover), melee swing, blast, cart. Debris is cosmetic. May hold a power-up: 03 §3 drops
one from a quarter of broken crates (`CRATE_DROP_CHANCE`, 03 §11 #3). Does not respawn within a
round.

### 4.4 Barrel `B` — core (the demo already draws it)
Solid; boomerangs **bounce** off it like a wall. Any hit (boomerang, melee, blast, fire vent flame,
cart) lights it: it wobbles for `BARREL_FUSE` = 24 ticks (red glow, rising tone), then blasts with
kill radius `BARREL_HIT_RADIUS` = 24 px inside a 27 px ring — same convention as the bomb (ring 10 %
wider than the hitbox). Blasts chain barrels, break crates, cut grass. Dash i-frames save you, as
with the bomb. One barrel hit by a boomerang is the arena's version of "throw a grenade".

### 4.5 Ice `_` — core
Player `ACCEL` and `DECEL` × `ICE_GRIP` = 0.2 while the centre is on ice: full speed takes ~10
ticks, stopping takes ~10 ticks, turning is a drift. Dash slide friction 0.93 → 0.94 (slides
roughly twice as far), knockback decays at the same slower rate. Boomerangs unaffected. Visual:
pale floor with cracks and a specular line. Ice + pits is a whole arena.

### 4.6 Spikes `^` — core
Floor trap tile on a cycle: `SPIKE_DOWN` 120 → `SPIKE_WARN` 30 (tips show, click) → `SPIKE_UP` 45
(lethal to any player whose centre is on the tile, no dash protection) → down. Boomerangs
unaffected. All spikes share the arena clock; a `phase` rect offsets groups so corridors alternate.
The warn phase is the escape window; standing still on spikes is never safe for more than 2.5 s.

### 4.7 Fire vent `*` — core
`VENT_IDLE` 150 → `VENT_WARN` 30 (embers, hiss) → `VENT_FLAME` 40 (lethal, no dash protection) →
idle. The flame is a column one tile wide and ~1.5 tiles tall, so it reads from across the room.
Lights barrels in the tile; a boomerang flying through a flame gets the **fire flag** for the rest
of that flight, so on the way out it lays the 03 §5.1 fire line from there (built 2026-10-09 with
03). Phases per rect like spikes.

### 4.8 Portal — core (Aaron, 2026-10-09: "portals that take you to the other side of the map", "styled like portal 2 - blue and orange and on the walls")
Two **mouths set into wall tiles**, one blue (`a`) and one orange (`b`), linked both ways; in the
hazard list rather than the legend because a mouth needs a partner. Each mouth faces its open side
(inferred: the first of south, north, east, west that is not wall; spelled out with `aFace` /
`bFace` when the wall has rooms on both sides). The two mouths are one doorway, the Portal rule:
**the way into one is the way out of the other, what was on your right stays on your right, speed
is kept.** With four facings that is always a whole number of quarter turns, so a mouth in the back
wall paired with one in the bottom wall is a pure shift (north in, north out), a pair in facing
walls across a room is a wrap-around tunnel, and a pair on the same wall turns you round. A player
who presses into a mouth comes out of the twin just clear of its face, at the same offset along it,
with everything they had turned to match — walk, a dash in progress, the slide, knockback, a belt's
push — so a roll into a portal keeps rolling out of the other one. The wall never gets to stop you:
the mouth is checked before wall collision. A stick held the way you went in keeps meaning
"onwards" after the hop (it is read through the portal's turn until let go or moved), so a pair
that turns you cannot swallow you straight back on a held key; screen-relative controls cannot turn
with you the way a first-person camera does, and this is the nearest thing. An **outbound**
boomerang goes through too, turned the same way, and the aim indicator shows where it comes out (the
preview runs the same flight code, which answers the old objection that teleports fight the
predictable-path indicator). A returning boomerang flies over everything anyway, so a pair can never
ping-pong it. Nothing lethal; the mouth is as wide as its tile (a body whose centre is within 7 px of
the mouth's centre line goes through, anything wider off hits the wall beside it).
Visual: a Portal-2 oval — a bright rim in the mouth's colour around a dark void, sparks riding the
rim, motes falling in, a flare and a spreading ring when something goes through, and a glow in its
colour that spills onto the floor in front and carries in the dark. On a wall face (south-facing) the
oval stands on the ground line and reaches up into the cap behind it; on a wall seen from above it
lies along the open edge. Blue and orange are the only saturated blue and the only orange-on-black
in the palette, so a mouth reads from across the room and the pair reads as a pair. Roster rule: a
pair puts you on the **other side of the room**, which is what makes it a route rather than a
gimmick. No tuning constants: the mouth is its tile and the hop is instant.

### 4.9 Bumper `o` — maybe
Round solid prop. Players touching it are shoved away at `BUMPER_SHOVE` = 5 px/tick (involuntary →
pit deaths). Boomerangs bounce with no speed loss and the bounce does not count toward
`BOOM_MAX_BOUNCES`, so a bumper field makes long ricochet throws. Fun but arcade-y for a dungeon;
a re-skin as a **mushroom cap** or a **spring-loaded shield** on a post could sell it.

### 4.10 Cut
- **Water / goop** (slows): ice covers "the floor fights you" and reads better.
- **Trapdoor** `=` (a floor tile on a 240 / 45 / 120 closed-warn-open cycle that became a pit):
  built in the demo, then cut — Aaron, 2026-10-09: "I don't think it is the most useful". A pit
  with a timer added nothing the pit, the crumble and the spikes don't already do; the hurry-up
  (§6) uses crumble instead. The legend characters `=` and `-` are free again.
- **Turrets, enemies, anything else that shoots**: the boomerang is the only projectile.

---

## 5. Movers and switches (entities, tick step 9)

### 5.1 Conveyor belt — core
Rect of floor that pushes any player whose centre is on it by `BELT_SPEED` = 0.75 px/tick in its
direction every tick (involuntary; a belt ending at a pit is the hazard). Walking against it nets
1.05 px/tick. Resting, hovering and dropped boomerangs **ride** it: your dropped boomerang drifts
away from you. Boomerangs in flight are unaffected. Rendered as a scrolling floor texture.

### 5.2 Moving platform — core
A `w × h` floor rect that slides along a straight rail over pit at `PLATFORM_SPEED` = 0.5 px/tick,
triangle wave, pausing `PLATFORM_DWELL` = 30 ticks at each end. Players and resting boomerangs
whose centre is on it are carried (their position gets the platform's delta before step 4). A
player whose centre is over pit after the platform moves **falls**. Two platforms passing each
other in opposite phase is the classic.

### 5.3 Gate — core
A line of tiles that alternates wall / floor: `GATE_OPEN` 300 → `GATE_WARN` 45 (rattle, chains) →
`GATE_CLOSED` 300 → open (no warn on opening). Closed gates bounce boomerangs and block players. A
player standing in a gate tile when it closes is **shoved** to the nearest open side at 5 px/tick,
never killed. Gates re-route the room every 10 s; with two gate sets in opposite phase the arena
flips between two layouts.

### 5.4 Crusher — core (one lethal mover)
Moves along a polyline rail at `CRUSHER_SPEED` = 2 px/tick, triangle wave, kill radius 7 px.
**Dash i-frames beat it** (01 §7 says saw blades: yes). Boomerangs pass over. One entity type,
three looks so themes don't repeat: a spinning **saw** on a floor slot, a **pendulum axe** swinging
across an arch (rail = the arc's chord, drawn as a swing), a **rolling boulder** in a trench.
Telegraph: a rail groove on the floor plus a 30-tick wind-up at each end before it starts back.

### 5.5 Mine cart — maybe
Solid box on rails at `CART_SPEED` = 2.5 px/tick; players it touches are **shoved** `CART_SHOVE` = 6
px/tick in its travel direction (involuntary, so rails that run past pits are the point).
Boomerangs bounce off it (moving wall — great for trick shots). Not lethal itself. Breaks crates it
hits. Telegraph: rails rumble and a lamp lights in the tunnel mouth 30 ticks before it emerges.

### 5.6 Chandelier — maybe
Hangs over a 2×2 area; its chain is anchored on a wall tile. A boomerang hitting the anchor drops
it after 20 ticks: kills under it (dash saves), then lies as rubble (a crate that cannot be
broken, or just debris). One-shot, very thematic for a chapel or throne room.

### 5.7 Darkness — core (render-only, zero sim cost)
Arena flag `lighting: 'dark'`: ambient 0.4 → 0.12, torches light their pools, **players carry no
light**. A boomerang in flight glows (throws give you away), a melee swing flashes, a dash leaves
the afterimage, a blast lights the whole room for its duration. Not combined with grass.
Visibility is render-only so determinism is untouched. The demo's lightmap already does 90 % of
this.

### 5.8 Crumbling floor — core (used by hurry-up, also placeable)
A floor tile that cracks when first stepped on (`CRUMBLE_WARN` = 30 ticks of crack + dust), then
falls away and is pit for the rest of the round. A player still on it when it goes falls. Props on
it fall with it (a crate on crumble is a one-use bridge).

---

## 6. Hurry-up

01 §10 leaves "hazards intensify" to this doc. Proposal: one universal escalation plus a
per-arena multiplier. **Not in the demo**: it belongs to round flow (timer, PLAYING state), which
the demo does not have; the crumbling-floor tile it relies on is built and placeable (§5.8).

- At `HURRY_START` = 2400 ticks (40 s of PLAYING): HUD timer turns red and pulses, music layer
  kicks in, `hurryUp` event.
- Every `HURRY_RING_TICKS` = 240 ticks the outermost remaining ring of playable floor **crumbles**
  (30-tick crack telegraph, then pit). Rings 1–4 fall at 44, 48, 52, 56 s; by the 60 s timer the
  room is 20 × 6. Props and resting boomerangs on a falling ring fall with it (boomerangs reappear on
  the nearest floor, 4.1). Grass, ice, spikes on the ring just go.
- All periodic hazards run their cycles at `HURRY_CYCLE_MULT` = 1.5 × speed after `HURRY_START`
  (phases recomputed so nothing jumps from safe to lethal without its warn).
- Arenas can opt out (`hurryUp: false`) — arenas that are already small or pit-heavy.

Why this and not sudden death: it is deterministic, needs no new art beyond cracked floor, works
in every arena, and gives the timer a visible meaning. Rounds should still mostly end before it
fires (01 targets 15–40 s); it exists to kill stalemates.

---

## 7. Arena roster (first set, built 2026-10-09)

Nine rooms of one dungeon, one hazard family per room, each with the Cellar's 520 open tiles (± 4 %)
in a shape and an environment of its own (§2). The maps live in `src/demo/arenas.ts`,
`npm run check-arenas` validates them, the demo opens on the first and
Tab cycles through them in this order (§13), `?arena=<key>` opens one directly. The
rules they follow are in `docs/notes-arena-design.md`, the game-design literature pass Aaron asked
for before any room was drawn; in short: one hazard family (the Theme) plus one static terrain
motif and nothing else; left-right mirror with spawn pairs (1,2), (3,4), (5,6) mirrored; at most two
movers; the centre is a hazard or a block, never a prize; three power-up points (flanks plus one in
the risky middle); nothing lethal within two tiles of a spawn; the top and bottom rows left open as
the long throw lanes and every other lane broken within a throw's length; 2 × 2 pillars as the
intentional bank targets. Hazards were chosen by the rubric in the notes (§4 there): the ones that
let a boomerang do something new are in, the ones that mostly push bodies around are not.

| Key | Arena | Theme (hazard family) | Shape · look | Terrain motif | Skill it exercises | Open tiles · blocks |
|---|---|---|---|---|---|---|
| `cellar` | **The Cellar** | blocks: crates, barrels | 36 × 19 rectangle · **stone**: the original slabs, brick and purple-black caps, unchanged | four 2 × 2 pillars round a central bowl with a barrel pair at each end; side pillars and crates break the long rows | banks off the pillars, lighting barrel pairs from range, opening lanes through crates. The neutral room: no lethal tile, no mover; every other room is judged against it | 520 · 24 |
| `pits` | **The Pits** | pits | 40 × 18, wide and low, corners eaten away · **cavern**: dirt floor, rock walls, no straight line | one chasm across the middle; crossings at both ends, a stone bridge in the centre, two crumble bridges that go one-way after first use, two short lifts | throws cross where bodies cannot; a hovered boomerang over the bridge denies it; lift timing | 522 (13 % pit) · 16 |
| `greenhouse` | **The Greenhouse** | grass | 32 × 22, tall and narrow · **bamboo**: earth and moss underfoot, bamboo stalks for walls, leaf canopy on top | 4 × 3 beds, two stands a side, pews of crates; nothing kills | recon by cutting, ambush from a bed with a hovered boomerang, reading rustles | 530 · 16 |
| `forge` | **The Forge** | fire vents | 34 × 21 octagon · **forge**: charcoal slabs with embers in the cracks, blackened red brick | vent bars in two phases guard the approaches to a furnace block with barrels against it | cross on OFF, throw through ON to light the boomerang, barrel chains at range | 528 · 8 |
| `lab` | **The Laboratory** | portals | 36 × 22 H: two bays and a bridge · **lab**: two-tone tiles, riveted panels, no debris | three fixed blue/orange pairs: the middle row wraps through the side walls, a column of each bay wraps top to bottom; two 2 × 2 blocks and crates for banks | throws that arrive from behind, a mouth as an escape hatch, aiming through the hop with the preview | 522 · 12 |
| `armoury` | **The Armoury** | spikes | 38 × 18 long hall with pilasters · **armoury**: riveted iron plates, grey dressed stone | two bands in opposite phase separate the north and south strips from a bowl between two 2 × 4 racks | cross on the beat, throw across the band you cannot cross, banks off the racks | 518 · 16 |
| `icebox` | **The Icebox** | ice | 38 × 21 rounded pond · **frost**: snow floor, ice-block walls with a bright rim, black water in the hole, snow falling | the rink fills the pond, a hole at its centre, snow patches to catch yourself on, bumpers at the rink corners, the spawns on the snow bank | leading a sliding target, throwing while you slide, banks off the bumpers, dash slides that compound on ice. The roster's one friction room | 528 (2 % pit) · 0 |
| `gatehouse` | **The Gatehouse** | gates | 36 × 21, two towers and a keep under a wall-walk · **keep**: cobbles, warm sandstone | the keep's walls have two gated doorways a side; top and bottom gate rows run in opposite phase so one row is always open; a pendulum sweeps the wall-walk | throws through a gate about to close, closed gates as bank walls, the pendulum walk as a dash-timed shortcut | 522 · 36 (the keep's free-standing walls count) |
| `chapel` | **The Chapel** | chandeliers | 40 × 22 Latin cross: apse, nave, transept · **chapel**: checkered floor, pale ashlar with dark arched windows | four chandeliers staggered over the nave, pews of crates, an altar block in the apse. **Dark: no torches, the chandeliers are the only lights**, and every one dropped leaves the room darker, to near-black with all four down (Aaron, 2026-10-09) | dropping a chandelier on someone with a throw, baiting people under one, choosing between light and a kill, the altar as a bank | 514 · 12 |

Deferred, with the reason from the notes: **The Mine** (autonomous carts) and **The Sewer** (belts)
move bodies and dropped boomerangs rather than thrown ones, which the rubric scores as encumbering;
**The Crypt** (darkness) conceals, which the stage-legality literature treats as the worst offender,
so a dark *room* becomes a party modifier (a toggle). Aaron overrode that for the Chapel the same
day: "remove the lights, and then the chandeliers are the lights. If you don't have the chandeliers
anymore, there's no light." The difference from the Crypt is that the players make the darkness,
one visible chandelier at a time, so it is forecastable and a choice (§7 table, §13). All three
deferred rooms stay in the demo strip (§13) for Aaron to try. A cart the boomerang launches (hit a
lever, the cart goes) is worth a revisit. The literature also says fewer rooms played more: expect
to cull to six to eight after playing at two and at six players.

Looks (the environments, `src/render/looks.ts`; 04 will refine the colours): **stone** (Cellar, the
original), **cavern** (Pits: packed dirt, rock), **bamboo** (Greenhouse: earth and moss, stalks,
canopy), **forge** (charcoal, embers, dark red brick), **lab** (two-tone tiles, riveted panels),
**armoury** (iron plates, grey ashlar), **frost** (Icebox: snow, ice blocks, black water, falling
snow, blue-grey shadows), **keep** (Gatehouse: cobbles, sandstone), **chapel** (checkerboard, pale
ashlar, dark arched windows). Each look is a palette plus one of a few procedural styles for the
floor, the wall cap and the wall face, so a new room costs a few colours rather than a tileset.
The Laboratory's portal blue and orange stay reserved for the portals.

Spawns: 6 per arena on the wall ring, each pair mirrored; the validator enforces the distances in
§2 and the stats column above comes from its output.

---

## 8. Arena rotation and lobby

From 01 §10: shuffled list, no repeats until exhausted. Lobby adds a per-arena toggle (host) and
a `random` default. The arena intro (30 ticks) shows the name and the room with hazards in their
start phase, so the first warn is visible before GO.

Hazard clocks start at ARENA INTRO so they are already moving during READY; phases are chosen
by the validator so that **no lethal phase is active within 2 tiles of any spawn during the first
90 ticks of PLAYING**.

---

## 9. Tick order placement and events

01 §9 step 9 "Hazards" becomes, in order: belts and platforms displace (then players are
re-resolved against walls), spike/vent/gate/crumble cycle updates and their kills or shoves,
crushers and carts move and apply kills or shoves, barrel fuses and blasts, pit falls last (so a
shove in this step can kill in this step). Grass cutting and portal hops happen where the mover
moves (steps 6 and 7). Resting-boomerang rides (belt, platform, pit slide) are applied in step 6.

Events added to the tick's list (01 §9 step 12), all with a tile or position: `grassRustle`,
`grassCut`, `grassRegrow`, `crateBreak`, `barrelLit`, `barrelBlast`, `spikeWarn`, `spikeUp`,
`spikeDown`, `ventWarn`, `ventFlame`, `trapWarn`, `trapOpen`, `trapClose`, `gateWarn`, `gateClose`,
`gateOpen`, `crusherTurn`, `cartEmerge`, `crumbleWarn`, `crumble`, `pitFall`, `platformDwell`,
`hurryUp`, `hurryRing`.

---

## 10. Art and build cost (feeds 04)

Rough asset counts so the shortlist can be weighed against "Aaron is not an artist":

| Element | Tiles / sprites | Animation |
|---|---|---|
| Ice, crumble, stubble, belt | 1–2 floor tiles each | belt scroll is a shader-free texture offset |
| Portal mouth | procedural: an oval on the wall in two sizes (face / cap), blue and orange | sparks and motes are a handful of particles; the flare is a ring |
| Spikes, fire vent | 1 tile + 3–4 frames | up/down, flame 4 frames |
| Barrel lit | reuse barrel + 2 glow frames | wobble is a render offset |
| Platform | 1 tile set (edges) | none |
| Gate | 2 tiles (bars up / bars down) + 2 mid frames | — |
| Crusher | 3 looks × 2–4 frames | spin / swing / roll |
| Cart | 2 views × 1–2 frames | — |
| Chandelier | 1 sprite + rubble | fall is a render offset |
| Palettes | 3 floor/wall recolours | — |

Everything stays on the `PROP_KEY` palette; three floor recolours give eight distinct rooms.

2026-10-09: superseded by 04 §8, the asset list as built (the rooms got nine full looks rather than
three recolours, §7). What each room's air carries, and what its hazards give off while they run,
is 04 §6.

---

## 11. Decisions needed (Aaron)

2026-10-09: Aaron answered #1 by asking for everything to be built into the demo so he can play with
each surface; the rest are still open and the demo runs on the defaults in the middle column.

| # | Question | My default | Alternative |
|---|---|---|---|
| 1 | Shortlist for v1 | the **core** set: pit, grass, crate, barrel, ice, spikes, fire vent, portal, belt, platform, gate, crusher, darkness, crumble | add bumper / cart / chandelier now; or fewer hazards, more arenas |
| 2 | Hurry-up | universal edge crumble from 40 s + 1.5× hazard speed | arena-specific only; or no hurry-up, 60 s draw |
| 3 | Grass regrowth | regrows after 8 s | cut is permanent for the round |
| 4 | Barrels | bomb-style blast, dash saves, chains | smaller "pop" that only breaks crates; or cut barrels |
| 5 | Crusher look per arena | saw / pendulum / boulder on one rule set | one look everywhere |
| 6 | Arena count for v1 | ~~8~~ nine built 2026-10-09 (§7); the notes expect six to eight to survive play | cull after playing at 2 and at 6 |
| 7 | Arena size | ~~30 × 16 per 01~~ **Answered 2026-10-09: 36 × 19**, "10% smaller than the original demo area" — for the Cellar; later that day: every other room keeps its 520 open tiles (± 4 %) in a shape of its own, up to 40 × 22 (§2) | — |
| 8 | Boomerang over a pit when it stops | never lost: slides to the nearest floor | it falls and respawns at the owner after 2 s |

---

## 12. Tuning constants (into `tuning.ts` with 01 §14)

```
HAZARD_WARN_MIN            = 30
HAZARD_CREDIT_TICKS        = 90

GRASS_REGROW               = 480
GRASS_SPROUT               = 60

BARREL_FUSE                = 24
BARREL_HIT_RADIUS          = 24
BARREL_RING_RADIUS         = 27     # 1.1 × hit

ICE_GRIP                   = 0.2
ICE_SLIDE_FRICTION         = 0.94

SPIKE_DOWN, SPIKE_WARN, SPIKE_UP        = 120, 30, 45
VENT_IDLE, VENT_WARN, VENT_FLAME        = 150, 30, 40
GATE_OPEN, GATE_WARN, GATE_CLOSED       = 300, 45, 300
# portals have no constants: a mouth is its tile and the hop is instant

BELT_SPEED                 = 0.75
PLATFORM_SPEED             = 0.5
PLATFORM_DWELL             = 30
CRUSHER_SPEED              = 2
CRUSHER_KILL_RADIUS        = 7
CART_SPEED                 = 2.5
CART_SHOVE                 = 6
BUMPER_SHOVE               = 5

CRUMBLE_WARN               = 30
HURRY_START                = 2400
HURRY_RING_TICKS           = 240
HURRY_CYCLE_MULT           = 1.5

# demo only (src/demo/main.ts), so the strip stays walkable; a real round never resets these
CRUMBLE_RESET              = 600    # a crumbled tile comes back
CHANDELIER_RESET           = 900    # rubble is cleared and the chandelier re-hung
```

---

## 13. What the demo builds (2026-10-09)

`npm run dev` opens the first room of the §7 roster (The Cellar). **Tab** swaps the room for the next
one in roster order and **Shift+Tab** for the previous, as do the `< >` arrows round the room name in
the HUD: the arena is rebuilt in place (map, props, hazards, canvas size), the tick count restarts so
the shared hazard clocks begin at their safe phase, every player is re-seated at the new room's
spawn with a fresh score, and the URL's `?arena=` follows so a reload comes back to the same room.
A card over the middle of the room names it, says what it is for (the §7 "skill" line) and shows the
keys for the first 2.5 s. This is the demo's stand-in for the §8 arena intro and the round-end
rotation of 01 §10; the real thing will swap rooms itself.

`?arena=strip` opens the **strip** instead: nine rooms in a row, one per theme, 300 × 21 tiles, walked
left-to-right with a camera that follows the local player and shows the same 40 × 21 viewport as
before. Each room exercises one family of tiles from this doc; `?at=c,r` spawns you in any of them
(the start column of each room is in brackets; `?at=` on its own implies the strip). Tab from the
strip goes to the first roster room, Shift+Tab to the last.

| Room | Starts at col | What is in it |
|---|---|---|
| CELLAR [1] | spawns 1–4, crates, barrels, a pillar, one pit, a blue portal mouth in the back wall at (21, 1) whose orange twin is in the CRYPT | the baseline: bots spawn here; the strip-spanning portal |
| GARDEN [32] | grass fields, crates, one barrel | cut, stubble, 60-tick sprout, regrow at 480 |
| PITS [63] | a pit band with a crumbling `%%` bridge and two lifts, a corridor below it that runs out through a blue mouth in the room's left wall (62, 10) and back in through an orange one in its right wall (97, 10), a lake with a ferry platform | platform carry, falling off a departing platform, crumble, a room that wraps like a tunnel |
| FORGE [98] | vents in two phases, belts feeding a central pit from three sides, barrels | burn deaths, belts carrying players and dropped boomerangs into the pit, vent flames lighting barrels and a boomerang's fire flag |
| ARMORY [131] | spike stripes in both phases, bumpers, crates | spike timing, ricochet throws, bumper shoves |
| ICEBOX [162] | one sheet of ice with a pit hole and five patches of plain floor in it, bumpers, props | low-grip steering, long dash slides, catching yourself on a patch, sliding into the pit |
| GATEHOUSE [195] | two gated walls in opposite phase, pendulum axes over the top corridor | gate ejection, routing changes, dodging a crusher with the roll |
| MINE [230] | two cart lines, a saw in a groove, a boulder in a trench, crates on the rails | cart shoves, carts smashing crates, three crusher looks |
| CRYPT [267] | dark, two torches, spike corridors, two chandeliers, spawns 5–6, the orange end of the CELLAR portal in the bottom wall at (283, 20) | darkness, glowing boomerangs, dropping a chandelier, a portal mouth glowing in the dark |

`?arena=<key>` opens one roster room from §7 directly (`cellar`, `pits`, `greenhouse`, `forge`,
`lab`, `armoury`, `icebox`, `gatehouse`, `chapel`): same sim, canvas sized to the room (36 × 19 up
to 40 × 22), no camera, drawn in the room's look. `scripts/shot.sh 30 "arena=chapel&idle=1&bots=3"` is the quickest look at one;
`scripts/shot.sh 30 "arena=strip&swap=2&idle=1&bots=3"` stills the room two Tabs on from the strip
(`swap=-1` for Shift+Tab), which is how the in-place swap is checked without a browser session.

Where the demo departs from the sections above, deliberately or because it is a stand-in:

- **Resets.** Crumbled tiles come back after `CRUMBLE_RESET` and chandeliers are re-hung after
  `CHANDELIER_RESET` so the strip can be replayed without a reload. Real rounds keep both one-shot.
- **Chapel darkness** (§7). A room with `lightSource: 'chandeliers'` has no torches; the lightmap's
  base darkness is `CANDLE_AMBIENT` (0.55) with every chandelier hanging and rises linearly to
  `DARK_AMBIENT` (0.92, the dark zone's) as they fall, each dropped one's share fading out with its
  rubble's candles over `CHANDELIER_FADE` (90 ticks). Hanging chandeliers in such a room light a
  100 px radius instead of 72. In the demo the re-hang brings the light back; in a round the dark is
  for keeps.
- **Portals** (§4.8): one pair spans the whole strip (a south-facing blue mouth in the CELLAR's back
  wall to a north-facing orange one in the CRYPT's bottom wall, about 4 200 px apart; walk north
  into one and you walk north out of the other) to show "the other side of the map" at demo scale.
  A boomerang thrown through it finishes its flight in the far room and then comes home across the
  strip over several seconds, which a one-screen arena never produces. The PITS pair sits in the
  room's two dividing walls, facing inwards, so the corridor between them wraps like a tunnel; that
  is the in-room version a real arena would use. `?walk=x,y[,T]` in the scripted scene walks and
  throws one way for the portal traces; `?aim=dx,dy` moves the scripted cursor.
- **Ice** (§4.5): friction (`ICE_SLIDE_FRICTION` 0.94) is applied every tick on ice, including while
  steering, with input adding `ICE_GRIP` × `ACCEL`; otherwise the old heading never bled off and
  turning felt like a rail. Dash slides and knockback both use the 0.94 decay on ice.
- **Chandelier** (§5.6): triggered by a boomerang passing within 12 px of the chandelier itself, not
  by hitting a wall anchor — the chain runs straight up off the top of the screen. It creaks for 20
  ticks, falls over 8, kills within 14 px (dash saves), and its landing also blasts a small ring that
  breaks crates and lights barrels.
- **Pendulum** (§5.4): drawn as an axe head on a vertical chain to a runner in the ceiling that
  slides along the rail, since a swinging arc over a top-down room never read. Same rule set as the
  saw and boulder.
- **Crusher dwell** is per look (saw 20, boulder 40, pendulum 10) instead of a flat 30-tick wind-up;
  the rail groove / trench / runner is the telegraph.
- **Gate eject** (§5.3) is instant: a player (or dropped boomerang) in a closing gate tile is placed
  on the nearer open side that tick rather than shoved at 5 px/tick.
- **Darkness** (§5.7) is a lightmap darkness alpha of 0.92 inside the dark room (0.4 elsewhere),
  fading over 96 px at its edges as the camera crosses in.
- **Hazard kill credit**: the last player to shove, bump or knock you in the previous
  `HAZARD_CREDIT_TICKS` = 90 ticks scores a pit / spike / vent / crusher kill. Unassisted hazard
  deaths score nobody.
- **Hurry-up** (§6) and the arena validator (§2) are not built.
