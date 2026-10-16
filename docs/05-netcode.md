# 05 — Netcode, lobby & hosting

Status: **Draft v0 — rooms by link, host-relayed lockstep and the game shell are built and pass a
two-browser smoke test; not yet played online by Aaron** (2026-10-10). How a match crosses the wire:
the signaling that turns a five-letter code into a connection, the lobby where the host sets the
match up, the lockstep that keeps 2–6 copies of the deterministic simulation in step on inputs
alone, the rules the simulation has to obey for that to work, and the way a desync is caught. Also
the shell that turned the demo into a game: main menu, character select, options, host / join /
lobby, the match flow of docs/01 §10 and the practice mode that is the demo as it stands. §9 is the
upgrade path to rollback; §10 the open decisions; §11 where the build departs from the text.

Scope: everything between two players' browsers, and everything around the game that is not the
game. The simulation's own rules are docs/01–03; how it is drawn and heard, docs/04 and 07; how the
code should be laid out so rollback becomes possible, docs/06 (planned).

---

## 1. Design lens

1. **A link is the whole invitation.** No accounts, no install, no server to stand up: the host
   presses HOST ROOM, sends the link, and whoever opens it is in the room. The README's fifth pillar
   (online-first, one player per browser) is the brief.
2. **Only inputs cross the wire.** The simulation is deterministic (docs/01) and every client runs
   all of it, so a match is a stream of five-number inputs, a few dozen bytes a tick per player.
   Nothing about the world is ever sent, which also means nothing about the world can be spoofed
   without the state hashes (§4.6) noticing.
3. **Correct first, then fast.** Input-delay lockstep is the simplest netcode that is exactly right:
   everyone steps tick T from the same inputs or nobody does. It is GGPO's degenerate case (all
   delay, zero rollback frames), so moving to rollback later changes the scheduler, not the
   protocol (§9).
4. **One host, star topology.** With at most six players a star through the host keeps one
   authority on tick order, roster and commands, and one place to compare hashes. It costs guests a
   second hop; §9 notes when a mesh pays off.
5. **The game never trusts the network layer with its feel.** The fixed-step accumulator decides how
   many ticks are due; the net only gates them. A missing bundle stalls the screen (with a WAITING
   notice), never the clock, so a hiccup is a hitch, not a speed-up or a slow-motion drift.
6. **The demo stays reachable.** PRACTICE is the demo exactly as it was, with every URL parameter,
   so nothing Aaron has approved by playing is behind a new screen.

---

## 2. Signaling and rooms

