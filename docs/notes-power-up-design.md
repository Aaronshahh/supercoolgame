# Notes — Power-up design, from Boomerang Fu and the literature

Written 2026-10-09 for the power-up spec (03). Two research passes fed this: a fact sheet on
Boomerang Fu's power-ups (its patch notes via the Steam news API, developer forum replies, the
2020 Reddit AMA, the prototype tweet thread, the fan wiki via its MediaWiki API, press), and a
synthesis of item design in competitive local-multiplayer games (Sakurai's Famitsu columns and
Smash interviews, Iwata Asks on Mario Kart 7, Mario Wiki's decompiled item tables, Thorson on
TowerFall, the Nidhogg 2 and Duck Game developer interviews, the GGPO developer guide and Infil's
rollback articles). Web search was mostly blocked, so this leans on primary pages fetched
directly; unverified items are listed at the end. Tags: **(S)** sourced, **(I)** inference from
sourced facts, **(?)** could not confirm.

## 1. What Boomerang Fu does

**Roster.** Launch (13 Aug 2020) shipped twelve power-ups plus the **Bamboozled** curse; the demo
had six (Caffeinated, Teleport, Explosive, Ice, Disguise, Shield); **Decoy** was the only one added
later (1.1.3, Jul 2021). All come from randomly filled "magical glowing recipe books" that appear
at arena spots (S: release post, 1.0.8 notes, fan wiki).

| Power-up | What it does (S: fan wiki unless noted) |
|---|---|
| Caffeinated ("Move Faster") | ~1.4× run, faster dash, no dash cooldown; slash unchanged; spam-dashing puts out fire |
| Dash Through Walls | the dash passes through any solid; removed from Golden Boomerang mode in 1.0.6 for prop-hiding exploits (S: notes) |
| Teleport Boomerang | after a throw, dash teleports you to the boomerang and collects it; not over air/water; landing on someone squashes them; teleporting to a live Explosive disarms it |
| Explosive Boomerang | flashes, then a large blast at the end of flight; a fresh boomerang appears in hand after ~1 s. Prototype had a "MASSIVE" radius and a grenade-pin countdown that started when you aimed (S: dev tweet) |
| Multi Boomerang | splits into five (four with Explosive or Fire) at a wall or max range; all must be recovered before rethrowing |
| Fire Boomerang | burning trail for a few seconds; touching it ignites you and you die seconds later; spreads by contact; put out by ice, wet ground, rain, portals, repeated dashing; exclusive with Ice |
| Ice Boomerang | pale-blue trail slows then freezes; mash dash to break out; frozen players die to any hit; exclusive with Fire |
| Disguise | stand still to become the nearest prop; creeping keeps it; slash or throw breaks it; bots are not fooled |
| Shield | absorbs one boomerang hit: the boomerang bounces, you recoil (can be knocked off ledges), ~1 s i-frames, shield gone. Not squish, fire, freeze, falls. Melee can pop it. Also earned by orbiting your boomerang round yourself 3–4 turns ("spin shield") |
| Battle Royale | one-shot: the boundary shrinks to the pickup spot; takes no slot |
| Telekinesis Boomerang | hold recall + stick to steer the thrown boomerang within a radius; a parry breaks your control |
| Extra Boomerang | a second boomerang now and at every round start; faster melee; recall only once both are out |
| Decoy (1.1.3) | once per life, dashing spawns an easy-bot doppelganger that vanishes when hit; 1.2.0 made it copy your boomerang count and Caffeinated speed (S: notes) |
| Bamboozled | inverts controls for a short time; no slot; 5 % odds at 0 power-ups rising to 6 % at 3 (S: dev reply 2021-02-18); never the first pickup of a match since 1.3.1 "so new players don't get confused" (S: notes) |

**Stacking.** Cap of three; a fourth removes the **first collected** (Shield exempt); Battle Royale
and Bamboozled do not count. Everything applies at once: "if you have Ice + Explosive boomerang,
your boomerangs now freeze enemies when they explode" (S: dev forum reply). Fire+Explosive gives a
ring of fire instead of a trail, Multi+Explosive four smaller blasts, Fire and Ice replace each
other (S: wiki). Launch-week feedback asked for the current stack to flash on pickup because the
oldest is "silently removed" and "it's difficult to know which power up you lost" (S: Steam,
Switch forum) — so a persistent over-head indicator is a known gap (I).

