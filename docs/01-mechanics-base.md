# 01 — Base Mechanics

Status: **Draft v2** — numbers are starting points for playtesting, not final. Every constant in
this document lives in a single `tuning.ts` so they can be tweaked without touching logic.

Changes from v1: online-only (one player per browser) so aiming is done with the mouse; visible
aim indicator; hold-to-charge removed in favour of throw-to-cursor; dash has invulnerability
frames; players hold at most one boomerang and must go retrieve it if they lose it.

Scope of this doc: the core loop that exists before any hazard, power-up, or netcode is added —
players, movement, the boomerang, melee, dash, death, and the round/match structure. Arenas and
hazards (02) and power-ups (03) plug into the hooks defined here.

---

## 1. Units, time, and space

| Concept | Value |
|---|---|
| Simulation tick | 60 Hz fixed step. **All gameplay numbers are in ticks and pixels-per-tick.** |
| Internal resolution | 576 × 318 px for the reference room, up to 640 × 366 px for the largest (02 §2), scaled by an integer factor to the window |
| Tile | 16 × 16 px |
| Arena grid | The reference room (The Cellar) is 36 columns × 19 rows (576 × 304 px), drawn below a 14 px HUD strip. Aaron, 2026-10-09: "10% smaller than the original demo area" (the 40 × 21 movement floor); it replaces the 30 × 16 proposal. The other rooms keep its number of open tiles (520 ± 4 %) in footprints of their own, up to 40 × 22 (Aaron, same day: "not the same exact formatting size every single time … the same amount of total squares, organized in interesting ways that fit the room's theme"; 02 §2, §7) |
| Outer ring | The outermost ring of tiles is always solid wall, and the top wall is two rows deep (cap and face, with the torches), so the Cellar's playable interior is 34 × 16 tiles (544 × 256 px). Thicker wall masses shape the other rooms (cut corners, bays, a cross) |
| Camera | None. Every arena is a single fixed screen (like Boomerang Fu). Screen shake is a render-only effect. |
| Perspective | 3/4 top-down ("Gungeon view"). Simulation is pure 2D on the ground plane; sprites are y-sorted by their feet position. |

Positions are floats in pixels. Velocities are px/tick. The mouse cursor is converted from window
coordinates to **internal pixel coordinates** (integers) before it enters the simulation.

### Determinism rules (constrain how all simulation code is written)

The simulation must produce identical results on every client given the same inputs, because
online play will use rollback. Therefore, inside the simulation:

- No `Math.random()`, `Date`, `performance.now()`, or anything that reads the wall clock. All randomness comes from one seeded PRNG (e.g. mulberry32) stored in the game state and advanced only by the simulation.
- No `Math.sin/cos/tan/atan2/exp/pow/log`. These are not bit-identical across JavaScript engines. Directions are stored as unit vectors, never angles. `Math.sqrt`, `+ - * /`, `Math.floor/abs/min/max` are fine (`sqrt` is IEEE-exact).
- Iterate players by slot index and boomerangs by id, always in the same order. Use **collect-then-apply** for anything where order would matter (kills, melee clashes, pickups).
- State is plain data (arrays of numbers / plain objects) with no closures or class instances holding behaviour, so it can be copied and restored cheaply.
- Rendering never writes to the simulation state. Particles, shake, and sound are driven by an **event list** the simulation emits each tick.

---

## 2. Players

**One player per browser**, up to **6** per match (hard cap chosen to keep arenas readable).
Characters are purely cosmetic: every player has identical size, speed, and abilities. Each player
also has a **player colour** (used for outline, aim indicator, boomerang trail, and HUD) that is
distinct from the character art.

### Body

| Property | Value |
|---|---|
| Collision circle | radius **5 px**, centred on the feet position `(x, y)` |
| Hurtbox circle | radius **6 px**, same centre (what boomerangs and melee test against) |
| Sprite | ~14 × 18 px, anchored at the feet |

Players collide with solid tiles and with each other (soft push-apart, see §9). Players cannot
voluntarily walk into pits; see §8 for how involuntary movement differs.

### State fields

```
pos, vel          : position and movement velocity
kb                : knockback velocity (§7)
aim               : unit vector toward the cursor (§3)
heldBoomerang     : boomerang id, or −1 if empty-handed
state             : IDLE | MELEE | DASH | DEAD
stateTicks        : ticks spent in the current state
throwRecovery     : ticks until another throw/melee may start after a throw
dashCooldown      : ticks until dash is available again
invulnTicks       : > 0 while immune to boomerangs and melee (§6)
alive, team, score, kills
```

### State machine

```
IDLE ──throw pressed, holding boomerang──▶ boomerang launched, 4-tick throw recovery, stay IDLE
IDLE ──melee pressed──▶ MELEE (windup → active → recovery) ─▶ IDLE
IDLE ──dash pressed, cooldown 0──▶ DASH (8 ticks, first 6 invulnerable) ─▶ IDLE
any  ──killed──▶ DEAD (respawn after 90 ticks if lives remain)
```

Only one of MELEE / DASH is active at a time, and neither can start while the other is running.
Knockback (§7) is an additive velocity, not a state, so it can happen during any of them.

### Action poses (render-side, driven by sim state)

Every action is drawn with its own hand-drawn frames of the character, not an effect layered over
the standing sprite. The renderer picks the frame from sim state alone, so this adds nothing to
the simulation or the netcode:

