# Notes — Arena layout rules, from the literature

Written 2026-10-09 for the first arena roster (02 §7). Aaron's brief: rooms "10% smaller than the
original demo area" (→ 36 × 19 tiles, 34 × 16 playable, for the reference room; later that day he
asked for the others to keep "the same amount of total squares" in shapes that fit their themes, so
every room has 520 ± 4 % open tiles and the targets below are stated per open tile), each with "a general Theme which indicates
what types of hazards are present"; "the gameplay should center around being fast"; "the hazards
shouldn't be too encumbering. They should mainly allow players to leverage their boomerang skills in
different ways."

Four research passes fed this: single-screen brawler stage design (Smash legality rules, Sakurai's
stage pages, TowerFall, Duck Game, Nidhogg, Samurai Gunn); Boomerang Fu itself plus ricochet
geometry (billiards, pinball, Bomberman); FPS arena-map theory (Level Design Book, Yoder, Holloway,
Ryan, Valve's TF2 commentary, ioquake3 spawn code); and hazard design in party games (SmashWiki
hazard taxonomy, Sakurai on fairness, Rosewater on complexity, Meier on decisions, Koster on
pattern learning, Overcooked / Nuclear Throne / Fall Guys post-mortems). No source gives numbers
for a top-down one-screen boomerang room, so §3's targets are reasoned from the principles and our
own scale; confidence is marked. Web search was mostly unavailable to the agents, so this leans on
primary pages fetched directly; the unverifiable items are listed at the end.

## 1. Our scale (what the rules are measured against)

| Quantity | Value | Tiles |
|---|---|---|
| Playable interior | 544 × 256 px in the Cellar | 34 × 16 = 544 tiles, 520 of them open; every room has 520 ± 4 % open tiles in its own footprint (up to 40 × 22 with the ring) |
| Walk | 1.8 px/tick = 108 px/s | 6.75 tiles/s; full width ≈ 5.0 s, height ≈ 2.4 s |
| Dash (roll) + slide | 43 px + ≈ 53 px over ≈ 49 ticks | ≈ 2.7 + 3.3 tiles |
| Throw | 224 px of path, wall bounces included (≤ 4), 46 ticks to rest | 14 tiles; a bank off a wall keeps the length |
| Deflect / bomb | 112 px / 157 px | 7 / 9.8 tiles |
| Return | flies over everything, homes on the thrower | geometry only shapes the *outbound* leg |
| Threading | boomerang wall radius 4 px, player radius 5 px | a 1-tile slot is a trick window; 2 tiles is comfortable |
| Cycles | spikes 195 t (3.25 s), vents 220 t (3.7 s), gates 645 t (10.75 s), platform 32 t/tile, crusher 8 t/tile | a 30–60 s round sees 9–18 spike cycles but only 3–6 gate cycles |

Boomerang Fu for comparison (from its Steam copy, patch notes and reviews): the whole map is
crossable in ≈ 5 s, rounds average ≈ 15 s, one screen for every player count, and 8 players was cut
because larger arenas made it "who can squint at the screen the hardest" (Cranky Watermelon, MKAU
2020). Our 520-open-tile rooms at 6.75 tiles/s match that crossing time.

## 2. Principles (with the Boomerangeon reading)

**Theme and dosage**

1. **One idea per room.** Overcooked builds "levels around a single element"; TowerFall's level
   sets each have "its own identity"; Nidhogg's screens each have one feature; TowerFall maps are
   "just different enough that each one feels unique, but not so much that one has to completely
   change their playstyle." → One hazard family (the Theme) plus one static terrain motif. Nothing
   else in the room.
2. **Build the neutral room first.** Sakurai: Battlefield is "the most basic of basic layouts",
   Final Destination "completely flat — no surprises"; competitive Smash judges everything against
   them. → The Cellar is that room: floor, blocks, crates, barrels, no lethal tile. Every other room
   is judged against it.
3. **Budget moving objects.** Multiple-object-tracking falls off with count and speed; Rosewater
   treats interacting pieces as a complexity budget; Vlambeer locked Nuclear Throne to 4:3 "to
   create an even balance of visual threats onscreen". → Six players and six boomerangs are already
   twelve movers; a room adds **at most two** hazard movers.
