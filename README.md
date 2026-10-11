# Boomerangeon (working title)

**[Play online](https://aaronshahh.github.io/supercoolgame/)** — free on GitHub Pages. Choose
**PRACTICE** for bots, or **HOST ROOM** and share the room link with friends. Once everyone has
joined, the host selects **START**. Desktop keyboard and mouse are required.

A browser-based, 2–6 player top-down party brawler in the spirit of **Boomerang Fu**, drawn in the
dark, chunky pixel-art style of **Enter the Gungeon**. One-hit kills, 3/5/7 lives per round, boomerangs
that come back, arenas full of hazards. Online multiplayer by sharing a link, no install — one
player per browser, keyboard to move and mouse to aim.

All art, music, and code are made from scratch for this project. The sound effects are built from
synthesized impact layers with public-domain (CC0) recordings of real objects laid over them where a
recording beats the synthesis; every recording is credited in `docs/audio-credits.md`.

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
| Networking | WebRTC data channels brokered by PeerJS (the public cloud, or a self-hosted PeerServer via `?signal=`); a room is a five-letter code the host claims and a link anyone can open; host-relayed input-delay lockstep on inputs alone with state hashes every 30 ticks, rollback as the upgrade path. Decided in `docs/05-netcode.md` |
| Hosting | Free GitHub Pages at `https://aaronshahh.github.io/supercoolgame/`, published from `gh-pages`; the only external game service is the PeerJS broker |
| Audio | Web Audio, render-side only; every sound event a layered impact (transient, body, sub, resonance, tail) from a synthesized kit with CC0 real-object recordings over it, music as continuous pre-rendered loops, one original theme per room, independent of game frames. Decided in `docs/07-audio.md` |

## Playing

### Publishing updates

Run `npm run deploy` to type-check, build, and publish the current working copy to the `gh-pages`
branch. GitHub Pages serves that branch's root at the play link above; allow a few minutes for an
update. The script publishes the built game, sound files, and audio credits using a temporary
checkout, leaving local source edits and the `main` branch intact. Git access to `origin` and a
configured Git author are required. In GitHub Settings → Pages, the source is **Deploy from a
branch**, **gh-pages**, **/ (root)**.

Hosting is free while this repository is public. Multiplayer uses the existing free PeerJS
broker and browser-to-browser WebRTC connections; availability and restrictive networks can affect
connections. Practice runs entirely in the browser. No paid server, domain, or API key is needed.

### Running locally

`npm install && npm run dev` → http://localhost:5173 opens the **main menu** (`docs/05` §6), drawn in
the game's own pixel font and driven by arrows / WASD, Enter, Esc or the mouse:

- **PRACTICE** — the demo below, exactly as it stands: you and some bots in a room, respawns, Tab to
  swap rooms, the feel readout, every URL parameter.
- **HOST ROOM** — claims a five-letter room code and shows the link (`…?room=CODE`); COPY LINK or
  select the link under the canvas and send it. Guests appear in the seats as they arrive. The host
  sets MODE (FREE FOR ALL / 2V2), FIRST TO (3 / 5 / 7 / 10 round wins), LIVES PER ROUND (3 / 5 / 7, default 3), ROOMS (CYCLE through the roster or STAY), the FIRST ROOM, BOTS to
  fill empty seats, and the INPUT DELAY (4 ticks by default), then presses START once there are two
  combatants. Up to six players, one per browser.
- **JOIN ROOM** — type a code or paste a link; opening a link joins straight away.
- **CHARACTER** — Slime, Skully, Shroom, Frog, Octopus, Hedgehog or Fish, and an eight-letter name; remembered.
- **OPTIONS** — music and effects volume, mute, screen shake, death zoom, lighting; remembered.

**2V2** uses Gold and Teal teams, two players per side. Choose TEAM in the lobby; bots can fill
empty seats. Each teammate has their own 3/5/7 lives, so a round can become 1v2. Friendly fire is
off, bots target opponents, and teammates spawn on the same side. A team wins a round only when
both opponents are out of lives. Each respawn grants two seconds of protection against attacks,
floor fire, and enemy dash shoves.

Every death briefly slows play to 60%, then eases back, with a 9% camera zoom toward the death.
The music tempo dips by 10% and recovers smoothly. The HUD stays fixed and mouse aim follows the
zoom. OPTIONS → DEATH ZOOM disables the camera effect; the shared gameplay timing stays fair.

A match (`docs/01` §10) gives each player 3, 5 or 7 lives per round: a room card and READY, GO,
respawns after 1.5 seconds until lives run out, then the last player with lives takes the round
(simultaneous final deaths draw), a freeze, the next room, and a
podium when someone reaches the target with Enter for a rematch (the host calls it). Online every
browser runs the same deterministic simulation from the same seed and only inputs cross the wire;
the HUD says WAITING FOR *name* when someone's input is late, names anyone who leaves, and shows
DESYNC in red if the copies ever disagree. **Esc** in a game opens the menu (pause and quit offline;
stay, options or leave online). Quitting to the menu reloads the page.

## Visual style demo

PRACTICE (or `?practice=1`) is the demo: one local player in the first room of the
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

**Power-ups** (`docs/03`) land on each room's three marked points: a glow in the coming colour, then
a badge that floats until someone walks over it. Eight kinds, three held at once, lost on death:
Fire (the throw leaves a burning line; grass catches), Bomb (the boomerang blasts where it stops),
Big (twice the size, smashes crates in passing), Triple (two phantom boomerangs fan out beside
yours), Ice (the throw leaves a slippery trail everyone slides on; fire and ice cancel to steam), Speed,
Shield (one side hit, not the floor), and Blink (dash while empty-handed to teleport to your
boomerang and catch it). Badges over the head and in the HUD show every stack; a quarter of broken
crates drop one; a boomerang through a lit fire vent catches Fire for the flight.

The seven characters use their original 14×18 pixel poses: Slime, Skully, Shroom, Frog,
Octopus, Hedgehog and Fish. Slime sloshes, Skully shuffles, Shroom walks and Frog hops.
Octopus scurries on alternating arms, Hedgehog scampers and tucks into a quilled dash,
and Fish curls, springs and flops back onto its belly.

The CHARACTER screen previews movement, throw, catch, melee and dash. All characters share
the same movement, collision and weapon rules. See [the character motion notes](docs/notes-character-motion.md)
for frame counts and timing. `npm run check-art` validates all 444 poses;
`npm run check-characters` checks selection, animation cycles and gameplay parity.

**Effects and atmosphere** (`docs/04`) are drawn by a render-only particle layer (`src/render/fx.ts`)
with its own random stream, so nothing the simulation does depends on them. Every room has its own
air: dust turning in the Cellar's torchlight and the odd pebble off the brick, water dripping from
the Pits' unseen ceiling, leaves coming down off the Greenhouse canopy, embers lifting out of the
Forge floor, steam from the Lab's panel seams, snow falling over the Icebox and settling, sand
trickling off the Gatehouse stone, candle smoke off the Chapel's chandeliers. Torches shed embers,
lit vents spit, burning floor smoulders, running saws and cart wheels throw sparks, portal mouths
breathe motes. The floor remembers: footprints in the snow that melt away, skate scratches on ice,
the slime's trail, scorch marks under every blast, a splat where someone died. A kill flashes the
body white, holds the frame for three ticks, shakes the screen and throws chunks in the player's
colour that lie where they fall; shield pops, ice trails, steam, blinks, pickups and catches each have
a ring and sparks of their own. Players drop in from above on spawn and squash on landing; standing
still, they breathe. `?shake=0` turns off the shake and the blast flash, `?hitstop=0` the hold.

Controls: WASD/arrows move · mouse aim · LMB throw (press and hold again to brake into one hover anywhere per throw, release to return smoothly from rest) · RMB/F melee · Space/Shift/MMB dash · L lighting · M mute · Esc menu · Enter rematch on the results. Practice only: 1–7 character · Tab / Shift+Tab next / previous arena (or click the `< >` in the HUD) · B / Shift+B add / remove a bot.
One simple AI opponent is in the room by default so there is someone to fight; B adds up to three, Shift+B takes the last one out again.
The dash ends in a slide: for most of a second your movement is added on top of a decaying push in the dash direction, so you overshoot, drift or get held back instead of stopping. Throwing, melee and dashing again are allowed throughout.

URL params: `?arena=<room>|strip|floor|brawl` picks one of the nine roster rooms (`cellar`, `pits`,
`greenhouse`, `forge`, `lab`, `armoury`, `icebox`, `gatehouse`, `chapel`; docs/02 §7; `cellar` is the
default, and Tab rewrites the param as you cycle), the strip, the old open 40×21 movement floor or
the 30×16 look-demo layout; `?at=c,r` spawns you (and respawns you) at that tile of the strip,
e.g. `?at=100,10` for the FORGE (on its own it implies `arena=strip`); `?bots=0-3` sets the number of AI opponents (one by default, none in scripted stills), `?light=0`
disables the lightmap, `?char=0-6` picks the character, `?seed=`. `?sheet=1` (or `?sheet=all`)
replaces the scene with every animation frame of the character(s) laid out for review. For
reproducible stills: `?t=140` renders exactly N scripted ticks and stops (`?idle=1` with it stands
still, to watch hazards cycle; `?push=x,y` holds that direction from the scripted dash onwards, to
measure the slide; `?walk=x,y[,T]` holds it from tick 0 until tick T and throws along it at tick 10,
to walk into a portal; `?aim=dx,dy` puts the scripted cursor there relative to the player; `?swap=K`
presses Tab K times first, Shift+Tab for a negative K, to still an arena swap; `?give=fire,triple`
hands the local player those power-ups at the start and after every room swap; `?powerups=0` stops
pickups spawning and crates dropping them), `?shake=0` turns off screen shake and the blast flash,
`?hitstop=0` the three-tick hold on kills, `?mute=1` starts muted, `?music=0` and `?sfx=0` silence
one side of the audio (scripted stills never start audio at all), `?trace=1` logs the local player and every boomerang per tick to the
console. Shell and match: `?room=CODE` joins that room, `?signal=host[:port][/path]` uses a
self-hosted PeerServer instead of the public PeerJS cloud (and is carried into the room link),
`?practice=1` skips the menu into the demo (as do `?t=`, `?arena=`, `?at=`, `?sheet=`,
`?audio=test`), `?match=1` starts an offline match against `?bots=` (two by default) with `?target=`,
`?rooms=stay`, `?arena=` and `?seed=` (`?match=1&t=1500&bots=2&seed=3&target=1` stills the results
panel), and `?test=host&code=ABCDE` hosts under a fixed code and starts when the first guest arrives,
logging a state hash every 30 ticks (`?test=join&room=ABCDE` on the other side).
`scripts/shot.sh 60,140 "bots=3&light=0"` builds, serves `dist/` and screenshots those
frames into `shots/` with headless Chrome; with `trace=1` in the extra query it also prints the trace.
`node scripts/net-smoke.mjs 15 "bots=1"` plays a lockstep match between two headless Chromes through
the broker and fails if any state hash differs or the match does not run at real time;
`npm run check-lobby` tests the normal HOST ROOM / START buttons, simultaneous human movement,
starting with a hidden guest, and hiding/restoring either tab. It checks both state hashes and
game speed. Pass `-- https://aaronshahh.github.io/supercoolgame/` to test the deployed site instead.
`npm run check-lobby -- --teams` runs four human clients through 2v2 selection, play and a
synchronized death, including a client with death zoom disabled.
`npm run check-hover` checks the short hover slowdown, early/late outbound and return-leg stops,
ignored repeat holds, release during braking, return from zero speed, and the duration cap.
`npm run check-rules-audio` tests actual match deaths, respawns, 3/5/7 lives, round resets and draws,
then audio timer stalls, changing loop recipes, offline mix peaks, all recordings and the audio kit. Scripted
scenes accept `?hover=start,end;start,end` to hold the button over selected tick windows.
`node scripts/live-shot.mjs <name> [query] [seconds] [keys…]` screenshots the live page (menus,
lobby, a running match) after some key presses, since Chrome's own screenshot flags only see the first frame.
`npm run check-arenas` validates the roster rooms in `src/demo/arenas.ts` without a browser (canvas
cap, open-tile budget, torches, spawns, connectivity, movers, portals, symmetry) and prints their layout numbers; the design rules
they follow, synthesized from the game-design literature, are in `docs/notes-arena-design.md`.
`npm run check-songs` parses the nine room themes in `src/audio/songs.ts` and checks every bar is
whole; `scripts/audio-smoke.sh` plays every sound event, loop, instrument and song once in headless
Chrome (`?audio=test`) and reports uncaught errors; `scripts/fetch-sfx.sh` re-downloads and re-cuts
the CC0 recordings behind `public/sfx/` (needs curl and ffmpeg; the outputs are committed, so a
clone plays without it), and `VERIFY=1 scripts/fetch-sfx.sh` re-reads every source's licence page
and fails if one no longer shows CC0.

Dash (including its slide) and all boomerang flight speeds were reduced by 5% on 2026-10-11.
Throw range, hover timing and dash cooldown are unchanged.

Movement is tuned to measurements taken from a Boomerang Fu recording; see
`docs/notes-boomerang-fu-motion.md` for the numbers and the method. The boomerang's flight departs
from them on purpose: it decelerates at a constant rate from release to a dead stop at range and
accelerates back the same way (parabolic position over time, straight path). After clicking to
throw, press and hold again to hover once at any point, outbound or returning. A six-tick
(100 ms) slowdown brings it to rest. Releasing starts a normal return from rest, including if
released during braking. Subsequent holds cannot stop the same throw again. The round clock
shows elapsed time; there is no one-minute cutoff. Deflecting your own boomerang
arms it: it flies 70 % of a throw a little slower than a throw with an orange glow, sits, beeps
twice, shrinks to a dot and blows up everyone within about 2.25 tiles, thrower included (the ring is
drawn a shade wider than the kill radius).

**Sound** (`docs/07`, `src/audio/`) starts on the first click or key press and takes the old foley
lesson as a method rather than a style: a real object with the right *shape* of sound stands in for
the thing on screen, and every contact is a construction, a stack of a transient, a body, a sub with
a saturated shadow so laptops hear it, a resonance with the struck material's own partials (wood,
iron, anvil, glass, bell) and a tail that only the rare, decisive events earn, with the recording as
one layer of it. The throw is a real whip crack with the arm's weight under it, the flight a
spinning blade that rises in pitch leaving the hand and darkens coming home, every wall bounce a
rock on wood a step higher each time so the ear counts them, the catch a ball into a leather glove
that stops the flight dead. A parry is steel on steel over one fixed anvil note. Arming your
boomerang is a gun being cocked, always the same take, with a sub settling in and a charge rising,
then two struck-steel beeps before a real explosion lands. Kills are the
game's signature and never vary in pitch: a slice is a knife into a melon over a crack and the
weight of the halves hitting the floor; fire is a barbecue igniting; a pit is a whoosh going away
and then no landing at all; a crush is a foot on an egg with the crusher's own metal on top. The 119
CC0 recordings (`public/sfx/`, credited in `docs/audio-credits.md`) come from Freesound and The
Designer's Choice, cut to single takes; several rotate per event so nothing repeats, and any that
fails to load falls back to the synthesized recipe. Each room has its own song in the idiom of a
roguelike boss fight, sharing one motif: unison saws through filter envelopes and saturation, a
synthesized high-gain guitar, reese and distorted bass, formant choir, drum kits built from CC0
one-shots, rendered into continuous audio tracks. Each song is sixteen bars of A then B with two
different B sections taken on alternate passes, so the form repeats every 38–70 seconds and
never resolves at the join. The Cellar is a 150 BPM power-chord drive, the Pits a swung half-time
drop over a sub, the Greenhouse a gallop in twelve, the Forge anvils on two and four, the Lab a
168 BPM breach with a riser into every eighth bar, the Armoury a riff in seven, the Icebox glass
over a 6/8 taiko, the Gatehouse a siege march, and the Chapel a requiem. Each room plays one
steady arrangement. Room changes crossfade once the next track is loaded; the old track keeps
playing during downloads. Deaths briefly lower playback speed by 10%, then it smoothly recovers.
There are no live note timers, combat volume dips, or per-frame arrangement changes. **M** mutes.

