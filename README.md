# Boomerangeon (working title)

A browser-based, 2–6 player top-down party brawler in the spirit of **Boomerang Fu**, drawn in the
dark, chunky pixel-art style of **Enter the Gungeon**. One-hit kills, 30-second rounds, boomerangs
that come back, arenas full of hazards. Online multiplayer by sharing a link, no install — one
player per browser, keyboard to move and mouse to aim.

All art, audio, and code are made from scratch for this project.

## Design pillars

1. **One hit, one kill, thirty seconds.** Rounds are short and lethal. Losing is cheap, so chaos is fun.
2. **Everything is readable.** Every attack is telegraphed; every death is understandable. No stats, no RNG in combat outcomes — only in spawns.
3. **The boomerang is a position puzzle.** You have exactly one. It goes out, it comes back — unless someone steals it, and then you have to go get it. While it is away you have no kill tool except your fists.
4. **Chaos comes from the arena and power-ups, not from the characters.** All characters are cosmetic and identical.
5. **Online-first, one player per browser.** No shared-screen play, so everyone aims with their own mouse. The simulation is deterministic so rollback netcode can hide latency.

## Working technical assumptions

These are decisions made so planning can proceed; each gets its own spec later.

| Area | Decision |
|---|---|
| Language / build | TypeScript, Vite, no game-engine framework (own fixed-step simulation + renderer) |
| Rendering | Canvas 2D, 576×318 internal resolution for the reference room (36×19 tiles under a 14 px HUD) and up to 640×366 for the largest, integer-scaled with nearest-neighbour filtering |
| Simulation | Fixed 60 Hz tick, deterministic, plain-data state (snapshot/restore friendly) |
| Input | Keyboard + mouse (WASD to move, cursor to aim, click to throw); remappable. Gamepad is a later nice-to-have |
| Networking | Peer-to-peer WebRTC data channels with a tiny signaling service; rollback netcode. Decided in `docs/05-netcode.md` |
| Hosting | Static site (Cloudflare Pages / Netlify / GitHub Pages) + a tiny signaling worker |
| Audio | Web Audio; sound effects synthesized procedurally (no sample packs) |

## Visual style demo