4. **One friction element, never two.** Yoder's "rough edges" are deliberate and singular; Dust2's
   doors work because they are the only bad flow on the map. → Ice *or* belts *or* darkness in a
   room, never stacked, and only when the room is about it.
5. **Fewer rooms, played more.** Demons with Shotguns' 40-arena quota hurt quality; TowerFall shipped
   160 levels only after years of fortnightly playtests; Boomerang Fu's "30+ arenas" is marketing.
   → The roster below is nine data rows that cost nothing to cull; expect to keep six to eight after
   Aaron has played them at 2 and at 6.

**Hazards: empowering, not encumbering**

6. **Predictability × influence.** SmashWiki's legality test for a hazard is "how predictable a
   stage hazard is and how much influence it has over the match"; the banned categories are random
   elements, hazards that act without player input, and hazards that KO players "knocked into
   them". → Nothing random. Lethal footprints are marked tiles. Every lethal thing warns for 30–45
   ticks (simple visual reaction time ≈ 190 ms = 11 ticks, then choose, then step out).
7. **Player-triggered > fixed cycle > random.** Samurai Gunn's icicles are "you can set falling";
   Boomerang Fu sells its sliding walls and rolling pins as *tools*, and its egg-beater pins are fun
   because "throwing a boomerang between them" is a deliberate act with a chaotic result; Meier: a
   decision made randomly is uninteresting. → Prefer what a boomerang can set off: barrels,
   chandeliers, crates, crumble. Fixed cycles are fine when short (next point). No random timers.
8. **Cycles must be learnable inside a round.** Koster: fun is pattern learning. → Periods of 3–8 s
   so a round shows at least three cycles. Spikes (3.25 s) and vents (3.7 s) pass; **the gate cycle
   (10.75 s) is too slow for a fast room** — flagged in §5.
9. **Bend the boomerang, not the player.** Gungeon designs its rooms so players "use the
   environment to their own advantage"; Smash bans hazards that "force players to give up an
   advantage to avoid them". → A hazard that only alters player movement (ice, belts, autonomous
   carts) has to justify itself. Ice stays because the dash slide compounds on it and because
   sliding targets are a new aiming problem; belts and autonomous carts are left out of the first
   set.
10. **Never kill the non-interacting player.** → Nothing lethal within two tiles of a spawn, no
    mover sweeps a spawn's neighbourhood, and 02 §8 keeps lethal phases away from spawns for the
    first 90 ticks. Involuntary movement (bumpers, ice) never ends in a pit or on spikes by itself.
11. **Concealment is the worst offender.** Smash bans stages for "concealing the ground"; Fall Guys
    cut from 100 to 60 players when it "stopped being readable"; Boomerang Fu's squinting quote
    above. → Darkness is **not** in the first roster; it becomes a party modifier (a toggle, like
    Smash's hazards switch), and grass is dosed as beds ≤ 4 × 3 that a throw cuts open.
12. **Destructibles open the map.** Bomberman's soft blocks, Spelunky's terrain. → Crates form lanes
    that *open* over the round and never wall a spawn in.
13. **Chaos is opt-in.** Thorson on TowerFall variants: "it's really easy to ruin the game with
    them"; Clever Endeavour moved power-ups to a separate mode because each one "completely reworks
    your mental model". → Hazards in the roster are the readable kind; the wild ones (darkness,
    random phases) go behind a modifier toggle later.

**Geometry for a boomerang**

14. **Axis-aligned mirrors are the readable ones.** Every single-screen brawler uses orthogonal
    tiles; a bounce flips one velocity component so anyone can predict it; billiards inlays diamonds
    so banks become arithmetic. → All bounce surfaces are tile edges; pillars sit on a countable
    rhythm (even columns, mirrored), torches every few tiles as reference marks.
15. **Intentional bounce targets are 2 × 2 or bigger.** At 10 px/tick the boomerang crosses a tile
    in under two ticks, so a 1 × 1 post reads as a clip. → 2 × 2 pillars for banks; 1 × 1 only as
    crates (break) or bumpers (visibly bouncy).
