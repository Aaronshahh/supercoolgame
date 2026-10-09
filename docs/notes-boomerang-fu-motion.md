# Notes — Boomerang Fu motion, measured

Source: `reference/Screen Recording 2026-10-08 at 5.50.22 PM.mov` (7.6 s Battle Royale clip,
watermelon vs avocado with a fire boomerang; the camera zooms and pans after "GO"). Measured
2026-10-08 by frame-stepping the clip with ffmpeg and tracking the characters, the boomerang and two
fixed planters in Node. Camera motion was removed by expressing positions relative to the planters
and dividing by the planter-to-planter distance (a zoom gauge). Numbers are in **reference-scale
pixels** (frame downscaled to 585×334) and in **body-widths** (a character is ≈ 16 px at that scale;
ours is 14 px), which is the unit that transfers to our game.

Frame rate: the recording's real cadence is ≈ 52 fps with duplicated frames on a 60 fps timeline, so
"frames" below are 60 fps timeline frames ≈ ticks.

## Walking

| Quantity | Boomerang Fu | Ours before | Ours now |
|---|---|---|---|
| Cruise speed | ≈ 2.6 px/frame ≈ **0.16 body/frame** | 2.2 px/tick = 0.157 body/tick | **1.8** (deliberately slower, see below) |
| Rest → cruise | 2–3 frames (includes the analog-stick ramp, so the game's own accel is at least this fast) | 4 ticks, along a curve | **2 ticks**, heading snaps |
| Cruise → rest | 2–3 frames | 3 ticks | **2 ticks** |
| Direction change | no visible arc; the sprite re-aims the same frame | ~8-tick reversal | instant heading, speed re-ramps |
| Walk animation | the whole body hops, ~2 px at this scale | 2-frame foot shuffle | render-only hop, 2 px, 8-tick period |

No dash happened in the clip, so the dash numbers in `01` are still untested guesses.

## Boomerang flight

Thrown at t ≈ 2.72 s, caught at t ≈ 4.15 s: a **1.43 s** round trip for a near-max throw.

| Phase | Duration | Speed / accel | Distance |
|---|---|---|---|
| Cruise out | ~17 frames | **≈ 8.7 px/frame ≈ 0.55 body/frame**, constant | ≈ 148 px |
| Brake | ~17 frames | ≈ 0.5 px/frame² linear decel to a **dead stop** | ≈ 75 px |
| Hang | ~6 frames | 0 | 0 |
| Accelerate back | 8–10 frames | ≈ 0.9 px/frame² up to ≈ 8.5 px/frame | |
| Cruise back | rest | ≈ 8.5 px/frame, straight at the thrower, sharp bend only in the last few frames | |

Max range ≈ 270 px ≈ **17 bodies**. The fire trail confirms the path is a straight line out and
the same straight line back, not a loop; there is no sideways drift at the turnaround.

Cruise speed is **≈ 3.4× walking speed**. Our previous 5.5 px/tick was only 2.5×, and the
constant-speed return with a 42 px turning radius gave a lazy curve where the reference has a hard
stop. That combination is what read as "floaty".

## Conversion to our constants (14 px body, 60 Hz)

| Reference | Ours |
|---|---|
| 0.55 body/frame cruise | 0.55 × 14 ≈ **7.5 px/tick** (`BOOMERANG_SPEED`) |
| decel to 0 over ~17 frames | 7.5 / 17 ≈ **0.45 px/tick²** (`BOOMERANG_DECEL`), braking distance 7.5² / (2·0.45) ≈ 64 px |
| hang 6 frames | **6 ticks** (`BOOMERANG_HANG_TICKS`) |
| 0.9 px/frame² return accel ≈ 0.056 body/frame² | 0.056 × 14 ≈ **0.8 px/tick²** (`BOOMERANG_RETURN_ACCEL`) |
| 17-body max range | 17 × 14 ≈ 238 px; `THROW_RANGE` is **224** (14 tiles) so throws fit our 30×16 arena |

Player movement: `ACCEL` and `DECEL` give 2-tick ramps and the integrator changes from "move the
velocity vector toward the target" to "snap heading, ramp speed" (`01` §3).

## Deliberate departures from the measurements (feel decisions, 2026-10-08)

After playing the retuned demo Aaron asked for:

- **Slower run**: `MAX_SPEED` 1.8, not the measured-equivalent 2.2. Ratio to the boomerang is now
  ≈ 4.2× rather than 3.4×, which keeps the boomerang feeling fast.
- **Standing-start windup**: 5 ticks of running in place before a stationary character moves
  (Mario-on-ice traction). Not seen in the clip (the characters were already moving); it is a
  control-feel choice to make movement harder to control.
- **Dash slide**: ≈ 22 px of low-grip drift after the 48 px dash. No dash occurred in the clip.
- **Fixed throw range**: 224 px of path, bounces included, cursor sets direction only. This *does*
  match Boomerang Fu, which has no charge or range control; the cursor-distance range was our own
  invention and is gone.
- **Parabolic flight profile** (later the same day): the measured cruise-then-brake was built and
  Aaron said it read as "moving at a constant speed and then stopping". It is replaced by a
  constant deceleration from the moment of release — launch at 10 px/tick, lose ≈ 0.22 px/tick
  every tick, rest exactly at range after 46 ticks — and a mirrored acceleration back. "Parabolic"
  here is the speed curve, not the path; the path is still the straight out-and-back the clip
  shows. The hang shrank from 6 to 3 ticks because the slow approach already reads as a pause.
- **Hold to hover, release to recall**: not in Boomerang Fu at all. Holding the throw button keeps
  the boomerang hanging at its stop (up to 1.5 s); releasing brings it back at 12 px/tick from the
  first tick instead of the gradual return.
- **Arming your own boomerang**: also not in Boomerang Fu. Deflecting a boomerang you already own
  relaunches it at 80 % speed (8 px/tick) over 70 % of a throw; it then sits, beeps twice,
  shrinks and explodes (36 px kill radius inside a 40 px ring, owner included) instead of returning.
  Numbers in 01 §5.

## Method, for repeating this

```
f=$(ls reference/*.mov | head -1)            # the filename has a U+202F before "PM"
ffmpeg -i "$f" -vf "scale=585:-1" -f rawvideo -pix_fmt rgb24 /tmp/bf/raw.rgb   # 402 passthrough frames
ffprobe -show_entries frame=pts_time -of csv=p=0 "$f" > /tmp/bf/pts.txt
node /tmp/bf/track.mjs track melon 100 177 300 200 40     # colour-window tracking
node /tmp/bf/track.mjs find chev2 150 260                 # whole-frame search for the boomerang
node /tmp/bf/track.mjs comp melon.txt lmA.txt lmC.txt 100 # camera-compensated speeds
```

Colour predicates and the script live in `/tmp/bf/track.mjs` (scratch, not committed; it is ~120
lines and easy to recreate: per-frame centroid of pixels passing an RGB predicate inside a window).
Caveats: the watermelon tracker latches onto the red fence after frame ~177; a landmark near the
bottom edge gets clipped as the camera zooms, so use two landmarks well inside the frame.
