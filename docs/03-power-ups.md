# 03 — Power-ups

Status: **Draft v0 — the whole roster is prototyped in the demo** (2026-10-09; 2026-10-10 Freeze
replaced by Ice on Aaron's feedback, see §5.5). Eight power-ups, their spawn and stacking rules,
and how each one meets the 01 verbs and the 02 hazards, with proposed numbers. Built straight into
the demo on the same day so Aaron can play them before judging the text; §13 lists where the demo
departs from it. The research behind the choices is in `docs/notes-power-up-design.md` (a
Boomerang Fu fact sheet and a synthesis of item design in Smash, Mario Kart, TowerFall, Nidhogg,
Duck Game and rollback netcode); quotes below cite it as "notes §n". Nothing here has been played
by Aaron yet; the open decisions are in §11.

Scope: the things a player can pick up during a round that change their boomerang or their body
until they die. Not in scope: round modifiers (lobby toggles, 05), the hurry-up (02 §6), and
anything that gives a player a second boomerang (01 §12: "the one-boomerang rule is never bent").

---

## 1. Design lens

Power-ups are the part of the game that is allowed to be unfair, on purpose and in small doses.
Sakurai says items exist so that "players who would normally lose, can sometimes win", and that
they are "an important essence when we're talking about people just gathering and playing
together"; Nintendo's guard-rail is that the result must still feel like "my driving" (notes §2).
Every power-up has to pass these:

1. **It amplifies a boomerang skill, it does not replace one.** Fire rewards a good line, Bomb
   rewards placing the stop, Triple rewards aim, Ice rewards reading where they will have to run,
   Blink rewards knowing where your boomerang is. Nothing kills for you. (Aaron's arena brief, 02
   §1, applied to items; Thorson's Drill Arrow that "completely change[s] the game" is the model,
   notes §2.) The corollary, from Aaron on the first Freeze draft: **in a one-hit game, a hit that
   does anything other than kill is strictly worse than the kill it replaces**, so no power-up
   turns a hit into a status effect. A flag changes the floor, the flight or the body, never what
   a landed hit does.
2. **One job, one glance.** Each power-up does one thing and has one colour, one badge over the
   head and one sound. An opponent has under a second to read a stack; a stack is at most three
   badges (notes §2, Mario Kart's three item goals; Cranky Watermelon's "squint at the screen").
3. **The same danger for the holder.** Fire burns the thrower, Bomb kills the thrower, Blink lands
   you where your boomerang is and nowhere safer. Boomerang Fu's designer: combos are "as dangerous
   to you as they are to your enemies" (notes §1).
4. **Position, not odds, does the balancing.** No position-based item tables, no luck-of-the-draw
   catch-up. A pickup is a place on the floor you have to walk to; where the next one lands is the
   only lever that favours the player with less (notes §2, principles 8–11).
5. **Small set, every one of them fun in a casual room and a serious one** (Thorson, notes §2).
   Eight at v0; the §5.9 maybes stay out until the eight have been played.

Hard rules inherited from 01: one boomerang per player, one-hit kills, everything deterministic
from inputs and the seeded RNG, dash i-frames beat what comes at you and never what you stand on.

---

## 2. Precedent: what Boomerang Fu does and what we take

Boomerang Fu shipped twelve power-ups plus a curse, all from random "books" at arena spots: speed,
dash through walls, teleport to boomerang, explosive, multi (five boomerangs), fire trail, ice,
disguise, one-hit shield, battle royale, telekinesis, extra boomerang; Decoy came later (notes §1).
Rules we **take**: cap of three, a fourth replaces the oldest; everything in the stack applies at
once; fixed spawn spots; placement biased away from the most-stacked player, "finger very gently
on the scales"; spawn probability as the balancing lever rather than stat tuning; dash as the
button for the teleport; Fire and Ice replacing each other in the stack, and the two trails
cancelling where they meet (§6). Rules we **leave**: power-ups persisting across deaths for the
whole match (01 §12 says cleared on death; §11 #1 asks Aaron), the curse (§5.10), Multi as five
real boomerangs that must all be collected (01 forbids it; §5.4 Triple is the phantom version),
Disguise (grass already hides), Telekinesis (our hold-to-hover is the readable version), and
Ice's "slows, then freezes you solid" (ours only makes the floor slippery: a frozen player in a
one-hit game is a kill postponed, §1 #1).
Reception we **listen to**: Multi and Telekinesis are the most disabled, Bamboozled "the most hated
power-up and it is literally just no fun", Teleport confuses newcomers, Explosive kills teammates,
players could not tell which power-up a fourth pickup had silently removed (notes §1).

---

## 3. Pickups: spawn and take

- **Where**: every arena marks exactly three power-up points `p` on plain floor (02 §2, §7:
  "flanks plus one in the middle"). Fixed, known pads: pickups are objectives, not surprises (Smash
  and Mario Kart, notes §2). The room's geometry makes grabbing one a risk, like a TowerFall chest:
  the Lab's are on the rails, the Icebox's on ice, the Pits' on the far side of the corridor.
- **When**: `POWERUP_FIRST` = 120 ticks after the room loads (2 s, past READY so nobody spawns on
  one), then one every `POWERUP_INTERVAL` = 480 ticks (8 s) **while fewer than**
  `POWERUP_MAX_ON_FIELD` = 2 are waiting. The clock only runs while there is room, so taking one
  never spawns the next at once. A 30 s round sees three or four pickups; a 60 s round seven.
- **What**: a seeded uniform pick over the enabled kinds that never repeats the previous kind.
  No weighting by score or position (§1 #4).
- **Where exactly**: a random free point, unless a living player holds two or more power-ups, in
  which case the free point farthest from the richest such player (Boomerang Fu's placement bias,
  notes §1).
- **Tell**: the point glows in the coming kind's colour for `POWERUP_WARN` = 45 ticks (a ring
  closing in, sparks rising), then the badge lands with a soft ping and floats, bobbing, with a
  sparkle circling it. It blinks for its last 1.5 s and fizzles after `POWERUP_TTL` = 900 ticks
  (15 s) so the kinds keep rotating and nobody camps a pad.
- **Take**: walk over it. The nearest living player within `POWERUP_PICK_RADIUS` = 10 px
  takes it; on a dead heat the lower slot index (deterministic, §9). A rising three-note chime,
  a burst in the kind's colour, the badge flies to the head. Dashing players can take one.
- **Crates**: a broken crate drops a pickup, already landed, with `CRATE_DROP_CHANCE` = 0.25 (02
  §4.3 "May hold a power-up"). Same kind rule, no placement bias. §11 #3.

Nothing is announced to a specific player; the glow is the whole telegraph and everybody sees it.

---

## 4. Holding and stacking

- A player holds up to `POWERUP_CAP` = 3 power-ups, shown as badges over the head, newest on the
  right, and in the HUD slot next to the dash indicator.
- Taking a kind you already hold does nothing except move it to the newest slot (no duplicates,
  no doubling; a stack cannot "add damage" in a one-hit game, notes §2).
- A fourth pushes out the **oldest** (Boomerang Fu's rule). The lost badge falls off the head and
  the event is logged so the HUD can flash it: the "which one did I lose" complaint from launch-week
  Boomerang Fu. Shield is **not** exempt (Boomerang Fu exempts it); §11 #2.
- Everything held applies at once. Boomerang flags (Fire, Bomb, Big, Triple, Ice) are copied
  onto the boomerang at the moment of the throw and ride it for that flight only, through deflects
  and steals (01 §12). A dropped boomerang carries nothing; the next thrower's set goes on it.
- **Fire and Ice never share a stack.** Taking one lets go of the other (logged like a pushed-out
  badge), so a line is always one thing. The same on the boomerang: a lit vent that catches an
  ice boomerang burns the ice off it for the rest of the flight (§5.1).
- **Duration: until you die or the round ends.** Death clears the set (01 §12 default) and you
  respawn with nothing. Timers would need a countdown nobody has time to read (notes §2,
  principle 19). Boomerang Fu keeps them for the whole match and players call that the core
  risk/reward hook; §11 #1 is Aaron's call.
- Shield is consumed when it pops (it leaves the stack and frees the slot). Nothing else is used up.

---

## 5. The roster

Five **boomerang flags** (they change the throw) and three **body power-ups** (they change you).
Colours are palette entries (04); every one already has a 7 × 7 glyph on a 9 × 9 badge.

| # | Power-up | Kind | Colour | One line | Constant |
|---|---|---|---|---|---|
| 5.1 | **Fire** | boomerang | flame red | the throw leaves a burning line; grass catches | `FIRE_TTL` 120 |
| 5.2 | **Bomb** | boomerang | flame orange | the boomerang blasts where it stops, then comes back | bomb radii from 01 |
| 5.3 | **Big** | boomerang | bone | twice the size: twice the reach, smashes what it passes | `BIG_SCALE` 2 |
| 5.4 | **Triple** | boomerang | white | two phantom boomerangs fly beside yours and fade at the end | `TRIPLE_SPREAD` 20° |
| 5.5 | **Ice** | boomerang | ice | the throw leaves a slippery trail; everyone slides on it | `ICE_TTL` 480 |
| 5.6 | **Speed** | body | flame yellow | run faster, dash twice as often | `SPEED_MULT` 1.35 |
| 5.7 | **Shield** | body | teal | takes one hit for you; not the floor | `SHIELD_GRACE` 20 |
| 5.8 | **Blink** | body | violet | dash empty-handed to teleport to your boomerang and catch it | `BLINK_SQUASH_RADIUS` 8 |

### 5.1 Fire — boomerang
Outbound leg only. From `FIRE_START` = 24 px into the flight (so the thrower never stands in it),
every floor tile the boomerang crosses is set alight for `FIRE_TTL` = 120 ticks (2 s): a bed of
embers with tongues that die down first. A full throw lays about twelve tiles, bending with each
wall bounce. A boomerang without the flag that crosses a **lit fire vent** gains it for the rest of
that flight (02 §4.7), so the Forge hands out Fire for free to anyone who times a throw.
**Standing in fire kills**, a floor rule: no dash i-frames, no shield, the thrower included; the kill goes to whoever owned the boomerang when it crossed that tile. Fire never lights
on walls, pits, the room's own ice, vent grates or under props. **Fire over laid ice melts it**: the
tile steams and neither is left (§5.5, §6). **Grass burns**: fire cuts the grass under it and,
during its first half, spreads to each adjacent standing grass tile every `FIRE_SPREAD` = 20 ticks,
so a field goes up in a wave about three tiles deep from the line (§11 #8 asks whether that is too
much). Through a portal the line continues on the other side (the mouth itself is wall). Skill it
amplifies: the line. A good Fire throw is a wall the opponent has to go round for two seconds, and
a bank off the wall draws a corner.

### 5.2 Bomb — boomerang
When the outbound leg comes to its stop, the boomerang blasts: kill radius `BOMB_HIT_RADIUS` = 36
px inside the 40 px ring, the same bomb as 01's own-deflect fuse but with **no fuse**, then the
boomerang hangs or returns as normal (Boomerang Fu hands you a fresh one after a second; ours is the
same boomerang, so Bomb costs you nothing but the walk). The blast kills the thrower too if they are
in range, breaks crates, lights barrels and cuts grass. An early outbound hover blasts at the
chosen stop, then hovers; stopping again during the return does not blast again.
**Own-deflecting a Bomb boomerang arms it the 01 way** (orange, 0.8× speed,
beep-beep-shrink-blast) and the flag's blast is skipped, so there is never a double blast. A
stolen Bomb boomerang blasts at *its* stop for the stealer: steal it and it is your bomb. Skill it
amplifies: placing the stop. An uninterrupted throw travels 14 tiles; a hover can stop it earlier.
A Bomb makes that spot lethal for one tick. Shield blocks the blast (a side hit).

### 5.3 Big — boomerang
Hit radius and sprite ×`BIG_SCALE` = 2 (20 px against players, so about a tile and a quarter of
reach), shadow doubled. Wall collision radius unchanged, so it threads the same gaps. While
airborne it **wrecks what it passes** within 14 px: breaks crates, lights barrels, cuts grass,
without slowing. It is also twice as easy to deflect (the melee deflect radius grows with it); the
catch radius is unchanged. Skill it amplifies: the sweep. Big turns a near miss into a hit and a crate line into
rubble, and it is the most generous flag for a new player, which is the point (§1).

### 5.4 Triple — boomerang
The throw launches the real boomerang plus two **phantoms** at ±`TRIPLE_SPREAD` = 20°, the same
owner and the same flags (Fire + Triple is three lines, Bomb + Triple three blasts, Ice + Triple
three trails, a rink). Phantoms are drawn dimmer with a white flicker, kill like the real one, bounce like
it, and **pop at their stop**. They cannot be caught, hovered, stolen or blinked to; a melee that
would deflect one pops it instead. The aim indicator shows all three paths with the marker on the
centre one. This is the 01 §12 "temporary projectiles" rule made concrete: Boomerang Fu's Multi
(five real boomerangs, all to be collected, the most-disabled power-up) is out. Skill it amplifies:
aim at range. The fan is three tiles wide at the stop and a tile wide up close, so Triple rewards
the long throw and does almost nothing in melee range.

### 5.5 Ice — boomerang
Fire's mirror. Outbound leg only, from the same `FIRE_START` = 24 px, every floor tile the
boomerang crosses is **coated in ice** for `ICE_TTL` = 480 ticks (8 s): a translucent slab that
thins away over its last two seconds. The trail bends with each wall bounce and continues through a
portal, so a full throw lays about twelve tiles. The hit itself is an ordinary kill; the ice is the
power. **Laid ice is the Icebox's ice** (02 §4.5), the same rules to the number: a fifth of your
grip, no heading snap, momentum kept at 0.94 a tick, dashes slide on and on, a shove carries with
the ice decay, skid scratches underfoot. Everyone slides, the thrower included (§1 #3). The grass
under it is flattened so the ice reads. **Ice over a burning tile puts the fire out**, and fire over
ice melts it: the tile steams and neither is left, so a Fire line and an Ice line erase each other
where they cross (§6). Ice never lays on walls, pits, the room's own ice, vent grates or under
props. **Credit**: while the ice lasts, whoever laid it holds the hazard credit for anyone else
standing on it (02 §3), unless a fresher shove has a live claim, so an opponent who slides off your
trail into a pit or onto spikes is your kill; slide in yourself and it is nobody's. Skill it
amplifies: reading the room. A good Ice throw is laid where the opponent is about to have to run,
across the mouth of a corridor, along the lip of a pit, in front of the pickup they are walking to,
and it is best in the rooms with edges (Pits, Lab, Chapel). Why not a freeze: Aaron's rule in §1
#1. Boomerang Fu's Ice slows and then freezes the victim; in a one-hit game that is a kill made
slower. An ice *floor* is a different kind of thing: it does nothing by itself and changes
everything about the next two seconds of movement, which is the arena brief's "hazards amplify
boomerang skill" (02 §1) in a pickup.

### 5.6 Speed — body
Run speed cap ×`SPEED_MULT` = 1.35 (2.43 px/tick, so the Cellar is crossed in 3.7 s instead of
5; the two-tick acceleration is unchanged), yellow dust under the feet, dash cooldown `SPEED_DASH_CD` = 15 instead of 30
(the dash distance and slide are unchanged, so Speed is more dashes, not longer ones). Melee and
throw unchanged (Boomerang Fu's Caffeinated is the same cut). Skill it amplifies: the dodge and the
fetch. Speed is the quiet one; it exists because the research says every roster needs one legible
"speed" item (notes §2, principle 14).

### 5.7 Shield — body
A teal dotted ring breathes round you. The first **side hit** that would kill you pops it instead:
a boomerang (any flag), a melee swing, a bomb or barrel blast, a crusher. You are
knocked `SHIELD_KB` = 6 px along the hit and get `SHIELD_GRACE` = 20 ticks of i-frames, and the
shield leaves the stack. It does **not** stop the floor (pits, spikes, vents, fire) or things that
fall on you (the chandelier, a Blink landing), the same line 02 §3 draws for dash i-frames. A
boomerang that pops a shield keeps flying (it does not deflect; the shield is not a melee). Skill
it amplifies: the trade. Shield is the one defensive item and the
only one that is used up, which is why Boomerang Fu gives it to trailing players as auto-balance
(notes §1); we do not, yet (§11 #2).

### 5.8 Blink — body
**Dash while empty-handed** and your boomerang is out: instead of rolling you teleport to where it
is and catch it, an afterimage left where you stood, violet bursts at both ends, a rising zip. It
works on the outbound leg, the return, the hang, a boomerang you dropped (a respawn brings a fresh
one instead), and an **armed bomb**
(Blinking to your own fuse disarms it: Boomerang Fu's Teleport does the same to a live Explosive).
If the boomerang is over a pit or inside a wall you land on the nearest floor. Landing within
`BLINK_SQUASH_RADIUS` = 8 px (plus the hurt radius) of another player **flattens** them, the
chandelier kill. The dash cooldown and the six i-frames are the ordinary dash's. There is no
wind-up in the demo; §9 argues for three ticks of one. Skill it amplifies: knowing where your
boomerang is. Blink turns every throw into a two-point movement option and the hang at range into
a flank. It is also the one Boomerang Fu newcomers found confusing (notes §1), so the badge, the
afterimage and the sound all have to carry it.

### 5.9 Maybe (not built; wait until the eight have been played)
- **Invisibility** — fade to a shimmer while not throwing; pairs with darkness rooms. Needs one rule
  for couch and online (notes §2, principle 20) before it is worth building.
- **Long throw** — 1.5× range. Cheap, but it changes the one fixed number every player has learned
  (01 §4.1), so it fights readability.
- **Shockwave melee** — the swing knocks back in a ring. A melee power-up for the one verb that has
  none; might just be a second Shield.
- **Steer** — a mild Telekinesis: hold throw to bend the flight a little. Our hover already owns the
  button; see whether hover is enough first.
- **Decoy** — a dash leaves a bot-driven copy. Lots of sim for a joke; Boomerang Fu's best-liked
  late addition though.
- **Dash through walls** — Boomerang Fu's "jump", overpowered there in a mode with props to hide in;
  here it would walk through portals' walls and gates, which the Gatehouse is built around.

### 5.10 Cut
- **Disguise** — grass already hides a player, and the maps are small enough that "which crate is
  new" is not a question.
- **Curses (Bamboozled)** — inverted controls take a slot nobody asked for; "the most hated
  power-up" in the reference game. If one is ever shipped the notes' rule applies: opt-out, obvious
  on the victim, brief, odds that barely move (§11 #4).
- **Extra boomerang** — 01 §12, never.
- **Battle royale** — the hurry-up (02 §6) already shrinks the room.

---

## 6. Interaction matrix

Power-ups against the 01 verbs:

| | Deflect (melee on a boomerang) | Steal (deflect an enemy's) | Own-deflect (01 §5 arming) | Hover (hold throw) | Catch | Dash | Death of the holder |
|---|---|---|---|---|---|---|---|
| Fire | flags persist, keeps burning on its new line | the line is now yours; the fire is credited to whoever owned it when the tile lit | armed fuse flight also burns | burns up to the stop, then hovers | — | dash through fire **dies** (floor) | set cleared |
| Bomb | persists; blasts at the new stop | your bomb now | **the 01 fuse replaces the flag's blast**, never both | blasts at the stop, then hovers | normal | i-frames beat the blast | set cleared; a boomerang already in flight still blasts |
| Big | easier to deflect (radius ×2) | persists | ×2 fuse | — | normal | — | set cleared |
| Triple | real one deflects, **phantoms pop** | phantoms cannot be stolen | the real one arms, phantoms pop | the real one hovers, phantoms pop at their stop | the real one only | — | phantoms pop with the owner's drop |
| Ice | persists; the trail bends with the deflect | the trail is now yours; the credit for a slide goes to whoever owned it when the tile iced | the armed fuse flight also lays ice | lays ice up to the stop, then hovers | normal | **a dash onto ice slides on** (01's ice rule); dash i-frames do not help a slide into a pit | set cleared; the ice laid stays its 8 s and keeps its credit |
| Speed | — | — | — | — | — | cooldown 15 | set cleared |
| Shield | a boomerang that pops it **keeps flying** | — | the blast pops it | — | — | i-frames and the shield stack; the shield pops only if the hit lands | set cleared |
| Blink | — | — | **blinking to your own armed bomb disarms it** | hover and blink both use a button; blink is the dash | blink **is** a catch | blink replaces the dash when a boomerang is out | set cleared |

Power-ups against the 02 elements:

| Element | Fire line | Bomb blast | Big | Ice trail | Shield | Blink landing |
|---|---|---|---|---|---|---|
| Pit | no fire | over | over | no ice over it; **the slide carries on into it**, the layer's kill | no help | lands on the nearest floor |
| Grass | **cuts and spreads** | cuts | cuts 14 px | flattens what it covers; no spread | — | — |
| Crate | no fire under props | breaks | **breaks in passing** | no ice under props | — | — |
| Barrel | the boomerang still bounces; no fire under it | lights | **lights in passing** | bounces; no ice under it | blast pops the shield | — |
| Ice (the room's) | **never lights**; the line stops at the patch and resumes past it | — | — | already ice: the trail skips it | — | — |
| Fire line | — | — | — | **puts it out**, tile by tile, steam; fire over laid ice melts it the same way | — | — |
| Spikes, vent | no fire on a vent grate; spikes burn; **a lit vent gives any passing boomerang the Fire flag** for that flight (02 §4.7) | — | — | no ice on a grate; spikes ice over (still spikes); a lit vent **burns the ice flag off** the boomerang | no help (floor) | dies if they are up |
| Portal | continues on the far side | — | through | continues on the far side | — | boomerang through a portal: blink to where it is now |
| Belt, platform | burns, carries nothing | — | — | a belt tile ices over: carried *and* sliding | — | — |
| Gate (closed) | wall | stops | bounces | wall | — | nearest floor |
| Crusher | — | — | — | the trench ices; harder to get out of | **pops** | — |
| Chandelier | — | — | — | — | no help (falls on you) | — |
| Darkness | the line **lights the room** | flash | glows ×2 | a pale strip, no light | ring glows | two violet flashes |

---

## 7. Readability and colour

- **One colour per kind**, and the kind's colour is on everything it touches: the badge, the
  pickup's warning glow, the trail of a flagged boomerang, the bursts, the dust. Fire red, Bomb
  orange, Big bone, Triple white, Ice ice-blue, Speed yellow, Shield teal, Blink violet. Teal and
  violet are new palette entries (`PAL.teal`, `PAL.violet`, with darks); **portal blue and orange
  stay the portals'** (02 §4.8). Bomb's orange is the armed-fuse orange from 01, which is the same
  thing said twice on purpose.
- A flagged boomerang's hue follows: armed fuse, then vent fire, then its **first** flag's colour,
  else the owner's colour. Its trail runs hot. Phantoms are 70 % alpha with a white flicker; a Big
  one is just big.
- **Badges** (9 × 9, a 7 × 7 glyph on a dark badge with cut corners) sit 10 px apart over the head,
  newest right, and in three HUD slots next to the dash indicator, so you can read your own stack
  without looking up and everyone else's by looking at them. A head badge is only drawn when fully
  on screen.
- **Body states draw on the body**: the breathing teal ring, the yellow dust. **Floor states draw
  on the floor**: the burning tile, the iced tile (a pale slab with a bright rim, cracks and a
  drifting glint, thinning away over its last two seconds). Nothing is a number.
- **Sounds** (07 §4.6): a low swell with a shimmer of air for the warning glow, metal set down on
  stone for the landing, a snatch and a hard bell with weight under it for the take and the same
  thing falling and muffled for the one that drops out of your pockets, an electrical fizz dying
  for a fizzle, a glass crack with a sub for the shield (the kill's transient with the wet layers
  taken out, so it reads as "that landed and did not count"), a pull of air and a snap of arrival
  for the blink, cracks running and a crystalline ring for the first iced tile of a throw, water on
  a hot pan for steam. Sounds pan by world position, which is the online answer to Thorson's
  per-controller sounds (notes §2); a per-character voice is 07 §10 #7.
- The pickup's warning glow is in the coming kind's colour, so a player can decide whether that
  pad is worth the walk before it lands. Deliberate: positional risk needs information.

---

## 8. Tick order placement and events

Within 01 §9:

- **3 Throws**: the thrower's boomerang flags are copied onto the boomerang; Triple adds its two
  phantoms.
- **4 Player movement**: Speed's multiplier; the ice test (`onIce`) is the room's ice **or** a laid
  tile, so every 01 ice rule applies to the trail unchanged; the dash branch becomes Blink when the
  player is empty-handed with a boomerang out.
- **6 Boomerangs**: Fire lays a tile of fire, Ice a tile of ice, per tile crossed (outbound, past
  `FIRE_START`; one over the other is steam and nothing laid); Big wrecks within 14 px; at the stop,
  Bomb blasts (unless armed), phantoms pop; overlaps test the shield first, then kill.
- **7 Melee**: deflect radius uses the boomerang's hit radius; a player kill tests the shield.
- **9 Hazards**: crushers test the shield; after everything in 02 §9, **fire** expires, spreads and
  burns whoever stands in it, then **ice** expires and hands its layer the hazard credit for anyone
  else standing on it.
- **10 Pickups**: after dropped boomerangs, the spawn clock, landings, fizzles and takes.

Events (01 §9 step 12), all with a position and where relevant a kind and a player:
`powerupWarn`, `powerupLand`, `powerupTake`, `powerupFizzle`, `powerupLost` (pushed out of a full
stack, or Fire/Ice swapped), `fireLit`, `fireOut`, `iceLaid`, `iceGone`, `steam`, `bombBlast`,
`phantomPop`, `shieldPop`, `blink`, `blinkSquash`. The demo's `?trace=1` log already prints the
human versions ("t164 Fire landed", "P0 let go of Fire for Ice", "the crate held Blink", "P1's
boomerang caught fire from a vent and lost its ice").

---

## 9. Online and determinism (feeds 05)

- Kind and placement come from the simulation RNG, never `Math.random`; the spawn clock is sim
  state; a pickup is a struct in the state, so a rollback un-takes it (GGPO, notes §2).
- Same-tick contested pickup: nearest wins, then the lower slot index. Boomerang Fu shipped the bug
  where two people took one book (1.0.6); ours is a rule.
- **Blink needs a wind-up online.** Rollbacks "always cut off some part of the startup", so an
  instant teleport is the worst case: under misprediction a player pops across the room and back
  (Keits, notes §2). Recommendation: `BLINK_WINDUP` = 3 ticks of a visible violet gather at the
  origin before the move, which also gives the squash victim a frame. Not in the demo; §11 #7.
- Fire and ice are each two typed arrays indexed by tile (laid tick, laid by) plus a list; cheap to
  snapshot. The ice test in movement reads the array, no per-player state.
- Phantom pops, shield pops, the shards along an ice trail and the steam where it meets fire are
  effects: emit them as events and let the renderer defer them past the rollback window (Infil,
  notes §2).
- Modifiers belong in the lobby (05): per-kind on/off and a spawn-rate 0.5×/1×/2× are the two
  Boomerang Fu players actually use (notes §1), and they are the cheap way to let a room decide how
  much chaos it wants (principle 12).

---

## 10. Art and build cost (feeds 04)

| Element | Sprites | Done in the demo |
|---|---|---|
| Badges | 8 glyphs, 7 × 7, on one 9 × 9 badge | yes (`src/art/powerups.ts`, validated by `check-art`) |
| Pickup on the floor | the badge, bobbing, plus a procedural shadow and sparkle | yes |
| Spawn warning | procedural ring and sparks in the kind's colour | yes |
| Floor fire | procedural embers and tongues per tile (04 may want 3–4 frames) | yes |
| Floor ice | procedural translucent slab per tile: lit rim, dark rim, fixed cracks, a drifting glint; draws in from its edges as it goes | yes |
| Shield ring | procedural dotted oval | yes |
| Big boomerang | the boomerang sprite scaled ×2 | yes |
| Phantoms | alpha and flicker on the boomerang sprite | yes |
| Speed dust, blink afterimage | existing particles and silhouette | yes |
| Sounds | nine events built from the impact kit, CC0 recordings over them where one exists | yes (`src/audio/sfx.ts`, 07 §4.6) |

No new character frames. The whole roster adds one art file and one render file; everything stays
on the existing palette plus the two new entries.

2026-10-09: the bursts these used were replaced by the shared effects of 04 §4 (a ring and sparks
in the kind's colour on landing and on pickup, smoke on a fizzle, a pair of shards on each tile an
ice trail lays and pale smoke where fire and ice meet, a ring opening and closing at the two ends
of a blink, the shield's ring bursting outward).

---

## 11. Decisions needed (Aaron)

The demo runs on the defaults in the middle column.

| # | Question | My default | Alternative |
|---|---|---|---|
| 1 | Do power-ups survive death? | **cleared on death** (01 §12): a stack is a 30 s advantage you have to defend | Boomerang Fu's rule: keep them for the whole match; the snowball is the risk/reward hook players there praise |
| 2 | Stack cap and the fourth pickup | cap 3, oldest out, Shield counts and is pushed out like anything else | Shield exempt (Boomerang Fu); or cap 2 for readability |
| 3 | Crate drops | 25 % of broken crates drop a pickup | none (pads only, cleaner objectives); or every crate |
| 4 | Curses | none | one Bamboozled-style curse, opt-out, 5 % odds, obvious on the victim, 2 s |
| 5 | Ice details | slippery floor tiles, not solid blocks; 8 s a tile; the trail flattens grass; Fire and Ice swap in the stack and cancel to steam where they cross; the layer gets hazard credit for anyone who slides off the trail | solid ice *blocks* you can hide behind and that stop a boomerang (a wall-building power, a much bigger change to 01's "the room is fixed"); shorter ice (4 s) so a trail is a moment not a floor; ice under grass leaves the grass standing; let Fire and Ice stack; no credit |
| 6 | Shield's rule | side hits only: boomerang, melee, blast, crusher | also fire and spikes (one life); or boomerangs only (Boomerang Fu) |
| 7 | Blink | instant, to any own boomerang including an armed bomb (disarms it), lands on the nearest floor, squashes | 3-tick wind-up now (§9); or no squash; or outbound-and-hang only |
| 8 | Fire spreading through grass | spreads to neighbours for its first second: a field burns in a wave | no spread (the line only); or spread once |
| 9 | Spawn pacing | first at 2 s, then every 8 s while fewer than 2 are out, 15 s to fizzle | Boomerang Fu's −20 % rate per power-up held; or 3 on the field |
| 10 | Bomb | the same boomerang blasts and comes back; the thrower is not spared | a fresh boomerang after 1 s (Boomerang Fu); or the Bomb is consumed by its blast |
| 11 | Which §5.9 maybe to try next, if any | none until the eight have been played | Invisibility (needs the darkness rooms), Long throw (cheap) |

---

## 12. Tuning constants (into `tuning.ts` with 01 §14 and 02 §12)

```
POWERUP_FIRST              = 120    # ticks after the room loads before the first warning
POWERUP_INTERVAL           = 480    # between pickups (8 s), clock runs only below MAX_ON_FIELD
POWERUP_MAX_ON_FIELD       = 2
POWERUP_WARN               = 45     # glow before it lands
POWERUP_TTL                = 900    # untaken, it fizzles (15 s)
POWERUP_PICK_RADIUS        = 10
POWERUP_CAP                = 3
CRATE_DROP_CHANCE          = 0.25

FIRE_TTL                   = 120    # a tile burns 2 s
FIRE_START                 = 24     # px of flight before the first tile
FIRE_SPREAD                = 20     # ticks between a burning grass tile catching its neighbours (first half only)

BIG_SCALE                  = 2
BIG_WRECK_RADIUS           = 14

TRIPLE_SPREAD              = 20°

ICE_TTL                    = 480    # a laid ice tile lasts 8 s, thinning over its last quarter; starts past FIRE_START like fire
# the ice itself is 01 / 02 §4.5: ICE_GRIP 0.2, ICE_FRICTION 0.94, KB_DECAY_ICE 0.93

SPEED_MULT                 = 1.35
SPEED_DASH_CD              = 15     # DASH_COOLDOWN is 30

SHIELD_KB                  = 6
SHIELD_GRACE               = 20

BLINK_SQUASH_RADIUS        = 8      # plus PLAYER_HURT_RADIUS
BLINK_WINDUP               = 3      # proposed for online (§9); the demo blinks at once

# Bomb reuses 01: BOMB_HIT_RADIUS 36, BOMB_RADIUS 40 (ring), the fuse constants for an own-deflect
```

---

## 13. What the demo builds (2026-10-09)

Everything in §5.1–5.8, §3 and §4, in every roster room and the strip, plus the 02 §4.7 vent hook
(a lit vent sets the Fire flag). Pickups land on the rooms' `p` points with the §3 clock; crates drop
them at 25 %. Badges over the head and in three HUD slots; the HUD's `ICE` readout lights on laid
ice as it does on the Icebox's. Bots: a bot with room in its stack walks to a landed pickup within
160 px (after fetching its own boomerang); bots do not yet aim an Ice throw at anything in
particular. No lobby modifiers; power-ups are either all on or all off.

Scripted stills: `?give=fire,triple` hands the local player those kinds at the start and again
after every room swap (so `?give=big,triple&walk=1,0,0&t=30` stills the fan,
`?give=fire&walk=1,0,0&t=60` the line and `?give=ice&walk=1,0,0&t=60` the trail); `?powerups=0`
stops spawns and crate drops. `?trace=1` logs every landing, take, lost badge, Fire/Ice swap, vent
ignition, shield pop and blink.

Departures from the text, all deliberate for the demo:

- No Blink wind-up (§9); the demo is local, so it blinks on the press.
- No per-held spawn throttle (§11 #9 alternative) and no spawn-rate modifier.
- The warning glow is in the kind's colour (§7); if that turns out to make pads too easy to ignore,
  a neutral glow is one constant.
- The room's own ice is not touched by either trail: a Fire line stops at the Icebox's patch and
  resumes past it, and an Ice line skips it. Only *laid* ice and fire cancel each other.
- Re-crossing an iced tile (a bounce back over the trail, a second throw) refreshes its clock
  rather than stacking; the effects and sound fire only on fresh tiles.
- Sounds are panned by position, not per player (07 §9).