16. **Only the outbound leg has geometry.** The return flies over everything. → Put bank features
    6–12 tiles from the spawns, where the throw is decelerating and hovering; keep the first three
    tiles around a spawn open (also the Boomerang Fu edge-death complaint, and our dash + slide is
    6 tiles).
17. **Long lane plus staggered field.** Bomberman corridors align blasts, staggered pillars make
    zig-zags; Boomerang Fu's maze maps are the criticised ones ("walls can impede your boomerang
    from returning"). → Each room has one uninterrupted long throw lane (for a max-range hover) and
    one staggered cluster for banks; interior lanes are otherwise broken every 10–14 tiles so a
    cross-room kill needs a bank or a hover.
18. **Design for the 2 : 1 aspect.** Side walls are 8 tiles from the centre, end walls 17; a
    14-tile centre throw can always bank off the long walls and never reach the ends. → Bank fields
    in the middle band, long lanes along the long axis.
19. **Portals are controlled wrap.** TowerFall's torus doubles range and makes from-behind shots,
    but Thorson added trails because spectators lost track at the edges; Boomerang Fu's teleportals
    caused most of its bot and performance bugs. → Fixed colour-coded pairs, both mouths on screen,
    exits never onto a hazard, one room built around them rather than a pair in every room.

**Structure, flow, fairness**

20. **No dead ends, no three-sided pockets.** Pearson: "you never want a map that has dead ends";
    Smash bans "caves of life". → Every pocket has two exits; nothing deeper than two tiles; every
    standable tile can be hit by a straight throw or one bank.
21. **Loop skeleton.** Combat bowls with an orbit path and side loops (Yoder, Clopper). → A central
    bowl, a ring around it, two side loops so 3+ players flow in a figure-8 rather than a mob.
22. **Three-entrance rule.** Pearson: three entrances so a defender "can cover one or two but never
    all". → No pocket a single hovering boomerang seals.
23. **Push players apart, not together.** Toto Temple Deluxe found clustering degenerates into
    button-mashing; Boomerang Fu's 6-player rounds are "elbow to elbow". → The centre holds the
    *hazard* or focal object, not a prize; power-up points sit at the flanks with at most one in
    the risky middle (this is where the FPS "reward inside risk" rule and the party-game
    "separate them" rule disagree; for six players on one screen, separation wins).
24. **Mirror for fairness, decorate asymmetrically.** TowerFall's editor has a mirror tool; Duck
    Game's "Balance" trait is L/R symmetry; Sakurai's fairness is "a competitor has the freedom to
    choose the same". → Left-right mirror (or a half turn) of every collision tile; spawn pairs
    (1,2), (3,4), (5,6) are mirror images so 2- and 4-player subsets stay fair; palette and props
    may break symmetry later.
25. **Spawns.** ioquake3 respawns in the farthest half of the spawn set; Kozin: FFA spawns at
    maximum distance; Ryan: never beside a pickup; Holloway: facing drives the first move. → Six
    spawns in a ring along the walls facing inward, ≥ 7 tiles apart (≥ 10 where the room allows),
    cover within a dash, no power-up point within three tiles.
26. **Readability of tiles.** Sakurai's Melee site: standable saturated, non-standable
    unsaturated, "don't draw too much, don't draw too little"; Pearson: gaps "obviously passable or
    obviously impassable". → Every tile either blocks a boomerang or doesn't, kills or doesn't.
    Pits are the one "boomerang passes, body doesn't" tile and should look it. (Feeds 04.)
27. **Rotate every round; nothing safe from both a throw and a melee approach.** Stick Fight loads
    a new map each round; Gang Beasts stalls because nothing forces engagement. → Already 01 §10;
    hurry-up (02 §6) is the backstop and stays unbuilt until a stall is seen.

## 3. Quantitative targets for a 520-open-tile room (the Cellar's 34 × 16 is the reference)

Confidence: medium unless noted. `npm run check-arenas` prints the measured values.