**Spawning.** Books appear "at various intervals" at arena spots (S: Nintendo Life). Placement
"prefers spawning power-ups further away from players that have already collected the most
power-ups"; curse odds move one point: "we only have our finger very gently on the scales" (S: dev
reply). 1.0.6: "Power-ups spawn 20 % less often per power-up already collected… to avoid big
power-up stacks in the early game", and less often with fewer kinds enabled "to avoid everyone
having the exact same stack" (S: notes). Modifiers: per-power-up on/off since launch, global rate
0.5×/1×/2× since 1.0.8. Max books on the field at once: (?).

**Death and rounds.** Power-ups **persist for the whole match** (a best-of to a points target,
rounds ~10–60 s). Nothing drops on death; nobody can take yours. Exceptions: Shield (consumed),
Bamboozled (timed), Battle Royale (one-shot), Decoy (one use). Players call this the core
risk/reward hook ("worth it to risk your life for them"); requests for a one-round expiry option got
only "Great ideas, thanks" (S: Steam, Reddit). Whether a stolen boomerang carries its owner's
modifiers: (?).

**Interactions.** Dash is the activation button for Teleport and Decoy and the escape from fire and
ice. Shielded players cannot be kicked or disarmed; a melee hit can pop the shield. Parrying a
Telekinesis boomerang breaks the owner's control. Portals extend Telekinesis range and extinguish
fire (S: wiki, 1.3.1 fix).

**Reception.** Overpowered: Multi ("multirang", the most disabled), Telekinesis, Dash Through
Walls in Golden Boomerang. Hated: Bamboozled ("the most hated power-up and it is literally just no
fun"), Explosive in teams (kills teammates). Confusing: Teleport for newcomers (the dev's answer:
disable it), Decoy's first dash. House rules: disable Multi, Bamboozled, Telekinesis, Explosive;
teach newcomers with power-ups off, then add "the three least disruptive"; 0.5× rate to make books
contested, 2× for chaos (S: Reddit, Steam, Metacritic).

**Designer.** Paul Kopetko (AMA): identical character abilities "so it's less confusing for new
players"; inspirations TowerFall, Duck Game, Nidhogg. The prototype thread shows Multi and Explosive
being nerfed from chaotic first versions and Disguise reworked from "a brown cube". The patch notes
show the balancing lever is **spawn probability, not stat tuning** (S). Power-ups are "pretty wild
individually" and combos are "as dangerous to you as they are to your enemies" (S: MKAU interview).

## 2. Principles from the wider literature

**Items exist so the weaker player can sometimes win, and designers say so.** Sakurai: in a normal
fighting game "the more skilled player wins"; items let "players who would normally lose…
sometimes win" and are "an important essence when we're talking about people just gathering and
playing together" (S: Nintendo Everything, Smash Ultimate interview). On the Blue Shell: once
skilled racers stop making mistakes the race is "drivers going across a tightrope on the same
line", so Mario Kart gives "players further back preferential treatment with items", which "aren't
aimed at players looking to test their true abilities" (S: Famitsu column 538, Source Gaming
translation). Nintendo's own guard-rail for Mario Kart 7: results must not "just depend on the
luck of how the items appear… the player also has to be able to think, 'It's a result of my
driving'" (S: Iwata Asks MK7 vol. 2).

**Position-based catch-up is the canonical implementation, and it does not fit us.** Mario Kart
Wii picks the item table by race position (1st: Banana 75/200, zero chance of Bullet Bill or Spiny;
12th: Bullet Bill 50/200); MK8 keys on distance to the leader at the moment the box opens; the
roulette is presentation (S: Mario Wiki tables). Smash does the mild version, a ±30 Smash Ball odds
handicap on stock difference (S: SmashWiki). Against: TowerFall ships no catch-up and treats chaos
as opt-in Variants; competitive Smash bans items outright; Sirlin's comeback design "gives tools,
not wins"; Rollings & Adams warn that visible rubber-banding is gamed once noticed (S). In a 30 s
one-hit-kill round "leader" is ill-defined and changes every few seconds, so position tables do not
apply; the defensible forms are Boomerang Fu's placement bias and per-stack spawn throttle, which
never hand anyone a kill (I).

