# Notes — audio (research behind docs/07)

Gathered 2026-10-10 in two rounds. The first (three passes: how the classic cartoon studios made
sound, music design for a nine-room party game, where CC0 recordings can be had) fed Draft v0, which
Aaron rejected the same day: he had meant the cartoon studios' *method* (a real object with the right
shape of sound standing in for the thing on screen), not their comic style, and wanted "incredibly
satisfying" effects that "fit the seriousness and high stakes" and music "hardcore, similar to how
roguelikes style their music for their boss fights". The second round (two passes: the foley and
substitution tradition and what makes a game hit satisfying; how roguelikes and action games build
boss music) fed Draft v1. Tags follow the other notes: **[V]** a source was fetched and says this
(URL in §9); **[M]** from memory or convention, not checked; **[I]** our inference for Boomerangeon.
Blocked during the passes: Fandom wikis, TV Tropes, Liquipedia, GDC Vault talk bodies (abstracts
only), FMOD and Wwise documentation (script-rendered), several designingsound.org and asoundeffect.com
URLs (404). Gaps are listed at the end of each section. Where 07 cites "notes §n" it means this
file; `src/audio/samples.ts` cites §5 for its pairings and `src/audio/songs.ts` cites §7 for the
room themes.

---

## 1. Substitution: how the sound stages did it

- **Jack Foley** (Universal, from 1929) performed effects live to picture, "everyday sounds, such as
  chewing, knocking on wood, and footsteps", and reckoned he walked over 5,000 miles making
  footsteps. He recreated *Spartacus*'s chained slave march with footsteps and keychains rather than
  reshooting; a cane made "the footsteps of two to three people"; cloth in his pocket stood in for
  movement. His colleague Joe Sikorsky: "you have to act the scene … you have to be the actors."
  The craft splits into feet, moves (cloth and body) and specifics (props, doors), over "Foley pits"
  of marble to gravel; the best of it "goes unnoticed by the audience". filmsound.org: good Foley
  artists "are audiles; they can look at an object and imagine what type of sound it can be made to
  produce". [V]
- **The recipes.** Halved coconut shells for hooves; cornstarch in a leather pouch for snow; frozen
  romaine for bone; cellophane for fire; gelatin and hand soap for squish; gloves for wing flaps; a
  thin stick or arrow for a whoosh; a heavy staple gun for gunfire; a metal rake for chain-link;
  walnuts in a glass for ice cubes; acorns on parquet for bones. Bacon frying is crumpled
  cellophane; rain is salt on tin foil; a bullet hit for gore is layered with "the sound of a melon
  being gouged"; an **impact sweetener** is "a hammer pounding hardwood, equalized so that only the
  low-end can be heard"; a sputtering engine is a pencil down a washboard; a slow-motion fall is "a
  broom whooshing by a microphone, pitch-shifted down and time-expanded". Epic Sound's working
  list: body hits are rolled newspapers struck with a soft stick or real meat; bone breaks are
  things inside a cooked chicken beaten with a sledgehammer; a blow to the head is a watermelon
  with cream crackers stuck on, hit with a bat; gore is wet wash leather, tomatoes, potatoes; a
  spear into flesh is biting an apple; fire is breaking matches or bubble wrap; explosion debris is a
  box of rubbish struck with a hammer, "slowed down with boosted low end"; an arrow is a bamboo
  garden stick whipped past the mic; a sword swing is a plank swung and layered; a sword draw is a
  steel spatula pulled off a tray; a boulder is a car rolling downhill on gravel, engine off. Kate
  Finan: "the best recordings are made from items which are different from what you actually see
  on screen" (a loose doorknob for gun foley, celery for bone). [V]
- **Ben Burtt** wanted an "organic soundtrack" against the electronic tones of earlier science
  fiction: the blaster is a hammer on a radio tower's guy-wire, the lightsaber a projector motor's
  hum plus a television's interference picked up by an unshielded mic, its movement made by swinging
  a microphone past a loudspeaker; the TIE fighter an elephant bellow over a car on wet pavement;
  Imperial walkers a punch press and bicycle chains dropped on concrete; a landspeeder freeway noise
  through a vacuum-cleaner pipe; spaceships a motel air conditioner slowed to "a massive rumble".
  For *Raiders*: the boulder is a Honda Civic down a gravel hill, the Ark lid a toilet cistern, the
  snakes hands in cheese casserole and wet sponges on grip tape. For *Last Crusade*: a balloon for
  earthquake tremors, chickens for rats. And the **audio black hole**: under a second of absolute
  silence before the seismic charge, because "they used to leave a few frames of silence in the
  track just before a big explosion." [V]
- **Gary Rydstrom** built *Jurassic Park* from scratch with "no stock sound effects": the T. rex
  roar is a lion, a tiger, a baby elephant and alligators; the raptors twenty to thirty animals
  including dolphins, walruses, geese and mating tortoises; the Brachiosaurus a whale, a cow and a
  donkey; footsteps are redwoods crashing; the Gallimimus being torn is a dog on a rope toy. The roar
  was reused for three later films. [V]
- **The cartoon studios were doing the same thing** with a different brief. Treg Brown's Warner
  library (1936–63) favoured the incongruous: Mel Blanc said his job "wasn't to simulate realism
  but to defy it" because the incongruous "would be so much funnier". Jimmy MacDonald (Disney) built
  five hundred devices and made Tick-Tock from castanets. [V] The method is the same substitution;
  only the target changed: Brown aimed for the laugh, Burtt and Rydstrom for conviction. **We take
  the method and Burtt's target.** [I]
- **Fighting games** are where the melon tradition became "satisfying": Mortal Kombat's Dan Forden
  made every sound alone and voiced the grunts; how its punches were built is not documented on any
  page reached. [V, method unverified]

Gaps: a single canonical statement of the "melon and cabbage for flesh and bone" rule (found
piecemeal); Indiana Jones's punches as bats on leather jackets (unverified); Brown's specific
pitch-shifting of real objects.