| Measure | Target | Reasoning |
|---|---|---|
| Open floor (incl. grass, ice, belts) | 75–90 % | Ryan's size/occlusion inverse plus the "fast" brief; below ~70 % the dash + slide (6 tiles) hits walls constantly |
| Solid blocks (walls, crates, barrels) | 5–15 % | Ricochet pass wanted 10–18 %; Bomberman's fixed pillars are 21 % and it is a grid-movement game. Our neutral room sits at the low end on purpose |
| Pits | ≤ 10 % | Pit-heavy Boomerang Fu maps are the ones players tolerate for "no more than 1 round" |
| Pillar clusters | 4–8 of 2 × 2, ≥ 2 tiles between them | Three-entrance rule; 2-tile gaps are threadable at any angle |
| Longest interior open line | the full width only along the top and bottom rows (34 in the Cellar, 38 in the widest rooms); elsewhere broken every 10–14 tiles | one throw = 14 tiles |
| Hazard movers | ≤ 2 | principle 3 |
| Lethal tiles (spikes, vents, pits) | ≤ 12 % of the interior | spawns need room, and 02 §8's first-90-ticks rule needs clear tiles |
| Spawn spacing | ≥ 7 Manhattan (validator), ≥ 10 preferred | 1.5 s of walking; six spawns round a room this size cannot all be a full throw apart |
| Spawn clearance | ≥ 3 open tiles around, ≥ 2 from any lethal tile or swept tile (validator) | dash + slide, principle 10 |
| Power-up points | 3, flanks + one centre, ≥ 3 tiles from a spawn | principle 23 |
| Cycle period | 3–8 s | principle 8 |

## 4. Hazard rubric

From the party-game pass. Score a hazard on: boomerang leverage (+2/+1/0), trigger
(player +1 / cycle 0 / random −2), forecastable a second ahead (+1/0/−1), control interruption
(0/−1/−2), kills a non-interacting player (0/−1/−2), exposure symmetry (0/−1), added movers
(0/−1/−2), cycle learnable in-round (+1/0/−1). ≥ +2 empowering, ≤ −2 encumbering.

| Hazard | Verdict | Condition for the roster |
|---|---|---|
| Pit | empowering | boomerang-only lines; a walkway around every pit; never in front of a spawn |
| Crate | empowering | lanes that open; never wall a spawn in |
| Barrel | empowering | player-lit, chainable, fused; ≥ 3 tiles from a spawn |
| Bumper | empowering | deterministic reflection, bounces don't count toward the cap |
| Chandelier | empowering | boomerang-triggered one-shot; visible chain |
| Portal | empowering | fixed pairs, both on screen, exits onto floor |
| Crumble | neutral | player-triggered one-way-ification; never under a spawn |
| Spikes / vents | neutral | fixed cycle, marked footprint, 30-tick warn; bodies blocked, throws pass, so a stripe that is ON is a boomerang-only line |
| Grass | neutral | hides bodies, a throw cuts it; beds ≤ 4 × 3, never over a pit |
| Platform | neutral | one or two, short rails, period 3–6 s |
| Gate | neutral | closed bars bounce boomerangs (a bank wall that comes and goes); cycle should be ≤ 8 s |
| Crusher | neutral if one, slow, never the only route | ≥ 2 s per pass |
| Ice | neutral → encumbering | only as the room's one idea, with floor patches to catch yourself on; bumpers kept away from the pit |
| Belt | encumbering | left out of the first set (it moves bodies and dropped boomerangs, not throws) |
| Cart | encumbering as an autonomous mover | left out; worth revisiting as a boomerang-launched cart (hit a lever, the cart goes) |
| Darkness | encumbering as a fixed condition | party modifier, not a room. **Overridden for the Chapel by Aaron (2026-10-09)**: the chandeliers are its only lights and each one dropped darkens it. That version scores better on the rubric than the Crypt did: player-triggered, forecastable (you see the chandelier fall), symmetric, and a real decision (light or a kill) |

## 5. What this did to the roster and what it flags

