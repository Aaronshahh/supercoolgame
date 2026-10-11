# 04 — Art style guide, effects & asset list

Status: **Draft v0 — everything in it is built in the demo** (2026-10-09). The rules every sprite
follows, the palette, the effects layer (particles, floor marks, screen shake and flash), the kill
feedback 01 §8 asked for, each room's atmosphere, animation timing, and the complete list of assets
as built with sizes, frame counts and palettes. Built into the demo the same day so Aaron can see
it before judging the text; §12 lists where the demo departs from it. The research behind the
choices is in `docs/notes-art-vfx-design.md` (an Enter the Gungeon and Boomerang Fu fact sheet,
the pixel-animation tutorials of Saint11, Slynyrd and Derek Yu, the game-feel literature from Swink
and Vlambeer to the Celeste source, and the Canvas particle literature); quotes below cite it as
"notes §n". Nothing here has been seen by Aaron yet; the open decisions are in §10.

Scope: how the game looks and moves. Not in scope: audio (07), the lobby and menus (05), the HUD
beyond what the demo draws, and the room layouts themselves (02 §7).

---

## 1. Design lens

The art has one job above all others, the second pillar: *everything is readable*. Gungeon gets
away with a dark, busy screen because the environment is desaturated and the things that can kill
you are the only saturated things on it (notes §1). Every rule below follows from that, in order:

1. **Actors over effects over environment.** A player, a boomerang and a hazard about to fire must
   read at a glance from across the room. Effects may be bright but are small and short; the
   environment is dark and still. Nothing ambient is ever brighter or faster than a player.
2. **The simulation never knows.** Every effect is spawned by an event the sim emitted and ticks on
   its own random stream. Nothing in this document touches a number the sim reads (01 §1, §9).
   Two runs with the same inputs show the same puffs; a scripted still shows the same puff every time.
3. **Response before anticipation.** Nothing the player does gets an anticipation frame or a delay
   for the sake of weight: the throw's first frame is the release, the melee's windup is the sim's
   own windup, the hold and the shake arrive *on* the hit, never before it (notes §2, §3).
4. **Contrast frame first, then physics.** A kill is one solid-white frame, then the pieces fly,
   fall and lie where they land. The fire in a blast fades fast, the smoke slowly (notes §2).
5. **The floor keeps score.** Everything that happens leaves a mark: the slime's trail, prints in
   the snow, skate scratches on the ice, a scorch under every blast, a splat where someone died,
   chunks lying where they fell. By the end of a round the floor tells its story.
6. **One air per room.** Each room's atmosphere is one or two kinds of thing drifting through it,
   drawn from the room's hazard family (02 §1: theme = hazard family). Snow where there is ice,
   embers where there is fire, drips where there is a pit.
7. **Small asset scope** (Aaron is not an artist). Drawn frames where a pose matters: the four
   characters. Everything else is procedural: tiles, walls, hazards, power-up visuals, lights,
   every particle. A new room costs a palette and two lines of weather, no sprites (§8.6).

---

## 2. Style rules