| Pose | Frames | Driven by |
|---|---|---|
| Stand | 1 | `IDLE`, not moving |
| Run | 4, each character its own gait (slime slosh, Skully shuffle, shroom walk, frog hop) | `IDLE`, moving; frame = `walkT / runPeriod` (per character, 5–6 ticks); `runLift[frame]` px of body lift over the shadow, so only the hoppers leave the ground. The slime also dabs a fading smear on the floor every `SMEAR_EVERY` = 5 ticks |
| Throw | 3 (release, follow-through, settle) | the throw event; 24 ticks, 8 per frame — deliberately three times the sim recovery |
| Reach | 1 | own boomerang returning within `CATCH_RADIUS + 4 × BOOM_RETURN_SPEED` (about 4 ticks out), hands empty |
| Catch | 1 (clutch, boomerang drawn in the pose) | the catch or pickup event; 14 ticks |
| Melee | 4 (windup, swing, follow-through, recover) | `MELEE` windup, active, then the two halves of recovery |
| Roll | 6 (tuck, four tumble frames, unroll) | starts with `DASH`; 3 ticks per frame, 18 ticks, so it finishes during the slide |

2026-10-09: two more render-side motions with no frames of their own, specified in 04 §5: the
standing pose breathes (the top of the body drops a pixel for 10 ticks every 72), and a respawn
drops in from above over 14 ticks and squashes on landing instead of appearing.

Frames exist for the three facings (down, side, up). Side frames face right and are mirrored for
left; down and up action frames are drawn with the arm on the right and are mirrored when the aim
points left. Roll frames tumble to the right and are mirrored for a leftward dash. The run lift
and the held-boomerang overlay only apply while a stand or run frame is showing. A dash or melee starting
cancels a throw or catch pose; a throw, catch or melee during the slide cuts the roll short; a
catch that lands mid-dash or mid-melee shows no clutch (the body is busy) but still counts.

Poses are big and held long enough to read at 60 Hz: every frame shows for at least 3 ticks, and
the throw runs well past its 4-tick recovery. The dash has **no invulnerability flash** — the roll
itself says you cannot be hit, as with a Dark Souls roll, and the window is learned.

---

## 3. Movement and aim

| Constant | Value | Notes |
|---|---|---|
| `PLAYER_MAX_SPEED` | **1.8 px/tick** (108 px/s) | Crosses the arena interior in ~4.1 s. Deliberately under Boomerang Fu's measured walk (≈ 0.16 body-widths/tick would be 2.2) — chosen slower on feel, 2026-10-08 |
| `PLAYER_ACCEL` | 0.9 px/tick² | Full speed in **2 ticks** once the windup is over |
| `PLAYER_DECEL` | 0.9 px/tick² | Stops in **2 ticks** when input is released |
| `START_WINDUP_TICKS` | 5 | Running in place from a standstill before the feet get grip |
| Melee multiplier | ×0.5 | Speed during melee windup + active frames |

Movement is deliberately **stiff**: the heading has no inertia, only the speed does, and a standing
start costs a beat.

Each tick, with `input` the 8-directional keyboard vector (diagonals normalised to length 1):

- input held while **stationary** (`|vel| = 0`) → `windup++`, no movement for the first
  `START_WINDUP_TICKS`. The run animation plays and dust kicks up at the feet: the character is
  running in place, like Mario on ice, committing to a direction before traction arrives. Changing
  direction during the windup does not reset it; releasing the input does.
- input held while **moving** → `speed = min(|vel| + ACCEL, MAX_SPEED × stateMultiplier)`;
  `vel = input × speed`. The direction snaps to the new input instantly, so a reversal is a hard
  stop-and-go in one tick, not a curve, and it never pays the windup.
- no input → `speed = max(|vel| − DECEL, 0)`, direction unchanged; `windup = 0`.
- out of a **dash** (§6) the rules above keep applying to `vel`, but the feet also carry the
  **slide**: a second vector `slide`, set to `DASH_SLIDE_SPEED` in the dash direction when the dash
  ends, decayed by `DASH_SLIDE_FRICTION` every tick and dropped under `DASH_SLIDE_MIN`. Position
  moves by `vel + slide`. The stick never replaces the slide, it only adds to it: forward
  overshoots, sideways drifts, back holds you in place until the slide has dropped under walking
  speed. The standing-start windup is skipped while `slide` is non-zero (you are moving, just not
  where you want). Aaron, 2026-10-08: the slide exists to punish obsessive dashing; 2026-10-09: the
  punishment is unwanted movement, not a stop, and the walk has to compound with the slide rather
  than wait for it — a locked slide followed by control read as a freeze, then as a longer roll.

Measured from Boomerang Fu (see `notes-boomerang-fu-motion.md`): characters reach cruise and come to
rest within 2–3 frames, and change direction without any visible arc. Our earlier vector-integrated
model (ACCEL 0.55 applied to the velocity vector) produced ~8-tick reversals and rounded corners; it
felt loose. The hop while walking is render-only (`04`), the sim position does not bounce.

### Aim