`npm install && npm run dev` → http://localhost:5173. One local player in the first room of the
**arena roster** (docs/02 §7): nine rooms, one hazard family each, built from the design notes. Each
has the same budget of open floor (the Cellar's 520 tiles, ± 4 %) in a shape of its own, from a
36×19 rectangle to a 40×22 cross, and each is drawn in its own environment: the Cellar's stone, a
dirt-and-rock cave, a bamboo grove, a charcoal forge, a tiled lab, an iron-plated armoury, a snowy
pond with ice-block walls and falling snow, a sandstone keep, a chapel with a checkered floor and
dark windows. The chapel has no torches: its four chandeliers are the lights, and every one you drop
leaves the room darker.
**Tab** swaps the room for the next one in the roster and **Shift+Tab** for the previous (or click
the `< >` arrows round the room name in the HUD): everyone is re-seated at the new room's spawns, the
scores reset, and a card names the room and what it is for. Each room is a separate page too:
`?arena=cellar` … `?arena=chapel`.

`?arena=strip` opens the **strip** instead: nine showroom rooms side by side (CELLAR, GARDEN, PITS,
FORGE, ARMORY, ICEBOX, GATEHOUSE, MINE, CRYPT), 300 tiles
wide, with a camera that follows you and shows a 40×21 window of it. Between them the rooms hold
every tile and hazard from `docs/02`: pits, cuttable regrowing grass, crates, barrels that fuse and
chain, ice with patches of plain floor in it, spikes, fire vents, crumbling floor, conveyor belts,
bumpers, moving platforms, gates, saw / pendulum / boulder crushers, mine carts, chandeliers a
boomerang can drop, a dark room, and Portal-2-style portals: a blue mouth and an orange mouth set
into the walls, and walking (or throwing) into one puts you out of the other, turned to match. One
pair wraps the PITS room's corridor through its side walls, one links the CELLAR's back wall to the
CRYPT's bottom wall. The simulation behind it is a stand-in, not the real deterministic one. The HUD
shows the room you are in and the local player's state, speed, windup and slide counters live.
Crumbled floor and dropped chandeliers reset after a while in the demo so the strip stays walkable.

Every character has hand-drawn poses for its actions, not effects layered over a standing sprite:
a three-frame throw (release, follow-through, settle), a reach for the returning boomerang and a
clutch with it in hand, four melee frames (windup, swing, follow-through, recover) and a six-frame
roll that starts with the dash and finishes in the slide. The dash has no invulnerability flash;
the roll is the tell. Each character
does these in its own idiom — the slime changes shape, Skully uses a bone arm, the shroom
headbutts with its cap, the frog lashes its tongue and bites. Each also runs its own way instead of
sharing a hop: the slime sloshes along like a slug and leaves a trail of dark smears, Skully does a
shuffling dance with the bone arms flung about, the shroom walks on two stubby legs under its stem,
and the frog goes in short hops that actually leave the ground. The art lives one file per character
in `src/art/chars/`; `npm run check-art` validates every frame's size and palette.

Controls: WASD/arrows move · mouse aim · LMB throw (hold to hover it at the far end, release to recall it fast) · RMB/F melee · Space/Shift/MMB dash · 1–4 character · L lighting · Tab / Shift+Tab next / previous arena (or click the `< >` in the HUD).
The dash ends in a slide: for most of a second your movement is added on top of a decaying push in the dash direction, so you overshoot, drift or get held back instead of stopping. Throwing, melee and dashing again are allowed throughout.

URL params: `?arena=<room>|strip|floor|brawl` picks one of the nine roster rooms (`cellar`, `pits`,
`greenhouse`, `forge`, `lab`, `armoury`, `icebox`, `gatehouse`, `chapel`; docs/02 §7; `cellar` is the
default, and Tab rewrites the param as you cycle), the strip, the old open 40×21 movement floor or
the 30×16 look-demo layout; `?at=c,r` spawns you (and respawns you) at that tile of the strip,
e.g. `?at=100,10` for the FORGE (on its own it implies `arena=strip`); `?bots=3` adds up to three simple AI opponents, `?light=0`
disables the lightmap, `?char=0-3` picks the character, `?seed=`. `?sheet=1` (or `?sheet=all`)
replaces the scene with every animation frame of the character(s) laid out for review. For
reproducible stills: `?t=140` renders exactly N scripted ticks and stops (`?idle=1` with it stands
still, to watch hazards cycle; `?push=x,y` holds that direction from the scripted dash onwards, to
measure the slide; `?walk=x,y[,T]` holds it from tick 0 until tick T and throws along it at tick 10,
to walk into a portal; `?aim=dx,dy` puts the scripted cursor there relative to the player; `?swap=K`
presses Tab K times first, Shift+Tab for a negative K, to still an arena swap), `?trace=1` logs the local player and every boomerang per tick to the
console. `scripts/shot.sh 60,140 "bots=3&light=0"` builds, serves `dist/` and screenshots those
frames into `shots/` with headless Chrome; with `trace=1` in the extra query it also prints the trace.
`npm run check-arenas` validates the roster rooms in `src/demo/arenas.ts` without a browser (canvas
cap, open-tile budget, torches, spawns, connectivity, movers, portals, symmetry) and prints their layout numbers; the design rules
they follow, synthesized from the game-design literature, are in `docs/notes-arena-design.md`.

Movement is tuned to measurements taken from a Boomerang Fu recording; see
`docs/notes-boomerang-fu-motion.md` for the numbers and the method. The boomerang's flight departs
from them on purpose: it decelerates at a constant rate from release to a dead stop at range and
accelerates back the same way (a parabolic speed curve, straight path), and holding the throw
button hovers it at the stop until release recalls it at full speed. Deflecting your own boomerang
arms it: it flies 70 % of a throw a little slower than a throw with an orange glow, sits, beeps
twice, shrinks to a dot and blows up everyone within about 2.25 tiles, thrower included (the ring is
drawn a shade wider than the kill radius). The beeps and the bang are the
demo's first synthesized sounds (`src/demo/sfx.ts`), unlocked by the first click or key press.

## Spec documents

| Doc | Status |
|---|---|
| [01 — Base mechanics](docs/01-mechanics-base.md) | Draft |
| [02 — Arenas, tiles & hazards](docs/02-arenas-hazards.md) | Draft v1 — every tile and hazard prototyped in the demo strip; nine-room roster drafted from the [design notes](docs/notes-arena-design.md) and validated; hurry-up pending |
| 03 — Power-ups | Planned |
| 04 — Art style guide & asset list (every sprite, size, frame count, palette) | Planned |
| 05 — Netcode, lobby & hosting | Planned |
| 06 — Tech architecture & project layout | Planned |
| 07 — Audio | Planned |