**Keep the set small; cut anything that cannot be fun for both casual and hardcore rooms.**
Thorson cut TowerFall's per-character abilities because they "would never be balanced in a way
where it would feel fun… in a casual setting or a hardcore setting"; Variants are "letting players
play a bad version of your game" with the default as the competitive standard (S: Game Developer).
Ascension's arrows were designed "to shake things up, to encourage players to change their
strategies, and surprise each other"; his favourite, the Drill Arrow, "completely change[s] the
game" (S: PS Blog). Nidhogg 2 scaled back weapons that "got a bit too complicated in terms of
stances" or needed "input combo sequences" to "add variety without totally throwing out the
metagame" (S: Game Developer). Sakurai: "tuning 'broad and deep' is very hard" (S).

**Prefer items that change position and strategy over raw lethality, and items that make people
interact.** Duck Game's Podbielski: the Netgun ("crush your friends with your friends") and the
useless flower that "brings joy" are the favourites; one-hit kills were chosen because it "was the
easiest and quickest way to get it working" (S: dev Q&A). In a one-hit game stacking cannot add
damage; stacks only add reach, speed, count or information, so the fairness levers are slot count ×
spawn throttle × exclusivity, and the cap should be low because every modifier is one more thing an
opponent must read in under a second (I).

**Readability.** Thorson added particle trails because at high skill "spectators couldn't follow it
anymore" and routed per-player sounds through each controller speaker (S). Cranky Watermelon chose
foods for "unique colours and silhouettes" and cut 8-player because bigger maps made it "a
confusing game of who can squint at the screen the hardest" (S: MKAU). Duck Game shelved boxing
gloves because the ragdoll "read as death to newcomers" (S). Sakurai's item goal is "no blind
spots": every item explainable (S: Smash Dojo). Mario Kart's items are legible because each maps
to one of three goals (speed, attack ahead, defend) (S: Source Gaming). Duration: with 30 s rounds,
"until death or round end" is the only legible choice; timers would need a countdown nobody has
time to read (I).

**Spawning.** Smash items appear at "stage-dependent designated locations" and are "universally
banned from tournaments" because timing and place are luck; Mario Kart boxes are fixed pads (S).
TowerFall's chests are a positional risk: opponents punish players who "over-extend" to grab one
(S: official site). Six-player Boomerang Fu rounds "often end in mere seconds" (S: Nintendo Life),
so anything slower than a spawn every 6–8 s makes items irrelevant in most rounds, and a first-spawn
delay of a few seconds avoids the opening scramble Boomerang Fu throttled (I).

**Curses.** Bamboozled is disable-able and its odds barely move with held count (S). Sakurai's
Momotaro Dentetsu point: misfortune for one player delights the others; the question is "will you
grin and bear it?" (S: Famitsu 538). Smash has "gradually phased randomness out of core gameplay"
while keeping it in items (S: SmashWiki). A curse is acceptable only if opt-out, obvious on the
victim, brief and only mildly skewed toward stacked players (I).

**Online and determinism.** GGPO: advancing one frame "must result in identical game states", RNG
state is serialised, wall-clock time excluded, and "any effects or sounds which are generated during
the rollback need to be deferred" (S: developer guide). Infil: destroyed objects must be kept alive
for the rollback window so they can be "un-destroyed"; audio is "a particularly difficult problem"
(S). Keits: rollbacks "always cut off some part of the startup", so instant-startup actions warp;
"2 or 3 frames" of stationary startup reduce artefacts with no feel change; avoid making "moments
around rollback pivotal every 5 seconds" (S: Infil p6). Boomerang Fu's own notes show pickup
arbitration must be explicit: "Fixed rare cases where one power-up could be collected by two people
at once" (1.0.6), "collecting 4 power-ups at once" (1.0.7) (S). Teleport-style items are
deterministic-safe but visually brutal under misprediction; give them a short telegraphed wind-up;
same-tick contested pickups need a deterministic tie-break; spawn choice must use the simulation RNG
(I).

## 3. Principles, one line each

