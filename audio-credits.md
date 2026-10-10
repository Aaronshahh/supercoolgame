# Audio credits

Every recording in `public/sfx/` and where it came from. All of them are released under the
Creative Commons **CC0 1.0 Universal** public-domain dedication
(https://creativecommons.org/publicdomain/zero/1.0/): "No Copyright … You can copy, modify,
distribute and perform the work, even for commercial purposes, all without asking permission."
Credit is therefore not required by any of these sources; it is given because the people who made
the sounds deserve it, and so the provenance of every file is checkable. The clips are rendered by
`scripts/fetch-sfx.sh`, which cuts each source to one take (`ss=`/`to=` on the raw file, `dur=`
from the first sound), trims leading and trailing silence, peak-normalises to −1 dBFS, fades 3 ms in
and 15 ms out (longer where `fade=` says so) and encodes mono 44.1 kHz MP3 at 96 kb/s; keep that
script and this file in step. `VERIFY=1 scripts/fetch-sfx.sh` re-reads every source's licence page
or metadata and fails if any no longer shows CC0 1.0; the set below passed on 2026-10-10. The rule
for adding a sound is in `docs/07-audio.md` §5: CC0 or public domain only, provenance recorded here.

**The music is original.** The nine room themes in `src/audio/songs.ts` are note data played by our
own synthesizer (`src/audio/music.ts`). Its drum kits, though, play the CC0 one-shots listed under
"the drums" below (kicks, snares, hats, cymbals, toms, alfaia and timpani, orchestral and sub hits,
anvils, reversed cymbals), with a synthesized drum as the fallback until they load.

## Sources

| Source | Licence basis | Our use |
|---|---|---|
| **Freesound** (freesound.org) | each sound's page states its licence; every id below links CC0 1.0. We use the site's anonymous "hq" preview MP3 (~128 kb/s), a derivative of the CC0 original; the lossless originals are downloadable with a free account under the same terms | 109 sounds by 92 uploaders, one clip each |
| **The Designer's Choice** (Nicholas A. Judy), archive.org | the items' metadata carry `licenseurl` CC0 1.0 and creator "Nicholas A. Judy"; the description reads "recorded, edited and designed by Nicholas A. Judy at The Designer's Choice. All sound effects are available to you on a complete royalty-free basis. Use these in many personal and commercial projects. You can credit me or not." Creator-asserted CC0; only files with his `_Nicholas Judy_TDC` suffix are used | 10 clips from the Cloth, Fight, Glass, Bells, Metal and Musical collections |

Excluded on purpose: Mixkit ("You can't redistribute the Item on its own, as stock, in a tool or
template, or with source files"), Pixabay, Zapsplat and Sonniss (licences with the same
redistribution concern), SoundBible (self-asserted licences of unclear provenance), anything
CC-BY or CC-BY-NC (attribution and non-commercial terms would bind every fork of this repository),
and any archive.org item that is plainly not the uploader's to license (commercial Warner and Sound
Ideas libraries). Kenney's Impact Sounds, used in the rejected first pass, were dropped with it.

## Files

119 clips, 1.5 MB. Freesound pages are `https://freesound.org/s/<id>/`. The Designer's Choice items are
`https://archive.org/details/Designers-Choice-Collection-<Collection>`. "Whole take" means the
source was used entire, less silence. Which file plays for which event, and what is synthesized
under it, is `src/audio/samples.ts`.

### Freesound

