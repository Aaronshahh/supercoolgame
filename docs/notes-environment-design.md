# Notes — Environment design, from the literature

Written 2026-10-14. Aaron's brief: the rooms are "too stony, brick-wally, dungeony … I would like a
lot more variation … each stage has its own unique environment. The chandelier room could be like a
disco ball room." The hazard families and layouts stay as validated (notes-arena-design.md); only
the fiction around them changes. Target spread: nine rooms, nine material worlds — stone, sky,
grove, kitchen, laboratory, clockwork, pond, shrine, discotheque — no two sharing a palette family.

Three research passes fed this: Gungeon-style tileset craft (Joe Harty interviews, Boris the Brave
on Gungeon's generation, Slynyrd's Pixelblog 1/11/20/23/43/45, Mark Ferrari's GDC 2016 talk,
Medeiros' saint11 sheets, Nuclear Throne / Hotline Miami observation); themed precedent per room
(Hotline Miami and Katana ZERO clubs, NecroDancer, Party Hard; Sky Sanctuary, TowerFall, Owlboy,
Rivals of Aether, Black Skylands; Overcooked, Dave the Diver, Eastward; Shovel Knight and
Castlevania clock towers; Pocky & Rocky, Ganbare Goemon, Sekiro/Okami as colour refs); and brawler
readability (Boomerang Fu, TowerFall, Samurai Gunn, Duck Game, Stick Fight, NecroDancer's pulsing
floor, Don't Starve / Backfire / Duck Game darkness). Web search was partially blocked; items are
either sourced or marked named-game observation in the agents' reports.

## 1. The laws (apply to every room)

1. **Theme = hue + light colour + a few props on one fixed grammar.** Gungeon's floors are
   literally this internally (one material family, one hazard family, one light colour each, on a
   shared cap/face/floor structure); Nuclear Throne gets eight biomes out of recolouring one
   floor+wall grammar and swapping 3–5 props. Our `Look` struct is already the right shape.
2. **Mechanics own their colours; themes own everything else.** Boomerang Fu's fire is orange and
   its ice patches cyan in all 30+ arenas; NecroDancer's trap glyphs are identical sprites in every
   zone. The spike grate, vent grate, flame, ice, portal blue/orange and the belt stay pixel-
   identical across all nine rooms, and no room palette may use those hues at high saturation.
3. **Actors keep the top of the range.** Harty: the environment's first job is contrast against
   actors; "everything else is mostly just flavour." Floors stay low-contrast (3–4 values, no
   high-contrast noise inside a texture, no dithering at 16 px — Slynyrd), detail density is spent
   at walls and rims, never mid-field between players.
4. **Wall cap clearly brighter than wall face** (the value jump is what signals the horizontal
   surface — Slynyrd 45); cast shadows max one tile; changing the grout/joint value alone is a
   cheap theme lever.
5. **Hazards are floor furniture.** Boomerang Fu cuts rails and slots into the floor before a
   hazard ever moves. Our grates/tracks/grooves already do this; reskins must not bury them.
6. **Darkness strips decoration first, actors never** (Don't Starve renders the avatar in total
   darkness; TowerFall's Backfire gives every actor its own halo). Applies to the Discotheque's
   falling light level exactly as it did to the Chapel's.
7. **Animate by palette step and 2–3 frame loops** (Ferrari's colour cycling; Slynyrd's water
   minimum: 2 frames + 1 blend). Nothing in a room needs more than 3 frames.

## 2. Per-room specs

Kept as built: **Cellar** (the one classic dungeon room — the anchor the exotic rooms contrast
against), **Greenhouse** (bamboo grove), **Icebox** (frozen pond). **Laboratory** keeps its look.
Five rooms are re-fictioned; keys and layouts unchanged, titles change with the fiction.

### The Pits → The Spires (chasm/bridge/lift)

A shattered ruin floating in daytime sky. "Down" is **bright**: pit = sky blue with a cream cloud
sea (Sky Sanctuary's answer), two cloud layers drifting at whole-pixel speeds — far ~0.25×, near
~0.5× of camera, plus slow autoscroll (Rivals of Aether's split of parallax and autoscroll per
layer). Pale dressed stone, moss/teal accent, gold trim glints. The one non-negotiable (sky-stage
trap): a **1 px dark rim on every walkable edge** — bright sky next to pale stone goes mushy
without it, so the pit-rim pass flips from light to dark in this room. Lift becomes a floating
platform. Palette: sky `#4a9fe8`→`#aee0f8`, cloud `#ffffff`/`#c4daf0`, stone `#e8e4d8`/`#a8a49a`,
cool shadow `#6b6878`, moss `#58c0a8`.

### The Forge → The Kitchen (fire vents/explosive barrels)

A giant kitchen. The fire read is unchanged (law 2): vents keep their iron grates and orange
flame — they are now burners set into the floor. The room around them goes **cool and clean** so
the warm hazards pop (the all-warm-mud trap): cream/terracotta checker floor, white wall tiles
with grout (8 px subtiles), a stainless band, hanging copper pans with one specular pixel each,
steam wisps in the air (Dave the Diver / Eastward vocabulary; Overcooked's grammar: counters
bound the space, props oversized). Palette: cream `#f2e8d5`, tile white `#e8f0ee` + grout
`#b0bcb8`, terracotta `#c4663a`, copper `#d87f3f` + `#ffd9a0`, stainless `#9fb2b8`.

### The Armoury → The Clockwork (spikes on a beat)

The rhythm hazard moves into a clock tower. **Cold steel-blue walls so the brass reads as metal**
(Shovel Knight's trick; brass-on-wood-on-bronze is mud), giant gears half-sunk in the wall faces,
dark plank floor with brass inlay. Gears are rotationally symmetric, so 2–3 frames advancing a
fraction of a tooth-pitch loop as continuous rotation (Castlevania does it in 2–3) — and they
**advance exactly on the spike cycle**, so the environment telegraphs the hazard rhythm for free.
All motion ties to that one master tick. Palette: brass `#c9962e`/`#f0d060`/`#8a6420`, steel-blue
`#3a4668`/`#242c48`, dark wood `#5c3a24`/`#7a4e30`, lamp `#ffcf7a`.

### The Gatehouse → The Shrine (gates/pendulum)

Sliding doors become what they always wanted to be: shoji. Tatami floor — each mat 2×1 tiles,
pale green-gold with a dark border, laid in **alternating orientation** (the layout is the read,
not the weave — Goemon); cream shoji panels in a dark wood lattice at ≥4 px cells (finer aliases
to grey mush), a few backlit to `#ffe8b0`; paper lanterns replace torches, same light system.
**Vermillion is rationed** to beams and the gate frames (Sekiro's discipline) — which also makes
the gates the most colour-marked thing in the room, pure law-5 profit. Palette: wood
`#4a3220`/`#8a5a30`, tatami `#c8b878`/`#a89858` + border `#5e5230`, paper `#f2e9d0`, vermillion
`#c43226`, lantern `#ffc864`, night blue `#26324e`.

### The Chapel → The Discotheque (droppable light sources)

Aaron's call. The chandelier system transfers whole: mirror balls are the only light; each one
dropped kills and darkens the club (CANDLE_AMBIENT → DARK_AMBIENT share logic unchanged). The
floor is the NecroDancer model: a two-value checkerboard in a **dark, narrow value band** that
pulses — and per the readability pass it **cycles hue only, never value**, synced to the music so
it reads as rhythm, not flicker. ≥70 % of the room's pixels stay in the two darkest values
(Hotline Miami's club trick: the floor carries all the colour, walls stay near-black); mirror-ball
light becomes 3–5 slow-drifting pale ellipse spots stamped on the floor only; neon = 3-step glow
(white core, 1 px pure hue, 1 px dark halo); speaker stacks against the walls. Characters already
carry outlines + drop shadows; nothing in the room may reach their value. Palette: room
`#0d0a14`/`#241a38`, floor-cycle hues `#ff3355/#ffaa00/#33ff77/#3388ff` at low alpha over
value-locked checker, neon magenta `#ff2e8a`, cyan `#00e5ff`.

## 3. What this costs (keeping the no-artist constraint)

Everything stays procedural: five palettes, four new floor styles (planks, tatami — kitchen and
disco reuse the checker/tiles styles with new colours), four new wall styles (gears, shoji,
kitchen tile, club panel), a sky pit treatment (mask + two cloud strips), three new fixture
sprites on the torch anchor (paper lantern, brass lamp, none for the club — mirror balls are the
light), a mirror-ball variant of the chandelier sprite, and two per-frame passes (dance-floor hue
pulse; cloud drift under sky pits). No hand-drawn tile art.

Unverifiable/soft items: Black Skylands' island treatment and the Katana ZERO/NecroDancer floor
mechanics are named-game observations, not dev statements; two primary talks exist but were not
transcribable (SIFTER ep. 153 with Kopetko; Thorson's Full Indie TowerFall talk).