## 2. What a satisfying hit is made of

- **Layering is the tool.** "The most common sound design tool is the use of layering to create a
  new, interesting sound out of two or three old, average sounds." [V] Helldivers 2 splits every
  explosion into "attack, body, and tail", each with several variations, and gives every stratagem
  three beats (launch, incoming, explosion); heavy weapons got "big mechanical clunks" and "bigger
  tails and impacts" to convey mass. [V] SAROS built weapons from granular layers so that "simply by
  swapping out a single layer, we could drastically alter how the weapon sounded", pairing "acoustic
  elements you would naturally expect to hear" with "heavily synthesised, abstract layers"; some
  tails were processed ice-cube recordings. [V]
- **The transient.** Acoustically "a high amplitude, short-duration sound at the beginning of a
  waveform" with more high-frequency and non-periodic energy than the body. [V] Clicks separated by
  1–5 ms fuse into one event; complex sounds fuse up to 40 ms; above 50 ms an echo is heard as
  separate. [V] So a synthesized click under a recording reads as part of the same hit if it leads
  by a few milliseconds, and the kit's layer offsets (3–30 ms) stay inside the fusion window. [I]
- **The sub, and pitching down for weight.** The "hammer on hardwood, low end only" sweetener [V];
  Cairn mixes "a bass layer recorded with a geophone, which captures the vibration of the rock" under
  footholds, after Nicolas Becker called a foothold "a bodily sensation" [V]; Burtt's slowed air
  conditioner and elephant, the pitch-shifted broom, Helldivers' household objects "pitched down" for
  creature voices [V]. Laptops cannot reproduce the sub, so the kit gives it a saturated shadow
  (`drive`) that they can. [I]
- **Silence and contrast.** Burtt's black hole before the blast [V]; Cairn: "It felt important not
  to shy away from silence", and energetic music "removes tension and makes it feel safe" [V]; Randy
  Thom on distance and pauses (first round) [V]. Our catch stops the flight loop in two ticks, and
  the pit has no landing. [I]
- **Not everything loud.** Battlefield 6's David Jegutidse: "If everything is loud than nothing is,
  and the whole mix becomes very flat"; they lean into "dirty, clipped, organic, messy, and
  unprocessed sound", a "found-footage approach versus the Hollywood approach", and build
  "sequential stories of multiple sounds rather than overlayering too many sounds at once", jumping
  "from one intense and memorable moment to the next rather than a consistent wall of noise".
  Source quality first: "everything starts with the quality of your source content" (they dropped
  cars and concrete barriers from 70 ft onto shipping containers to get it). [V]
- **Fatigue.** SAROS: "The more satisfying and powerful you make the sounds, the more fatiguing they
  can become over time." Helldivers dulled brightness over sustained fire. COCOON: feedback sounds
  must "feel exciting and iconic, whilst not being overpowering in the mix when often repeatedly
  played". [V] Hence the frequent sounds (throw, bounce, swing) are short and dry and only the
  decisive ones get a tail. [I]
- **Feel comes from the pairing with picture.** Joonas Turner (Nuclear Throne): "no individual
  backing track or sound effect will elevate your work"; he pairs effects with "crazy screen shake"
  to make a game "feel tighter and more coherent by sound". Many of Nuclear Throne's sounds are his
  voice. [V] Our kill flash, hit-stop and shake (04 §4) and the slice duck are one event. [I]

## 3. Variation, repetition and signatures

- **Vary the frequent.** Godot's `AudioStreamRandomizer` picks a stream from a pool, with
  `PLAYBACK_RANDOM_NO_REPEATS` ("avoid playing the same stream twice in a row") and random pitch and
  volume offsets [V]; A Sound Effect's primer: ten sword swings, one at random at varying volume
  [V]; Helldivers gave every explosion layer its own variations and let several designers each make
  explosions for "such a varied palette" [V]; "dynamic audio" in Wikipedia's definition is
  non-repeating footsteps [V]. Rule adopted: 2–3 takes per event, never the same take twice running,
  ±0.5 to ±1.5 semitones on the recording and its under layer together. The practitioners' exact
  cent ranges were not found. [I]
- **Fix the signatures.** Kate Finan: "I consider anything that will clearly appear in a series again
  and again to be signature", build those from a new palette, and don't over-specify the recording
  list or "you close off your brain to considering other options" [V]. SAROS made attack cues
  tonal: "The main spine of a vocalization had to be very tonal. We needed a strong fundamental so
  that the vocalization could cut through the mix", so "players should be able to dodge or parry
  attacks just by listening" [V]. Dark Souls 3 players "rely on sound to memorize the rhythm and
  pattern of the boss's attack", which is why blindfolded runs are possible [V]. Film reuses its
  signatures verbatim: the Wilhelm scream in 400+ films, Rydstrom's roar three times over [V].
  Adopted: deflect, arm, beep, slice, shieldPop and the gate's iron note never vary in pitch; the
  deflect's fixed anvil note and the arm's single gun-cock take are the two sounds a player must
  recognise with their back turned. [I]
- **Bridgett's three principles**: Simple ("removing unnecessary layers"), Beautiful (finesse the
  "breakages, fractures and dead spots that reveal the technology underneath"), Unique (instantly
  recognisable and tied to the game); "without good design, the technology is often of very little
  consequence". [V]

## 4. Mixing so a six-player room stays readable

- **Murch's law of two and a half**: with similar sounds, "three is the borderline where you cross
  over from 'individual things' to 'group'"; capacity rises to about five when the layers spread
  across speech, effects and music. "Dense clarity / clear density" is "everything happening at once
  – Density – yet everything heard distinctly – Clarity", got "only … by a kind of subterfuge": the
  *Apocalypse Now* attack was "a shell game where layers are disappearing and reappearing". [V]