- `aim` is the unit vector from the player's feet to the cursor's world position. If the cursor is on top of the player (length < 1 px) the previous `aim` is kept.
- `aim` updates every tick **except** during melee windup/active (locked at windup start) and during a dash (locked to the dash direction).
- Throws and melee use `aim`. Dash uses **movement input**, falling back to `aim` when no movement key is held (twin-stick convention: you dodge where you're going, not where you're looking).
- The character sprite faces `aim` (quantised to down / up / side-mirrored for the art).

### Aim indicator (render-side, driven by sim state)

Readability is a pillar, so throws are telegraphed:

- **Local player**: a dotted line in the player's colour tracing the **exact path the throw will take** — a dry run of the outbound flight (§4.2) from the current position along `aim`, reflecting off walls exactly as the real boomerang does, for the fixed `THROW_RANGE` of path length — ending in a small reticle where the boomerang will stop and hang. The dots animate outward. The preview and the flight share one function, so what you see is what you get, corner bounces included. When empty-handed the line shrinks to a single short chevron (you can still melee in that direction) and the reticle disappears.
- **Other players**: only the short chevron at their feet, in their colour, showing which way they are facing. Not their exact target point — enough to read a throw coming, not enough to remove all risk. (Every client has the full state, so this is a UI choice, not a fairness mechanism. Flagged in §13.)

---

## 4. The boomerang

Every player spawns holding **exactly one** boomerang and can never hold more than one
(`MAX_HELD_BOOMERANGS = 1`). While it is in flight you have no kill tool except deflecting. If it
is stolen, dropped, or stranded, **you have to go pick it up again.**

### 4.1 Throwing

| Constant | Value |
|---|---|
| `THROW_RANGE` | **224 px (14 tiles)** of path length, the same for every throw — wall bounces included |
| `THROW_RECOVERY_TICKS` | 4 — no throw or melee may start until it ends (dash may) |
| `THROW_SPAWN_OFFSET` | boomerang appears at `pos + aim × 8` |

- **Click to throw.** No charging: the cursor sets the **direction only**. An uninterrupted throw covers `THROW_RANGE` of path, measured through every wall bounce, then stops (§4.2). The aim indicator traces that full path; a manual hover can stop it earlier.
- **Hover once, anywhere; release to return.** After the launch click, press and hold again on either leg to brake over six ticks (100 ms), then hover, still lethal, for up to `BOOMERANG_HOVER_MAX_TICKS`. Release commits to a normal accelerating return from zero velocity, even during braking. Holding the launch click lets it fly out normally and uses the hover at the endpoint. Each throw has only one hover; later holds cannot stop its return again.
- Movement is unaffected by throwing. The 4-tick recovery exists to prevent instant melee follow-ups; the character's throw pose (release, then follow-through) plays for 24 ticks over it and is purely visual (§2, action poses).
- Throwing while a dash or melee is active is not allowed; the 6-tick input buffer fires it as soon as the state ends.

### 4.2 Flight model

Boomerang states: `HELD → OUTBOUND → HANG → RETURNING → (caught → HELD)` or `→ DROPPED`.

The flight is a **straight out-and-back with a dead stop at the far end**, not a U-turn, and the
**speed profile is parabolic**: the boomerang leaves the hand fast and loses speed at a constant
rate the whole way out, drifting to rest exactly at the end of its range, then accelerates back at
the same rate. Position over time is a parabola — the same curve as a ball tossed straight up —
even though the path itself is a straight line. Aaron chose this (2026-10-08) over the profile
measured from Boomerang Fu (`notes-boomerang-fu-motion.md`: flat cruise, then a hard brake), which
read as "moving at a constant speed and then stopping". The even older constant-speed arc with a
42 px turning radius read as floaty.

