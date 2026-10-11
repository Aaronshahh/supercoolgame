# Original seven-character roster

All seven characters use 14×18 pixel poses anchored on the bottom row. The original four
designs and the first Octopus, Hedgehog and Fish designs have been restored. The larger
32×32 animation revamp was reverted at Aaron's request.

| Character | Movement | Frames |
| --- | --- | --- |
| Slime | Grounded sloshing cycle | 48 |
| Skully | Shuffling steps | 48 |
| Shroom | Stubby-legged walk | 48 |
| Frog | Crouch, hop and landing | 48 |
| Octopus | Alternating arm plants, pulls and curled tips | 84 |
| Hedgehog | Low scurry and tucked rolling dash | 84 |
| Fish | Tail curl, spring, airborne flop and belly landing | 84 |

Octopus, Hedgehog and Fish each have six idle poses, eight run poses, five throw poses,
three catch poses and four melee poses per facing, plus six dash poses. Their idle and
run cycles use uneven holds. Fish reaches four pixels above its shadow before landing.

Throws animate for 24 ticks, catches for 14 ticks, melee follows its original 15-tick
combat state, and dash poses finish over 18 ticks. The returning weapon uses the original
reach pose shortly before the catch. The original held-boomerang offset is restored.

The three newcomers' frame grids were recovered from the published seven-character
release `a000ae9af15ff5ee619bfe186ab47d60dade704b`. All seven characters' frame grids and
timing metadata match that release. Colour swaps, mirrors, saved profiles and multiplayer
character IDs remain supported.

`npm run check-art` validates all 444 frames, palette symbols, anchors and timing tables.
`npm run check-characters` checks all seven selections, persistence, every facing, mirror,
colour and action, plus identical movement and projectile traces across the roster.
`node scripts/character-art-preview.mjs` regenerates pose contact sheets in `shots/`.