- **Priority by meaning, not loudness.** Overwatch's director set "Play by Sound" as the goal for
  twelve players with unique kits, and enemy footsteps are louder than allies' [V]; Battlefield 6
  plays enemy foley "350% louder" than friendly and routes enemies aiming at you to a "threat-bus"
  that sidechains lower-priority sounds [V]; Helldivers 2 ranks sources so "your own weapon fire will
  be ducked by the sound of you taking damage and an objective being completed might even duck a
  grenade explosion", reduces off-screen sounds to free headroom, and tiers enemies so the dangerous
  ones "dominate the mix" [V]. SAROS groups simultaneous impacts by proximity and type and gives only
  the top groups an emitter [V]. Ours: a view-based listener with fade past the edge, per-event
  minimum gaps, and a duck hierarchy by consequence (blast > squash > slice > burn > beep > parry).
  A voice cap is 07 §10 #6. [I]
- **Duck the music, by band.** Helldivers uses dynamic EQ to duck "only the lowest music frequencies
  for the first few ms of an explosion, sparing the tail", compresses the music harder the more it
  is ducked, and notes "the louder the game is overall, the more ducking and dynamic EQ we could
  afford" [V]. We split the music at 110 Hz and duck the *highs* fully and the lows 40 %, the
  opposite choice, because our kills carry their own sub and what competes with the slice's whoosh
  and crack is the melodic body, while the kick keeps the groove under the hit. Worth an A/B when
  Aaron listens. [I]
- **Loudness tiers.** Rob Bridgett on *Prototype 2*: −23 LU was "too quiet and inhibiting …
  particularly for intense action"; the final targets ran −23 for ambience, −19 for action and −13
  for "insane action", with three ducking tiers and state-based snapshots for gain, sends and
  filters; two user mixes, full dynamics and a TV-speaker mix with "some subtle compression" [V]. Our
  compressor, limiter and clipper are the TV mix; a full-dynamics option is a later question. [I]
- **Dynamic range as a feature.** Frostbite's HDR audio (Bad Company, 2008) "allowed differing sound
  levels to be perceived by the player"; Battlefield's soundscape is praised as "complex, dense …
  that never seems to clutter"; Portal 2's doors and portals are "almost musical" with tonal
  consistency [V].
- **Sync windows.** Detectable lip-sync error runs from 45 ms lead to 125 ms lag (ITU); film works to
  ±22 ms. [V] Web Audio's output latency "varies depending on the platform" [V]; we schedule effects
  at `currentTime` on the event's frame and accept the device's latency. [I]

Gaps: Overwatch's friendly/enemy ultimate lines; a quoted "100 ms rule"; Sekiro's deflect sound
design; practitioners' pitch-variation ranges in cents.

## 5. The brief for Boomerangeon's events

Every hit is a stack in arrival order, with the kit primitive for each stage and the recording as
one layer among them. [I] throughout, grounded in §1–3; `src/audio/samples.ts` is the record of what
was built and 07 §4 the table.

| Stage | Window | Kit | Reason |
|---|---|---|---|
| transient | 0–5 ms | `click` | the microphone and the encoder soften it; the fusion window (§2) lets a synthesized click lead the recording |
| body | 5–100 ms | `thump`, `smack` | the weight and the material's first answer |
| sub | 0–400 ms | `sub` (+ `drive` shadow) | the "low end only" sweetener; the geophone layer |
| resonance | from 3 ms | `modal` with material ratios | what was struck; fixed for signatures |
| tail | from 30 ms | `bloom`, `debris`, `crackle`, `shatter`, `rattle`, `rumble`, `hiss`, `whoosh`, `scrape`, `sweep` | only decisive events, against fatigue |

**The objects**, chosen for the shape of their sound, not their name:

- **Throw:** a whip crack (a wrist snap and air cut), a bullwhip swung, a bowstring released; the
  arm's weight under. **Swing:** a staff or stick through air. **Catch:** a baseball into a leather
  glove, a glove through a contact mic, a glove slap; the blade's faint metal ring says *boomerang*.
  **Bounce:** a rock on wood, a clack, a metal ping; the sim raises the pitch a semitone per bounce
  so the ear counts. **Bumper:** basketballs and a fist on drywall over a rubber ring.
- **Deflect:** kitchen steel clashed, a short sword clash, over the fixed anvil note. **Arm:** a gun
  cocked, two clicks, one take; a sub settling and a sawtooth charge rising say *live*. **Beep:**
  synthesized struck steel, damped, fixed pitch. **Blast:** a real explosion and two firework
  reports with a 30 Hz sub and rumble; the fuse beeps duck the music before it.
- **Slice:** a knife on foley flesh, a knife into a melon, a swede stabbed (the gore tradition of
  §1); a 110→45 Hz thump and a 48 Hz sub arrive 30 ms after the blade. **Burn:** a gas barbecue
  igniting, a fire burst. **Fall:** a whoosh slowed and faded, no landing (the cliché page's
  fading scream, inverted: ours fades the air, not a voice). **Squash:** a foot on an egg, a lemon
  crushed, a groin crunch, the biggest body in the kit and the crusher's own metal. **Shield pop:** a
  balloon over synthesized glass: it landed and did not count.
- **Room:** crates breaking; a match struck for the barrel; a bush cut and leaves for grass; ice
  cracking recorded from inside the block; steam; a trap, a blade unsheathed, a knife slash for
  spikes; a blowtorch and a flamethrower for vents; a 750 kg chain pulley and a gate swung shut over a
  fixed iron note; wood creaks; a rope cut and a chain dropping, then a prop chandelier shattering and
  a Coca-Cola bottle smashed; rubble; whooshes reversed so the swell is the arrival (the portal).