1. Design items for the couch goal "a weaker player can sometimes win", and say so (Sakurai; Famitsu 538).
2. Never let an item decide a round by itself; results must still feel like "my driving" (Iwata Asks MK7).
3. Keep the set small and cut what cannot be fun for both casual and hardcore rooms (Thorson).
4. Prefer items that change strategy and position over items that add raw lethality (Thorson; Podbielski).
5. Add variety without discarding the base metagame; scale back anything that needs extra inputs (Nidhogg 2).
6. Cap the stack at 2–3, make the 4th replace, declare exclusive pairs up front (Boomerang Fu).
7. Throttle spawn rate per power-up already held to prevent early snowballs (Boomerang Fu 1.0.6).
8. Bias spawn placement away from the most-stacked player instead of handing out stronger items (Cranky Watermelon).
9. Do not import position-based item tables into a 30 s one-hit round; comeback tools must still be executed (Sirlin; I).
10. Make every pickup a positional risk: grabbing it exposes you (TowerFall).
11. Use fixed, known spawn pads so pickups are readable objectives (Smash, Mario Kart).
12. Expose spawn rate and per-item toggles so rooms self-tune chaos (Boomerang Fu 1.0.8; Smash Item Switch).
13. Every held effect needs a one-glance tell and a per-player sound cue; spectators count too (Thorson; Cranky Watermelon).
14. One clear job per item (speed, attack, defend) so newcomers categorise it instantly (Source Gaming).
15. Add 2–3 ticks of visible wind-up to any instant action so rollback corrections do not warp players (Keits).
16. Keep destroyed pickups and projectiles alive for the rollback window; defer VFX/SFX until confirmed (GGPO; Infil).
17. Resolve same-tick pickups and item RNG deterministically from simulation state, as a tested rule (GGPO; Boomerang Fu bugs).
18. If a curse ships: opt-out, obvious on the victim, brief, mildly skewed toward stacked players (Bamboozled; Famitsu 538).
19. Effect duration is "until death or round end"; timed effects are illegible at this cadence (I).
20. One stealth rule that works identically on couch and online (I, from Disguise and Hide & Seek being couch-only).

## 4. Sources

Boomerang Fu: Steam news feed (`api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=965680`,
notes 1.0.6, 1.0.7, 1.0.8, 1.1.0, 1.1.3, 1.2.0, 1.3.1, 1.3.5); dev replies
https://steamcommunity.com/app/965680/discussions/0/3105765614216715862/ and
…/3032600513505812898/; prototype thread https://twitter.com/boomerangfu/status/1293697987697242112;
AMA https://old.reddit.com/r/NintendoSwitch/comments/i9cb6l/; fan wiki
https://boomerangfu.fandom.com/wiki/Powerups; MKAU interview
https://www.mkaugaming.com/mkau-interviews-cranky-watermelon-boomerang-fu-best-gameplay-winners-2020-australian-game-developer-awards/;
Nintendo Life review; r/BoomerangFu threads uw564j, t2wmww, 13ib48m.

Literature: Sakurai Smash Ultimate interview
https://nintendoeverything.com/sakurai-on-smash-bros-ultimate-tempo-items-changes-and-additions-choosing-taunts-much-more/;
Famitsu 538 https://sourcegaming.info/2017/11/18/the-blue-shell-and-the-party-element-sakurais-famitsu-column-vol-538/;
Iwata Asks MK7 vol. 2; Mario Wiki item probability pages; SmashWiki Item and Randomness; Thorson
https://www.gamedeveloper.com/design/the-magic-of-i-towerfall-i-depth-simplicity-community and
https://blog.playstation.com/2014/03/14/towerfall-ascension-on-ps4-behind-the-arena/; Nidhogg 2
https://www.gamedeveloper.com/design/why-i-nidhogg-2-i-ditches-the-minimalism-of-the-original; Duck
Game Q&A http://blog.wonthelp.info/2022/01/21/duck-game-developer-qa/; Sirlin
https://www.sirlin.net/articles/designing-puzzle-strike-2; Source Gaming Holism
https://sourcegaming.info/2024/11/25/holism-the-items-in-mario-karts-wacky-races/; GGPO developer
guide https://github.com/pond3r/ggpo/blob/master/doc/DeveloperGuide.md; Infil netcode
https://words.infil.net/w02-netcode-p5.html and p6.

**Unverified / gaps:** Thorson's "Friendly Fire: Designing TowerFall" talk (no transcript);
Bomberman Skull design rationale (general knowledge only); Boomerang Fu's max books on field, icon
colours and whether stolen boomerangs keep modifiers; Celeste/Spelunky readability quotes; any GMTK
episode; Stick Fight and Gang Beasts design commentary.
