# 07 — Audio

Status: **Music playback simplified, 2026-10-11.** The current runtime is described here;
older design notes below record the original adaptive-music design.

The original room themes now ship as compressed, gapless loops in `public/music/`. The browser
plays **one AudioBufferSourceNode per room**. It needs no note-scheduling timer, per-frame heat
updates, layer or drum-kit switching, kick pumping, event ducking, or room-entry signature hit.
The effects/reverb compressor is separate from music; only the final safety limiter is shared.
The existing sound-effect recipes and recordings remain in use.

- `src/audio/music.ts`: load/decode, loop, crossfade, stop, and brief death slowdown.
- `src/audio/music-tracks.json`: generated, versioned filenames and track metadata.
- `src/audio/songs.ts`, `score.ts`, `music-drums.ts`: the original compositions and synthesis kit,
  used by the asset renderer, not during gameplay. The fixed arrangement uses the heavy kit and
  all musical layers, with the top accent layer mixed lower. Both B sections are retained.
- `npm run render-music`: renders all nine themes using local Chrome and ffmpeg. A previous form
  warms up sustained notes, reverb and compression, then an exact full loop is exported with
  gapless MP3 metadata. Assets are checked in; ordinary builds never render music.
- A room change keeps the old song playing while the new file downloads/decodes, then crossfades
  for 0.8 seconds. Repeated requests for the same room preserve position. Stale loads cannot
  replace a newer room or restart music after stop. Failed downloads retry once and retain the
  previous song. The decoded cache holds at most three tracks.
- A death smoothly lowers playback speed to 90% over 40 ms, holds briefly, and returns to 100%
  at 0.6 seconds. This is AudioParam automation on the same playing source; music never restarts.
- Mute and music volume control the entire recording, including its baked reverb. Unmuting
  preserves position. Returning to a visible tab retries a browser-suspended audio context.

`npm run check-music` monitors real audio-thread samples through a 2.5-second main-thread stall;
checks repeated deaths, volume/mute/resume, slow/failed/out-of-order loads and stop cancellation;
and decodes all nine tracks to check duration, peaks and audible loop joins.
`npm run check-rules-audio` covers the game rules, effects, loop changes and final mixer.

**Historical design reference:** adaptive layers, event ducking, live synthesis and the proposed
hurry-up hooks described below are superseded by the continuous player above. Sound-effect
provenance remains in `docs/audio-credits.md`; all incorporated recordings are CC0.

Scope: every sound the game makes and the rules it makes them by: the audio graph, the sound-effect
idiom and the event-to-sound map, where the recordings come from and what we may do with them, the
music system and the nine themes, how the music reacts to play, mute and the URL parameters, and
what the audio layer must never do to the simulation. Not in scope: voice chat (05), menu and lobby
music (05; the themes here are per room), accessibility captions for sound (a later pass).

---

## 1. Design lens

Aaron's brief, after hearing the first pass: "I wanted you to be a little bit out of the box, like
how old-timey cartoons used to use sound effects of real objects to generate their realistic sound
effects … I want the sound effects to be incredibly, incredibly, incredibly satisfying and to fit the
sort of seriousness and high stakes of the gameplay … [The music] needs to be high-stakes, thrilling,
and engaging … hardcore. Similar to how roguelikes style their music for their boss fights." Every
sound here has to pass these:

1. **Substitute, don't illustrate.** The foley lesson taken as method, not as style: find the real
   object whose sound has the shape the event needs and record that (notes §1). A boomerang release
   is a whip crack because a whip crack *is* a wrist snap and air being cut. A kill is a knife into a
   melon because the ear knows exactly what a blade into something wet and dense sounds like. No
   gags, no slide whistles, no sound that comments on the event instead of being it.