**Transport.** WebRTC data channels brokered by [PeerJS](https://peerjs.com), reliable and ordered
(lockstep wants every input, in order), JSON on the wire. PeerJS gives each browser a *peer id* at a
broker and connects two ids; after the channel is up the broker is out of the picture.

**Room code.** Five characters from a 32-symbol alphabet with no `0/O/1/I` (one random byte mod 32
per character, uniform). The host's peer id is `bmr-<code>` in lower case; a guest connects to that
id. The link is the page with `?room=<code>`; a `?signal=` on the host's page is carried into the
link so a party on a self-hosted broker stays on it. The join field accepts a code, a link or a
bare peer id, in any case.

**Claiming a room.** The host asks the broker for `bmr-<code>`; if it is taken (`unavailable-id`)
the code is re-rolled, up to three times. If the broker drops the host (`disconnected`) it
reconnects so new guests can still find the room; channels already open are unaffected.

**Joining.** The guest gets an anonymous peer id, opens a channel to `bmr-<code>`, and says hello
(§3). Fifteen seconds with no roster back is NO ANSWER FROM THE ROOM. PeerJS errors are mapped to
plain words on the status line:

| PeerJS error | Status line |
|---|---|
| `peer-unavailable` | ROOM NOT FOUND |
| `unavailable-id` (after the re-rolls) | CODE TAKEN |
| `network`, `server-error`, `socket-*` | SIGNALING SERVER UNREACHABLE |
| `browser-incompatible` | BROWSER HAS NO WEBRTC |
| `disconnected` | LOST THE SIGNALING SERVER |
| `webrtc` | CONNECTION FAILED |

**Broker.** The PeerJS public cloud by default (free, no guarantees). `?signal=host[:port][/path]`
points every page at a self-hosted PeerServer; a leading `wss://` or `https://` forces TLS, and
without a scheme the page's own protocol decides. NAT traversal uses PeerJS's default STUN; there is
no TURN relay, so two players both behind symmetric NAT cannot connect (§10 #2).

---

## 3. The lobby protocol

Guests talk only to the host; the host talks to everyone. Messages are JSON tuples: a word for the
lobby, one letter for the per-tick traffic. `PROTOCOL_VERSION` is bumped whenever a shape changes
or simulation rules change, and a guest on another version is turned away at the door.

| Direction | Message | Meaning |
|---|---|---|
| guest → host | `['hello', {name, char, ver}]` | first thing on a new channel |
| guest → host | `['set', {name?, char?}]` | change own name or character |
| host → guest | `['lobby', {players, settings, you}]` | the roster and settings, resent on every change, `you` filled per connection |
| host → guest | `['bye', reason]` | turned away: VERSION MISMATCH, MATCH ALREADY STARTED, ROOM FULL |
| host → guest | `['start', {seed, players, settings}]` | the match begins; everything a client needs to build the same game |
| guest → host | `['i', tick, packed]` | my input for `tick` (§4) |
| host → guest | `['b', tick, inputs[], cmds?]` | everyone's inputs for `tick`, plus host commands |
| guest → host | `['h', tick, hash]` | my state hash at `tick` |
| host → guest | `['d', tick]` | a desync was seen at `tick` |
| either direction | `['w']` | wake a hidden peer while a visible player waits for input; the host relays guest wakes |

**Slots.** The host is slot 0; a guest takes the lowest free slot 1–5 and keeps it; six players at
most. Slots are the simulation's player ids and the HUD order. A guest's colour is its slot. Bots
are not in the roster: the start message carries a bot count, and every client seats `BOT n` in the
free slots after the humans in the same order, so the rosters agree without being sent.

**Names.** Upper case, `A–Z 0–9 space hyphen`, eight characters, cleaned on the host; a duplicate
gets ` 2`, ` 3`… (truncated to fit). Empty becomes `P<slot+1>`.

**Settings** (host only; everyone sees them): FREE FOR ALL / 2V2 mode; first to 3 / 5 / 7 / 10 rounds; 3 / 5 / 7 lives per round (default 3); rooms CYCLE (the
roster in order from the first room) or STAY; bots 0 up to the free seats; input delay 2 / 3 / 4 /
5 / 6 / 8 ticks (§4.4); first room, any of the nine. Defaults: 5, CYCLE, 0 bots, delay 4, the
Cellar.

**Start.** Needs the room open and at least two combatants (humans plus bots). The seed is 31
random bits from `crypto`; the host sends `start` to every open channel, then builds its own
session. From then on the same channels carry §4.

**Leaving the lobby.** A guest's channel closing before the start removes it from the roster; the
host leaving destroys the peer, so guests' channels close and they see THE HOST LEFT.

---

## 4. Lockstep

### 4.1 The rule

Every client runs the whole simulation. Tick T may be stepped only from a **bundle**: the inputs of
every live human for T, assembled by the host, plus any host commands. Inputs ride the wall clock:
once per tick of real time a client submits its input for the next unsent tick, which runs at least
`delay` ticks ahead of the tick it is stepping, so by the time a tick is due the host has had a
round trip to collect everyone's input for it. The first `delay` ticks are primed with neutral
inputs (everyone stands still through part of the intro, which nobody can see).

The host accepts inputs into a per-tick pending set and, in tick order, completes every bundle for
which all live humans have reported, broadcasting each as it completes and keeping a copy for
itself. A guest queues bundles as they arrive. Each step, a client `take`s the bundle for its next
tick; if it is not there it **waits**: nothing is predicted, nothing is rolled back. The HUD says
WAITING FOR *name* (the host knows whom; a guest only knows it is the host) after a dozen frames.

### 4.2 Inputs on the clock, steps on arrival

The fixed-step loop's real-time accumulator decides how many ticks are due this frame; each due
tick first pumps one local input (`netPump`), then steps one bundle if it is here (`netStep`), else
the sim waits while the inputs keep flowing. The two must stay decoupled. An earlier version
submitted the next input only *after* stepping a tick, which chained everyone's inputs to bundle
arrivals: every bundle needs a round trip through the host, so the whole match converged on `delay`
ticks per round trip — 28 ticks a second at a 100 ms RTT in the §8 test, slow motion for everyone,
with every hash agreeing. (Its predecessor had the opposite bug: stepping every queued bundle to
"catch up" fed itself through that same coupling and ran at 178 ticks a second.)

The input frontier is allowed `delay + 12` ticks past the last stepped tick, enough to keep the
host supplied through a round trip of ~260 ms at the default delay before the pump pauses too. When
stepped ticks trail the inputs already sent — a stall's backlog, or a link slower than the delay
hides — the loop drains one extra bundle per frame, outside the accumulator's budget, until the gap
is back to `delay`. The drain cannot run away: only the clock-paced pump creates inputs, so at most
2× speed, and only while a backlog exists. Network events and drawing use the same accumulator and
clock.

### 4.3 What an input is

`[mx, my, flags, cursorX, cursorY]`: the move vector to two decimals, four bits for throw / melee /
dash / hold, the aim cursor in world pixels. The sender's own simulation uses the **unpacked** copy,
not its raw input, so the quantisation is the same on every screen. About thirty bytes of JSON a
tick per player, two kilobytes a second each way at 60 Hz, before WebRTC's own framing.

### 4.4 The delay

With the host relaying, a guest's input needs guest → host → guest before it is in a bundle the
guest can use, about one round trip to the host; the host's own input needs one trip out. Delay *d*
hides a round trip of roughly (d − 1) × 16.7 ms completely; a longer round trip no longer slows the
match (§4.2) — the pace stays 60 ticks a second and the extra latency shows as inputs landing late,
your own included, by about RTT − d × 16.7 ms:

| Delay | Fully hides | Feels like |
|---|---|---|
| 2 | ~17 ms | same machine / LAN |
| 3 | ~33 ms | same city |
| **4** (default) | ~50 ms | same region |
| 5–6 | ~67–83 ms | cross-country |
| 8 | ~117 ms | intercontinental; past this, rollback (§9) |

Raising the delay past the link's round trip buys nothing; below it, the match is just as fast and
everyone's inputs land equally late, so the fixed default stays sensible on a slow link. For
comparison, the press-to-release of a throw is already 24 ticks of animation and the melee windup
several, so four ticks of input delay sits under the game's own commitment times.

### 4.5 Commands

The host puts commands in the next bundle it completes, so every client applies them on the same
tick, before stepping it: `leave:<slot>` (that player is parked dead, marked gone, no longer
counted or waited for; a notice names them) and `rematch` (scores to zero, back to the first room,
round one). Enter on the results screen sends `rematch` on the host and does nothing on a guest.

### 4.6 Hashes and desync

Every 30 ticks each client hashes its state: the match phase and round tick, every player's
position, velocity, slide, state, score, kills, held boomerang, power-ups and gone flag, every
boomerang's position, velocity and owner, mixed through a 32-bit integer hash of the raw
double-precision bits (so a one-ulp difference is a different hash). Guests send theirs; the host
compares against its own for that tick, in either arrival order, and on the first difference
broadcasts `['d', tick]`. Every HUD shows DESYNC in red from then on; the match plays on (§10 #3).

### 4.7 Leaving and losing people

A guest's channel closes (tab closed, `pagehide`, network gone): the host stops waiting for that
slot and issues `leave:<slot>`. The host's channel closes: guests see THE HOST LEFT in the HUD, the
bundles stop, the match freezes where it is, and Esc → LEAVE takes them to the menu. There is no
reconnection; a dropped player is out for the match (§10 #4, #6).

### 4.8 Death slow-motion online

Every death sets the same 18-tick slowdown on all clients, included in the state hash. The live
accumulator changes tick duration from this shared state: 60% speed initially, easing to normal
in the last six ticks. Hidden clients use the same pacing through the existing wake/timer path.
The 9% camera zoom and its option are local; neither changes the simulation. The music receives
a temporary 10% tempo dip per death. A room reset clears both effects.

### 4.9 Background tabs

Hidden tabs do not receive animation frames. Online simulation can also step on incoming network
activity, without drawing, using the same real-time budget. If a visible player is waiting for a
bundle, it sends `w` to wake its peers; this matters when a hidden peer has queued bundles but no
new packet will arrive until it steps them. The host relays guest wakes so a visible guest also
keeps hidden guests moving through a hidden host. Hidden peers never originate wakes: that would
create a message loop. A background timer provides a fallback when everyone is hidden.

Protocol version 2 added the wake message; version 3 updates hover/return simulation rules; version 4 adds lives per round and the single-hover braking rule; version 5 adds teams, the 5% speed reduction, longer respawn protection and synchronized death slow-motion.
Everyone should refresh after an update. The browser
can still slow an entirely hidden match or suspend a page/process (for example during device
sleep). A static host cannot keep a suspended player's simulation running.

---

## 5. Determinism rules

What the simulation must obey for §4 to hold; the test is §8.

1. **One random stream, seeded.** `mulberry32(seed)` from the start message; every draw the sim
   makes (spawns, bots' wander targets, pick-up kinds, crate drops) comes from it in tick order.
   `Math.random` never appears in sim code.
2. **No transcendental maths in the sim.** `Math.sin/cos/atan2/pow` are not required to be
   bit-identical across engines and CPUs; `+ − × ÷` and `sqrt` are. The sim rotates through
   `dcos/dsin` tables in `src/util/trig.ts` (degrees → doubles, built once from literals), and the
   AI aims with vector arithmetic. Render code (lights, particles, the HUD) may use anything.
3. **Inputs are quantised on the way in.** Every client, the author included, steps from the packed
   form (§4.3).
4. **The local player is a render-side notion.** `local()` and `localId` are used only by the
   camera, the HUD, the aim indicator, the lights and the sounds. Where the sim needs a tie-break it
   uses `players[0]`, which is the same player on every client.
5. **Render state is never read by the sim.** The effects layer has its own RNG (docs/04), the
   callout and notices are display timers, the audio is a listener (docs/07 §8), the camera is
   derived from state. None of them appears in the hash.
6. **Iteration order is slot order.** `players` is seated sorted by slot on every client and never
   reordered; bots' inputs are computed inside `advance()` on the same tick everywhere.
7. **Scripted runs are the oracle.** `?match=1&t=N&seed=S` must land on the same `END` line on any
   machine; the hash lines of two browsers must agree (§8).

---

## 6. The shell

The page loads `src/game/app.ts`, which draws the menus on its own canvas in the game's pixel font
and hands over to `src/demo/main.ts` only when a game starts. Keyboard: arrows / WASD, Enter,
Escape; the mouse works everywhere (hover selects, click activates, drag or click sliders).

**Main menu.** PRACTICE · HOST ROOM · JOIN ROOM · CHARACTER · OPTIONS, with the chosen character
and name beside them and a drift of boomerangs behind. Music plays from here (the Cellar's theme,
quiet) once the page has heard a click or key.

**Character.** The four characters standing side by side, the chosen one lifted, and a name field
(eight characters). Both persist.

**Options.** MUSIC and SFX sliders, MUTE, SHAKE, HIT-STOP, LIGHTING; saved in `localStorage` and
applied live. Reachable from the main menu and from the in-game menus.

**Join.** One field, CODE OR LINK: type or paste a code or a whole link (Ctrl/Cmd-V works on the
canvas). Enter joins. A wrong shape says so without going anywhere.

**Lobby.** Title ROOM CODE *XXXXX*, the link in the hint line under the canvas (selectable, so it
can be copied by hand) and COPY LINK on the host's menu. Right: six seats, humans by name with
their character and colour, `BOT n` for the bots, OPEN SEAT for the rest. Host: MODE, FIRST TO, LIVES PER ROUND, ROOMS,
FIRST ROOM, BOTS, INPUT DELAY, CHARACTER, START (enabled from two combatants), LEAVE. Guest: the
settings read-only, CHARACTER, LEAVE. Status line: CONNECTING…, WAITING FOR PLAYERS, the error, or
STARTING.

**Hand-over.** The shell removes its canvas and listeners, imports the game module and calls
`startGame` with the roster, seed, rules and (online) the session. The game module keeps its state
at module level and is not re-entrant, so **quitting to the menu is a page reload** keeping only
`?signal=`; the room is gone with it (§10 #6).

**In the game.** Esc opens a menu: offline, RESUME · OPTIONS · QUIT TO MENU and the sim pauses;
online, STAY · OPTIONS · LEAVE ("the others play on without you") and the sim does not. L and M
still toggle lighting and mute and save the option.

**Match flow** (docs/01 §10, as built): a 90-tick intro with the room card, ROUND *n* · FIRST TO
*t* and the lives setting, READY for the last 60 ticks and nobody able to move; GO; play with
an elapsed clock and 90-tick respawns while lives remain; last player with lives takes the round,
simultaneous final deaths are a DRAW; a 45-tick freeze with
the callout; the next room (CYCLE) or the same one (STAY) with spawns reshuffled from the seeded
RNG; when someone reaches the target the results panel after a 90-tick hold: *NAME* WINS, the
podium by rounds then kills then slot, and ENTER: REMATCH · ESC: MENU (host / offline) or WAITING
FOR THE HOST · ESC: LEAVE (guest). Online, names float over heads and the HUD shows the gone marker
for anyone who left, WAITING FOR … on a stall, DESYNC or THE HOST LEFT in red.

**Practice** is the demo as approved: the local player and `?bots=` bots in the chosen room, Tab /
Shift+Tab or the HUD arrows to swap rooms, respawns, the feel readout, every URL parameter. The
scripted entry points (`?t=`, `?audio=test`, `?sheet=`, `?arena=`, `?at=`, `?practice=1`) go
straight into it so the screenshot and smoke scripts need no menu.

**URL.** `?room=CODE` joins straight away (the link); `?signal=` picks the broker; `?match=1`
starts an offline match against `?bots=` (default 2) with `?target=`, `?rooms=stay`, `?arena=`,
`?seed=`; dev: `?test=host&code=ABCDE` hosts under a fixed code and starts when the first guest
arrives, `?test=join&room=` logs the join, and with `?test` set every hash is logged.

---

## 7. Hosting

The game is a static site: `npm run build` → `dist/`, served from any static host (Cloudflare Pages,
Netlify, GitHub Pages) over HTTPS (the broker is `wss://`, and browsers want a secure context for
WebRTC in practice). The only service is the broker, and that is the public PeerJS cloud until it
proves unreliable; the fallback is a self-hosted PeerServer (`npx peer --port 9000 --path /`) behind
`?signal=`, or baked in as the default once we have a domain. A TURN relay (coturn, or a metered
service) is the one piece that costs money and is deferred until failed connections are seen in the
wild (§10 #2).

---

## 8. Testing

- **Offline match stills.** `?match=1&t=N&bots=2&seed=3` runs N ticks of a match against bots
  deterministically and prints the `END` line; `&target=1` reaches the results panel. Used for the
  HUD, banner, callout and podium screenshots.
- **Two-browser lockstep.** `node scripts/net-smoke.mjs [seconds] [host query]` builds, serves
  `dist/`, drives two headless Chromes over the DevTools protocol (Node's built-in WebSocket, no
  dependencies), hosts `?test=host&code=SMOKE&target=3&bots=1`, joins `?test=join&room=SMOKE`,
  plays for the given seconds, screenshots both to `shots/net-host.png` / `net-guest.png`, writes
  both consoles to `shots/net-*.log`, compares every `NET t<tick> hash <h>` line and checks the
  pace. Passes when every compared hash agrees and the match ran at 45–75 ticks a second. Result,
  2026-10-10: 30 of 30 hashes agree, 900 ticks in 15.0 s (60 ticks/s). Needs the broker reachable;
  the data channel itself is on the loopback. `lag=<ms>` in the host query holds every outgoing
  message that long on both sides (`?lag=`, peer.ts), faking a 2×lag round trip. Result, 2026-10-15:
  at lag 50 (100 ms RTT) 27 of 27 hashes agree at 54 ticks/s — this machine's no-lag pace — where
  the arrival-chained pipeline (§4.2) managed 28; at lag 80 with delay 2, 52 of 52 at 53 ticks/s.
- **Live stills of the shell.** `node scripts/live-shot.mjs <name> [query] [seconds] [keys…]` opens
  the page, presses the keys, waits, and screenshots: the menus, a lobby
  (`test=host&code=SHOT1&bots=1`), a failed join (`room=ZZZZ2`).
- **Manual lobby and background tabs.** `npm run check-lobby` builds and serves the working copy,
  creates a room through the menu, joins a second isolated browser, hides that guest before the
  host presses START, and checks that the countdown ends. It then sends simultaneous movement,
  throws and holds both boomerangs in mid-flight, releases them,
  hides/restores both roles, and checks 45–75 ticks/s and equal state hashes. Both-hidden stepping
  is checked for runaway speed. `npm run check-lobby -- <site URL>` runs it against a deployment.
- **Headless gotchas.** Chrome's `--timeout` screenshots at load and `--virtual-time-budget` does
  not run the `requestAnimationFrame` loop, so anything live goes through `scripts/lib/headless.mjs`.
- **Not yet done.** A cross-engine run (Chrome host, Safari or Firefox guest) is the real
  determinism test for §5 #2; a deliberate desync (`Math.random` in a sim path under `?test`) to
  prove the DESYNC path end to end; a lossy-link run.

---

## 9. The rollback upgrade path

Lockstep keeps the pace on a slow link (§4.2) but everyone's inputs land a full round trip late.
GGPO-style rollback removes that latency: run ahead with predicted inputs (each remote player's last
known input), and when a real input arrives that differs, restore the snapshot of that tick and
re-simulate to the present. What it needs, in order:

1. **Snapshot / restore** of the whole sim state: players, boomerangs, hazards and their timers,
   power-ups on the floor, the RNG's word, the match struct. Plain data, copied by value. The demo's
   module-level state is the obstacle; docs/06 is where the sim becomes one object.
2. **Silent re-simulation.** Effects, sounds, decals and callouts emitted during a re-sim must be
   suppressed or reconciled; the render-only separation of docs/04 and 07 is what makes this
   possible, and the hash of §4.6 is unchanged.
3. **A scheduler** that tracks each remote player's confirmed tick, limits the rollback window (8
   frames is GGPO's default), and keeps the lockstep stall as the fallback past it.
4. **Topology.** With rollback, sending inputs peer to peer (a mesh of at most 15 channels for six
   players) saves the host hop; the host stays the authority for the roster and commands.

The protocol of §3 does not change: inputs are still `['i', tick, packed]`; only when a client is
allowed to step tick T does.

---

## 10. Open decisions

1. **Broker at launch.** Public PeerJS cloud (free, unmonitored) or our own PeerServer on the game's
   domain from day one.
2. **TURN.** Pay for a relay so every pair can connect, or accept that some NAT pairs cannot and
   say so clearly.
3. **Desync policy.** Flag and play on (now); freeze and offer the host a rematch; or send the host's
   full state and resume from it.
4. **The host leaves.** End the match for everyone (now) or migrate the host to the next slot.
5. **Input delay.** A fixed host setting (now, default 4) or chosen from a round-trip measured in
   the lobby and shown as a ping beside each name.
6. **Late join and reconnection.** Turned away now; a lobby that survives a quit (needs a
   re-entrant game module, docs/06) and a rejoin for a dropped guest.
7. **Rollback.** When, and whether the demo sim is restructured first (docs/06) or rewritten.
8. **Spectating** and a lobby chat or ready-check: none now; six seats, host starts.
9. **Cursor on the wire.** Whole world pixels now; is relative-to-player aim or a coarser grid
   worth the bytes saved, and should a guest's cursor be visible to others.
10. **Hit-stop online.** Keep the per-client hold (others wait up to three ticks) or disable the
    hold online and keep only the flash and shake.
11. **Profanity and impersonation** in names; eight upper-case characters, deduplicated, no filter.

---

## 11. Where the build departs from this spec, and known limits

- Quit to menu is a reload; the room does not survive it (§6).
- No ping is measured or shown; the host guesses the delay.
- Bots play on every client identically (their inputs come from the shared RNG), not host-only:
  correct for lockstep, and it is why a bots-only match is a useful determinism test.
- The lobby object stays alive through the match (it owns the channels); the shell's canvas and
  listeners are gone.
- `scripts/net-smoke.mjs` plays a bots-and-two-humans match with neutral human input; nobody presses
  anything, so it exercises the pipeline and the pace, not the input path under load.
- The dev `?test=` harness (fixed codes, auto-start, hash logging) ships in the build; harmless, but
  worth gating out of a public build.


### 2v2 lobby and roster

Gold and Teal each need two players, with bots filling selected empty seats. TEAM is editable by
each human in the lobby. Switching the host’s mode to 2V2 balances the current players and fills
empty seats with bots initially; BOTS can be reduced to wait for humans. START validates four
players with two per side on the host as well as in the UI. A 2v2 room admits at most four humans,
and a room already holding more than four cannot switch to 2v2. The shared roster builder drives
the lobby preview and every client’s match roster. Team IDs are fixed once the match starts.

`npm run check-lobby -- --teams` exercises four human clients, guest team selection, held input,
background tabs, a death and matching simulation hashes with one client’s death zoom disabled.