| Rule | As built |
|---|---|
| Resolution | One game pixel is one texel. 16 px tiles; the reference room is 576×318 (36×19 tiles under a 14 px HUD), the largest 640×366; the canvas is integer-scaled with nearest-neighbour filtering. Nothing is drawn at a fractional position: every sprite, particle and decal is rounded to the pixel. |
| Scale of things | A character is 14×18, feet on the bottom row: a tile wide and a tile-and-a-bit tall. A boomerang is 11×11. A crate fills a tile (14×14 with its outline). A torch is 7×11. The eye reads the tile as the unit. |
| Outline | Every actor and prop has a one-pixel outline in `outline` (#140c14, a purple-black, never pure black). Tiles, walls and floor marks have none: the environment is texture, the things that act are shapes. Particles have none either, except that a 3 px chunk gets a dark bottom row so it sits on the floor. |
| Anti-aliasing | None on any sprite edge. Alpha is used only where something is genuinely translucent: dust, smoke, floor marks, the lightmap, cast shadows. |
| Palette discipline | Environment colours are dark and desaturated purples, browns and greys; saturated colour is reserved for what matters: the six player colours, fire, the blue and orange portal mouths, the teal shield and violet blink. Shadows darken toward `#1a0f1e` (purple-black), highlights lighten toward `#fff6e0` (warm), never toward black or white, so every ramp shifts hue as it goes (notes §2, Slynyrd's hue-shifted ramps). |
| Ramps | Three steps. A player colour becomes `P`/`p`/`h` (base, darkened 0.4, lightened 0.4); a spark cools through lightened 0.55, base, darkened 0.55. |
| Light | From above and slightly in front. Wall caps are lit, wall faces are in shade, every standing thing casts a soft purple-black shadow on the floor (`shade` 8,5,12 at 45 %; the snow look has its own blue-grey). Torches, vents, fire, portals and chandeliers are the light sources the lightmap carves out of the room's darkness. |
| Facings | Three (down, side, up). Side frames face right and are mirrored for left; down and up action frames put the arm on the right and are mirrored when the aim points left. Roll frames tumble right and are mirrored for a leftward dash. |
| Depth | Everything is sorted by its floor-plane y. A particle lives on the floor plane at (x, y) and `z` pixels above it and is drawn at (x, y − z): sparks fall, embers rise, dust spreads flat. Whatever is at rest on the floor is drawn under the players; whatever is in the air is drawn over everything. |
| Motion | Pixel art moves in whole pixels at 5–6 ticks a frame for ordinary cycles (80–100 ms, notes §2); faster only for a tumble or a flicker; slower only to hold a pose on purpose. Every loop in the room runs on its own phase so no two torches, chandeliers or breaths move together. |

---

## 3. Palette

`src/art/palette.ts` holds 72 named colours in `PAL`, the six player colours and the three letter
keys the sprite data is written in. The looks (§6) add their own environment shades on top; they
are not in `PAL` because no sprite is drawn in them.

| Group | Colours |
|---|---|
| Neutrals | `outline` #140c14 · `white` #f2eef5 · `bone` #e6dccb · `boneDark` #b8a992 · `cream` #efd9b0 · `creamDark` #c9ab7a · `red` #d8506a · `grey` #3a3340 |
| Materials | `wood` #8a5a32 · `woodLight` #a8743f · `woodDark` #5c3a1f · `metal` #6d6d7a · `metalLight` #9a9aa8 · `iron` #2b2630 · `ironDark` #17131b · `ironLight` #4a434f · `stone` #5c5362 · `stoneLight` #786e7e · `stoneDark` #3c353f · `crack` #120d14 |
| Fire | `flameY` #ffd86b · `flameO` #ff9a2e · `flameR` #e8531e |
| Cellar floor and walls | `floor[]` #3d3240 #433745 #392e3c #403443 · `floorLight` · `floorMortar` · `floorCrack` · `floorSpeck` · `wallCap` + `Light`/`Edge`/`Joint`/`Dark` · `brick[]` #9c6a42 #a8744a #8d5e3a #b07c4e · `brickLight` · `brickMortar` · `pit` #0b0810 · `pitWall` · `pitWallDark` |
| Grass | `grassBase` #2f4a2c · `grass[]` #4f7a3a #6a9a48 #3f6530 · `grassCut` #26381f · `grassSprout` #5c8a3c |
| Ice | `ice[]` #5f7f96 #66889f #5a788e #637f94 · `iceLight` #9dc0d4 · `iceDark` #3f5a6e · `iceCrack` #86aabf |
| Portals | `portalBlue` #1ea7ff + `Light`/`Dark` · `portalOrange` #ff6a1a + `Light`/`Dark`: the only saturated blue and the only orange-on-black in the game |
| Power-ups | `teal` #4fd1c5 · `tealDark` #1f6f6a (shield) · `violet` #b873e8 · `violetDark` #5a2f80 (blink): the two hues nothing else uses |
| Screen | `bg` #0a080c · `hud` #0e0a12 · `hudLine` #2a2330 · `hudDim` #4a3f52 |
| Players | `PLAYER_COLORS` yellow #f4c542 · cyan #46c8e6 · pink #e65aa8 · green #7ad24a · orange #ff7f3b · white #e8e4f0 |

**Keys.** Sprite rows are strings of letters. `CHAR_KEY` (o/k outline, w white, b/d bone, c/C
cream, r red, g grey, T/t wood for the boomerang baked into catch frames) plus `P`/`p`/`h` for the
player's colour, added per player by `withPrimary`. `PROP_KEY` adds `u` wood-dark, `m`/`M` metal,
`y`/`O`/`R` flame, `s` a 45 % soft shadow. `POWER_KEY` adds `i`/`I` ice, `t`/`T` teal, `v`/`V`
violet. `npm run check-art` rejects any letter not in the key.

**Adding a colour.** Only when a new *kind* of thing needs to be told apart at a glance, and then
one hue with a dark and a light step. The portal and power-up entries are the model: each took a
hue nothing else used. Player colours are never reused for anything but players and their
boomerangs, trails, chunks and splats.

---

## 4. Effects catalogue

### 4.1 The layer

`src/render/fx.ts`, class `Fx`, one instance (`vfx`) owned by the renderer. It holds particles,
rings, decals, shakes and flashes, steps them once per rendered tick, and draws them in two passes:
`drawGround` (floor marks and anything at rest) under the players and `drawAir` (everything
airborne, then rings) over the scene. It has its own `mulberry32` stream, seeded from the room seed
and reseeded on every room load, and salts per-tick flicker and sway with `hash2` so a particle's
wobble is a pure function of the tick. Caps: 900 particles (the oldest goes first), 160 decals (the
oldest *fading* one goes first; permanent marks only go when nothing else is left).

### 4.2 Particle kinds

| Kind | Motion | Look | Life (ticks) | Used for |
|---|---|---|---|---|
| dust | spreads flat, decays 0.88/tick, barely lifts | 1–2 px square, alpha 0.65 fading as (1−t)², shrinks to 1 px halfway | 14–26 | footsteps, dash, landings, wall hits, rubble |
| spark | flies, falls under gravity 0.16, dies on the floor | 2 px then 1, light → base → dark of its colour, 35 % are white | 10–22 | impacts, deflects, metal, the glint on a pickup |
| ember | rises (to 0.7/tick), sways, flickers off 15 % of frames | 1 px, 2 px when young and bright, yellow → orange → red | 36–80 | torches, vents, burning floor, blasts, the Forge |
| chunk | flies up, falls, bounces once (×0.45), stops and *lies there* | 2–3 px in one of the given colours, dark bottom row if 3 px, fades in its last quarter | 40–180 × 0.7–1.3 | crate splinters, rubble, grass blades, pieces of a player |
| smoke | rises slowly, sways, swells to 1.7× | dark ellipse, alpha 0.32 fading linearly | 36–70 | blasts, scorched floor, barrel fuses, torches |
| shard | ice splinter: flies, bounces, no colour ramp | 1–2 px white or `iceLight` | 22–40 | each tile an ice trail lays, drip splashes |
| leaf | sways down (sin, period ≈ 11 ticks), lands, lies | 2×1 / 1×2 turning over as it falls, flat once down | 150–260 | the Greenhouse canopy, cut grass |
| drip | falls from 44–64 px up; on landing a 1→5 ring and three beads | 1 px, 2 px tall when fast | until it lands | the Pits |
| mote | hangs, drifts a fraction of a pixel, twinkles | 1 px at alpha 0.12–0.52, eased in and out | 140–260 | dust in the light; portal breath |
| flake | drifts down from 60–90 px with a sideways sway; settles as a `dot` decal | 1 px at alpha 0.85 | until it lands | the Icebox |
| wisp | rises in a thin thread, sways | 1×2 px at alpha 0.3 fading | 50–90 | steam from the Lab's seams, candle smoke |
| grit | falls from 10–18 px; a tick of dust where it lands | 1 px solid | until it lands | pebbles off the Cellar, Armoury and Gatehouse walls |

### 4.3 Spawners

| Call | What it makes |
|---|---|
| `burst(x, y, color, n, speed)` | the all-purpose "something happened": 60 % sparks, 40 % dust, in the colour |
| `dust(x, y, n, color, speed, dirX, dirY)` | a low puff, optionally pushed in a direction |
| `sparks(x, y, color, n, speed, z, dirX, dirY)` | hard bright sparks, optionally along a direction |
| `embers(x, y, n, z, spread, color)` | embers lifting off a hot spot `spread` px wide |
| `chunks(x, y, colors[], n, speed, z, lie)` | debris that lands and lies `lie` ticks |
| `smoke(x, y, n, color, z, spread)` | smoke |
| `shards(x, y, n, speed, z)` | ice splinters |
| `ambient(kind, x, y, color)` | one particle of a room's weather |
| `ring(x, y, r0, r1, color, ttl, ry, inner?)` | a ring on the floor plane growing from r0 to r1 with an ease-out, fading; `ry` squashes it into perspective (0.5 flat on the floor, 0.8 upright); `inner` adds a second ring 2 px inside |
| `decal(kind, x, y, color, {w, h, dx, dy, ttl})` | a floor mark; `ttl` −1 is permanent |
| `shake(mag, ticks)` | the world layer rattles `mag` px, falling off linearly; several at once, the strongest wins |
| `flash(a, ticks)` | a white veil over the world at alpha `a`, fading |

### 4.4 Floor marks

| Decal | Look | Life | Left by |
|---|---|---|---|
| smear | one row, 2–3 px, the player's colour darkened 0.4, alpha 0.7 → 0.2 | 45 | the slime, every 5 ticks of travel (01 §2) |
| print | 2×1 in the look's `prints` colour, alpha 0.7 → 0.15 | 240 | a footstep on snow, alternating left and right of the path |
| scratch | 3 px line along the motion in `iceCrack`, alpha 0.7 → 0.2 | 300 | a footstep or a fast slide on ice |
| scorch | a dark ellipse 0.55 × 0.35 of the blast ring with a ragged edge and a few embers' flecks | 3600 (a round) | a blast |
| splat | seven dots of the player's colour darkened 0.45, two of them 2 px | 420 | a sliced or flattened player, thrown along the hit |
| dot | 1 px white at alpha 0.75 melting away | 140 | a snowflake that landed |
| (lying chunk) | not a decal: a chunk at rest, fading in its last quarter | 40–180 | see §4.2 |

### 4.5 Event → effect

The table the real renderer will be built from. Every row is live in the demo. "Shake m/n" is `m`
px for `n` ticks; the hold is §5.1. Colours named in `PAL` unless they are the player's (`col`) or
the look's (`dust`).

| Event | Effect |
|---|---|
| **Kill, sliced** (boomerang, melee, blast, saw, pendulum, spikes) | the body splits along the hit into two halves that drift apart for 36 ticks, drawn solid white for the first 2; ring 3→16 in `col` (10 ticks, ry 0.7); 7 chunks of `col`/dark `col`/white that lie ~120; 6 white sparks along the cut; splat 5×3; shake 2/8; hold |
| **Kill, burned** (vent, fire trail) | an ash silhouette (`ironLight`) sinks into the floor over 20 ticks, white for the first 2; 14 embers; 6 `flameY` sparks; 5 smoke; shake 2/8; hold |
| **Kill, flattened** (boulder, cart, chandelier, gate, blink landing) | the sprite sinks in 10 ticks, white first; 8 chunks thrown *sideways only* (z 1) that lie ~150; 8 dust; splat 7×4; shake 2/8; hold |
| **Kill, pit** | the sprite sinks over 28 ticks, no flash; 4 dust. No shake, no hold: the fall is quiet on purpose, the hole is the feedback |
| **Blast** (bomb, barrel) | the drawn ring (18 ticks); 14 `flameY` sparks at speed 3; 18 embers over half the ring; 8 smoke over 0.4 of it; a scorch; shake 4/12; white flash 0.35 for 3 ticks |
| Barrel lit | 5 `flameY` sparks from the top; while the fuse burns, a spark every 3 ticks and a thread of smoke every 9 |
| Crate broken | 10 wood chunks that lie ~150; 5 dust; a dropped power-up adds a burst of 8 in its colour |
| Grass cut | 6 grass-green chunks that lie ~90; two leaves come down after |
| Crumble tile falls | 6 chunks in the floor's own colours that lie ~40; 6 dust; shake 1/5 |
| Chandelier lands | ring 4→22 in `dust` (12 ticks, flat); 10 chunks of bone/boneDark/`flameY` that lie ~180; 10 dust; 5 `flameY` sparks; 3 smoke; shake 3/10 |
| **Throw** | 4 white sparks at the release point along the aim |
| Throw windup | a 2-dust scuff behind the planted foot on windup ticks 1 and 3 |
| Boomerang off a wall | 4 sparks in the boomerang's colour back into the room; 2 dust off the wall |
| Deflect | ring 2→10 white (armed: 2→14 in the bomb's orange); 7 white sparks along the new direction (armed: 10, plus 8 embers); shake 1/4 |
| Phantom (Triple) pops | ring 2→9 white; burst of 6 white |
| Catch (and pickup by hand) | ring 2→8 white at the hand (7 ticks); 4 white sparks. Fires even when the body is busy and keeps its own frames |
| Boomerang drops over a pit | 3 dust where it fell; ring 1→7 in the owner's colour where it lands |
| Portal transit | a burst of 6 in the mouth's colour at the mouth left and the mouth arrived at |
| Gate ejects a player | 3 dust |
| **Spawn-in lands** | ring 3→14 in `col` (10 ticks, flat); 8 dust (§5.4) |
| Dash starts | 5 dust kicked back along the dash |
| Dash into a wall | 6 dust back off the wall; shake 1/4 |
| Slide | every 3 ticks while fast: a scratch on ice, else 1 dust behind |
| Footstep | every 8 ticks of travel while the run cycle shows: a print on snow (alternating sides), a scratch on ice, else 1 dust behind the foot. Not in grass, not during a dash, not below 0.3 px/tick |
| Slime moves | a smear every 5 ticks (01 §2) |
| Speed power-up, moving | a `flameY` spark trailing every 4 ticks |
| Bumper | 4 white sparks along the bounce normal; ring at the bumper 6→12 white (6 ticks) |
| Cart shoves | 3 dust along the shove |
| Shield pops | ring 8→18 teal with a white inner (10 ticks); 12 teal sparks; shake 1/5 |
| Ice tile laid | 2 shards; 1 `iceLight` dust; the frost crackle once per throw, on the first tile |
| Fire meets ice (steam) | 3 pale smoke (`#c8d8e0`); 2 `iceLight` dust; a hiss |
| Ice tile gone | 2 `iceLight` dust (the slab has already drawn in from its edges over its last quarter) |
| Blink, leaving | ring 2→12 violet; 8 violet sparks |
| Blink, arriving | ring 12→2 violet (closing); 4 white sparks; 4 dust |
| Pickup lands | ring 2→12 in its colour (10 ticks, flat); 8 sparks in it |
| Pickup fizzles | 3 smoke |
| Pickup taken | ring 2→10 in its colour; 10 sparks |

The emitters that run while nothing is happening (torches, vents, saws, portal mouths and so on)
are §6.2.

---

## 5. Game feel

### 5.1 Kills (01 §8)

Three channels, all render-side, all on the kill event, none before it:

| Channel | Value | Why this |
|---|---|---|
| Hit-flash | the body is drawn as a solid white silhouette for `HIT_FLASH` = 2 ticks | the contrast frame: Saint11's "first frame strongest", a white or black frame before the pieces (notes §2). Two ticks because the hold keeps the frame on screen anyway |
| Hold | the renderer repeats the frame for `HITSTOP_TICKS` = 3 ticks (50 ms); the sim runs on | Celeste's `Freeze` calls are 0.05 s on ordinary hits (notes §3); long enough to register, short enough not to feel like lag with four other players still moving underneath |
| Shake | `SHAKE_KILL` = 2 px for 8 ticks | small: a kill is frequent and happens to someone else most of the time. The blast is the loud one (§5.2) |

The shake is a whole-pixel offset of the world layer in a fresh pseudo-random direction every tick
(never the same two in a row, so it reads as a rattle and not a drift), with the y component at 70 %
of x so the room never seems to jump up and down. The HUD never moves. Several shakes at once do
not add: the strongest live one wins.

Shakes and flashes only fire for events within 80 px of the visible window, so a kill at the far
end of the strip does not rattle a screen that cannot see it.

**Pit deaths** get none of the three (table in §4.5). Falling is the one death the victim did to
themselves with their feet; it should feel like a drop, not a hit. Open question, §10 #3.

### 5.2 Blasts

The loudest thing in the game: `SHAKE_BLAST` = 4 px for 12 ticks and a white veil at alpha 0.35
for 3 ticks, with the fire and smoke of §4.5 and a scorch that lasts the round. The flash is kept
short and far from full white on purpose (photosensitivity; §9) and goes off with `?shake=0`.
Flashes are rate-limited at the layer: once one has fired, `FLASH_GAP` = 20 ticks pass before
another can, so a chain of barrels flashes once and the screen never flashes more than three
times a second (WCAG 2.3.1, notes §3.2). The shakes of a chain still stack (strongest wins).

### 5.3 Lesser impacts

1 px for 4–5 ticks: a deflect, a dash into a wall, a shield pop, a crumble tile going. 3 px for
10 ticks (`SHAKE_LAND`) for a chandelier landing. Nothing else shakes.

### 5.4 Spawn-in

A respawning body does not appear; it drops. `SPAWN_DROP` = 14 ticks from `SPAWN_HEIGHT` = 40 px
above the spawn point with an ease-in (the body covers f² of the height at time f, so it
accelerates like a fall), then spends the last `SPAWN_LAND` = 3 ticks squashed on the floor
(1.3× wide, 0.7× tall, easing back) before standing. The landing fires a ring and dust (§4.5),
and the body's glow grows as it comes down so the eye is drawn to where the newcomer will be. The
invulnerability flicker is suppressed while dropping; it starts once they have landed.

### 5.5 Idle breath

A standing character breathes: every `BREATHE_PERIOD` = 72 ticks, for `BREATHE_DIP` = 10 ticks,
the top of the visible body is drawn one pixel lower (the rows above a fold at `BREATHE_FOLD` =
45 % of the drawn body's height shift down; the feet never move). This is the one-pixel-down,
mass-constant idle of the tutorials (notes §2) without drawing a frame, and the fold is relative to
the visible body so the slime, whose body starts eight rows down the frame, breathes too. Each
player's breath is phased by 23 ticks × id so no two breathe together.

### 5.6 Room fade-in

A freshly loaded room comes up from black over `FADE_IN` = 20 ticks in live play (never in a
scripted still, so stills stay comparable).

### 5.7 Readability guards

The ambient layer never spawns outside the visible window (so the strip's off-screen rooms cost
nothing), motes sit at alpha 0.12–0.52, snow is 1 px, every ambient particle is slower than a
walking player, and all of it lives in the two particle passes: nothing ambient is ever drawn over
the HUD or in front of a player standing where it would matter. Kill effects use the player's own
colour so the audience knows *who* died from the pieces alone.

---

## 6. Atmosphere

### 6.1 Each room's air

Rates are spawns per second over a reference room's worth of view (36×19 tiles), scaled to the
visible area. `where` is where a particle starts: over open floor, under a wall (leaves off the
canopy, grit off the brick, steam from a seam), on standing grass, or anywhere including over the
walls (snow).

| Room (02 §7) | Look | Air | Dust colour | Prints |
|---|---|---|---|---|
| The Cellar | stone: slabs, brick, block caps | motes 2.5/s on the floor (`boneDark`, `cream`); grit 0.25/s off the walls (`brickMortar`, `wallCapEdge`) | `boneDark` | — |
| The Pits | cavern: earth with moss, rock | drips 1.2/s (#7fa6bd) that splash; motes 1.5/s (#6a5d55) | #6a5a4c | — |
| The Greenhouse | bamboo: earth, stalks, leaf canopy | leaves 1.6/s off the canopy (#9aa84e, #6a8a3a, #c8b060) that land and lie; motes 1.2/s over standing grass (#d2dc8a) | #6a5a42 | — |
| The Forge | forge: charcoal slabs with glowing specks, dark brick | embers 4/s up out of the floor (`flameO`, `flameR`); smoke 0.35/s off the walls (#1a1416) | #4a3a38 | — |
| The Lab | lab: 8 px tiles, metal panels | wisps of steam 0.9/s from the panel seams (#9aa4b8) | #6c7288 | — |
| The Armoury | armoury: riveted plates, panels | motes 1.5/s (#8e8a98); grit 0.3/s (#5e5e6a) | #6a6a76 | — |
| The Icebox | frost: snow floor, ice-block walls, snow caps | snow 22/s anywhere (#f0f8ff), each flake settling as a dot that melts | #eef5fa (white puffs) | #8aa6ba |
| The Gatehouse | keep: cobbles, ashlar | motes 1.5/s (#c8b48a); sand 0.5/s off the stone (#a08a62, #766858) | #80705e | — |
| The Chapel | chapel: checkerboard, ashlar with dark windows, no torches | motes 3/s (`cream`, `boneDark`) in the chandelier light | #605666 | — |

The Chapel darkens as its chandeliers fall (02 §7, Aaron's call); its motes are the only ambient
that gets *less* visible as a round goes on, because there is less light for them to hang in.

### 6.2 Fixtures

Things in the room that give off something while they run. All phased by position or index so
they never fire together.

| Fixture | Emits |
|---|---|
| Torch | an ember every 18 ticks from the flame tip; a thread of smoke every 80. The flame itself is three frames at 6 ticks each, each torch on its own phase, and its light flickers |
| Lit fire vent | an ember every 3 ticks while on (phased by column) |
| Burning floor tile | 25 % chance per tick of an ember, 3 % of a puff of smoke, for the tile's 120 ticks |
| Barrel fuse | a spark every 3 ticks, smoke every 9 (24 ticks in all) |
| Saw, running | a spark off the trailing edge every 2 ticks |
| Boulder, rolling | dust behind it every 3 ticks |
| Mine cart, moving | a spark off the trailing wheel every 5 ticks |
| Portal mouth | a mote in its colour every 12 ticks, breathed out along its normal |
| Chandelier, hanging or creaking | a wisp of candle smoke every 16 ticks from the candles |
| Chandelier, fallen | the rubble smoulders for 45 ticks: 8 % ember, 4 % smoke per tick |
| Power-up waiting | one glint spark in its colour every 36 ticks |

### 6.3 Rules for a new room

One or two ambient kinds, from the hazard family; the second kind at a quarter the rate of the
first. Total under 5/s for anything the eye can follow (motes, drips, leaves, grit); snow is the
exception because a flake is one pixel and the point is the blanket. Ambient colours come from the
room's own environment shades, a step lighter than the floor at most, never from a player's hue.
`dust` is the floor's colour a step lighter (snow: near white). `prints` only where feet would
genuinely leave a mark that fades: snow now, maybe sand (§10 #7).

---

## 7. Animation timing

The character poses are 01 §2; this is the timing of everything that moves, drawn and procedural,
against what the tutorials recommend (notes §2: 80–100 ms a frame for ordinary motion, 60 for
projectiles, random start phases, loops of unequal length).

| Thing | Frames | Timing | Note |
|---|---|---|---|
| Stand | 1 per facing | — | the breath (§5.5) is the idle: 72-tick period, 10-tick dip |
| Run | 4 per facing | 5 ticks a frame (frog), 6 (slime, Skully, shroom); `runLift` 0/2/4/0 frog, 0/1/0/1 Skully and shroom, none slime | 83–100 ms, on the tutorials' number |
| Throw | 3 per facing | 8 ticks a frame, 24 in all | slower than a "3 + 4 recovery" attack by design: the pose is the point, and the first frame is the release (no anticipation) |
| Reach / Catch | 1 + 1 per facing | reach ≈ 4 ticks before the catch; clutch held 14 | the tutorials' "squash then settle" is reach then clutch |
| Melee | 4 per facing | the sim's windup 3, active 4, recovery 8 split in two | windup is the sim's own, not an added frame |
| Roll | 6 | 3 ticks a frame, 18 in all | a tumble: the one place frames go faster than 5 ticks; it finishes during the slide |
| Boomerang spin | 4 (one drawn, three rotations) | a quarter turn every 2 ticks in flight, every 10 when dropped | 33 ms: projectile speed, reads as a blur of a chevron |
| Boomerang trail | — | 8 remembered positions, 2–3 px squares fading along the tail; a flagged or armed boomerang trails a size thicker | the projectile gets the light outline the tutorials ask for in motion, not in the sprite |
| Torch | 3 | 6 ticks a frame, own phase per torch | 100 ms |
| Spawn-in | 1 (stretched) | 14 ticks drop, 3 squashed | the squash is a draw-time scale, not a frame |
| Death | 1 white + pieces | 2 ticks white, halves drift 36, ash sinks 20, flattened sinks 10, pit sinks 28 | contrast frame then physics |
| Dust puff | — | 14–26 ticks, 2 px to 1 px halfway | the tutorials' 3–4 frame smoke at 10–20 ticks |
| Blast | ring + particles | ring 18 ticks; sparks 10–22; embers 36–80; smoke 36–70 | fire fades fast, smoke slow (notes §2) |
| Ice trail | shards per tile; the slab 480 ticks, drawing in over its last 120 | 22–40 ticks | the thinning is a draw-time inset, not frames |
| Ambient | — | leaves 150–260, drips to the floor, motes 140–260, snow to the floor then 140 as a dot, wisps 50–90 | slow and low-contrast, never in step |

---

## 8. Asset list, as built

Everything drawn by hand is in `src/art/`; everything else is code. `npm run check-art` counts
and validates the drawn frames: **4 characters (192 frames), 45 glyphs, 8 power-up icons.**

### 8.1 Drawn sprites

| Asset | Size | Frames | Key | File |
|---|---|---|---|---|
| Slime, Skully, Shroom, Frog | 14×18 each | 48 each: stand 1×3 facings, run 4×3, throw 3×3, catch 2×3 (reach, clutch), melee 4×3, roll 6 | `CHAR_KEY` + `P`/`p`/`h` | `src/art/chars/{slime,skully,shroom,frog}.ts` |
| Boomerang | 11×11 | 1 drawn; 3 rotations generated; recoloured per player (6) | `PROP_KEY` + `P` | `src/art/props.ts` |
| Crate | 14×14 | 1 | `PROP_KEY` | `props.ts` |
| Barrel | 12×14 | 1 | `PROP_KEY` | `props.ts` |
| Torch | 7×11 | 3 (flame) | `PROP_KEY` | `props.ts` |
| Shadows | 10×4 (body), 6×2 (boomerang) | 1 each | `s` | `props.ts` |
| Debris | bone 5×3, skull 5×4, pebbles 3×2, shard 2×2 | 1 each | `PROP_KEY` | `props.ts` (scattered on the floor at room build, density per look) |
| Power-up glyphs | 7×7 on a 9×9 badge | 8 (fire, bomb, big, triple, ice, speed, shield, blink) | `POWER_KEY` | `src/art/powerups.ts` |
| Font | 3×5 | 45 glyphs | — | `src/art/font.ts` |

Total hand-drawn: 192 character frames, 15 prop frames, 8 icons, 45 glyphs. The hit-flash and
ash silhouettes are recolours of these made at load (`silhouette`), not frames.

### 8.2 Procedural environment (`src/render/tiles.ts`, `looks.ts`)

A room is rendered once into a static layer from its tile grid, its seed and its look, and only
the cells that change (cut grass, broken crates, crumbled floor) are redrawn. Nine looks, each a
palette of about twenty shades plus three style choices:

| Style | Variants |
|---|---|
| Floor | slabs (2×2-tile stone with mortar) · earth (packed dirt, pebbles, optional moss) · snow (matt white-blue, sparkles, drifts) · tiles (8 px, two shades) · plates (riveted iron) · cobbles (4×4 per tile) · checker (one-tile) |
| Wall face | brick (three courses of 8×4) · rock · bamboo (stalks with nodes) · ice (translucent blocks, frost joints, highlight streak) · panel (seam and rivets) · ashlar (two courses of dressed blocks) · chapel (ashlar with tall dark windows) |
| Wall cap | blocks (running bond from above) · rough · canopy (leaves) · snow (a smooth mound with a bright rim) |

Plus cast shadows, pit walls, and loose debris in the look's density.

### 8.3 Procedural hazards and props (`src/render/hazardArt.ts`)

Spikes · vent (embers and flame) · portal mouth · belt stripes · crumble cracks · moving platform
· gate track and bars · saw groove and blade · crusher trench · boulder · pendulum and anchor ·
cart rails and cart · bumper · chandelier · rubble · fuse glow. Each is one draw function taking
the tile or hazard state; none has a sprite.

### 8.4 Procedural power-up visuals (`src/render/powerupArt.ts`)

Floor fire · floor ice (a laid trail's slab, drawn under the floor marks so skid scratches sit on
it) · shield ring · pickup base and the spawn warning glow. Badges over the head and in the HUD
reuse the §8.1 icons.

### 8.5 Lights, effects, text

`src/render/lighting.ts`: a lightmap of carved-out brightness per light (`x, y, r, a`) with an
optional additive coloured glow; torches, vents, fire, portals, chandeliers, pickups, the armed
boomerang and a dropping player are lights. `src/render/fx.ts`: the twelve particle kinds, rings,
six decal kinds, shake and flash of §4. `src/render/text.ts`: the 3×5 font, plain and shadowed.

**Sound** is 07's: the kill feedback of §4 (flash, hold, shake, chunks) is matched there by a
kill sound whose first 50 ms, the transient and the sub, play over the held frame, and by a dip of
the music under it; every effect that has a ring here has a sound there (`src/audio/`).

### 8.6 What things cost

| Addition | Costs |
|---|---|
| A fifth character | 48 frames of 14×18 in `CHAR_KEY`, one file; the run cycle's period and lift; nothing else |
| A new room | a `Look` (≈ 20 shades, three style picks, one or two ambient lines, a dust colour); zero sprites |
| A new hazard | one draw function; one row in §4.5 for what it does on impact; one line in §6.2 if it runs |
| A new power-up | a 7×7 glyph; a hue (if it needs one) with a dark step; its rows in §4.5 |
| A new weather | a case in `ambient()` and in `step()`/`drawParticle()` of `fx.ts`; ≈ 30 lines |

---

## 9. Determinism, performance, accessibility

**Determinism.** The effects layer never writes to the sim and the sim never reads it (01 §1).
It is spawned only from events or from sim state the renderer already reads to draw, and all its
randomness is its own stream, reseeded per room from the room seed, plus `hash2` of the tick for
flicker. A scripted still (`?t=N`) therefore draws identically every run; two 300-tick bot games
with the same seed produced byte-identical screenshots. In the real game the renderer will consume
the sim's event list per tick (01 §9); on a rollback the events of the re-simulated ticks are
simply not re-fired, so a rolled-back kill's puff stays on screen, which is the right behaviour.

**Performance.** Particles are `fillRect`s of one to three pixels with a colour and alpha set per
particle, which a benchmark this session put at well under a millisecond for 900 on a software
raster (notes §4.1): the fastest path Canvas 2D has, so the design does not need an atlas or a
typed-array pool. Particles are capped at 900 and culled by x against the visible window; decals
at 160; the environment is a cached static layer; the ambient spawner only works inside the view.
Two improvements the benchmark points at, neither urgent: `lighting.ts` builds a radial gradient
per light per frame where a cached glow sprite per radius and colour is twice as fast, and the
particle cap evicts with an array shift where a swap-remove is constant time. Not yet measured on
a slow machine with six players and a full pool (§12).

**Accessibility.** `?shake=0` turns off screen shake *and* the blast flash; `?hitstop=0` turns
off the hold. Both are render-only and per client, so a player may turn them off without affecting
anyone. The blast flash is short (3 ticks), low (alpha 0.35, never white, never red) and
rate-limited to one per 20 ticks (§5.2), so the screen stays under the three-flashes-a-second line
of WCAG 2.3.1 and Xbox guideline 118 whatever happens in the room (notes §3.2). Both Gungeon and
Boomerang Fu shipped these switches, Boomerang Fu only after launch and under complaint (notes §1);
the shape they settled on is the one 05 should offer: screen shake as an amount (off, half, full),
freeze frames on or off, screen flashes on or off, each described by what it does and never
labelled "epilepsy safe" (notes §3.2). The URL params are the demo's stand-in.

---

## 10. Decisions needed (Aaron)

1. **Kill shake 2 px / 8 ticks, blast 4 / 12, random direction.** Too little, too much? Scaled to
   our screen the literature's practice is about 3 / 12 and 4–5 / 18 (notes §3.3); ours are at the
   quiet end because kills are frequent and mostly happen to other people. The bigger question is
   direction: Celeste and Nuclear Throne shake *along* the hit (a kick), which carries information
   where a rattle carries noise. A kill shake along the kill vector is a small change.
2. **Hold 3 ticks, global, on kills only.** 01 §8's rule as built. Smash freezes only the attacker
   and the victim and shortens the freeze as players are added (×0.77 at six), on the argument
   that a global hold hands a free beat to everyone not involved (notes §3.1). Keep the global
   3-tick hold (at "the brain won't notice" length it costs nobody much), make it local to the two
   bodies and the boomerang (a sim rule, so a 01 change), or drop it? Also on blasts and chandelier
   landings, or does that make a barrel chain stutter?
3. **Pit deaths silent** (no flash, hold or shake). Keep, or give them a small shake when the
   victim was shoved?
4. **How long marks last.** Scorch a whole round, splat 7 s, prints 4 s, chunks 2–3 s, 160 marks
   at most. The literature's "permanence" is forever (notes §3.1), which for a 30-second round
   means the round. Should everything last the round so the floor is the round's record, at the
   cost of a busier floor?
5. **Pieces in the player's colour** (chunks and the splat), the same for every character. It
   reads as who died, but it is a little gory for a party game; neutral bone/white is one
   alternative. The other is Boomerang Fu's: death pieces per character (a slime splash that stays
   as a puddle, Skully's bones, the shroom's cap popping off, the frog in two) at a handful of
   drawn pieces each (notes §1.2, §1.4). More personality for little art; it moves the death
   effect from §4.5's table to each character's file.
6. **Idle breath 72 / 10.** Visible enough? Too often?
7. **Prints only in the snow.** Should the Pits' earth and the Gatehouse's sand take prints too?
8. **Spawn-in as a drop** (14 ticks from 40 px). Or rise from the floor, or pop out of a portal?
   And is 14 ticks of a body you cannot yet control the right length?
9. **Blast flash on by default** at 0.35 for 3 ticks, or off by default with an opt-in?
10. **Ambient density per room** (§6.1 rates). Judge after playing: these are set so the Cellar
    and Chapel look alive at a glance and the Lab barely moves.
11. **Lock the palette** at 72 named colours plus the looks' shades, or leave it open until 07?
12. **Weather that reacts.** None of the ambient effects respond to play (snow does not fall on a
    body, embers do not land on grass). Worth doing for any of them, or is the layer's job to stay
    out of the way?
13. **A dead player's boomerang goes grey.** Boomerang Fu's trick for reading which boomerangs on
    the floor still belong to someone (notes §1.2). Cheap; touches 01 §5's dropped-boomerang
    rules only in colour. Yes?
14. **Not for 04 but raised by the research:** a slow-motion beat on the round-deciding kill was
    Boomerang Fu's most criticised effect and had to be made optional and restricted after launch
    (notes §1.2). If 06 wants one, it is last-kill only, never in modes with respawns, brief, and
    behind a switch. Flagged so 06 starts from that.

---

## 11. Tuning constants (as built)

`src/demo/main.ts` unless noted.

| Constant | Value | Meaning |
|---|---|---|
| `HITSTOP_TICKS` | 3 | ticks the renderer holds the frame on a kill |
| `HIT_FLASH` | 2 | ticks a killed body is drawn solid white |
| `SHAKE_KILL` / `SHAKE_BLAST` / `SHAKE_LAND` | 2 / 4 / 3 px | shake magnitudes; durations 8 / 12 / 10 ticks at the call sites; lesser shakes 1 px for 4–5 |
| blast flash | 0.35 for 3 ticks | `flashAt` in `blast()` |
| `fx.ts` `FLASH_GAP` | 20 | ticks before another flash may fire (≤ 3 a second) |
| `SPAWN_DROP` / `SPAWN_LAND` / `SPAWN_HEIGHT` | 14 / 3 / 40 px | the spawn-in drop |
| `BREATHE_PERIOD` / `BREATHE_DIP` / `BREATHE_FOLD` | 72 / 10 / 0.45 | the idle breath |
| `FADE_IN` | 20 | room fade from black (live only) |
| `SMEAR_TTL` / `PRINT_TTL` / `SCORCH_TTL` | 45 / 240 / 3600 | floor marks; scratch 300, splat 420 and dot 140 at the call sites |
| `BLAST_TTL` | 18 | the drawn blast ring |
| `THROW_FRAME` · `CATCH_ANIM` · `ROLL_FRAME` | 8 · 14 · 3 | 01 §2 pose timings |
| `runPeriod` (per character) | 5 frog, 6 others | ticks per run frame |
| `fx.ts` `MAX_PARTICLES` / `MAX_DECALS` / `GRAVITY` | 900 / 160 / 0.16 | the layer's caps and fall rate |
| `Look.ambient` rates | §6.1 | spawns per second per 36×19 view |
| fixture periods | torch 18 / 80, vent 3, saw 2, boulder 3, cart 5, portal 12, chandelier 16, glint 36 | ticks between emissions (§6.2) |
| shake / flash reach | 80 px | beyond the view edge, an event is silent |

---

## 12. What the demo builds, and where it departs

Everything in §2–§9 is in the demo (`npm run dev`; Tab through the rooms; `?shake=0`,
`?hitstop=0`). Stills that show it: `scripts/shot.sh 8,13 "idle=1"` (the drop and the landing
squash), `scripts/shot.sh 240 "arena=forge"` (embers and torch sparks), `scripts/shot.sh 240
"arena=icebox&walk=1,0,240"` (snow, prints along the path), `scripts/shot.sh 600 "bots=3&trace=1"`
(kills, scorches, chunks lying), `scripts/shot.sh 60 "give=ice&walk=1,0,0&bots=0"` (an ice trail).

Departures and gaps:

- **The hold stops the stand-in sim.** The demo is one loop, so during the three held ticks it
  skips stepping the sim rather than re-drawing a frame while the sim runs; the real renderer
  holds the frame alone (01 §8). Visually identical; the sim-side difference is nil in the demo
  because nothing else is running.
- **Effects are called from the kill functions directly**, not mapped from an emitted `kill`
  event, because the demo's stand-in sim has no event list yet. §4.5 is the mapping the real
  renderer implements from the sim's events (01 §9).
- **The toggles are URL parameters**, not lobby options (05).
- **Pit deaths, blink squash and the Triple's phantoms** keep the old generic `burst` in a couple
  of places (crate drops, portal transit, phantom pop); fine for now, listed so they are not
  mistaken for design.
- **Not measured**: frame time with six players, a barrel chain and 900 live particles on a slow
  laptop (§9). The lightmap's per-frame gradients and the particle cap's array shift are the two
  known inefficiencies, both small (§9).
- **Torch flicker is hashed noise**, not an authored flicker string; Quake's ten-steps-a-second
  light styles (notes §4.3) would give the Chapel's candles a guttering shape the hash cannot.
  Listed as a possible refinement, not a gap.
- **Not built**: anything in §10 marked as an alternative; weather that reacts (§10 #12); the
  boomerang's own ambient (a whistle of air, a glint on the spin) was considered and left out to
  keep the projectile clean.