The roster in 02 §7 and `src/demo/arenas.ts` follows this: nine rooms, one hazard family each,
left-right mirrored, six spawns in mirrored pairs, three power-up points, the centre always a
hazard or a focal block, no belts, no carts, and darkness only where the players make it (the
Chapel, Aaron's call). The demo strip keeps every hazard for Aaron to try.

Aaron's second note the same day ("the room should not be the same exact formatting size every
single time … use the same amount of total squares, but organize them in interesting ways that fit
the room's theme") reshaped the rooms without touching these rules: each keeps 520 ± 4 % open tiles
(the Cellar's count; `npm run check-arenas` enforces it) in a footprint of its own, and each is
drawn in an environment of its own. The silhouette now does some of the theming the hazards used
to carry alone: the cave's eaten corners, the grove's height, the forge's octagon, the lab's two
bays, the hall's pilasters, the pond's rounded bank, the keep between its towers, the chapel's
cross. Sightlines and spawn spacing were re-checked per room; the validator numbers are in 02 §7.

Flags for tuning, not changed here:

- `GATE_CYCLE` 300/45/300 (10.75 s) breaks the 3–8 s rule; 150/45/150 (5.75 s) would show five
  cycles a round. The Gatehouse's two gate rows run in opposite phase so one is always open.
- `CRUSHER_SPEED` 2 gives a 12-tile pendulum pass of 1.6 s; the Gatehouse sets `speed: 1.5` on its
  pendulum to get ≥ 2 s per pass, per the rubric.
- Spawn spacing in the validator is ≥ 7 Manhattan; the literature would like a full throw (14),
  which six spawns on this screen cannot have. The arena intro and READY phase (02 §8) are what
  make the first second safe.

## 6. Sources

Verified by the agents (fetched and read): SmashWiki *Stage hazard*, *Stage legality*, *Cave of
life*, *Walk-off*; Sakurai's DOJO!! stage pages and Famitsu columns 512, 535, 561 (Source Gaming);
Source Gaming's Melee "Battle Stages" translation (saturation rules); Thorson's "Procedural Level
Mutation" and "TowerFall Physics" posts, Polygon 2013 interview, Shacknews Dark World interview;
TowerFall editor guide (Enumex, Steam); Duck Game "Elements of a Stage" / "How to create a good
Duck Game level" (Steam community); Boomerang Fu Steam page, 26 Steam news posts, Just Desserts DLC
page, Game Jolt page, MKAU Cranky Watermelon interview, r/NintendoSwitch AMA, Steam reviews and
"Large Map" thread, Nintendo Life / GamingTrend / Zed Games reviews; Dan Taylor "Ten Principles of
Good Level Design" (Game Developer 2013); Totten "Designing Better Levels Through Human Survival
Instincts" and the *Architectural Approach* excerpts; The Level Design Book (flow, balance, cover,
typology, wayfinding, prospect-refuge, metrics, Chill Out study); Andrew Yoder's Halo/Quake essays;
Holloway "Deathmatch Map Design: The Architecture of Flow"; Ryan "Multiplayer Map Game Design
Guidelines"; Kozin "Designing maps that complement game mechanics"; Luban "Multiplayer Level Design
In-Depth" 1–3; Valve TF2 developer commentary (Gravel Pit, Hydro, Well); ioquake3 `g_client.c`;
Sock's Focal Point / Pyramid / Si'Metrik notes; Rosewater "New World Order" and "Lenticular Design";
Sid Meier GDC 2012 write-up; Koster *A Theory of Fun* excerpt; Overcooked post-mortems (MCV, Red
Bull, Game Developer); Clever Endeavour "Why did we remove power-ups" (2026); Demons with Shotguns
and Toto Temple Deluxe post-mortems (Game Developer); Wikipedia pages (quoting named primaries) on
Fall Guys, Spelunky, Enter the Gungeon, Hitman 2016, Nuclear Throne, Super Bomberman, Samurai Gunn,
Nidhogg, Stick Fight, Gang Beasts, mental chronometry, multiple object tracking, billiard tables,
corner reflectors, pinball.

Not verifiable this session, used from memory or second hand: Jesse Schell's lenses; Thorson's
"Designing Celeste"/"Friendly Fire" talks (titles only); Epic's Gears "Multiplayer Map Theory";
Lunaran's flow essays; Griesemer's "30 seconds of fun"; the fighting-game "15–18 frames is
reactable" rule of thumb; any Cranky Watermelon design talk or the Boomerang Fu wiki's arena list;
Messhof (Nidhogg) interviews; a published arena-size-per-player ratio (none seems to exist).