`npm run render-music` rebuilds the nine original tracks using Chrome and ffmpeg. Normal builds
use the checked-in MP3s. `npm run check-music` verifies continuous audio through a main-thread
stall, loop seams, room changes, failed downloads, mute and death slowdown.


## Spec documents

| Doc | Status |
|---|---|
| [01 — Base mechanics](docs/01-mechanics-base.md) | Draft |
| [02 — Arenas, tiles & hazards](docs/02-arenas-hazards.md) | Draft v1 — every tile and hazard prototyped in the demo strip; nine-room roster drafted from the [design notes](docs/notes-arena-design.md) and validated; hurry-up pending |
| [03 — Power-ups](docs/03-power-ups.md) | Draft v0 — eight power-ups (five boomerang flags, three body) with spawn and stacking rules, all prototyped in the demo; grounded in the [design notes](docs/notes-power-up-design.md); decisions in §11 pending |
| [04 — Art style guide, effects & asset list](docs/04-art-style-guide.md) | Draft v0 — the style rules, every sprite as built (size, frame count, palette), the effects catalogue, kill feedback and per-room atmosphere, all prototyped in the demo; grounded in the [design notes](docs/notes-art-vfx-design.md); decisions in §10 pending |
| [05 — Netcode, lobby & hosting](docs/05-netcode.md) | Draft v0 — rooms by link over PeerJS, host-relayed input-delay lockstep with state hashes, the menu / options / character / lobby shell and the match flow, all built and passing a two-browser smoke test; rollback is the upgrade path in §9; decisions in §10 pending |
| 06 — Tech architecture & project layout | Planned |
| [07 — Audio](docs/07-audio.md) | Draft v1 — layered-impact sound effects (synthesized kit plus CC0 real-object recordings), nine boss-fight room themes on one motif, now rendered as continuous loops; grounded in the [design notes](docs/notes-audio-design.md), recordings listed in the [credits](docs/audio-credits.md); a first cartoon-gag pass was rejected and is recorded there; decisions in §10 pending |