| Constant | Value | Notes |
|---|---|---|
| `BOOMERANG_RADIUS` | 10 px | Hit radius against players and melee (Aaron's number, 2026-10-08). The sprite is an 11 px chevron; wall collision uses a tighter 4 px (`BOOMERANG_WALL_RADIUS`) so bounces hug the wall face |
| `BOOMERANG_SPEED` | **9.5 px/tick** (570 px/s) | Launch speed, ≈ 5.3× player speed. Average over the flight is half that |
| `BOOMERANG_DECEL` | derived: `SPEED² / (2·range + SPEED)` | ≈ 0.197 px/tick² for a 224 px throw: 9.5 → 0 in 49 ticks, exactly `range` of path |
| `BOOMERANG_HANG_TICKS` | 3 | Motionless at the far end before turning back, still lethal. The slow approach already reads as a pause |
| `BOOMERANG_HOVER_MAX_TICKS` | 45 (0.75 s) | Longest each hold can keep it hanging |
| `BOOMERANG_RETURN_ACCEL` | = the throw's `DECEL` | Mirrors the outbound, so a full throw gets back to ≈ 10 as it reaches a stationary owner |
| `BOOMERANG_RETURN_SPEED` | 11.4 px/tick | Cap on the return |
| `BOOMERANG_BRAKE` | 0.6 px/tick² | Emergency decel once the bounce or flight cap is hit |
| `BOOMERANG_TURN_RATE` | 0.16 × speed per tick | Homing steer while returning. Far from a straight line only if the owner moved |
| `BOOMERANG_TURN_RATE_NEAR` | 0.4 × speed per tick | Within `BOOMERANG_NEAR_DIST` of the owner, so the catch lands instead of orbiting |
| `BOOMERANG_NEAR_DIST` | 48 px | |
| `BOOMERANG_MAX_BOUNCES_OUT` | 4 | Bounces during OUTBOUND before it brakes early |
| `BOOMERANG_MAX_FLIGHT_TICKS` | 240 (4 s) | Safety: brakes after this, drops at 2× |
| `BOOMERANG_CATCH_RADIUS` | 10 px | Distance to owner at which it is caught |
| `BOOMERANG_PICKUP_RADIUS` | 8 px | Distance at which a dropped boomerang is picked up |

**OUTBOUND**: launched at `SPEED × aim` with `decel = SPEED² / (2·range + SPEED)` fixed for the
throw (the discrete sum `Σ (SPEED − k·decel)` is `SPEED²/(2·decel) − SPEED/2`, which is why the
`+ SPEED` term). Every tick: `speed = max(0, min(speed − decel, range − traveled))`, direction
unchanged, then move and accumulate `traveled`. Reflects off solid tiles (velocity component normal
to the wall is negated; speed is preserved, and `traveled` keeps counting). After 4 bounces or the
flight limit `decel` is raised to `BRAKE` so it stops early. On reaching zero → HANG.

A 14-tile throw: 224 px over 49 ticks → stops after 0.82 s, having covered half the distance in
the first 13 ticks and crawling through the last tile at under 2 px/tick. Bounces do not reset
`traveled`: a throw into a nearby wall comes most of the way back past the thrower before it
stops, which is how you hit someone standing behind you.

**HANG**: motionless and still lethal, at the natural endpoint or after manual braking. A manual
hover consumes the throw's single hover immediately. Over at most six ticks its speed falls to
zero along the current direction; outbound walls still reflect it. Braking does not change the
normal return acceleration. It then stays still until release or `HOVER_MAX_TICKS`. Releasing
during braking also commits to returning once stopped, even if pressed again before the stop.
Only the natural, unheld endpoint has a minimum `HANG_TICKS` pause. The used hover is not restored
by deflecting. Armed fuse boomerangs and Triple's phantoms cannot hover.

**RETURNING**: each tick, `speed = min(|vel| + RETURN_ACCEL, RETURN_SPEED)`;
`desired = normalize(owner.pos − pos) × speed`; `vel` moves toward
`desired` by at most `TURN_RATE × speed + RETURN_ACCEL` (`TURN_RATE_NEAR × speed + RETURN_ACCEL`
inside `NEAR_DIST`). Because every return starts from rest its first ticks point straight at the
owner, so a stationary thrower sees it fly back along the same line it went out on. Flies **over**
walls and obstacles (it is coming home). When within `CATCH_RADIUS` of the owner:
- owner is empty-handed → **caught**, back to HELD;
- owner already holds a boomerang (possible after a steal, §4.3) → it **DROPs at the owner's feet**.

**DROPPED**: lies on the ground, decelerating by ×0.85 per tick until still. Harmless. Any
**empty-handed** player who overlaps it (radius 8) picks it up and becomes its owner. A player's
own dropped boomerang is outlined in their colour so they can find it; the HUD also shows an
"empty-handed" icon next to their score. Dropped boomerangs are cleared at round end.

Sub-step the integration (moves of ≤ `BOOMERANG_SUBSTEP` = 8 px) so even a fast
boomerang cannot tunnel through or end a tick inside a 16 px wall.

Boomerangs fly **over** pits and tall grass (grass gets cut, see 02). They break crates and continue
(see 02).

### 4.3 Lethality and ownership

- A boomerang in OUTBOUND, HANG or RETURNING **kills any player it overlaps except its current owner**, at any speed — a boomerang crawling to its stop, hanging or hovering at the end of its throw is just as deadly as one at launch speed — unless that player is invulnerable (dashing, §6), in which case it passes straight through. It continues flying after a kill. Only DROPPED is harmless.
- **Ownership transfers on deflect** (§5). The original thrower is then vulnerable to their own boomerang, and it returns to the deflector: if the deflector is empty-handed they catch it (a clean steal); if they already hold one it drops at their feet, stranded under their guard. Either way the thrower is now weaponless and has to go get it.
- An **armed** boomerang (§5, arming your own boomerang) also kills with its blast, the owner included; only dash invulnerability saves you.
- Kill credit goes to the owner at the moment of impact (for stats; it does not affect scoring).

### 4.4 When the owner dies

- A boomerang **in hand** drops at the death position with a small seeded random velocity (1–2 px/tick).
- A boomerang in **OUTBOUND** finishes its outbound phase, drifting to its stop (still lethal — posthumous kills are allowed and are funny), and then DROPs where it stopped instead of hanging and returning.
- A boomerang in **HANG** or **RETURNING** drops immediately.

---

## 5. Melee

| Constant | Value |
|---|---|
| `MELEE_WINDUP` | 3 ticks |
| `MELEE_ACTIVE` | 4 ticks |
| `MELEE_RECOVERY` | 8 ticks — cannot melee again until it ends (15-tick total cycle, 0.25 s) |
| Hitbox | circle radius **11 px**, centred at `pos + aim × 10` (≈21 px reach, ~120° effective arc) |
| `CLASH_IMPULSE` | 4 px/tick knockback to both players |
| `PUNCH_IMPULSE` | 5 px/tick knockback to the target |
| `DEFLECT_SPEED` | 7.125 px/tick — launch speed of a deflected boomerang; it decelerates to rest over `DEFLECT_RANGE` like a throw (`decel` ≈ 0.22) |
| `DEFLECT_RANGE` | 112 px (7 tiles) — outbound range of a deflected boomerang |
| `DEFLECT_GRACE` | 1 tick — the swing keeps deflecting boomerangs (not killing) for this long after its active frames, so the deflect window is 5 ticks against a 4-tick kill window. Aaron asked for deflects to be "more forgiving but still hard, ~20% more time" (2026-10-08) |
| `BOMB_SPEED_MULT` | 0.8 — launch speed multiplier for an armed boomerang (7.6 px/tick, slower than a throw: it is heavy now, not fast. Aaron, 2026-10-08) |
| `BOMB_RANGE` | 157 px — 70 % of `THROW_RANGE`, the armed flight |
| `BOMB_PAUSE` | 15 ticks at rest, quiet, before the first beep |
| `BOMB_BEEP_GAP` | 10 ticks from the first beep to the second |
| `BOMB_BEEP_LEN` | 3 ticks each beep flashes white |
| `BOMB_SHRINK` | 12 ticks of shrinking after the second beep |
| `BOMB_FUSE` | `PAUSE + GAP + LEN + SHRINK` = 40 ticks (0.67 s) from coming to rest to the blast |
| `BOMB_RADIUS` | 40 px (2.5 tiles) — radius of the drawn blast ring |
| `BOMB_HIT_RADIUS` | 36 px — the kill radius, 90 % of the ring, owner included. The drawing is deliberately a shade bigger than the hitbox so the visible edge is safe (Aaron, 2026-10-08) |

`aim` locks at the start of windup. Movement is ×0.5 during windup and active frames.

**With the boomerang in hand ("slash")** — anything in the hitbox during active frames:

- Enemy player → **killed** (sliced). Invulnerable (dashing) players are not affected.
- Boomerang in flight (any owner, including your own; OUTBOUND, HANG or RETURNING) → **deflected**: owner becomes the attacker; state becomes OUTBOUND with `vel = aim × DEFLECT_SPEED`, `range = DEFLECT_RANGE`, `traveled = 0`, `decel` recomputed for the new speed and range, active hover/braking and bounce count reset; a used hover stays used. One deflect per boomerang per swing. The deflect check also runs for `DEFLECT_GRACE` ticks after the active frames end, so a swing that was a hair early still connects with the boomerang.
- Crate → broken (02). Tall grass → cut (02).

**Arming your own boomerang** (Aaron, 2026-10-08). A deflect that connects with a boomerang you
*already own* — your own throw on its way out or back — **arms** it instead of merely redirecting it.
(A first version had an intermediate "supercharged" level; Aaron cut it the same day: the first
smack is the bomb.)

- It relaunches along your aim at `BOOMERANG_SPEED × BOMB_SPEED_MULT` (8 px/tick, a touch slower than a throw) with an orange
  hue and a heavier trail, covers `BOMB_RANGE` (70 % of a throw) with the usual parabolic profile,
  and comes to rest. It does not return.
- The **fuse** then runs where it sits: quiet for `BOMB_PAUSE`, **beep** (white flash, small ring,
  blip), `BOMB_BEEP_GAP` later a second **beep**, then over `BOMB_SHRINK` ticks the boomerang
  **shrinks** to a dot and its glow tightens with it, and at `BOMB_FUSE` it **explodes** outward:
  every player within `BOMB_HIT_RADIUS` dies, the owner included (dash invulnerability still saves
  you). The ring is drawn out to `BOMB_RADIUS`, 10 % wider than the kill radius.
  The boomerang drops where it went off, disarmed, so the thrower has to go and get it.
- An armed boomerang is lethal on contact throughout like any flying boomerang, finishes its fuse
  even if its owner has died in the meantime, and smacking it again (owner or not) relaunches it
  armed and restarts the fuse once it lands. A **steal** never arms a boomerang; it only keeps one
  armed.

The outbound integration is sub-stepped in ≤ `BOOMERANG_SUBSTEP` px moves so a fast boomerang
cannot end a tick inside a 16 px wall.

**Empty-handed ("punch")** — same hitbox and timing, but:

- Enemy player → knocked back by `PUNCH_IMPULSE` along `aim`. Not killed.
- Boomerang in flight → deflected exactly as above. Since you are empty-handed, a deflected boomerang returns to you and you **catch it** — this is the main way to re-arm without walking to your own boomerang.

**Clash**: if two players' active windows overlap on the same tick and each is inside the other's
hitbox, neither dies; both receive `CLASH_IMPULSE` away from each other and a spark effect fires.
Resolved before kills are applied (collect-then-apply), so it is independent of player order.

---

## 6. Dash

| Constant | Value |
|---|---|
| `DASH_SPEED` | 5.13 px/tick (5% less than 5.4, 2026-10-11) |
| `DASH_SLIDE_SPEED` | 3.8 px/tick carried out of the dash as the slide's starting speed |
| `DASH_SLIDE_FRICTION` | ×0.93 per tick on the slide — above walking speed for 11 ticks, gone after ≈ 41 |
| `DASH_SLIDE_MIN` | 0.2 px/tick — the slide is dropped below this |
| `DASH_TICKS` | 8 → 43 px, a hair under 3 tiles |
| `DASH_INVULN_TICKS` | **6** — the first 6 of the 8 ticks are invulnerable (100 ms, 32 px) |
| `DASH_COOLDOWN_TICKS` | 30 after the dash ends (one dash every ~0.63 s) |
| `SHOVE_IMPULSE` | 4 px/tick |

- Direction = movement input at press time (`aim` if no movement key is held). Locked for the duration; movement input is ignored until the dash ends.
- **Invulnerability**: during the first 6 ticks the player cannot be killed by boomerangs or melee — boomerangs pass through without being deflected, slashes whiff. Hazards from 02 declare individually whether a dash dodges them (saw blades: yes; fire: no). Pits are unaffected because dashing is voluntary movement and cannot enter them. The last 2 ticks are vulnerable, which is the punish window for a predictable dash.
- Readability: the dash is drawn as a roll (§2, action poses) with an afterimage trail. There is no invulnerability flash — the roll is the tell, as with a Dark Souls roll, and players learn where the window ends. A boomerang passing through an invulnerable player emits a "whiff" event (small spark, soft sound).
- **Shove**: on overlapping another player during a dash, that player receives `SHOVE_IMPULSE` in the dash direction and the dash ends early (invulnerability ends with it). Shove is the only way to move an opponent against their will, and it can push them into a pit.
- Dash cannot start during melee windup/active or throw recovery; the input buffer fires it afterwards.
- **Slide-out**: the dash does not end in a walk, and it does not end in a lockout either. At `DASH_TICKS` the dash speed becomes the **slide**, a base velocity of `DASH_SLIDE_SPEED` in the dash direction that `DASH_SLIDE_FRICTION` bleeds off over ≈ 41 ticks (0.7 s), and the stick works the whole time **on top of it** (§3): the walk is added to the slide, never substituted for it. Measured on the demo floor, from where the dash ends (48 px at the time; it is now 41 px and the slide starts at 3.8 px/tick; the measurements below predate the 5% reduction): no input drifts ≈ 53 px; forward held compounds to ≈ 5 px/tick and covers ≈ 123 px; sideways held walks across at full speed while still drifting the same 53 px forward; back held is still carried ≈ 12 px forward for 11 ticks before it starts gaining, and takes ≈ 27 ticks to get back to where the dash ended. That is the punishment: not a stop, but movement you did not ask for, and chaining dashes chains it (Aaron, 2026-10-08: "punish the player for obsessive dashing"; 2026-10-09: "punished with unwanted movement", "the movement adds, so the slide is a base speed for a little bit"). Throw, melee and another dash are allowed throughout (a new dash discards the slide). A dash stopped by a wall ends dead with no slide; a wall or pit edge also kills the slide on that axis, and like the dash itself the slide is voluntary movement that cannot enter a pit. On ice (02 §4.5) the slide decays at `ICE_SLIDE_FRICTION` instead and carries much further.

A freshly thrown boomerang at 10 px/tick crosses a player's hurtbox in about 2 ticks, so a reactive
dash still dodges it cleanly, but the window to react is tight (a 14-tile throw covers its first
half in ~0.2 s and reaches the far end in 0.77 s); a dash started too early leaves the vulnerable
tail exposed. That is the intended skill test. Near the end of the flight the boomerang is slow but
still lethal. A hovering one accelerates from rest when released, so judge the dash by its
position and current speed.

---

## 7. Knockback

Knockback is a separate velocity vector `kb` added to movement each tick and multiplied by
**0.8** per tick (gone in ~10 ticks). While `|kb| > 0.5` the player counts as **involuntarily
moving**: walls still block, but **pits do not** (§8). Sources: shove, punch, clash. Later
hazards (bumpers, explosions) reuse it. Knockback does not interrupt melee or dash; it just moves
the player.

---

## 8. Death and the ground

One hit costs one life. Each round starts with 3, 5 or 7 lives per player (default 3). A player with
lives remaining respawns after 90 ticks (1.5 seconds), with 120 ticks (2 seconds) of spawn protection. This also blocks floor fire, floor hazards and enemy dash shoves.

| Cause | Visual |
|---|---|
| Boomerang / slash | Sprite is **sliced**: split into two halves along the hit direction that fly apart and fade, plus a burst of player-colour pixels |
| Fall into pit | Shrinks/fades downward with a puff |
| Hazards (02) | Per hazard |

Pit rule: a player whose feet centre is over a pit tile **while involuntarily moving** falls and
dies. Voluntary movement (walking, dashing) treats pits as walls. Boomerangs ignore pits entirely.

Dead players cannot act while waiting to respawn. At zero lives they spectate until the next
round, which refills everyone’s lives. The HUD distinguishes lives (L) from round wins (W).

On any death, all clients run 18 simulation ticks of slow-motion: 60% speed at first, easing
back over the last six ticks (about half a second total). A local camera zoom eases up to 9%
toward the death and back without scaling the HUD. Mouse input uses the inverse view transform.
Music tempo dips by 10% for 0.6 seconds, easing in and out per note without restarting the song.
OPTIONS → DEATH ZOOM affects only the camera; shared timing never depends on a local preference.

---

## 9. Tick order

Fixed order every tick; this is the spec for `step(state, inputs)`:

1. **Inputs** — latch this tick's input for every slot (movement, cursor position, buttons); detect press edges; apply the 6-tick input buffer (a press during a non-actionable state fires as soon as the state allows). Recompute `aim` for players whose aim isn't locked.
2. **Player timers** — advance melee phase, dash, throw recovery, cooldowns, `invulnTicks`; decay knockback.
3. **Throws** — launch boomerangs for players who pressed throw and are allowed to.
4. **Player movement** — compute target velocity, accelerate, add knockback, integrate X then Y against the tile grid with sliding. Dash uses its own fixed velocity.
5. **Player separation** — for each overlapping pair, push each apart by half the overlap; re-resolve against walls.
6. **Boomerangs** — sub-stepped integration, wall bounces, state transitions, crate hits; **collect** overlaps with non-invulnerable, non-owner players (not applied yet). Emit `whiff` for invulnerable overlaps.
7. **Melee** — for every player in active frames, **collect** targets (players, boomerangs, crates). Detect clashes.
8. **Resolve** — apply clashes (remove those players from each other's kill lists), then deflects (ownership transfers), then kills (all simultaneous — mutual kills are possible), then knockbacks and shoves.
9. **Hazards** — pit falls, and any hazards from 02.
10. **Pickups** — dropped boomerangs (empty-handed players only), power-ups.
11. **Round state** — check alive count and timer (§10).
12. **Events out** — the tick's event list goes to the renderer/audio.

---

## 10. Round and match flow

```
LOBBY → [ARENA INTRO → READY → PLAYING → ROUND END → RESULTS]×N → MATCH END → (rematch → LOBBY)
```

| Phase | Length | Notes |
|---|---|---|
| Arena intro | 30 ticks | Arena name slides in; players appear at spawns holding their boomerang |
| READY | 60 ticks | "READY… GO!" — sim runs but all inputs are ignored (aim still updates so indicators are live) |
| PLAYING | Until ≤1 player has lives remaining | Respawn until eliminated |
| ROUND END | 45 ticks | Triggered when ≤ 1 player has lives remaining. Sim frozen; winner callout and slow-mo on the final kill |
| RESULTS | 90 ticks | Score pips update; skip-able by any player after 30 ticks |

- **2v2**: Gold and Teal, exactly two players per team, humans or bots. Lives are individual, not pooled. Eliminating one teammate leaves the other playing 1v2. Friendly fire is off for weapons, bombs, fire and blink; allies do not dash-shove or steal each other’s flying boomerangs. Teammates spawn on the same side, and bots target enemies. The last team with lives gets one round win credited to both teammates.
- **Scoring (free for all)**: last player with lives remaining gets **1 point**. Players waiting to respawn still count. If the last two lose their final lives on the same tick, the round is a **draw** — no points.
- **Match**: first to `MATCH_TARGET_SCORE` (default **5**; lobby option 3/5/7/10) wins. No "win by two".
- **Timer**: elapsed time, with no one-minute draw cutoff. Lives determine when the round ends.
- **Arena rotation**: shuffled (seeded) list of all enabled arenas, no repeats until exhausted.
- **Spawns**: each arena defines ≥ 6 spawn points; assignment is a seeded shuffle each round.
- **Match end**: podium ordered by score, then kills. Rematch keeps the lobby; everyone back to 0.

---

## 11. Input

Each browser controls exactly one player with **keyboard + mouse**. Inputs are sampled once per
tick into a compact struct — this is also exactly what gets sent over the network:

```
moveX, moveY   : −1 | 0 | 1 per axis (keyboard)
aimX, aimY     : cursor position in internal pixel coordinates (int16 each, 0..479 / 0..269)
throw          : held (bit)
melee          : held (bit)
dash           : held (bit)
```

8 bytes per tick per player. Press edges are derived in the sim from the previous tick's struct;
the `throw` bit's *held* state is also read directly by an airborne boomerang (hover, §4.2).
Sending the cursor *position* rather than an angle keeps the struct integer-only (deterministic
across clients) and gives the sim the aim direction.

### Default bindings (all remappable)

| Action | Default | Alternate |
|---|---|---|
| Move | W A S D | Arrow keys |
| Aim | Mouse cursor | — |
| Throw (hold again to brake into one hover per throw, release to return) | Left mouse button | — |
| Melee | Right mouse button | F |
| Dash | Space | Shift, or middle mouse |
| Pause / menu | Esc | — |

The cursor is always visible as a small custom crosshair in the player's colour. Gamepad support
(left stick move, right stick aim with stick magnitude as range) is a later nice-to-have, not v1.

For local testing, two browser tabs on one machine are two players.

---

## 12. Hooks for later specs

Defined here so 02/03 can attach without changing the core:

- **Tile kinds** (02): `floor`, `wall` (solid, bounces boomerangs), `pit` (blocks voluntary movement, lethal to involuntary movement, boomerangs fly over), `grass` (hides players, cut by boomerangs/melee), `crate` (solid, breakable). The tick order reserves step 9 for dynamic hazards (saw blades, bumpers, moving platforms) and step 10 for pickups. Each hazard declares whether `invulnTicks` protects against it.
- **Boomerang effect flags** (03): a boomerang carries a small bitfield set at throw time (fire, explosive, big, bounce…). Flags persist through deflects, so a stolen fire boomerang stays on fire. 03 §5 fills this in as Fire, Bomb, Big, Triple, Ice.
- **Player power-up set** (03): per-player set of held power-ups, cleared on death (03 §11 #1 asks whether to keep them across deaths as Boomerang Fu does). Power-ups spawn at arena-defined points on a seeded timer and from crates. Power-ups that give "extra boomerangs" are temporary projectiles, not held items — the one-boomerang rule is never bent (03 §5.4 Triple's phantoms).
- **Teams** (later): a `team` field per player; kill rules consult it. Default is every player on their own team.

---

## 13. Open questions (defaults chosen so building can start)

Decided in v2: mouse aim (yes), dash invulnerability (yes, 6 of 8 ticks), max one boomerang.

| Question | Default in this spec | Alternative |
|---|---|---|
| Hold-to-charge throws | Removed; fixed maximum 14-tile range, mouse sets direction only. A new hold stops it anywhere; release returns from zero speed | Range from cursor distance was tried in the demo and dropped — throws stopped short unpredictably |
| Opponents' aim visibility | Facing chevron only | Full dotted line + reticle for everyone (maximum readability) |
| Dash i-frame coverage | Boomerangs + melee, hazards opt-in | Boomerangs only |
| Can shoves push players into pits? | Yes | Pits block all movement |
| Deflect steals ownership? | Yes | Deflect only redirects; original owner keeps it |
| Character theme | Dungeon critters (slime, skeleton, mushroom, bat, frog, imp…) — fits the Gungeon palette | Anything; purely cosmetic |
| Working title | *Boomerangeon* | — |

---

## 14. Tuning constants (single source of truth → `tuning.ts`)

```
TICK_RATE                  = 60
TILE                       = 16
MAX_ARENA_COLS, MAX_ARENA_ROWS = 40, 22   (the Cellar is 36 × 19)
OPEN_TILE_BUDGET           = 520          (± 4 %, per room)
HUD_HEIGHT                 = 14
MAX_PLAYERS                = 6

PLAYER_RADIUS              = 5
PLAYER_HURT_RADIUS         = 6
PLAYER_MAX_SPEED           = 1.8
PLAYER_ACCEL               = 0.9
PLAYER_DECEL               = 0.9
START_WINDUP_TICKS         = 5
MELEE_SPEED_MULT           = 0.5
INPUT_BUFFER_TICKS         = 6

DASH_SPEED                 = 5.13   # 5% slower; 41.04 px over eight ticks
DASH_TICKS                 = 8
DASH_INVULN_TICKS          = 6
DASH_COOLDOWN_TICKS        = 30
DASH_SLIDE_SPEED           = 3.8
DASH_SLIDE_FRICTION        = 0.93   # the walk is added on top of the slide, never replaces it
DASH_SLIDE_MIN             = 0.2
SHOVE_IMPULSE              = 4
PUNCH_IMPULSE              = 5
CLASH_IMPULSE              = 4
KNOCKBACK_DECAY            = 0.8

MELEE_WINDUP               = 3
MELEE_ACTIVE               = 4
MELEE_RECOVERY             = 8
MELEE_REACH                = 10
MELEE_RADIUS               = 11

THROW_RANGE                = 224
THROW_RECOVERY_TICKS       = 4
THROW_SPAWN_OFFSET         = 8
MAX_HELD_BOOMERANGS        = 1

BOOMERANG_RADIUS           = 10
BOOMERANG_WALL_RADIUS      = 4
BOOMERANG_SPEED            = 9.5
BOOMERANG_DECEL            = SPEED² / (2·range + SPEED)   # per throw; 0.218 at 224 px
BOOMERANG_HANG_TICKS       = 3
BOOMERANG_HOVER_MAX_TICKS  = 45
BOOMERANG_RETURN_ACCEL     = BOOMERANG_DECEL
BOOMERANG_RETURN_SPEED     = 11.4
BOOMERANG_BRAKE            = 0.6
BOOMERANG_TURN_RATE        = 0.16   # × speed
BOOMERANG_TURN_RATE_NEAR   = 0.4    # × speed
BOOMERANG_NEAR_DIST        = 48
BOOMERANG_MAX_BOUNCES_OUT  = 4
BOOMERANG_MAX_FLIGHT_TICKS = 240
BOOMERANG_CATCH_RADIUS     = 10
BOOMERANG_PICKUP_RADIUS    = 8
BOOMERANG_DROP_FRICTION    = 0.85
DEFLECT_SPEED              = 7.125
DEFLECT_RANGE              = 112
DEFLECT_GRACE              = 1
BOOMERANG_SUBSTEP          = 8
BOMB_SPEED_MULT            = 0.8
BOMB_RANGE                 = 157    # 0.70 × THROW_RANGE
BOMB_PAUSE                 = 15
BOMB_BEEP_GAP              = 10
BOMB_BEEP_LEN              = 3
BOMB_SHRINK                = 12
BOMB_FUSE                  = 40     # PAUSE + GAP + LEN + SHRINK
BOMB_RADIUS                = 40     # drawn ring
BOMB_HIT_RADIUS            = 36     # 0.9 × BOMB_RADIUS, the kill radius

ROUND_INTRO_TICKS          = 30
ROUND_READY_TICKS          = 60
ROUND_TIME_LIMIT_TICKS     = 3600
ROUND_END_FREEZE_TICKS     = 45
ROUND_RESULTS_TICKS        = 90
MATCH_TARGET_SCORE         = 5
```
