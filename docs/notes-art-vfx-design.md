# Notes — art, effects and atmosphere (research behind docs/04)

Gathered 2026-10-09 by four research passes, then condensed. Tags follow the convention of the
other notes: **[V]** a source was fetched and says this (URL in §6); **[M]** from memory, not
checked this session; **[I]** our inference for Boomerangeon. Web search was largely blocked
during the passes (captchas, 402s from the wikis, 403 from Medium), so the verified material is
what could be reached directly: YouTube transcripts, raw GitHub source, the MediaWiki API, the
Reddit archive, MDN, W3C and Microsoft, and the game-developer.com deep dives. The gaps are
listed honestly at the end of each section. Where 04 cites "notes §n" it means this file.

---

## 1. What Enter the Gungeon and Boomerang Fu actually do

### 1.1 Gungeon (Dodge Roll, 2016)

- **One artist.** Joe Harty drew the whole game on a four-person team and chose "a simple design to
  offer more content". Pixel art is "not retro, it is a component". Influences: Looney Tunes, Mario
  ("even mountains have faces"). [V] The Bullet Kin was the first enemy and set the tone; they have
  no arms, just floating "nub-nubs". [V]
- **Pixel-perfect is the intended look.** The game's own option text for Pixel Perfect begins
  "Intended Visual Design, makes our artist…". [V] Internal 480×270 integer-scaled, 16 px tiles,
  Gungeoneers about 16–20 × 22–26 px. [M]
- **Readability by saturation.** Dark, desaturated, floor-specific environments against saturated
  characters, bullets and effects; enemy bullets are red, pink or yellow so they read on any floor.
  [M], reason [I]. Every actor has a dark oval drop shadow and a dark hue-shifted outline. [M]
- **Dodge roll:** about 0.7 s, eight directions, immune for the first half minus a frame or two,
  vulnerable for the second half, 3 contact damage and knockback when rolling into an enemy. [V]
  Dust at take-off and landing, no i-frame flashing. [M]