- **Power-ups:** a meditation chime, a coin and a thin clank, a desk bell and a sherry glass, a
  hand cymbal choked, a lit match dropped in water. **Players:** cloth rolls and drags for the dash
  (Foley's "moves"), suction cups for phantoms, an air burst for Blink, a body on the ground and a
  pillow into a wall for the landing. **Stingers:** a big timpani and an orchestral hit, wired to
  nothing yet.
- **Loops stay synthesized** (flight, hover, saw, cart, boulder, pendulum, fuse): a recording cannot
  follow a speed; the flight's Doppler is deliberately backwards (effort out, weight home).

Rules: a recording is one layer and never carries the weight; signatures fixed, everything else
varied; frequent sounds short and dry; the kill is the biggest sound; the music ducks by band.

## 6. The cartoon pass, kept as history

What the first round found still bears on the game; what it built does not.

- **Stalling, Brown, Jones, MacDonald, Bradley, Curtin** (first round, all [V]): Stalling fixed the
  tempo before animation so action landed on beats; Brown built the Warner library and sped up Paul
  Julian's car-horn imitation for the Road Runner; Chuck Jones's Coyote rules ("the Coyote is always
  more humiliated than harmed") are a sound brief; William Hanna trimmed Tom's scream to "only the
  strongest part" (a transient-only edit in the 1940s); Hoyt Curtin wrote Hanna-Barbera cues so that
  "if you cut it into bits and pieces and rearranged them, they would still flow".
- **Kept:** pitch encodes size (sped-up = small; timpani = heavy); anticipation → beat → payoff
  (wind-up, a hole of silence, the hit); contrast (Thom); variation (Hanna and Bradley avoided
  identical hits; H-B's weakness was audible reuse); modularity for stingers (Curtin); the
  recording-of-a-real-thing as the raw material (the whole §1). [V][I]
- **Dropped:** sound as punchline, humiliation not harm, the prop library (slide whistle, flexatone,
  ratchet, popgun, cuckoo, boing, sad trombone), and the comic reading of "defy realism". Aaron's
  words on hearing it: "I did not mean literally cartoon-sounding or cartoon-adjacent … I want the
  sound effects to be incredibly, incredibly, incredibly satisfying and to fit the sort of
  seriousness and high stakes of the gameplay." [I]
- **Modern games that borrow the cartoon rules without the props** (first round [V]): Cuphead's live
  big band, Untitled Goose Game's sliced Debussy, Fall Guys' "falling over is funny", Gang Beasts'
  grunts, Worms' voice banks. Boomerang Fu itself: audio by designer Paul Kopetko, nominated for
  Best Sound at the 2020 Australian Game Developer Awards; a reviewer's commenter heard the slash
  "land with a very satisfying and meaty sound effect". That is the bar, not the gag. [V][I]

## 7. Music: a boss fight in nine rooms

### 7.1 What the practitioners say (first round, still standing)

- **Serve the action.** Koji Kondo scrapped a Super Mario Bros. draft if it failed to "accentuate the
  action" or clashed with the effects, and raised the tempo once the game sped up; four places, four
  meters and modes. [V]
- **Loops must survive repetition.** Kondo wrote so short segments "could be endlessly repeated …
  without causing boredom" [V]; Bornstein's mere-exposure meta-analysis: liking peaks around 10–20
  presentations, then falls [V]; restarting at bar 1 every round gives the first phrase all the
  exposure [I]. Winifred Phillips on short timed play: change the music "for nearly every eight bar
  sequence", three tempo tiers, vertical layers unlocked by success (Low: patterns and a clock; Mid:
  bass and "head-nodding drums"; High: the theme in brass), music as "a warning system and
  information source". [V]
- **The toolbox.** Michael Sweet: loops, horizontal re-sequencing, vertical remixing, stingers,
  real-time tempo; vertical for continuous intensity, horizontal for events, phrase branching waits
  for the phrase end. [V] Grant Kirkhope's Banjo-Kazooie fades layers of the same composition. [V]
- **One theme, many surfaces.** Wintory's Journey (one theme, the cello as the player) [V]; Lena
  Raine's Celeste (an instrument per character, motifs colliding) [V]; Darren Korb sets rhythms
  against each other, five over three, for tension [V]; Doseone gives each Gungeon floor two tracks
  plus boss, post-boss, shop and secret-room tracks [V].
- **Stingers and tempo.** Smash victory themes quote the fighter's franchise melody as a stinger
  before a results loop; SMB's "Timer Warning" pauses the music and resumes it sped up [V]. Allegro
  120–156, Vivace 156–176, Presto 168–200 [V]; our throw is 24 ticks = 400 ms = one beat at 150 BPM,
  so throws land on beats in the 150 rooms [I]; swing narrows as tempo rises, so the swung room sits
  at 140 [V][I].
- **Ducking** is side-chain attenuation [V]; Shovel Knight let effects play alongside the music
  rather than steal a channel [V].
- **Web Audio craft.** Chris Wilson's two clocks: timers only open scheduling windows, notes are
  placed by `currentTime`; "100ms of 'lookahead' time, with intervals set to 25ms" to start [V] (we
  run 200 ms and 40 ms). A `ConvolverNode` with a generated decaying-noise impulse, one per bus [V].
  `setTargetAtTime` approaches 63 % per time constant, so a third of the wanted duration reaches 95 %
  [V]. AudioParam methods "take precedence over" `.value`; never mix them on one param [V]. Buffer
  sources are "fire and forget", one `start()` each, buffers reusable [V]. `playbackRate` resamples
  with "no pitch correction", so it is the pitch control for a take; `detune` in cents compounds
  with it [V]. `decodeAudioData` resamples to the context rate and wants whole files [V].

### 7.2 Boss music: how the roguelikes and the action scores do it

- **Mick Gordon, DOOM (2016).** id told him not to use guitars or write metal, which they thought
  "corny"; he started from synthesizers to imagine what the game's "Argent energy" would sound like:
  "we started for about six to nine months doing just synthesisers", and the guitar crept in, "if we
  can add five percent guitar in here, everybody will love it", then ten, then fifteen. "We didn't
  say, 'Let's make a metal soundtrack.' We went synths and kickdrums, and then we ended up working in
  metal elements." He "designed several chains of effects units through which he passed sub-bass sine
  waves", "layered with white noise to make them audible on widely available speaker equipment".
  Mars levels use human-made sounds; Hell is "more atonal, dissonant and weird". Sources included old
  cassettes, old guitar pedals and an antique Soviet synthesizer. The brief of his GDC 2017 talk: "a
  high-energy modern first-person-shooter soundtrack that unashamedly sits front-and-center". Best
  Music/Sound Design, The Game Awards 2016. [V] The lesson taken: build from the sub and the kick,
  add the guitar as a layer on top, and give the sub a shadow small speakers can hear (our `drive`
  under the kit's `sub`, the pumped `dbass` under every song). [I]
- **Darren Korb, Hades.** "Mediterranean prog rock Halloween": bouzouki, lavta, baglama and metal
  guitar ("Metal comes from Hell, everyone knows this"). On boss music: "it's got to be a harder
  version of the main theme that goes more places." Three FMOD stems, drums / bass / everything else:
  exploration is drums off with bass and guitar semi-randomised, combat puts the drum stem on, boss
  and mini-boss get the full "rocking section", victory an ending tag; about two and a half hours of
  music for players who "play it for dozens, hundreds of hours". For tension (on Transistor),
  "rhythmic elements that fight a bit" (a piece in 5 with the bass in 3). Boss tracks run
  5:53–9:01. [V] Our kits are
  Korb's drum stem: the fight decides the drums; the Greenhouse pluck in twos against the threes is
  his fighting rhythms. [I]
- **Lena Raine, Celeste.** "the soundtrack in general plays a lot with dynamic mixing and track
  progression which let us take parts away or build up a track"; Badeline's theme "I wrote it
  literally as a minor inversion of Madeline's theme"; Madeline's "small, tenuous piano line … gets
  completely engulfed in synths". [V] The B sections answer the motif with its inversion after her. [I]
- **Christopher Larkin, Hollow Knight.** "We definitely started with the soft piano and viola in the
  opening menu and 'Dirtmouth,' but we pull out all the stops for the boss battles"; "the melancholy
  and a certain sadness is still evident in a lot of these, underneath the crazy runs and shredding";
  an organ for the Soul Sanctum's "sacredness". [V] The Chapel's organ and bells under the drive. [I]
- **Furi.** Electro and synthwave chosen "to excite the player and make the game stand out"; each
  track "designed and created specifically for the game and the boss/area", the artists briefed on
  each boss's design, personality and arena; Carpenter Brut's tracks required "several loops". [V]
  One song per room, written to the room's hazard family, is the same brief. [I]
- **The roguelikes' lengths and attitudes.** Chris Christodoulou's Risk of Rain is progressive
  electronic rock, 2:23–4:44 a track in the first game and up to 11:38 in the second; Yoann Laulan's
  Dead Cells boss tracks run about 3:40–4:16 with the final at 6:21 and a separate track per Dracula
  phase in the Castlevania DLC; Ridiculon's Binding of Isaac: "Many guitars were maimed in the making
  of this. Drums were punished and voices scraped to the utmost", "An analogue bull in the chip-tune
  china shop"; Doseone's Gungeon is "BEATS, STRINGS, SING, CHIP & ATTITUDE" with boss tracks
  1:36–3:13; Jukio Kallio's Nuclear Throne tracks run 1:00–2:40; Crypt of the NecroDancer orders its
  zones by ascending tempo and its remix albums must keep the originals' lengths and BPMs. Junkie XL's
  *Fury Road*: "hundreds of drums" and "electric guitar-driven themes". [V] Where a boss fight lasts
  minutes the tracks run long; our rounds last thirty seconds and the same room is heard across many,
  so the anti-fatigue work goes into a 38–70 s form with two B sections instead. [I]
- **The grand tradition.** Okabe's Nier: Automata boss theme has a three-part chorus; Uematsu built
  "One-Winged Angel" from "various phrases over the course of two weeks and putting them together as
  if it was a puzzle", with Latin from *Carmina Burana*, and "Dancing Mad" runs 17:35; Jesper Kyd's
  Hitman uses "deep brooding Latin" choir, Darktide "industrial heavy synths and epic gothic choirs";
  "Duel of the Fates" is a choir singing Sanskrit over an ostinato. [V] Choir and organ are the
  sound of size; the Gatehouse's open-fifth choir and the Chapel's mass use them. [I]

**The devices, verified:**

- **Modes.** Phrygian's ♭2 gives its dark colour and it is heavily used in metal and film scoring;
  Phrygian dominant (harmonic minor's fifth mode) is the characteristic flamenco, Middle-Eastern
  and metal scale; harmonic
  minor's raised seventh makes an augmented-second gap common in metal and neoclassical shred; the
  tritone is "diabolus in musica" (Black Sabbath's title track). [V] Ours: Aeolian, Phrygian and
  harmonic minor, chosen so every room has the ♭6 the motif needs; the Pits, Gatehouse and Chapel
  lean on the ♭2. [I]
- **Ostinato, pedal, chromatic descent.** An ostinato for drive and tension (Holst's "Mars"); a pedal
  point building tension against changing harmony; chromaticism and the lament bass for dread;
  *Master of Puppets* opens with "a chromatic descent, followed by an ascent based on the tritone";
  *Jaws* is a two-note minor-second ostinato Spielberg first laughed at. [V] Pedal-tone riffs in the
  Cellar, Greenhouse and Forge, the Forge's chromatic climb, the Greenhouse's Andalusian descent. [I]
- **Drum density, not tempo.** Half-time "doubles the perceived bar length, making the beat feel
  heavier"; a breakdown is a half-time, heavily palm-muted section; a blast beat is "a repeated,
  sixteenth-note figure played at a very fast tempo" at 180–280 BPM; double bass drumming traces to
  Motörhead's "Overkill"; drumstep is a half-time beat over drum and bass's 165–185 BPM. [V] The
  light and heavy kits change density at a fixed tempo; the Pits and Gatehouse are half-time rooms;
  the Cellar's B2 is a breakdown. [I]
- **Distortion that stays clean.** A power chord's root and fifth sit near 3:2, so under distortion
  the intermodulation stays harmonic and "a new fundamental frequency component appears an octave
  lower than the root note", while thirds become "messy and indistinct"; palm muting gives "a
  tighter and more precise sound"; djent is palm-muted, high-gain, low-tuned, syncopated chug;
  guitar speakers roll off above ~5 kHz and below ~75 Hz, which is "part of the guitar sound". [V]
  Our guitar plays roots and fifths only, gated short for the chug, into a lowpass and mid-scoop
  cabinet. [I]
- **Kicks.** Hardstyle runs ~150 BPM on "overdriven and hard-sounding kick drums" shaped by
  "distortion, equalization and layering" and pitched into basslines; the TR-808's long-decay kick
  became the "808 bass". [V] The synthesized kick is tuned to the song's root; the Pits ride an 808. [I]
- **Risers.** The Shepard tone "seems to continually ascend or descend in pitch, yet which
  ultimately gets no higher or lower"; *Dunkirk* uses the Shepard–Risset glissando "to create the
  illusion of an ever increasing moment of intensity". [V] A candidate for the hurry-up (07 §9). [I]
- **Production.** The supersaw is the Roland JP-8000's (1996) seven detuned saws, a staple of trance
  and hardstyle; Attack Magazine's recipe sets detune "just before half way" with fine detune ±0.09
  and octaves spread, drive about a third. The Reese is two detuned saws beating (Kevin Saunderson,
  1988, on a Casio CZ); Attack's redux: ±0.27 semitones, mono, a 24 ms release. "Basslines
  sidechained to the kick drum are a ubiquitous sound in contemporary dance music." Parallel
  compression keeps transients; a limiter is a compressor at a very high ratio. [V] Our supersaw,
  reese, pump and limiter. [I]
- **Form.** Dubstep drops come after 16- or 32-bar builds; the drop is the climax after the
  breakdown; pop form builds through a pre-chorus to a chorus lift. [V] Sixteen bars A+B, a riser
  into the join in the Lab, the drop proper as the Pits' B1. [I]
- **Fatigue.** Bornstein's 1989 meta-analysis (208 experiments, r = 0.26): liking peaks around 10–20
  presentations, and Montoya (2017) found the inverted U; Glenn Miller: "If you repeat your figure
  too often, it will start to bore the listener"; game loops are "probably between one and four
  bars"; Furi's tracks needed "several loops"; Korb wrote 2.5 hours for hundreds. [V]

Not verified: Gordon's drop tunings and the "doom instinct" phrase; the mapping of "Dancing Mad" to
Kefka's tiers; Kondo's GDC 2007 remarks verbatim; Michael Sweet's pros and cons of each technique;
Risk of Rain 2's teleporter music; Adam Szabo's exact JP-8000 detune measurements (the songs use
−19, −11, −3.3, 0, 3.4, 10, 17 cents from memory).

### 7.3 The design, as built

**One motif.** 1 – 5 – ♭6 – 5 – 1, long–short–short–long: out, up a fifth, a half step into the dark
note, back, home. All nine modes have the ♭6 (Aeolian, harmonic minor, Phrygian), so the motif is
identical in every room and the room is told by everything around it. The B sections answer it with
its inversion 1 – 4 – ♭3 – 4 – 1. [I]

**Form against fatigue.** Sixteen bars A+B, with two B sections (B1 in `seq`, B2 in `alt`) on
alternate passes, so the form recurs every 32 bars (38–70 s per room); no B ends on the tonic, so
every drop back into A is an arrival; nine meters and grooves across the roster so a session never
settles. [I] (Bornstein's ceiling, Kondo's repetition, Phillips's eight-bar changes.)

**Vertical layers and kits.** Layer 0 the groove, 1 harmony, 2 the lead, 3 the top (choir, high
line), faded with a 0.25 s constant; `light` and `heavy` drum tracks swap at bar lines with hysteresis
(two hot bar lines in, four cool out, a crash on the swap), so a single throw never flips the kit.
A `pump` instrument dips every `pumped` track per hit (0.3–0.65 by room). The Chapel runs the layers
backwards: intensity is the share of chandeliers still hanging. [I]

**Timbres.** Seven-saw supersaw (the JP-8000's seven detuned saws [V]) at Adam Szabo's measured
detune offsets (−19, −11, −3.3, 0, 3.4, 10, 17 cents) [M]; guitar as saw stacks into a high-gain waveshaper and a cabinet EQ (lowpass, mid scoop,
presence peak); reese as two detuned saws through a slow filter; formant choir; a −4 dB notch at
3 kHz on every song so the transients of §2 keep their band; drums as CC0 one-shots in round-robin
with ±1.5 % rate, the synthesized drum as fallback, the reversed cymbal placed to end on the
downbeat. [I]

**The room table as built** (07 §6.3 has the full plans):

| Room | Mode · meter · BPM | Groove | Signature hit |
|---|---|---|---|
| Cellar | D minor · 4/4 · 150 | guitar sixteenths on a pedal, four on the floor, supersaw stabs | orchestral hit |
| Pits | E Phrygian · half-time, swung · 140 | 808 and reese, a two-step when hot | sub impact |
| Greenhouse | G minor · 12/8 · 150 | gallop, shuffle kit, a pluck in twos against threes | taiko |
| Forge | A harmonic minor · 4/4 · 140 | anvils on two and four, taikos, brass, a chromatic climb | anvil |
| Lab | C minor · 4/4 · 168 | sixteenth arpeggio, four on the floor pumping everything, a riser every eighth bar | sub impact |
| Armoury | E harmonic minor · 7/8 · 172 | a riff that lands early every bar | clang |
| Icebox | D minor · 6/8 · 150 | taikos on the big beats, saw arpeggio, glass | bell |
| Gatehouse | G Phrygian · half-time march · 128 | taikos and timpani, low brass, snare line, choir | orchestral hit |
| Chapel | E Phrygian · 4/4 · 110 | organ, bells and a slow taiko; voices fall with the chandeliers | bell |

Dropped from the first pass: the bright modes (Dorian, Lydian, pentatonic, Mixolydian), the NES
palette, the echo voice, 100–160 BPM. Kept: one motif, theme = place, heat-driven layers, the Chapel
inversion, the 150 home tempo. [I]

**Loop test checklist** for Aaron's listening pass (none of it run by ear yet): (a) the join: no
click, no tonic on the last beat, A arrives; (b) twenty passes with effects muted, mark any bar you
dread; (c) every effect over the loop, nothing masks the beep, the blast or the pickup; (d) the
groove alone is listenable, each layer adds something, each removal sounds intentional; (e) a duck
on every beat position; (f) a room swap on every bar: the hit lands, no double downbeat; (g) kit swap
in and out, no stumble; (h) nine rooms at full layers under 5 % main-thread time, compressor
reduction above −6 dB; (i) **identity**: four bars of each room blind, name the room, hear the
motif; (j) a kill in each room: does the duck read as the hit landing or as the music failing? [I]

Gaps: Boomerang Fu's actual per-arena music behaviour; Overcooked's end-of-level speed-up; any
published tempo survey of boss music; the items listed as not verified under §7.2.

## 8. Where the recordings came from

The rule: the repository redistributes the clips with its source, so only **CC0 / public domain**
qualifies; a licence that permits use but not redistribution with source is out, and attribution or
non-commercial terms would bind every fork. What was used, 119 clips in all (`docs/audio-credits.md`
lists each):

- **Freesound** marks each sound's licence on its page; CC0 pages link
  creativecommons.org/publicdomain/zero/1.0 ("No Copyright … copy, modify, distribute and perform the
  work, even for commercial purposes, all without asking permission") [V]. The anonymous "hq"
  preview MP3 (~128 kb/s) is a derivative of the CC0 work; the lossless original needs a login [V].
  **109 sounds by 92 uploaders** taken: the real objects of §5 and the drum one-shots (kicks, snares,
  claps, hats, ride, crashes, toms, alfaias, timpani, a cinematic hit, sub drops, anvils, a clang,
  reversed cymbals).
- **The Designer's Choice** (Nicholas A. Judy) on archive.org: UCS-named collections with
  `licenseurl` CC0 1.0, creator "Nicholas A. Judy", description "recorded, edited and designed by
  Nicholas A. Judy at The Designer's Choice … You can credit me or not" [V]. Creator-asserted CC0;
  his Freesound uploads are CC BY, so only the archive.org files are used, and only files carrying
  his `_Nicholas Judy_TDC` suffix [V][I]. **10 clips** taken from the Cloth, Fight, Glass, Bells,
  Metal and Musical collections.
- **Verification.** `VERIFY=1 scripts/fetch-sfx.sh` re-reads every Freesound page and every
  archive.org metadata record and fails unless each shows the CC0 1.0 URL; the whole set passed on
  2026-10-10. [V]
- **Excluded.** Mixkit: "You can't redistribute the Item on its own, as stock, in a tool or
  template, or with source files" [V]. Pixabay, Zapsplat, Sonniss: redistribution terms or blocked
  pages [V][I]. SoundBible: self-asserted licences of unclear provenance [I]. archive.org items not
  the uploader's to license (Warner's "Crash! Bang! Boom!", Sound Ideas kits) [I]. Anything CC-BY or
  CC-BY-NC. Kenney's Impact Sounds (CC0) were used in the rejected first pass and dropped with it. [I]

The music is original note data rendered by our synthesizer; the only recordings in it are the CC0
drum one-shots above, with a synthesized drum as the fallback until they load.

## 9. Sources

**Substitution and the satisfying hit (second round, all fetched):** Wikipedia on Jack Foley, Foley
(filmmaking), Sound effect, Sound design, Ben Burtt, Lightsaber, Star Wars (film), TIE fighter,
Raiders of the Lost Ark, Indiana Jones and the Temple of Doom, Indiana Jones and the Last Crusade,
Wilhelm scream, Treg Brown, Wile E. Coyote and the Road Runner, The Great Race, Jimmy MacDonald,
Gary Rydstrom, Jurassic Park, Mortal Kombat (1992), Mortal Kombat II, Dan Forden, Transient
(acoustics), Precedence effect, Audio-to-video synchronization, Frostbite (game engine), Celeste,
Doom (2016), Dark Souls, Sekiro; filmsound.org (/foley/, /foley/jackfoley.htm, /terminology/foley.htm,
/starwars/, /cliche/); epicsound.com/sfx/; transom.org/2005/walter-murch/;
boomboxpost.com/blog/2018/9/10/designing-signature-sounds…; designingsound.org
(designing-signature-sounds 2018-10-11; the-sound-of-battlefield-v 2018-11-05); asoundeffect.com
(helldivers-2-game-sound-design, battlefield-6-game-audio, saros-game-audio, cairn-game-audio,
cocoon-game-audio, 3-game-sound-design-principles-rob-bridgett, gameaudioexplained);
gamedeveloper.com (meet-joonas-turner-vlambeer-s-sound-guy; video-how-great-sound-design-can-make-
your-game-feel-better; video-crafting-the-sound-of-hyper-light-drifter; 7-games-worth-studying-for-
their-excellent-sound-design; composer-darren-korb-talks-audio-middleware…; game-audio-overview-
sound-effects-for-games; notes-from-the-mix-prototype-2; how-prototype-2-s-sound-team-solved-a-
common-audio-conundrum; video-how-overwatch-was-designed-so-people-could-play-by-sound;
anatomy-of-an-enemy-attack-in-dark-souls-3); gdcvault.com/play 1023317 (Overwatch: Play by Sound),
1474 (HDR Audio, Bad Company), 1022843 (Joonas Turner), 1023778 (Hyper Light Drifter), 1335 and
1014329 (weapon sound design), 1017698 (How to Mix a Video Game), 1029369 (TUNIC), abstracts only;
docs.godotengine.org class_audiostreamrandomizer; web.dev/articles/audio-scheduling; MDN
AudioBufferSourceNode (and playbackRate, detune, start), AudioScheduledSourceNode/start,
BaseAudioContext/decodeAudioData and currentTime, Web_Audio_API/Best_practices,
DynamicsCompressorNode, AudioParam/setTargetAtTime, AudioContext/outputLatency.

**Cartoon sound (first round, all fetched):** Wikipedia on Treg Brown, Paul Julian, Now Hear This,
Mel Blanc, Carl Stalling, Mickey Mousing, Steamboat Willie, The Skeleton Dance, Tex Avery, Scott
Bradley, Tom and Jerry, Jimmy MacDonald, Goofy holler, Fleischer Studios, Hanna-Barbera, Hoyt Curtin,
Sound Ideas, Stock sound effect, Slide whistle, Flexatone, Ratchet (instrument), Whip (instrument),
Slapstick, Pop gun, Anvil, Twelve basic principles of animation, Cuphead, Boomerang Fu, Untitled
Goose Game, Dan Golding, Rayman Legends, Fall Guys, Gang Beasts, Worms Armageddon; cartoonbrew.com;
cartoonresearch.com; d23.com; filmsound.org/articles/designing_for_sound.htm (Randy Thom);
crankywatermelon.com; paulkopetko.com; nintendolife.com's Boomerang Fu review.

**Music (first round, all fetched):** web.dev/articles/audio-scheduling and webaudio-intro; MDN Web
Audio Advanced_techniques, Best_practices, PeriodicWave, AudioParam/setTargetAtTime, DelayNode,
ConvolverNode, DynamicsCompressorNode; blog.gskinner.com (generated-impulse reverb);
sonoport.github.io/synthesising-sounds-webaudio; Wikipedia on Video game music, Shovel Knight,
Celeste, Lena Raine, Disasterpeace, Darren Korb, Journey (2012), Banjo-Kazooie, Koji Kondo, Super
Mario Bros. theme, Super Mario Bros., Donkey Kong Country, David Wise, Adaptive music, Leitmotif,
Ostinato, Mere-exposure effect, Mode (music), Harmonic minor scale, Septuple meter, Swing (jazz
performance style), Tempo, Ducking, Enter the Gungeon, Doseone, Jukio Kallio, Nidhogg, TowerFall;
mariowiki.com Timer_Warning, Final_Lap; ssbwiki.com Victory_theme; winifredphillips.wpcomstaging.com
(The Timed Challenge pts 1–2; Horizontal resequencing and song structure); informit.com (Michael
Sweet, *Writing Interactive Music for Video Games*, contents); enterthegungeon.wiki.gg Soundtrack.

**Boss music (second round, all fetched):** Wikipedia on Doom (2016 video game), Mick Gordon,
Nine-string guitar, Doom Eternal, Darren Korb, Hades (video game), Risk of Rain, Risk of Rain 2,
Dead Cells, Doseone, Music of Hollow Knight, Furi, Nuclear Throne, Crypt of the NecroDancer, Celeste,
Lena Raine, Keiichi Okabe, Nier: Automata, Nobuo Uematsu, One-Winged Angel, Music of Final Fantasy
VI, Motoi Sakuraba, Koji Kondo, Super Mario Bros. theme, Journey (2012), Austin Wintory, Jesper Kyd,
Hitman: Blood Money, Mad Max: Fury Road (soundtrack), Phrygian dominant scale, Phrygian mode, Minor
scale, Locrian mode, Tritone, Ostinato, Pedal point, Chromaticism, Jaws (soundtrack), Duel of the
Fates, Braam, Shepard tone, Power chord, Breakdown (music), Palm mute, Half-time (music), Blast
beat, Thrash metal, Drop (music), Dubstep, Djent, Dropped tuning, Hardstyle, Drum and bass, Boss
(video games), Supersaw, Roland JP-8000, Reese bass, Dynamic range compression, Parallel
compression, Limiter, Guitar speaker, Distortion (music), Roland TR-808, Adaptive music,
Mere-exposure effect, Daniel Berlyne, Repetition (music), Loop (music), Song structure;
pcgamesn.com/prey/prey-composer-mick-gordan-doom; gameinformer.com (Doom sounds from cassettes and
a Russian synthesizer, 2016); gdcvault.com/play/1024068 ("DOOM: Behind the Music", abstract);
nintendolife.com ("Metal comes from Hell", Korb); gameplay.co (Hades music and sound design, Korb);
wshu.org (Korb, 2020); supergiantgames.bandcamp.com (Hades OST); chrischristodoulou.bandcamp.com
and chrischristodoulou.com; deadcells.wiki.gg Soundtrack; doseone.bandcamp.com;
ridiculon.bandcamp.com; gamedeveloper.com (crafting an evocative score for Hollow Knight);
daily.bandcamp.com (Larkin); jukiokallio.bandcamp.com; originalsoundversion.com (Lena Raine on
Celeste); vice.com (Raine); radicaldreamland.bandcamp.com; jesperkyd.com/about;
attackmagazine.com (sylenth-supersaw; reese-bass-redux pp. 1–2; ableton-sidechain-compression);
winifredphillips.wordpress.com (three posts); web.dev/articles/audio-scheduling; MDN Web Audio
Advanced_techniques.

**Licences (all fetched):** freesound.org/s/<id>/ for every id in `scripts/fetch-sfx.sh`;
archive.org/metadata/Designers-Choice-Collection-{Cloth,Fight,Glass,Bells,Metal,Musical};
mixkit.co/license; creativecommons.org/publicdomain/zero/1.0.