| File | Source sound | Author | Id | Cut | What it stands in for |
|---|---|---|---|---|---|
| `throw1` | Whip Crack.m4a | SciFiSounds | [529925](https://freesound.org/s/529925/) | whole take | a real whip crack: the wrist snap of the release |
| `throw2` | Swing Woosh | Jofae | [389590](https://freesound.org/s/389590/) | whole take | a bullwhip swung without the crack |
| `throw3` | Bow Release Hit | EminYILDIRIM | [536068](https://freesound.org/s/536068/) | whole take | a bowstring released |
| `swing1` | Swinging staff whoosh (strong) 04.wav | Nightflame | [422513](https://freesound.org/s/422513/) | whole take | bamboo staff through the air |
| `swing2` | Woosh (stick swung in the air) | Dalesome | [352719](https://freesound.org/s/352719/) | whole take | a stick swung |
| `swing3` | SWOSH-01 44.1kHz | qubodup | [59988](https://freesound.org/s/59988/) | whole take | a stick swung |
| `catch1` | Glove Catch 1 FF014.aif | martinimeniscus | [164499](https://freesound.org/s/164499/) | whole take | baseball into a leather glove |
| `catch2` | catching a baseball glove | Luisa_Sanchez | [816984](https://freesound.org/s/816984/) | whole take | glove catch through a contact mic: the thud of the palm |
| `deflect1` | Sword_Clash (7).wav | JohnBuhr | [326868](https://freesound.org/s/326868/) | whole take | steel on steel (kitchen spatulas clashed) |
| `deflect2` | Sword Clash.wav | Bird_man | [275159](https://freesound.org/s/275159/) | whole take | a short sword clash |
| `arm` | Gun Cock.wav | krucifix | [442847](https://freesound.org/s/442847/) | whole take | a gun cocked, two clicks: one take, the arming signature |
| `bounce1` | Single rock hitting wood.wav | worthahep88 | [319226](https://freesound.org/s/319226/) | whole take | a rock on wood |
| `bounce2` | Quick Clack | effectator | [443328](https://freesound.org/s/443328/) | whole take | a hard small clack |
| `bounce3` | Metal Ping 1.wav | JarredGibb | [217459](https://freesound.org/s/217459/) | whole take | a metal ping |
| `bumper1` | Basketball 3 | zmobie | [319785](https://freesound.org/s/319785/) | whole take | a basketball bounce |
| `bumper2` | BasketballBounce.wav | Blankened | [505628](https://freesound.org/s/505628/) | whole take | a tighter basketball bounce |
| `bumper3` | Thump.mp3 | mpuffenbarger | [683031](https://freesound.org/s/683031/) | whole take | a fist on drywall |
| `shove1` | Clothed Body Hit 1 .wav | Flem0527 | [629977](https://freesound.org/s/629977/) | whole take | a clothed body hit |
| `shove2` | body_hit.wav | insanity54 | [276600](https://freesound.org/s/276600/) | whole take | a body hit |
| `shove3` | Hit_Impact | gulfstreamav | [842508](https://freesound.org/s/842508/) | whole take | a full water bottle on a counter |
| `dash1` | Person Rolling on Floor Clothing Rustle | KoimeMatsuchiya | [872226](https://freesound.org/s/872226/) | 0–0.6 s | a person rolling on the floor in clothes |
| `dash2` | Jacket/Cloth Rustle 9 | brandondelehoy | [494797](https://freesound.org/s/494797/) | whole take | a jacket rustle |
| `dash3` | Whoosh (Clothing Drag) | JonasTisell | [496188](https://freesound.org/s/496188/) | whole take | cloth dragged fast |
| `phantomPop1` | Suction Pop | JoBot__ | [523687](https://freesound.org/s/523687/) | whole take | a suction cup pulled off |
| `phantomPop2` | Glass Suction | bigbadbowman95 | [840069](https://freesound.org/s/840069/) | whole take | a suction cup off glass |
| `slice1` | slashkut.wav | Abyssmal | [35213](https://freesound.org/s/35213/) | whole take | a knife slash on foley flesh |
| `slice2` | Knife Stab Melon.wav | jawbutch | [344404](https://freesound.org/s/344404/) | whole take | a knife into a melon |
| `slice3` | Large Swede Stab with Whoosh.wav | minituffy | [385966](https://freesound.org/s/385966/) | whole take | a swede stabbed, with the whoosh |
| `burn1` | flame burst ignite bbq barbecue.flac | kyles | [637533](https://freesound.org/s/637533/) | whole take | a gas barbecue igniting |
| `burn2` | Fire Burst Flash | Za-Games | [539972](https://freesound.org/s/539972/) | whole take | a fire burst |
| `fall1` | Woosh - Metal tea strainer 4 - slowed down | Sadiquecat | [742833](https://freesound.org/s/742833/) | 0.3 s fade | a metal tea strainer whooshed, slowed down: no landing |
| `fall2` | Deep whosh - Short | Khrinx | [523978](https://freesound.org/s/523978/) | first 1.2 s 0.3 s fade | a deep whoosh, faded out mid-fall |
| `squash1` | d0_step_on_egg_01 | dav0r | [176759](https://freesound.org/s/176759/) | first 0.7 s | a foot on an egg |
| `squash2` | Crushing a Lemon 1_5 | Joao_Janz | [483932](https://freesound.org/s/483932/) | whole take | a lemon crushed |
| `blast1` | Explosion 1 | magnuswaker | [523089](https://freesound.org/s/523089/) | whole take | an explosion, tight |
| `blast2` | Sharp Explosion 4 (of 5) | Rudmer_Rotteveel | [336011](https://freesound.org/s/336011/) | whole take | a firework report |
| `blast3` | Loud Firewords Bang Cut Off | qubodup | [840510](https://freesound.org/s/840510/) | whole take | a firework bang |
| `crate1` | Crate Break 4.wav | kevinkace | [66780](https://freesound.org/s/66780/) | whole take | a crate breaking |
| `crate2` | wooden-crate-break1.wav | DeltaCode | [667653](https://freesound.org/s/667653/) | whole take | a wooden crate breaking |
| `crate3` | Wood Crate Destory 1 | Bertsz | [500902](https://freesound.org/s/500902/) | whole take | a wooden crate destroyed |
| `barrelLit1` | Match strike 03 | scalywhale | [423811](https://freesound.org/s/423811/) | whole take | a match struck |
| `barrelLit2` | Match Ignite (No Strike) | brachern | [398448](https://freesound.org/s/398448/) | whole take | a match catching, no strike |
| `grass1` | Bush Cut.wav | Kreastricon62 | [327894](https://freesound.org/s/327894/) | whole take | a bush cut |
| `grass2` | LeavesRustlingFast06 | falcospizaetus | [489940](https://freesound.org/s/489940/) | whole take | leaves rustled fast |
| `ice1` | Ice Crack 1 | j_p_higgins | [262635](https://freesound.org/s/262635/) | whole take | ice cracking, mic frozen inside the block |
| `ice2` | Ice Break With Hand.wav | Lynx_5969 | [422669](https://freesound.org/s/422669/) | whole take | ice broken by hand |
| `ice3` | ice_cracking_01.flac | wwstudioswastaken | [624163](https://freesound.org/s/624163/) | whole take | ice cracking |
| `steam1` | Steam/hiss | wubitog | [234782](https://freesound.org/s/234782/) | whole take | a steam hiss |
| `steam2` | R19-39-Steam Hiss.wav | craigsmith | [479296](https://freesound.org/s/479296/) | first 1.2 s | a steam hiss |
| `spikes1` | Trap Springing Shut | qubodup | [752070](https://freesound.org/s/752070/) | whole take | a trap springing shut |
| `spikes2` | Unsheathe Blade | Blazewasbored | [655341](https://freesound.org/s/655341/) | whole take | a blade unsheathed |
| `spikes3` | Knife Slash Spike Trap sharp sound 4 | rtyrtyrtyrtyrtyrtyrtyrty | [766480](https://freesound.org/s/766480/) | whole take | a knife slash: the spike trap's shing |
| `vent1` | small blowtorch | Ubsje | [547880](https://freesound.org/s/547880/) | first 1.2 s 0.25 s fade | a small blowtorch |
| `vent2` | Flamethrower | LilMati | [459884](https://freesound.org/s/459884/) | first 1.2 s 0.25 s fade | a flamethrower burst |
| `gate1` | Chain pulley 750kg - Chain pull | ldezem | [386174](https://freesound.org/s/386174/) | whole take | a 750 kg chain pulley pulled |
| `gate2` | Pulling Chain.wav | Mrthenoronha | [405417](https://freesound.org/s/405417/) | whole take | a chain pulled |
| `gate3` | swinging metal gate closed.mp3 | FartMuffin | [571419](https://freesound.org/s/571419/) | first 1.5 s | a metal gate swung shut |
| `creak1` | Wood Creak Single V10 | Rudmer_Rotteveel | [506665](https://freesound.org/s/506665/) | whole take | a single wood creak |
| `creak2` | Wood Floor Creak | sthran | [572645](https://freesound.org/s/572645/) | whole take | a wood floor creak |
| `creak3` | Creak_floorboard 31.wav | deleted_user_2104797 | [164523](https://freesound.org/s/164523/) | whole take | a floorboard creak |
| `chandelierFall1` | cut rope.wav | zepurple | [540266](https://freesound.org/s/540266/) | whole take | a rope cut |
| `chandelierFall2` | Metallic_Chain_Dropping_Onto_Wood.wav | mickyman5000 | [340534](https://freesound.org/s/340534/) | whole take | a metal chain dropping onto wood |
| `chandelierLand1` | Shattering Chandelier.mp3 | matt_ratz | [541601](https://freesound.org/s/541601/) | whole take | a chandelier shattering (theatre prop) |
| `chandelierLand2` | 37.Fall_of_a_chandelier.wav | miguelab1998 | [408611](https://freesound.org/s/408611/) | whole take | the fall of a chandelier |
| `crumble1` | Stone Impact Rubble Debris 14 | Sheyvan | [569510](https://freesound.org/s/569510/) | whole take | stone impact, rubble, debris |
| `crumble2` | Rubble Trouble | magnuswaker | [758580](https://freesound.org/s/758580/) | whole take | rubble |
| `crumble3` | Stone Crumble 2 | Kastenfrosch | [521956](https://freesound.org/s/521956/) | first 1.5 s | stone crumbling |
| `warp1` | Stick - Whoosh 11 (Reverse) | Sadiquecat | [802453](https://freesound.org/s/802453/) | whole take | a stick whoosh, reversed |
| `warp2` | Backwards Whoosh | SlavicMagic | [446010](https://freesound.org/s/446010/) | whole take | a whoosh, reversed |
| `pickupLand1` | Singular Coin Dropping.wav | Flem0527 | [630018](https://freesound.org/s/630018/) | first 0.6 s | a single coin dropped |
| `pickupTake2` | ding.wav | mark205 | [580649](https://freesound.org/s/580649/) | whole take | a sherry glass tapped |
| `pickupFizzle` | Match Sizzle 02 | squareal | [237407](https://freesound.org/s/237407/) | first 1.0 s 0.2 s fade | a lit match dropped into water |
| `shieldPop1` | Balloon Pop.wav | Laumark | [415125](https://freesound.org/s/415125/) | whole take | a balloon popped |
| `shieldPop2` | Balloon Pop | Lukeo135 | [563197](https://freesound.org/s/563197/) | whole take | a balloon popped |
| `blink1` | Air Burst | JustInvoke | [138477](https://freesound.org/s/138477/) | whole take | an air burst |
| `blink2` | burst.wav | ReadeOnly | [186928](https://freesound.org/s/186928/) | whole take | a burst |
| `spawnDrop` | Woosh - Ukulele 6 Slow | Sadiquecat | [743004](https://freesound.org/s/743004/) | whole take | a ukulele whooshed, slow |
| `spawnLand1` | Human Impact on Ground | alegemaate | [364690](https://freesound.org/s/364690/) | whole take | a human impact on the ground |
| `spawnLand2` | Falling Thud | septalium1 | [584293](https://freesound.org/s/584293/) | whole take | a pillow into a wall |
| `spawnLand3` | Thud.ogg | egomassive | [536766](https://freesound.org/s/536766/) | whole take | a thud |
| `win` | hit of orchestral cymbals and bass drum | Selector | [385011](https://freesound.org/s/385011/) | first 2.5 s 0.6 s fade | orchestral cymbals and bass drum, one hit |
| `kick1` | Clicky Sub Kick Drum | TheEndOfACycle | [673512](https://freesound.org/s/673512/) | whole take | a clicky sub kick |
| `kick2` | Subby Kick Drum | Mattc90 | [400707](https://freesound.org/s/400707/) | whole take | a subby kick (~50 Hz); also the second 808 |
| `kick3` | Fractanimal_Acoustic_Drum_Kit_Kick_7.wav | johnnydekk | [581461](https://freesound.org/s/581461/) | whole take | an acoustic kit kick |
| `kick808` | 808 Deep kick | EKVelika | [208447](https://freesound.org/s/208447/) | whole take | an 808 deep kick |
| `snare1` | Flat & Fat Snare Drum Hit | TheEndOfACycle | [673516](https://freesound.org/s/673516/) | whole take | a flat, fat snare |
| `snare2` | Fractanimal_Acoustic_Drum_Kit_Snare_2.wav | johnnydekk | [581468](https://freesound.org/s/581468/) | first 0.8 s | an acoustic kit snare |
| `snare3` | Punchy Rock Snare G 196 Hz Oneshot | lennartgreen | [860525](https://freesound.org/s/860525/) | whole take | a punchy rock snare |
| `clap1` | Clap-9.wav | Sorinious_Genious | [561119](https://freesound.org/s/561119/) | whole take | a single dry clap |
| `clap2` | HandClap14.wav | bastianpusch | [493717](https://freesound.org/s/493717/) | whole take | a 50-person clap |
| `hat1` | Hi-Hat Closed Hit - Clean | TheEndOfACycle | [674296](https://freesound.org/s/674296/) | whole take | closed hi-hat |
| `hat2` | Closed Hi Hat | M0nsterHD | [811628](https://freesound.org/s/811628/) | whole take | closed hi-hat |
| `ohat` | hat open3.wav | shpira | [317097](https://freesound.org/s/317097/) | whole take | open hi-hat (Gretsch kit) |
| `ride` | crisp ride.wav | DreStortion | [493688](https://freesound.org/s/493688/) | whole take | a crisp ride |
| `crash1` | Meinl_Byzance_16__Extra_Dry_Thin_Crash_H_5.wav | ankealtd | [696211](https://freesound.org/s/696211/) | whole take | a 16" extra-dry thin crash |
| `crash2` | B8 18in Crash.wav | Ev3nIfItKillsME | [163449](https://freesound.org/s/163449/) | whole take | an 18" B8 crash |
| `tom1` | Fractanimal_Acoustic_Drum_Kit_Low_Tom_1.wav | johnnydekk | [581467](https://freesound.org/s/581467/) | whole take | a low tom |
| `tom2` | Pearl MLX 16 Floor Tom.wav | stuntstudio | [221484](https://freesound.org/s/221484/) | whole take | a 16" floor tom |
| `taiko1` | Alfaia Hit | Sassaby | [509528](https://freesound.org/s/509528/) | first 1.5 s 0.3 s fade | an alfaia (rope-tuned goatskin bass drum) |
| `taiko2` | Alfaia Hit (combined) | Sassaby | [511275](https://freesound.org/s/511275/) | first 1.5 s 0.3 s fade | an alfaia, combined hits |
| `timp` | Timpani 4.wav | Sorinious_Genious | [573282](https://freesound.org/s/573282/) | first 2.0 s 0.4 s fade | a timpani (the "ready" timpani is the second take) |
| `orchHit` | Cinematic Hit With Horns.wav | DeVern | [427803](https://freesound.org/s/427803/) | first 2.5 s 0.5 s fade | a cinematic hit with horns (the "win" hit is the second take) |
| `impact1` | Synth Bass Drop Impact | AlexLane | [475005](https://freesound.org/s/475005/) | whole take | a bass drop (Moog Sub 37) |
| `impact2` | Drop That Sub SFX | TheEndOfACycle | [674303](https://freesound.org/s/674303/) | first 3.0 s 0.5 s fade | a sub drop |
| `anvil1` | Anvil Hit 1 | michorvath | [270589](https://freesound.org/s/270589/) | whole take | an anvil struck |
| `anvil2` | Anvil Hit 2 | michorvath | [270588](https://freesound.org/s/270588/) | whole take | an anvil struck |
| `clang1` | Basic Metal Clang Free | AardsReal | [842171](https://freesound.org/s/842171/) | whole take | a plain metal clang |
| `rev1` | Reversed Crash Cymbal - Low | TheEndOfACycle | [674292](https://freesound.org/s/674292/) | whole take | a crash cymbal reversed, low |
| `rev2` | Reverse Cymbal.wav | Lynx_5969 | [418724](https://freesound.org/s/418724/) | whole take | a cymbal reversed |

### The Designer's Choice (Nicholas A. Judy)

| File | Source file (UCS name) | Collection | Cut |
|---|---|---|---|
| `catch3` | CLOTHImpt-Blue Snowball Microphone, CU_Glove Slap | Cloth | first 0.6 s |
| `squash3` | FGHTImpt-Blue Snowball Microphone, CU_Groin Crunch | Fight | first 0.8 s |
| `chandelierLand3` | GLASBrk_Coca Cola Bottle Smash | Glass | whole take |
| `pickupGlow` | BELLMisc-Blue Snowball Microphone, CU_Meditation Chime, Ring | Bells | first 1.5 s, 0.5 s fade |
| `pickupLand2` | METLImpt-Blue Snowball Microphone_Metal, Clank, Thin | Metal | whole take |
| `pickupTake1` | BELLHand-Samsung Galaxy Smartphone, CU_Desk Bell, Ring | Bells | first 1.2 s, 0.3 s fade |
| `pickupLost` | MUSCPerc-Blue Snowball Microphone, CU_Hand Cymbal, Choke | Musical | whole take |
| `ready` | MUSCPerc-CU_Big Timpani Impact | Musical | first 2.0 s, 0.5 s fade |
| `taiko3` | MUSCPerc-Samsung Galaxy Smartphone, CU_Drum Bang | Musical | first 1.5 s, 0.3 s fade |
| `clang2` | METLImpt-Blue Snowball Microphone_Metal, Clang 01 | Metal | first 1.2 s, 0.2 s fade |

## Synthesized only

The bomb's warning `beep` and all seven loops (flight, hover, fuse, saw, cart, boulder, pendulum)
are generated in `src/audio/synth.ts` and `src/audio/sfx.ts` with no recordings. Every sampled
event above also plays a synthesized layer under the recording (`src/audio/samples.ts`): the sub,
the first millisecond, the material's ring, the air after the hit. If a file fails to download or
decode, that event falls back to its fully synthesized recipe in `src/audio/sfx.ts`, and a drum to
its synthesized voice in `src/audio/music.ts`.