- **What they let players turn down** (from the game's string table): Screen Shake Amount as a
  *slider*, Co-op Gun Shake Reduction, Debris Quantity, Lighting Quality, Shader Quality, Realtime
  Reflections, Scaling Mode. [V] No flash or photosensitivity toggle. [V] A patch (V2.1.8) "fixed
  some screen shake values", so shake is tuned per event. [V] Reading: shake fires on your own gunfire
  and stacks in co-op; debris is numerous and persistent enough to need a cap; lighting is real-time. [I]
- **Permanence:** shell casings stay on the floor until the room is clear and then slide to the
  player. [V] Fallen Bullet Kin leave a fire patch; the corpse becomes floor debris. [V]/[M] Spent
  brass bounces and persists under the Debris Quantity cap. [M]
- **Hit flash** white on damage; on the player being hit a brief freeze and a red screen-edge
  flash. [M] Distortion effects only on exotic weapons (Black Hole Gun, Tangler). [V]
- Torches and braziers as point lights with flicker, dark falloff, dust and embers on some floors. [M]

### 1.2 Boomerang Fu (Cranky Watermelon, 2020)

- **Team:** Paul Kopetko (design, code, sound), Julian Wilton (art direction), freelance 3D artists;
  Unity. Influences named: TowerFall, Duck Game, Nidhogg, Lovers in a Dangerous Spacetime, J.S.
  Joust. [V]
- **Readability rules for six players, in the art director's words:** "1. Strong silhouettes they
  could be easily identified 2. Strong colours, so you can easily see your character while scanning
  across the screen. We didn't include a food item if that colour was already used." A Swiss Cheese
  character was cut for being Banana's yellow. [V]
- **Deaths are per character** [V]: the default is sliced in half; Banana, Carrot and Pineapple
  fall into slices; Burger separates into ingredients; Avocado loses its pit; Fries slide out of
  the box; Milk and Boba spill; Hot Sauce, Coffee and Ramen shatter and leave a puddle. Burned
  bodies turn black and fall over. Frozen bodies shatter; crushed and drowned have their own.
- **The most criticised effect was the final-kill slow motion**: "super distracting… especially
  when you are not the person who is doing the killing"; Golden Boomerang "almost unplayable". A
  "Disable slow-mo" option shipped in v1.0.6 a week after launch; v1.0.8 made only the Golden
  Boomerang holder trigger it in that mode. [V]
- **Options at launch:** Screen shake on/off ("for certain in game events such as an explosion"),
  Freeze frames, Quality, vibration. Kopetko: the freeze-frame toggle "only controls a subtle
  visual effect that some people might be sensitive to". So hit-stop and slow-mo are separate
  systems, each with a switch. [V]
- **Power-up visuals** [V]: explosive = a series of flashes at the end of the flight, then a large
  circular blast; fire = a burning ground trail for a few seconds, burning players leave their own
  short trail, fire on ice or wet ground *smokes instead of lighting*; ice = a pale-blue trail,
  standing in it slows and tints you bluer, then an ice cube "with panicked faces", mash dash to
  break out, frozen players shatter when hit; shield = knockback plus 1 s invulnerability; the
  boomerang matches its owner's colour and turns grey when the owner dies.
- About 5 % of rounds on some maps are night rounds with rain and lightning; never on maps with
  drop-offs. [V] Fire, steam and leaf particles were reworked post-launch (v1.0.7) for look and
  performance. [V] Four-second replays after a round. [V]

### 1.3 Nuclear Throne and TowerFall [M throughout]

Nuclear Throne: camera kicks toward the aim on every shot, muzzle flash on the first frame, white
hit flash, corpses, permanent scorches and casings, a screenshake percentage and a freeze-frames
toggle. TowerFall: the final kill of a round triggers slow motion; archers burst into feathers;
arrows stick in corpses and walls; light shake, brief freeze on kills. Boomerang Fu names TowerFall
as an inspiration, so the slow-mo is probably inherited. [I]

### 1.4 What it means for us [I]

- Colour is a player-identity budget: one saturated hue per player on dark desaturated rooms; no
  power-up or hazard may reuse one. (Done: 04 §3.)
- Per-character death pieces are cheap personality: a slime splash, Skully's bones, a shroom cap,
  frog halves. A handful of pieces plus simple physics. (Not done: 04 §10 #5.)
- Ship the toggles from day one, as *both* games did after the fact: shake as an amount, hit-stop,
  flashes and any slow-mo as separate switches. (Done as URL params: 04 §9.)
- If there is ever a slow-mo it is for the round-deciding kill only and never in modes with
  respawns; Boomerang Fu had to patch exactly this. (Belongs to 06, round flow.)
- The boomerang going grey when its owner dies is a readability trick worth stealing. (Not done.)
- Fire on ice smoking instead of lighting is a rule 03 should have. (03 §11, fire spread.)

**Gaps.** Gungeon's resolution, sprite sizes, frame counts, shake magnitudes and hit-stop frames
are all [M]; no GDC talk or art-book content could be reached. Boomerang Fu's last-kill camera,
confetti, pickup glow, dash puffs and slow-mo time scale are unconfirmed.

---

## 2. Pixel animation principles

From Pedro Medeiros (Saint11), Raymond Schlitter (Slynyrd), Derek Yu, and Mark Ferrari's colour
cycling talks; tutorials were reachable, so most of this is [V] to the tutorial pages, with the
exact frame counts [M] where the page is an image.

- **Frame rate.** 80–100 ms a frame for ordinary motion (5–6 ticks at 60 Hz); bullets and fast
  effects at 60 ms; slow idles 160 ms. Slynyrd's eight-frame run at 80 ms, four-frame at 160 ms. [V]
- **Idle:** 2–6 frames; the body drops a pixel and the mass stays constant (what goes down must go
  out). Loops of *different lengths* and random start phases so a crowd never pulses together. [V]
- **Run:** four key poses mirrored (contact, down, passing, up); a top-down run at 26×32 bobs the
  head −1, −1, +2. [V]
- **Attack:** about 3 frames plus 3–4 of recovery, the last recovery frame overshooting; "no
  anticipation frame or players feel input lag" for anything the player triggers. Anticipation
  belongs to enemies and hazards, where it is the telegraph. [V]
- **Death:** the first frame is the strongest; squash, compress, then a white or black *contrast
  frame*, then the explosion or the pieces; gravity before fade. [V]
- **Roll:** about 7 frames for a tumble. [V]
- **Smoke:** frame one has a dark contrast dot; 3–4 frames over 10–20 ticks. **Explosion:**
  flash → blast → fire → smoke, four frames at least; the fire fades fast and the smoke slow; a
  fire wave every 2–3 frames. **Sparks** resolve in three frames with a blank flicker frame. [V]
- **Impact:** a one-frame pause only for big hits; shake the camera *and* the target. [V]
- **Palette:** 16–32 colour palettes; ramps shift hue about +20° as they lighten, never toward
  pure black or white; avoid saturated-and-bright except in effects; projectiles get a light outline,
  actors a dark one; selective outlines; never anti-alias the outer edge. [V] Colour cycling for
  water, fire and light at no frame cost (Ferrari). [V]
- Gungeon's dodge roll ≈ 0.7 s with i-frames in the first half [V]; 480×270 and 16 px tiles [M].

**Frame-count table the tutorials add up to** (04 §7 is our comparison):

| Thing | Frames | Ticks |
|---|---|---|
| idle | 2–4 | 36–40 per loop |
| run | 4–6 | 5–6 per frame |
| throw | 3 + recovery | ≈ 24 |
| catch | 2 | ≈ 10 |
| melee | 3 + 3–4 | 24–30 |
| roll | 6–7 | 30–42 |
| death | 1 impact + 1 white + physics | — |
| spawn-in | 4–6 | 24–30 |
| torch | 3–4 | 6–8 per frame, random start |
| dust puff | 3–4 | 10–20 |
| explosion | ≥ 4 | 24–40 |
| freeze burst | — | ≈ 16 |
| hit spark | — | 8, plus a 2–4 tick pause |
| ambient | — | 2–8 fps, low contrast |

Where we differ on purpose: the roll is 6 frames in 18 ticks because 01's dash is 8 ticks plus a
slide, not a 0.7 s Gungeon roll; the throw holds its three frames for 24 ticks because the pose is
what the other players read; the idle is one frame plus a procedural breath instead of drawn frames
(Aaron is not an artist). [I]

---

## 3. Game feel: hit-stop, shake, flash

### 3.1 The talks and the code

- **Nijman, "The Art of Screenshake" (Vlambeer, INDIGO 2013)** [V, transcript]. Thirty tricks
  added one at a time to a platform shooter; the ones that matter here: muzzle flash as "just the
  first frame of your bullet sprite"; impact effects so "something hit here"; hit animation = "a
  white flash and a slightly different pose"; permanence (corpses, casings that "stay forever");
  camera lerp and aim bias; **sleep** "for 20 milliseconds or something… your brain won't notice
  that but kind of use that time to process what's happening" on hit and death; camera *kick*
  opposite the shot, separate from random shake; big explosions as a circle flashing black to
  white; lingering smoke; a 10 fps fake slow-motion on the death moment. Q&A: "We had to put like an
  option in Nuclear Throne to disable the screen shake because some people were getting really
  nauseous"; shake "gets kind of addictive… you stop noticing it and then everybody else throws up";
  "don't put things in your game that hurt people physically". The only number in the talk is the
  20 ms sleep, about one frame at 60 Hz.
- **Jonasson & Purho, "Juice It or Lose It" (2012)** [V, transcript and source]. Juice is "maximum
  output for minimum input" layered on an *unchanged* simulation: "we're not changing the game at
  all". Order of additions: colour, tweening with overshoot, the `x += (target − x) × 0.1` ease,
  squash and stretch, white flash then fade back, everything pulsing on a hit, sound ("the most
  cost-effective thing"), particles, screen shake ("powerful… be careful"). Demo defaults: trail
  length 30, shake power 0.5, freeze settings present but defaulting to 0.
- **Swink, "Game Feel: The Secret Ingredient" (2007)** [V]. Feel = input, response, context,
  **polish**, metaphor, rules. Polish (particles, shake, squash and stretch) exists to convey that
  "the game world has its own self consistent physics", and is "a notorious time sink": pick only
  the effects crucial to the intended physical impression. No numbers.
- **Celeste `Player.cs`** [V, source]. `Celeste.Freeze(0.05f)` (3 frames) on dash begin, red dash
  and dream-dash exit; 0.1 s (6 frames) on a bumper launch; 0.01 s on an ordinary bounce that also
  shakes. `DirectionalShake(DashDir, 0.2f)` on every dash, 0.1 s on launches; the amplitude lives in
  the unpublished Level.cs, believed ≈ 1 px at 320×180 [M]. Squash: jump (0.6, 1.4), super-bounce
  (0.5, 1.5), side launch (1.5, 0.5), landing (1.4, 0.6), small hop (0.8, 1.2), recovering linearly
  at 1.75/s (a 0.4 deviation in ≈ 0.23 s). Dust: 4 on a jump, 8 on a hard landing, 1 per step. Hair
  flashes white 0.12 s on a dash refill. A displacement shockwave 8→64 px over 0.4 s on dash.
  Settings: `ScreenShake` as an amount, `DisableFlashes` (Photosensitive Mode) which Everest shows
  covers distortion, glitch, lightning, screen flash and text highlight.
- **Smash hitlag (SmashWiki)** [V]. Melee ⌊d/3 + 3⌋ frames capped at 20; Ultimate ⌊(0.65d + 6) ×
  e × s × p⌋ capped at 30, so a 10 % hit is 12 frames in Ultimate, 6 in Melee. **"Only the attacker
  and victim freeze; other game elements continue."** Projectile owners are not frozen when their
  projectile lands. Ultimate scales hitlag down with player count: ×0.925 at 3, ×0.862 at 4,
  ×0.8116 at 5, ×0.77464 at 6 (only when hitlag exceeds 10 frames; projectiles exempt). The victim
  visibly shakes during hitlag.
- **Sakurai's channel** [V, titles and descriptions only; subtitles are burned in]. Hit stop's
  thinking "can be applied to more than just hits"; "using slow motion only briefly and then
  returning to normal speed would make the effect even more impactful"; shake: "careful not to
  overdo it, but using the entire screen to emphasize a given moment can be extremely effective";
  hit marks matter "especially… where the camera is pulled back".
- **GMTK, "Secrets of Game Feel and Juice" (2015)** [V]. Summarises the above; the restraint
  argument: "if it's about jumping… keep the camera still so you can land each jump".
- **Eiserloh, "Juicing Your Cameras With Math" (GDC 2016)** [V topic only; video paywalled].
  [M] trauma ∈ [0,1] added on events, decaying linearly; offset = trauma² (or ³) × max; noise
  rather than white noise; a little rotation.

### 3.2 Accessibility standards [V]

- **WCAG 2.3.1:** no more than three flashes in any one second unless below threshold. A flash is
  an opposing luminance change of ≥ 10 % where the darker state is under 0.80 relative luminance,
  over more than 25 % of a 10° field (≈ 341×256 px on a typical display). A *red flash* (any
  transition involving saturated red) has a stricter threshold.
- **Xbox Accessibility Guideline 118:** the same, with "lower intensity flashing can also cause a
  failure if… continued for an extended period". Remove triggers rather than warn.
- **Game Accessibility Guidelines:** avoid > 3 flashes/s over 25 % of the screen and any flashing
  over 5 s; never label a setting "epilepsy safe", describe it ("screen flash effects"); cites
  TowerFall's in-game toggle.
- Shake toggles in the wild: Nuclear Throne (Nijman), Celeste (amount), Gungeon (slider), Boomerang
  Fu (on/off), plus Boomerang Fu's separate freeze-frame and slow-mo switches (§1.2).

Our blast veil covers the whole world layer, so by the letter every blast is a "flash"; the rule
that matters is the count. Hence the global gap of 20 ticks between flashes in `fx.ts`
(04 §5.2): a barrel chain flashes once. [I]

### 3.3 What the literature says for a six-player one-hit brawler [I]

1. Freeze on kills, catches and deflects, never on throws or steps. Nijman sleeps ~1 frame; Celeste
   freezes 3 on a dash. Spend the budget where outcomes are decided.
2. The Smash model is **freeze only the attacker and the victim** and shorten it as players are
   added. A global hold in a six-player room hands a free beat to the four people not involved.
   Our 01 §8 rule is a 3-frame renderer hold, which is at the "brain won't notice" end; 04 §10 #2
   asks whether to keep it global, drop it, or make it local.
3. A global time effect only for the round-deciding kill, briefly, then snap back (Sakurai, Nijman,
   TowerFall); and only with a switch (Boomerang Fu). That is 06's call, not 04's.
4. Victim white for 1–2 frames, then the pieces; the pieces carry *who* (Nijman's "white flash and
   a different pose"). Done.
5. Shake small, short and preferably *directional* (Celeste's `DirectionalShake(DashDir)`,
   Nijman's kick opposite the shot): it carries information, random shake only carries noise. Our
   shake is random-direction (04 §5.1); a kill shake along the kill vector is the alternative in
   04 §10 #1. Scaled to 576×318 the literature's practice is about kill 3 px / 12 frames, blast
   4–5 px / 18, deflect 1–2 px / 6; ours are 2/8, 4/12, 1/4. Cap the summed offset (ours: strongest
   wins, no sum).
6. One shared screen: the shake is about the world, not about one player, and the camera stays
   still when precision matters (GMTK).
7. Shake Off/Half/Full and flash Off/On as options; both games learned this after launch.
8. No full-screen flashes over the three-per-second line; avoid saturated red; white or yellow for
   impact. Our veil is 0.35 alpha, 3 ticks, rate-limited.
9. Throws respond on the input frame with a "muzzle" first frame; no anticipation that delays the
   projectile. Done (01 §2, 04 §7).
10. Squash and stretch ±30–40 % recovering in ≈ 0.2 s on body actions (Celeste). Our spawn landing
    is 1.3/0.7 over 3 ticks; a catch squash (1.2, 0.8) is a cheap addition not yet made.
11. Particle counts small: 1 per step, 3–4 per dash or catch, 6–8 per kill or blast, 0.2–0.5 s
    lives (Celeste's 1/4/8). Ours sit at 1 / 4–5 / 6–14 plus the longer-lived chunks and smoke.
12. Impacts always leave a mark and marks last the round; rounds are short so "forever" is "this
    round" (Nijman's permanence, Hotline Miami). Our scorch lasts 3600 ticks; chunks and splats
    shorter: 04 §10 #4.
13. Decals on the floor layer at reduced contrast, never over players, boomerangs in flight
    (especially an armed bomb), hazard telegraphs, pickups or the respawn spot.
14. Sound carries more weight per hour than visuals (Jonasson: "the most cost-effective thing";
    Nijman's +12 dB bass anecdote). Good news for a non-artist; 07.
15. One effect, one meaning: white means hit, the ring means the bomb's radius.
16. Juice is render-only (Jonasson: "not changing the game at all"); hit-stop is the one thing that
    could be a sim rule if it is made local to entities.
17. Playtest juice on fresh players: the developer stops noticing the shake (Nijman).

**Gaps.** Sakurai's actual numbers; Celeste's shake amplitude; Street Fighter hitstop
(≈ 8–13 frames by strength [M]); Eiserloh's specifics; any Dead Cells, Hollow Knight, Katana ZERO,
Risk of Rain or TowerFall developer write-up.

---

## 4. Ambient atmosphere and the particle layer

### 4.1 Rendering on Canvas 2D

- **MDN "Optimizing canvas"** [V]: pre-render repeated drawing offscreen; integer coordinates
  (sub-pixel positions trigger anti-aliasing); never scale inside `drawImage`; layered canvases so
  static content is not redrawn; avoid `shadowBlur`; `getContext('2d', {alpha:false})`; upscale a
  small canvas rather than drawing big.
- **Smus, "Improving HTML5 Canvas Performance"** [V]: "changing the state machine is expensive",
  draw everything of one colour before switching; batch shapes into one path; round coordinates;
  `shadowBlur` is "very expensive".
- **A local benchmark** (headless Chrome, Apple M5, 640×366, software raster; a mid laptop is
  assumed 3–5× slower) [B = measured this session]:

  | Method | Count | ms/frame |
  |---|---|---|
  | `fillRect` 2×2, integer | 2,000 / 10,000 | 0.95 / 3.4 |
  | `fillStyle` set per particle | 10,000 | 3.0 (free) |
  | `globalAlpha` per particle | 10,000 | 3.1 (free) |
  | `save`/`restore` per particle | 10,000 | 4.8 (+50 %) |
  | one path of `rect()`s, one `fill()` | 2,000 | 0.48 |
  | `drawImage` 3×3 from an atlas | 2,000 / 10,000 | 2.9 / 14.3 (4–5× `fillRect`) |
  | 32×32 glow sprite with `lighter` | 500 | 1.1 |
  | radial gradient created per glow | 500 | 2.5 (2× a cached sprite) |
  | `shadowBlur` 4 on 2×2 rects | 500 | 1.4 (10× plain) |
  | full-frame `putImageData` | — | 0.2, flat |
  | full-screen `drawImage` (layer composite) | 1 | 0.10 per layer |

  With GPU raster on, any `getImageData` in the loop collapsed `drawImage` to hundreds of
  milliseconds: never read pixels back inside the frame.

  What this means for `fx.ts`: its 1–3 px `fillRect`s with per-particle `fillStyle` and alpha are
  the fastest path; 900 particles cost well under a millisecond even on the slow assumption. The
  two improvements worth making are caching glow sprites per radius and colour in `lighting.ts`
  (it builds a gradient per light per frame) and replacing `particles.shift()` with a swap-remove
  or free list (Nystrom's Object Pool [V]: fixed block, O(1) spawn, drop or evict silently when
  full, "the user won't notice if the next explosion isn't quite as impressive"). Neither is urgent
  at 900. [I]

### 4.2 Rollback and effects

- **GGPO Developer Guide** [V]: the RNG must be in game state and seeded identically; "any effects
  or sounds which are generated during the rollback need to be deferred until after the rollback is
  finished"; rendering is "driven by the current game state".
- **Juckett, INVERSUS** [V]: kept particles *inside* game state, otherwise "the non-gamestate
  particle manager would have two explosions running"; sounds through a ring of the last 128
  events, one start per event name per frame; mispredicted sounds keep playing ("an explosion that
  never happened"), proposed fix: fade what was not re-triggered; audio suppressed during render
  extrapolation and "it would be possible to also suppress large visual events".
- **Mattis, SnapNet** [V]: snapshotting particle state is often not "easy or even feasible"; flag
  that an effect fired so it can be cancelled if mispredicted; for short effects "the best user
  experience is often to just let them play out".
- **Fiedler** [V]: determinism means byte-identical, checked with checksums; float determinism
  across machines is "complicated", so keep cosmetic floats out of the sim.

Policy for us [I]: particles stay outside the sim with their own stream (as built; 01 §1). Gameplay
effects spawn from sim events keyed `(tick, type, entity)`; a ring of the last 128–256 keys stops
a re-simulated tick re-firing one; an event not re-emitted after a rollback kills its *big* effect
(blast ring, flash) and lets small ones play out; nothing spawns during extrapolation. 04 §9.

### 4.3 Atmosphere and light

- **Dead Cells, "Giving back colors to cryptic worlds" (Massé)** [V]: the readability ladder.
  Background "fades smoothly — no sharp ruptures"; interactive elements at mid contrast; enemies and
  projectiles get "high levels of saturation, contrast and brightness". Depth comes from parallax,
  *particle density* and foreground clouds. The ambient layer takes the lowest rung.
- **Dwerve, dynamic 2D lighting (Legendre)** [V]: torch colour `#FFAF64`; a soft additive donut
  glow per torch, its alpha modulated by a flicker script; embers drift up from torches; shadow
  darkness 0.85, a vignette, colour grading. This is our lightmap plus additive glow almost exactly.
- **Quake light styles (id source)** [V]: flicker is a lookup string stepped at 10 Hz, 'a' dark,
  'm' normal, 'z' double; FLICKER `mmnmmommommnonmmonqnmmo` (±4 % with rare bumps), CANDLE
  `mmmmmaaaaammmmmaaaaaabcdefgabcdefg`, FLUORESCENT `mmamammmmammamamaaamammma`. Cheap,
  deterministic, proven; a 20–30 step string loops every 2–3 s. Ours is `hash2` of the tick, which
  is the same idea without the authored shape; the CANDLE string would suit the Chapel. [I]
- **Celeste `Player.cs`** [V]: `Dust.Burst(…, 4)` on a jump, 8 on a hard landing, 16 on a split.
  Action puffs are small, so ambience is smaller still.
- **Serra, "Developing a Pixel Bloodstain System"** [V]: marks are painted *into* the floor
  texture (no objects, no overdraw); the stain colour is lerped from the floor pixel toward the
  stain, not pure ("radioactive ketchup"); shape is a probability rhombus inside a circle; permanent.
- **Slime Rancher 2 snow** [V]: footprints and trampled grass written into one top-down render
  texture, pixel-snapped, one draw per interaction type.
- **MDN `globalCompositeOperation`** [V]: `lighter` adds and can blow out; `screen` lightens
  softly and cannot reach white; `multiply` darkens.
- Hyper Light Drifter's look rests on a 16-bit palette and restraint [V, nothing on particles];
  Children of Morta credits custom lighting and post [V, no numbers]. Community dislike of film
  grain and chromatic aberration on pixel art is [M]; on an integer-scaled grid they smear the
  pixels: none, at most an off-by-default scanline toggle. [I]

### 4.4 Principles for the layer [I, with the sources above]

- Ambient is the bottom rung: desaturated, one or two steps from the floor or wall colour, never a
  player's hue; drawn under the characters except sparse 1 px high things (snow, leaves, ash).
- Counts low: 10–60 ambient particles on screen in a busy room; the Icebox is the exception by
  design (1 px flakes, the point is the blanket). Our live counts at the §6.1 rates: Cellar ≈ 8
  motes, Chapel ≈ 10, Forge ≈ 25 embers, Icebox ≈ 60–70 flakes.
- One signature per theme; light carries the mood (tint plus flicker), particles just confirm it.
- Flicker on authored strings or two incommensurate sines, a different phase per light.
- Fog over players hurts readability: avoid; under them at alpha ≤ 0.15 if ever. Light shafts as a
  cached gradient quad with motes concentrated inside; pre-rendered per room.
- Marks that settle go into the floor layer; only marks that still fade stay as live decals (as
  built: decals fade; the static layer takes cut grass and broken crates).
- Ambient speeds slower than a walking player; ours: motes ≈ 5 px/s, flakes 18–33, embers up to
  42, against a run of 120+.

**Gaps.** No primary source reached for the ambient effects of Hyper Light Drifter, Celeste
(snow, wind), Katana ZERO (rain), Hollow Knight, Eastward, Owlboy, Blasphemous, Darkwood or
Gungeon's own lighting; no rollback-effects write-up from Rivals, Skullgirls or Slippi; the mid
laptop factor is assumed.

---

## 5. The principles, one line each

1. Everything readable: actors over effects over environment; saturation is the player's budget.
2. The sim never knows; effects run on their own stream from events; rollback drops nothing it has
   shown and re-fires nothing it has already shown.
3. Response before anticipation on anything the player does; anticipation is for hazards.
4. Contrast frame first, then physics; fire fades fast, smoke slow.
5. The floor keeps score; marks last the round.
6. Hit-stop one to three frames and, ideally, only for the two people involved; a time effect
   only for the last kill, and only with a switch.
7. Shake small, short, about the world; directional carries meaning, random carries noise; cap it.
8. Under three flashes a second, never full white, never saturated red; toggles for shake, hold
   and flash from day one, described not labelled.
9. Ambient is the bottom rung: low contrast, slow, under the players, one signature per room, every
   loop on its own phase.
10. Small puffs (1 / 4 / 8), palette ramps over alpha, integer positions, `fillRect` over
    `drawImage`, cached glows, no `shadowBlur`, no pixel readback.
11. Keep the asset scope small: frames where a pose matters, code for everything else; sound is
    the cheapest juice per hour.
12. Test it on fresh eyes; the developer stops seeing the shake.

---

## 6. Sources

Enter the Gungeon
- wiki.gg "Dodge Roll" (team) https://enterthegungeon.wiki.gg/wiki/Dodge_Roll ; "Bullet Kin" https://enterthegungeon.wiki.gg/wiki/Bullet_Kin ; "Asset strings" / String Database UI (options) https://enterthegungeon.wiki.gg/wiki/Asset_strings
- Silverword, "Enter the Gungeon: entretien Joe Harty", roxarmy.com, 2016 https://roxarmy.com/enter-the-gungeon-entretien-joe-harty/
- Tim W., "Q&A: The guns and dungeons of Enter the Gungeon", Game Developer, 2016 https://www.gamedeveloper.com/design/q-a-the-guns-and-dungeons-of-i-enter-the-gungeon-i-
- Fandom "Dodge Roll (Move)" https://enterthegungeon.fandom.com/wiki/Dodge_Roll_(Move) ; "Pickups" https://enterthegungeon.fandom.com/wiki/Pickups ; "Bullet Kin" https://enterthegungeon.fandom.com/wiki/Bullet_Kin

Boomerang Fu
- Cranky Watermelon AMA, r/NintendoSwitch, 14 Aug 2020 https://www.reddit.com/r/NintendoSwitch/comments/i9cb6l/ (via api.pullpush.io)
- Fandom: "Death animations", "Game options", "Version 1.0.6", "Version 1.0.7", "Version 1.0.8", "Explosive Boomerang", "Fire Boomerang", "Ice Boomerang", "Disguise", "Shield", "Boomerang", "Rain", "Replays" under https://boomerangfu.fandom.com/wiki/
- Steam news, v1.0.8 https://store.steampowered.com/news/app/965680/view/2739831657934096436 ; store page https://store.steampowered.com/app/965680/Boomerang_Fu/

Pixel animation
- Pedro Medeiros (Saint11), pixel art tutorials index https://saint11.art/blog/pixel-art-tutorials/
- Raymond Schlitter, Pixelblog (run cycles, palettes, wind) https://www.slynyrd.com/blog/2021/7/16/pixelblog-33-wind-effects and the series index
- Derek Yu, "Pixel Art Tutorial" (Spelunky site) [M for the URL]
- Mark Ferrari, "8 Bit & '8 Bitish' Graphics — Outside the Box", GDC 2016 [M]

Game feel
- Jan Willem Nijman, "The Art of Screenshake", INDIGO 2013 https://www.youtube.com/watch?v=AJdEqssNZ-U
- Martin Jonasson & Petri Purho, "Juice It or Lose It", 2012 https://www.youtube.com/watch?v=Fy0aCDmgnxg ; source https://github.com/grapefrukt/juicy-breakout
- Steve Swink, "Game Feel: The Secret Ingredient", Gamasutra 2007 https://www.gamedeveloper.com/design/game-feel-the-secret-ingredient
- Celeste `Player.cs` https://github.com/NoelFB/Celeste ; Everest (settings) https://github.com/EverestAPI/Everest
- SmashWiki, "Hitlag" https://www.ssbwiki.com/Hitlag
- Masahiro Sakurai on Creating Games: "Stop for Big Moments!" https://youtu.be/OdVkEOzdCPw ; "Eight Hit Stop Techniques" https://youtu.be/tycbMSjDDLg ; "Screen Shake" https://youtu.be/2JXR7IASSog ; "Hit Marks" https://youtu.be/B-P4ysHSjCg
- Mark Brown (GMTK), "Secrets of Game Feel and Juice", 2015 https://www.youtube.com/watch?v=216_5nu4aVQ
- Squirrel Eiserloh, "Juicing Your Cameras With Math", GDC 2016 https://www.gdcvault.com/play/1023557/

Accessibility
- WCAG 2.1, Understanding 2.3.1 https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold.html
- Xbox Accessibility Guideline 118 https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/118
- Game Accessibility Guidelines, flickering https://gameaccessibilityguidelines.com/avoid-flickering-images-and-repetitive-patterns/

Rendering, rollback, atmosphere
- MDN, "Optimizing canvas" https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas ; `globalCompositeOperation` https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation
- Boris Smus, "Improving HTML5 Canvas Performance", 2011 https://web.dev/articles/canvas-performance
- Robert Nystrom, "Object Pool", Game Programming Patterns https://gameprogrammingpatterns.com/object-pool.html
- GGPO Developer Guide https://github.com/pond3r/ggpo/blob/master/doc/DeveloperGuide.md
- Ryan Juckett, "Rollback Networking in INVERSUS", 2019 http://blog.hypersect.com/rollback-networking-in-inversus/
- Jay Mattis, "Netcode Architectures Part 2: Rollback", 2023 https://www.snapnet.dev/blog/netcode-architectures-part-2-rollback/
- Glenn Fiedler, "Deterministic Lockstep" https://gafferongames.com/post/deterministic_lockstep/ ; "Fix Your Timestep" https://gafferongames.com/post/fix_your_timestep/
- Percy Legendre, "Dynamic 2D lighting in Dwerve", 2020 https://www.gamedeveloper.com/design/art-design-deep-dive-dynamic-2d-lighting-in-dwerve
- Gwenaël Massé, "Giving back colors to cryptic worlds in Dead Cells", 2018 https://www.gamedeveloper.com/production/art-design-deep-dive-giving-back-colors-to-cryptic-worlds-in-i-dead-cells-i-
- Albert Serra, "Developing a Pixel Bloodstain System", 2019 https://www.gamedeveloper.com/design/developing-a-pixel-bloodstain-system
- Slime Rancher 2 snow interaction, 2023 https://www.gamedeveloper.com/design/slime-rancher-2-snow-particle-effects
- id Software, Quake light styles https://raw.githubusercontent.com/id-Software/Quake/master/qw-qc/world.qc and WinQuake/r_light.c
- Bryant Francis on Hyper Light Breaker, 2024 https://www.gamedeveloper.com/art/tossing-out-textures-to-build-a-visual-bridge-from-hyper-light-breaker-to-its-predecessor
- Amir Fassihi, "Postmortem: Children of Morta", 2020 https://www.gamedeveloper.com/design/postmortem-children-of-morta