2. **A hit is a construction.** Every contact is a stack in the order it arrives: transient (the
   first 1–5 ms), body (the pitched thump), sub (the floor under it), resonance (the struck
   material's own partials) and tail (debris, air, ring), with the recording as one layer among them
   (notes §5). The frequent sounds are short and dry; only the rare, decisive ones earn a tail.
3. **Serious and satisfying.** Deaths are the biggest sounds in the game, close and heavy, with the
   music pulled down under them so they land alone. Silence is part of the kit: the catch stops the
   flight loop dead in two ticks, and the pit has no landing at all. Nothing is cute.
4. **Signatures never vary.** A deflect, the bomb arming, its beeps, a slice and a shield pop play at
   one fixed pitch so they are recognisable from across the room and across a session (notes §5).
   Everything else rotates takes and wobbles in pitch so that no two hits are the same.
5. **Readable in chaos.** Every sound is placed by its world x: panned, faded past the view, held off
   if the same event fired a few milliseconds ago. Kills, blasts and parries duck the music's body and
   leave its floor, so the hit reads and the groove never stops.
6. **The music is a boss fight.** One motif in nine dark keys, driving ostinatos, double-time drums,
   distorted bass and guitar, unison saws, choir and brass, everything melodic breathing under the
   kick (notes §7). The arrangement thins when the room is quiet and the heavy kit comes in when it
   is hot; every song has two B sections so it does not repeat inside a minute; a room change lands
   on the new room's hit.
7. **Render-side, always.** Sound is driven by the event list the simulation emits (01 §5, §13);
   nothing in the simulation reads anything from the audio layer, and a headless or scripted run
   never creates an AudioContext. Determinism and rollback are untouched by anything here.

---

## 2. What the player hears

Open the demo, press a key: the Cellar's theme fades in with the guitar already chugging and the
lead held back. Throw, and the release is a real whip crack with the arm's weight under it; the
flight is a spinning blade, brighter and faster leaving the hand, darker coming home, that drops to
a low trembling drone while LMB holds it in the air. Every wall it hits is a rock on wood with a
knock of pitched weight, a semitone higher each time. The catch is a ball into a leather glove and
the flight goes silent in the same frame. Parry another player's boomerang and steel meets steel
over one fixed anvil note while the music dips for a sixth of a second. Deflect your own and a gun
cocks, twice, with a sub settling into the floor and a charge rising; two struck steel beeps, the
second holding the music down, and then a real explosion with a sub that keeps falling. Someone
dies and the song's body drops for a third of a second under a knife into a melon, a crack and the
weight of the halves hitting the floor; on the Forge the press lands on an egg with the crusher's
own metal on top; in the Pits a whoosh fades out and nothing ever lands. The fight heats up and the
double-time kit crashes in; it dies down and after four quiet bars the groove alone is left. Change
room and the new song's signature hit, an orchestral slam, an anvil, a bell, lands in the middle of
the crossfade. Press **M** and it all stops.

---

## 3. The audio graph

`src/audio/engine.ts`. One `AudioContext`, created on the first key press or mouse button (browsers
refuse to start sound before a gesture; the scripted `?t=` branch never calls `unlock()`), feeding:

```
sfx ───────────────────────────┐
music ─┬─ lows  (< 110 Hz) ────┼─► master (0.85) ─► compressor ─► limiter ─► safety clip ─► speakers
       └─ highs (> 110 Hz) ────┤
verb ──────────────────────────┘   (convolvers fed by per-sound sends: the room's tone)
```

- **Three buses.** `sfx` is a plain gain. `music` is split at 110 Hz by a Linkwitz–Riley crossover
  (two Butterworth biquads a side, flat where they meet) into a low and a high path, each with its
  own duck gain. `verb` is the room's convolver fed by per-sound sends through `verbIn` (0.6).
- **Mastering.** Everything sums into `master` and then a `DynamicsCompressorNode` that glues
  (threshold −14 dB, knee 18, ratio 4, attack 4 ms, release 180 ms), a second one set as a limiter
  that catches the kill stacks (−3 dB, knee 0, ratio 20, attack 1 ms, release 80 ms), and a 2× oversampled
  safety shaper that leaves normal samples unchanged and rounds off peaks above 0.9.
- **Band-split ducking.** `duck(amount, hold = 0.25, release = 0.4)` pulls the music's high path down
  by `amount` in 20 ms, holds, and ramps back; the low path only moves 40 % as far (`LOW_DUCK`). So
  a kill takes the tune's body out from under the hit while the bass and kick stay on the floor:
  the hit reads, the groove never stops (notes §5, "ducking"). Sound-effect definitions carry their
  own duck (§4.7).
- **Room tone.** `setRoomTone(seconds, bright)` renders an impulse response on the fly: six early
  reflections, then a noise tail through a one-pole lowpass (k = 0.15 + 0.8 × bright) decaying to
  −60 dB over `seconds`. Each song declares its own (`reverb: [s, bright]`, §6.3) and `playRoom`
  hands it over. A room change does not cut the old tail: the new convolver comes in beside the old
  one, which rings out and is disconnected half a second after its decay.
- **Switches.** `setMuted`, `setMusicOn`, `setSfxOn` set bus gains (mute ramps the master in 20 ms);
  `onUnlock(cb)` runs a callback as soon as the context is running (the sample loader uses it).

---

## 4. Sound effects

`src/audio/sfx.ts` holds the event-to-sound table (forty recipes, fully synthesized, each the
fallback for its event); `src/audio/synth.ts` is the impact kit they are built from;
`src/audio/samples.ts` says which recordings play for which event and what plays under them (§5).
The sim calls `sfx(name, x?, { pitch?, gain?, delay? })` at the moment a thing happens, with the
world x so the sound can be panned and attenuated; render code calls `loop(key, name, x, param,
gain)` every frame for things that keep going.

### 4.1 The impact kit and the layer order

A satisfying hit arrives in a fixed order, and the kit has a primitive for each stage (notes §5):

| Stage | When | Kit | What it does for the ear |
|---|---|---|---|
| **transient** | 0–5 ms | `click` | the edge: tells the ear something *hard* happened; the microphone and the MP3 encoder both soften it, so it is always added back |
| **body** | 5–100 ms | `thump` (a pitch drop), `smack` (filtered noise burst) | the weight and the material's first answer |
| **sub** | 0–400 ms | `sub` (a fixed sine, 30–90 Hz) | the floor; laptops cannot play it, so the bomb's goes through `drive` for a saturated shadow they can |
| **resonance** | 3 ms on | `modal` with the ratios `WOOD`, `IRON`, `ANVIL`, `METAL`, `GLASS`, `BELL` | what was struck: a crate, a gate, a parry, a boomerang edge, ice, a win |
| **tail** | 30 ms on | `bloom` (air), `debris`, `crackle`, `shatter`, `rattle`, `rumble`, `hiss`, `whoosh`, `scrape`, `sweep` | only the decisive events get one; the frequent ones end with the body |

Every event in the table below is a stack of these. When a recording is loaded for it (§5) the
recording plays *instead of the recipe* and a smaller stack, the event's **under** layer, plays with
it: the sub and the transient the recording lacks, and for signature events the fixed-pitch ring
that makes them recognisable. The under layer follows the take's random pitch (`v.p`) where it is
the material and ignores it where it is the signature.

### 4.2 The boomerang

| Event | Recording (takes rotate) | Under it | Notes |
|---|---|---|---|
| **throw** | a whip crack · a bullwhip swung · a bowstring released | the arm's weight: a 170→90 Hz thump | ±1.2 semitones; pitch 0.8 when Big; heats the music (§6.5) |
| **flight** (loop) | — | a blade spinning: band-passed air chopped at 9–21 Hz with the low whir of its weight; brighter and faster leaving the hand, darker and slower coming home (the Doppler is deliberate and backwards: effort, then weight) | `param` is signed speed |
| **hover** (loop) | — | a 55 Hz drone with its fifth, trembling at 6 Hz, a thin shimmer of air above | while LMB holds it |
| **bounce** | a rock on wood · a hard clack · a metal ping | a 3.2 kHz edge and a 190→90 Hz knock | 2^((n−1)/12) for the n-th wall, capped at four semitones, so the ear counts them; phantoms at 0.4 gain |
| **catch** | a ball into a leather glove · the same through a contact mic · a glove slap | an edge, a 150→70 Hz thump in the palm, the blade's faint `METAL` ring | the flight loop stops in two ticks: the silence after the slap is the reward |
| **deflect** (parry of another's boomerang) | kitchen steel clashed · a short sword clash | a 4 kHz edge, the **fixed 1150 Hz `ANVIL` note**, a 120→60 Hz thump, the redirected flight cutting away | signature: no pitch variation; ducks 0.3 for 0.17 s |
| **arm** (own-deflect, 01 §12) | a gun cocked, two clicks: one take only | a 52 Hz sub settling in, an `IRON` latch, a sawtooth charge 60→130 Hz over half a second, a second `IRON` note at 0.4 s | signature: always the same |
| **beep** | — (synth only) | a struck steel bar damped at once, 1320 Hz with a hard edge | the second a major third up (from the caller); each dips the music 0.45 and the second's dip holds until the blast |
| **blast** | a real explosion · two firework reports | a 140→22 Hz thump, a 30 Hz sub, a rumble | ducks 0.7 for 0.4 s; the synth recipe adds a saturated pressure bloom, debris and crackle |
| **bumper** | a basketball bounce · a tighter one · a fist on drywall | a 160→70 Hz thump, a rubber `[1, 1.5, 2.7]` ring, a 90→150 Hz push | bodies at pitch 0.8: a body is bigger than a boomerang |
| **phantomPop** | a suction cup pulled off · off glass | a 90 Hz floor | Triple's phantoms winking out |
| **shove** | a clothed body hit · a body hit · a full bottle on a counter | a 140→55 Hz thump and the air leaving | 90 ms gap, the first tick of contact only |

### 4.3 Players

| Event | Recording | Under it | Notes |
|---|---|---|---|
| **swing** (melee) | a bamboo staff · a stick · a stick | a darker, heavier smack of air than the throw | ±1.2 semitones, 60 ms gap |
| **dash** | a person rolling on the floor in clothes · a jacket rustle · cloth dragged fast | a 120→60 Hz thump on the first contact and grit on the slide | 80 ms gap |
| **slice** (killed by a boomerang or melee) | a knife slash on foley flesh · a knife into a melon · a swede stabbed | the blade's whoosh, then at 30 ms the weight: a 110→45 Hz thump, a 48 Hz sub, the air | the game's signature kill: fixed pitch; ducks 0.5 for 0.3 s (18 ticks: the hold frame and the shake, 04 §4) |
| **burn** | a gas barbecue igniting · a fire burst | a 55 Hz sub, a bloom of ignition, crackle | ducks 0.5 for 0.35 s |
| **fall** (pit) | a slowed-down whoosh · a deep whoosh faded out at 1.2 s | a 60 Hz rumble and a thread of cold air | no landing is ever heard; the music barely dips (0.2) |
| **squash** (crusher, cart, chandelier, Blink landing) | a foot on an egg · a lemon crushed · a crunch | the biggest body in the kit: a 170→40 Hz thump, a 42 Hz sub, the crusher's own `METAL`, stone debris | ducks 0.6 for 0.3 s |
| **shieldPop** | a balloon popped (two) | the kill's weight with glass in place of the wet layers: a shatter, a thump, a 75 Hz sub | "that landed, and it did not count": fixed pitch, ducks 0.3 |
| **blink** | an air burst · a burst | the inward pull of air, then the snap of arriving at 120 ms | |
| **spawnDrop** | a ukulele whooshed, slow | air rising in pitch as the body comes | |
| **spawnLand** | a human impact on the ground · a pillow into a wall · a thud | an edge, a 130→50 Hz thump, the air | fires on the landing tick (04 §4) |

### 4.4 Loops

`loop(key, name, x, param, gain)` is called every rendered frame for each live source; a voice that
is not refreshed fades out at `endFrame()` with a 12 ms time constant and is stopped 120 ms later,
and `stopLoops()` cuts them all on a room change. Keys are per object (one voice per boomerang, per
saw), so two carts are two voices. All seven are synthesized: a recording cannot follow a speed.

| Loop | Recipe | `param` and gain |
|---|---|---|
| **flight** | band-passed air (700–1600 Hz) chopped by a 9–21 Hz LFO, plus the low whir (< 320 Hz) of the weight going round; the chop rate, the band and the brightness follow speed, shifted up 10 % going out and down 12 % coming home | speed −1..1, negative on the way back; base 0.3 |
| **hover** | 55 Hz and 82.5 Hz sines in a 6 Hz tremolo, a 3.2 kHz shimmer of air | base 0.12 |
| **saw** | two detuned saws (96 and 193 Hz) into a hard tanh, band-passed at 1.3 kHz, the teeth a 31 Hz square chop, grit above 3.5 kHz | gain 1 running, 0.5 idle; base 0.22 |
| **cart**, **boulder** | low noise clattering at 18 Hz (cart, < 420 Hz) or 11 Hz (boulder, < 260 Hz) over a 70 / 48 Hz hum; the cart's wheels click over a rail joint 3.3 times a second | only while moving; base 0.3 |
| **pendulum** | air that is loudest and highest at the bottom of the arc (350→1250 Hz as sin(πu)) and the pivot's low complaint at 150–210 Hz | where along the arc the blade is, 0..1; base 0.14 |
| **fuse** | a 4.5 kHz hiss with sparks: brighter noise chopped irregularly at 37 Hz and 5.3 Hz | armed boomerangs and lit barrels (gain 0.8); base 0.14 |

The flight loop is what makes the boomerang feel alive between the throw and the catch: it slows
as the boomerang decelerates to its stop (01 §3's parabolic speed curve), drops to the hover drone
while LMB is held, and darkens and speeds back up on the recall.

### 4.5 The room

| Event | Recording | Under it |
|---|---|---|
| **crate** | three crates breaking | a 150→70 Hz thump and the box's `WOOD` |
| **barrelLit** | a match struck · a match catching | the fuse hiss settling in and crackle; the barrel then carries a **fuse** loop |
| **grass** | a bush cut · leaves rustled fast | a low smack of the stalks going down |
| **ice** (Icebox floor, first tile of an Ice trail) | ice cracking with the mic frozen inside the block · ice broken by hand · ice cracking | a 70 Hz floor and a `GLASS` ring |
| **steam** (fire meets ice) | two steam hisses | air and a 58 Hz floor |
| **spikes** | a trap springing shut · a blade unsheathed · a knife slash | an edge, a 200→80 Hz knock, `METAL` |
| **vent** | a small blowtorch · a flamethrower burst, both cut at 1.2 s | a 58 Hz floor and a bloom of air |
| **gate** | a 750 kg chain pulley · a chain pulled · a metal gate swung shut | the **fixed 165 Hz `IRON`** of the gate itself and a 120→45 Hz thump |
| **creak** | three wood creaks | a low rumble: the rope taking strain |
| **chandelierFall** | a rope cut · a chain dropping onto wood | the whoosh down and the links rattling |
| **chandelierLand** | a prop chandelier shattering · a chandelier falling · a bottle smashed | a 150→35 Hz thump, a 40 Hz sub, `METAL`, the air; ducks 0.5 |
| **crumble** | stone rubble · rubble · stone crumbling | rumble, a 100→40 Hz thump, a 45 Hz sub |
| **warp** | two whooshes played backwards (the swell is the arrival) | a falling 2400→200 Hz sweep and a sub where it lands |

Spikes and vents are the one place the sim does not hand the audio an x: the renderer scans the
tiles within ±20 columns and ±10 rows of the local player and reports the nearest one that fires
this tick, so a room full of spikes is one snap per cycle, not forty.

### 4.6 Power-ups

| Event | Recording | Under it |
|---|---|---|
| **pickupGlow** | a meditation chime | the pad's hum at 82 and 123 Hz: something is coming here |
| **pickupLand** | a coin dropped · a thin clank | a 160→80 Hz thump and `METAL` |
| **pickupTake** | a desk bell · a sherry glass tapped | a 60 Hz sub and a lift of 300→1200 Hz: you got a thing |
| **pickupLost** | a hand cymbal choked | a fall of 400→120 Hz and a muffled smack; delayed 0.3 s so it follows the take (03 §6) |
| **pickupFizzle** | a lit match dropped into water | a sawtooth dying 220→90 Hz |

03 §7's request for a per-power-up "type note" (a different pitch per kind) is §10 #8.

### 4.7 Mixing rules

- **Listener.** `setListener(centerX, viewW)` is called once a frame with the camera. A sound is at
  full volume anywhere inside the view and fades to nothing over the next 260 px past its edge, so
  the strip's far rooms are silent and a boomerang leaving the screen trails off.
- **Pan.** Position across the view maps to ±0.75 pan. Never hard left or right: a sound at the
  edge is still in both ears.
- **Variation.** Each definition carries `pitchVar` in semitones (0 for the signatures, ±0.5 to
  ±1.5 for everything else, random per play) and the round-robin never plays the same take twice
  running; a recording's `playbackRate` follows the same variation, so a melon and its sub move
  together.
- **Gaps.** `minGap` per event (35 ms by default; 40 for bounces and grass, 60 for swings and
  bumpers, 80 for dashes, 90 for shoves) so a cluster of simultaneous hits is one hit, not a flam.
- **Reverb send.** Per definition, 0 to 0.6; deaths, the chandelier, the blast and the stingers send
  the most, the beeps almost nothing: a warning has to be dry.
- **Duck.** Per definition, on the band-split bus of §3: blast 0.7 / 0.4 s, squash 0.6 / 0.3 s,
  slice 0.5 / 0.3 s, burn 0.5 / 0.35 s, chandelier landing 0.5 / 0.3 s, beep 0.45 / 0.3 s, win
  0.4 / 0.8 s, deflect and shield pop 0.3 / 0.17 s, ready 0.3, fall 0.2 / 0.4 s.
- **Priority.** None yet: the compressor and the limiter are the only arbiters (§10 #6).

---

## 5. The recordings

`public/sfx/` holds 119 MP3 clips (1.5 MB in total, 0.07–3.0 s each, mono 44.1 kHz at 96 kb/s),
rendered by `scripts/fetch-sfx.sh` from two CC0 sources and listed file by file in
`docs/audio-credits.md`:

| Source | What we took | Licence |
|---|---|---|
| **Freesound** (109 sounds by 92 uploaders) | the real objects: a whip, a bullwhip, a bowstring, sticks and a staff, baseball gloves, swords clashed, a gun cocked, a rock on wood, basketballs, body hits, cloth, a knife into flesh and fruit, a barbecue igniting, crates, matches, ice, steam, chains and a gate, creaks, a chandelier, rubble, a coin, a glass, balloons, thuds, an explosion and fireworks; and the drums: kicks, snares, claps, hats, a ride, crashes, toms, alfaias, a timpani, a cinematic hit, sub drops, anvils, a clang, reversed cymbals | each page marked CC0 1.0 |
| **The Designer's Choice** (Nicholas A. Judy, archive.org; 10 clips) | the UCS library takes: a glove slap, a groin crunch, a Coca-Cola bottle smashed, a meditation chime, a desk bell, a hand cymbal choked, thin and heavy metal, a big timpani impact, a drum bang | archive.org items marked CC0 1.0 by their creator |

Rules:

1. **CC0 or public domain only.** The repository redistributes these files with its source, so a
   licence that merely allows *use* is not enough, and attribution or non-commercial terms would
   bind every fork. Mixkit, Pixabay, Zapsplat, Sonniss, SoundBible and every CC-BY sound were
   excluded for that reason even where they had better takes (notes §8). Nothing is taken from a
   page whose licence we could not read.
2. **Provenance travels with the file, and is re-checkable.** Every clip has a line in the fetch
   script (source, id, cut) and a row in the credits. `VERIFY=1 scripts/fetch-sfx.sh` re-reads every
   source's licence page or metadata and fails if any no longer shows CC0 1.0. Add a sound, add
   both lines and run it.
3. **Re-fetchable.** `scripts/fetch-sfx.sh [prefix]` downloads to a cache, cuts each recording to one
   take (`ss=`/`to=` on the raw file, `dur=` from the first sound), trims silence at −50 dB in and
   −60 dB out, peak-normalises to −1 dBFS, fades 3 ms in and 15 ms out (longer for the long tails),
   and encodes. A download that fails is listed at the end and its clip skipped. The outputs are
   committed so a clone plays without running it.
4. **Recording is one layer, the kit is the rest.** `assignSamples(name, files, gain, under?)` pairs
   each event with its takes and the under layer of §4.1. A recording is chosen for the one thing it
   has that synthesis does not: the texture of the real material. It is never asked to carry the
   weight; the kit does that, the same way under every take, so a kill through a melon and a kill
   through a swede land the same.
5. **Loaded on unlock, degraded silently.** `loadSamples()` fetches and decodes everything after the
   first gesture; a sound that fires before its file arrives, or whose file fails, plays its full
   synthesized recipe instead, and a drum its synthesized voice.

---

## 6. Music

`src/audio/music.ts` is the instrument set, the pattern language and the sequencer;
`src/audio/songs.ts` is the nine songs. `npm run check-songs` parses every pattern, checks every bar
is whole and every `alt` matches its `seq`, and prints the form lengths.

### 6.1 One game: the motif

Every song states the same five notes, the boomerang's out-and-back, in its own key:

```
1 – 5 – ♭6 – 5 – 1      long · short · short · long
```

Up a fifth, a half step up to the flat sixth, back, home. The ♭6 is the dark note that all nine modes
share (Aeolian, harmonic minor, Phrygian), so the motif sounds like itself everywhere and the room
is told by everything *around* it. Every bass states it at the end of its A section, in unison with
the guitar where there is one; the leads carry it when the room is hot; the B sections answer it
with its inversion, 1 – 4 – ♭3 – 4 – 1. It is also the hook for the stingers that are not yet wired
(§9).

### 6.2 Form: sixteen bars, two B sections, no tonic at the join

The longest track in a song is its **form**: sixteen bars, A then B. A is the groove that stands on
its own, the first eight bars, what a quiet room hears. B is a departure, and there are two: B1 in
`seq`, B2 in `alt`, taken on alternate passes, so the whole form repeats only every thirty-two bars
(50–70 s), long past the length of a round. No B ends on the tonic: every one leaves on the V, the
♭II or the ♭VII so the drop back into A is an arrival (notes §7, "loop fatigue"). Each room is its
own meter or groove so a long session never settles: straight 4/4 drive, half-time trap, 12/8
gallop, 7/8, 6/8, a march, a mass.

### 6.3 Nine rooms

| Room | Title | Key · meter · BPM | Reverb | Pump | A, then B1 / B2 | Swap hit |
|---|---|---|---|---|---|---|
| Cellar | *Stonework* | D minor · 4/4 · 150 | 1.2 s, 0.4 | 0.5 | guitar sixteenths on a D pedal, four kicks a bar, supersaw stabs on the offbeats, the motif as the lead; i–i–VI–V. B1 the Phrygian lean, a gallop on E♭ back down; B2 the breakdown, chords on the downbeats with the hands off between, climbing D–F–G–A | orchestral hit on D |
| Pits | *The Drop* | E Phrygian · half-time, swung 0.08 · 140 | 2.2 s, 0.3 | 0.6 | an 808 on one and the back of three, a reese growl, a sub only on the downbeat, a pad in the dark. B1 the drop proper on F (♭II); B2 the stutter, the reese chopped into sixteenths, the sub out. Heavy kit: a two-step | sub impact |
| Greenhouse | *Undergrowth* | G minor · 12/8 · 150 | 1.6 s, 0.6 | 0.45 | a gallop, triplet guitar on a G pedal, a shuffle kit, a pluck stalking in twos against the threes; i–i–iv–V. B1 E♭ and D, C minor and D; B2 the gallop stops for the Andalusian descent G–F–E♭–D | taiko |
| Forge | *Hammerfall* | A harmonic minor · 4/4 · 140 | 0.9 s, 0.7 | 0.45 | anvils on two and four, taikos and a kick, a galloping guitar, brass stabs, low horns, a lead on the leading tone. B1 iv to V; B2 the climb, one power chord a bar up the chromatic scale A to E under a horn pedal | anvil |
| Lab | *Containment Breach* | C minor · 4/4 · 168 | 0.8 s, 0.8 | 0.65 | electronic: a sixteenth arpeggio that never stops, four on the floor pumping everything, distorted bass, supersaw chords, a riser into every eighth bar. B1 F minor to C, A♭–B♭–G; B2 E♭ and F minor, then D♭ (♭II) into G, the saws in stabs | sub impact |
| Armoury | *Seven Sharp* | E harmonic minor · **7/8 (2+2+3)** · 172 | 0.7 s, 0.6 | 0.4 | a riff that lands a step early every bar, kicks on the groups, stabs on one and four. B1 A minor and E, C–D♯dim–B; B2 G–Am–C–B in long chords, sevens on the B | clang on B |
| Icebox | *Black Ice* | D minor · **6/8** · 150 | 2.0 s, 0.9 | 0.4 | taikos on the two big beats, a saw arpeggio, glass with the motif in long notes; guitar and horns at two thirds, the choir at full. B1 B♭ and A, G minor and A; B2 the thaw, D–F–Gm–A in long chords, the glass answering the motif | bell on D |
| Gatehouse | *Siege* | G Phrygian · half-time march · 128 | 2.5 s, 0.5 | 0.35 | taikos and timpani, low brass with the motif, strings, then the snare line, a choir and a chug when hot; the ♭2 leans on every fourth bar. B1 E♭ and D, C minor and D, the chug in eighths; B2 Fm–E♭–Cm–A♭ in half notes, the choir in open fifths | orchestral hit on G |
| Chapel | *Requiem* | E Phrygian · 4/4 · 110 | 3.5 s, 0.5 | 0.3 | organ pedal, bells and a slow taiko always; the choir is the first voice lost, then the strings and drums, then the guitar and the high line (§6.5); i–i–♭II–i. B1 Am–G–F–Dm, the bells answering the motif; B2 C–Dm–F, out on the ♭II. No kits | bell on E |

### 6.4 The instruments

Everything is synthesized per note from a handful of nodes, stopped after it (`InstName`):

- **supersaw** and **stab**: seven saws at Szabo's JP-8000 detune offsets (−19, −11, −3.3, 0, 3.4,
  10, 17 cents) through a filter envelope and saturation (notes §7, "supersaw").
- **guitar** and **guitarLead**: saw stacks into a high-gain waveshaper, then a cabinet: a lowpass,
  a mid scoop and a presence peak around 3–4 kHz, the EQ shape of a guitar speaker (notes §7).
  Palm-muted chugs are short gates on the root.
- **bass**, **dbass**, **reese**, **sub**: a saturated bass, a distorted one, two detuned saws
  beating against each other through a slow filter (the Reese), and a sine an octave down.
- **choir** (formant filters over saws), **strings**, **horn**, **pad**, **organ**, **bell**,
  **glass**, **pluck**, **piano**, **arp**, **lead**, **riser**.
- **Drums**: kick, kick808, snare, clap, hat, ohat, ride, crash, tom, taiko, timp, orchHit, impact,
  anvil, clang, rev, tick, shaker. Every one of these but tick and shaker plays a CC0 one-shot when
  it is loaded (§5; `assignDrum(inst, files)`), round-robin without repeating, at a playback rate
  that wobbles ±1.5 % so a hat line is not a machine gun, scaled by the note's velocity; the
  reversed cymbal is placed so it *ends* on the note (`sampledTail`), the swell arriving exactly at
  the downbeat. Until a file arrives the synthesized drum plays, and the synthesized kick is tuned
  to the song's `root` folded into 41–82 Hz.
- Every song's output passes a peaking notch at 3 kHz (Q 0.9, −4 dB) before the engine's music bus,
  leaving the band where the transients of §4 live.

### 6.5 Heat: the fight sets the arrangement

Each `Track` may carry a `layer`:

| Layer | Plays when | Holds |
|---|---|---|
| 0 | always | the groove: drums, bass or pedal, the chug |
| 1 | intensity ≥ ⅓ | harmony, pads, the first stabs |
| 2 | intensity ≥ ⅔ | the lead, guitar lead, horns |
| 3 | intensity = 1 | the choir, the high line, fills |

Layers fade in and out with a 0.25 s time constant, so the arrangement thickens and thins without a
seam: Phillips's and Sweet's vertical layering (notes §7). On top of the layers, two **kits**: tracks
marked `light` are the groove's drums, tracks marked `heavy` the double-time kit. The sequencer
swaps them only at bar lines and with hysteresis: two consecutive hot bar lines (intensity ≥ 0.66)
bring the heavy kit in with a crash, four cool ones (< 0.5) take it out with another, so a single
throw never flips the drums. And every song names a **pump**: the kick (or taiko) whose hits make
every `pumped` track dip and recover, the sidechain breathing of modern electronic and metal
production (notes §7) that keeps a dense mix moving at 0.3–0.65 depth per song.

The demo keeps a **heat** value in 0..1 and hands it to `music.setIntensity()` once a frame:

| | |
|---|---|
| Start of a room | 0.7 (the lead is in: the room introduces itself) |
| Floor | 0.34 (never drops below the first harmony) |
| Decay | −0.08 per second |
| A throw | +0.12 |
| A wall bounce | +0.03 |
| A deflect | +0.2 |
| A kill | +0.6 |

So a lull leaves the groove; a volley of throws brings the lead back; a kill brings the heavy kit
in two bars later and it stays for the exchange that follows. The **Chapel overrides this**: its
intensity is the share of chandeliers still hanging, so the mass starts full and every chandelier a
boomerang drops takes a voice with it until the last leaves the organ pedal and the bells in the
dark, matching the room's darkening (02 §7, 04 §6). The layers run backwards there on purpose, and
the room has no kits.

### 6.6 Room changes, tempo and transposition

`music.playRoom(key)` crossfades to the room's song over 0.8 s (a no-op if it is already playing),
hands the engine the room tone, and plays the new song's **signature hit** (§6.3, last column) at
the midpoint of the fade, so the swap lands on a downbeat-sized event instead of a dip;
`stopLoops()` cuts the old room's machinery at the same moment. `music.setTempo(mult)` and
`music.setTranspose(semis)` are taken up at the next bar line, so the hurry-up (§9) can speed the
song up and lift it a step without a click. The sequencer is Chris Wilson's two-clock pattern: a
40 ms `setInterval` places every note that falls in the next 200 ms at an exact `currentTime`
(notes §7, "Web Audio").

---

## 7. Controls and parameters

| | |
|---|---|
| **M** | toggle mute (the whole master bus) |
| `?mute=1` | start muted |
| `?music=0` | sound effects only |
| `?sfx=0` | music only |
| `?t=N` (scripted stills) | audio never unlocks; no AudioContext is created |
| `?audio=test&bots=0` | the smoke test: every event, loop, instrument and song once, errors counted to the console |
| `scripts/audio-smoke.sh` | runs the smoke test in headless Chrome |
| `scripts/fetch-sfx.sh [prefix]`, `VERIFY=1 …` | re-fetch and re-cut the recordings; also re-check every licence |
| `npm run check-songs` | parse the nine songs without a browser |

The audio layer is always loaded; muting is a gain, so the sequencer keeps its place and unmuting
mid-bar is seamless.

---

## 8. Determinism and netcode

The audio layer is render-side in the sense of 01 §5 and 04 §1: the sim emits events, the renderer
turns some of them into particles and the audio layer turns some into sound, and no value computed
here is ever read back. It has its own randomness (take choice, pitch wobble, drum rate) and may fall
behind or drop sounds without affecting the game. Under rollback (05) a mispredicted event may have
already sounded; the plan is to fire sounds only from the confirmed frame for the one-shots that
cannot be taken back (kills, blasts) and from the predicted frame for everything else, which is
§10 #1.

---

## 9. Hooks not yet wired

Built and audible, waiting for the systems that call them:

- **ready** (a big timpani impact with a 41 Hz sub and `METAL`) and **win** (orchestral cymbals and
  bass drum with a `BELL` and a fifth swelling out of it) are defined and sampled for the round
  start and the winner; the demo has no round system yet (01 §10), so nothing plays them. The
  plan: the start stinger is the motif at double speed in the room's lead over the running song,
  which does not restart; the win stinger is the motif with a cadence in the room's instruments
  over `win`.
- **The hurry-up** (02 §6): `music.setTempo(1.15)` and `music.setTranspose(2)` at the bar line
  after the warning, taken up together, plus the ticking the round timer defines.
- **Per-player voice.** 03 §7 asked that power-up sounds get a per-player pan or voice. Pan is now by
  world position, which is the online-first answer (one player per browser hears their own screen);
  a per-character kill vocal (§10 #7) is not built.
- **Death slowdown (built 2026-10-11).** Each death briefly dips the music tempo by 10%, with a
  40 ms entry and 200 ms recovery over a 0.6 s envelope. Applied to new notes immediately rather
  than waiting for a bar line. Already scheduled notes finish, the song never restarts, and room
  changes clear the dip. The short lookahead can delay the audible change by up to 200 ms.

---

## 10. Open decisions

1. **Rollback and one-shot sounds** (§8): confirmed-frame only for kills and blasts, predicted for
   the rest, or everything predicted and accept the odd phantom kill?
2. **Music persists across rounds, or restarts?** Notes §7 argues it must not restart (mere-exposure
   wears out bar one). Proposed: persists; the start stinger overlays.
3. **Hurry-up: tempo and transposition together** (§9), or tempo alone? Proposed: both, once with
   the round timer; a step up reads as stakes where a tempo change alone reads as a glitch.
4. **Chapel's backwards layering**: a feature (the room darkens in sound and light) or confusing
   because it is the one room where a kill does not fill the music? Proposed: keep; it is the
   room's identity.
5. **The pit's missing landing**: the air fades and nothing lands. Proposed: keep; it is the one
   death whose sound is an absence, and that is what a pit is.
6. **Voice budget**: enforce a cap with priority (kills > blasts > throws > room) or trust the
   compressor and limiter? Proposed: trust them until a six-player test says otherwise.
7. **Per-character kill vocals** (§9): a short grunt or cry per character on a slice, or does the
   melon serve everyone (04's "characters are cosmetic")? Proposed: none; the kill is the object,
   not the victim.
8. **A type note per power-up** (03 §7): the take sound's lift ending on a different pitch per kind,
   or one sound for all? Proposed: one sound; the badge over the head carries the kind.
9. **Resolved 2026-10-11:** brief tempo slowdown on a death (§9), alongside the gameplay slowdown and zoom.
   Proposed: try the hold; it is cheap and it is what boss fights do.
10. **Sampled kicks and the key.** The synthesized kick is tuned to the song's root; the recorded
    kicks play at their own pitch (a 50 Hz kick under a D or an E room). Retune them per song
    (`playbackRate` by root), or accept it? Proposed: accept until Aaron hears a clash; a sampled
    kick's pitch is mostly its transient.
11. **Ambient room beds** (torch crackle, Pits drips, Icebox wind) as loops under the music, or let
    the music be the room? Proposed: music only.
12. **A menu / lobby theme** (05): the Cellar's song, a tenth song, or the motif alone?

---

## 11. Where the demo departs from this spec, and the rejected pass

- Spikes and vents report the nearest firing tile to the local player (§4.5) rather than emitting
  per-tile events; the real sim should emit `spikesUp`/`ventOn` events with positions and let the
  audio layer pick.
- Heat (§6.5) is a demo value in `main.ts`, not a sim quantity; the real game should derive
  intensity from the round state (players alive, time left, recent kills) that 01 §10 defines.
- `ready` and `win` are never played, and `setTempo`/`setTranspose` are never called (§9).
- Loops are keyed by demo object indices; the real sim's entity ids will replace them.
- The recordings are re-encoded from Freesound's 128 kb/s previews and the original WAV files from
  The Designer's Choice; if we ever need the Freesound originals (lossless), a free account can
  download them under the same licence.

**Draft v0, rejected (2026-10-10).** The first pass read the brief's "old-timey cartoons" literally:
a Warner-stage prop kit (slide whistles, cuckoos, boings, popgun corks, kazoo raspberries, splats,
a sad trombone, a "ta-da") with CC0 recordings of the props, and nine chiptune songs in the NES
palette (pulse leads, triangle bass, noise drums) in bright modes (Dorian, Lydian, pentatonic,
Mixolydian) at 100–160 BPM. Aaron: "I did not mean literally cartoon-sounding or cartoon-adjacent. I
meant creativity … how old-timey cartoons used to use sound effects of real objects … I want the
sound effects to be incredibly, incredibly, incredibly satisfying and to fit the sort of seriousness
and high stakes of the gameplay … Music is also very childish and upbeat. It's very one-note. The
timbre is very 8-bit … It needs to be hardcore. Similar to how roguelikes style their music for
their boss fights." What survived into v1: the engine and buses, the listener, pan and attenuation,
round-robin takes with pitch variation, the loops, the CC0-only pipeline and credits, heat driving
layers, one motif across nine rooms and the Chapel's inversion. Everything audible was replaced.


### Static fixes (2026-10-10)

The sequencer skips expired notes after a delayed callback instead of starting missed beats at
once. Muted intensity layers stop creating new voices after their fade. A loop key now replaces
its recipe with a short crossfade when its sound changes, so flight air cannot persist during
hover. The final safety shaper is linear below 0.9 rather than saturating the whole mix. The
music sidechain takes 4 ms to dip, and one-shot effects get 5 ms of scheduling lead time.

`npm run check-rules-audio` verifies delayed scheduling, flight/hover/return loop changes, a real
OfflineAudioContext mix (finite samples, no hard clipping), recorded asset decoding, and every
sound/instrument/room through the realtime audio smoke test.
