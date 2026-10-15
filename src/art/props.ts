/**
 * Prop and effect sprites. Pure data; see PROP_KEY in palette.ts for the key.
 * Key: . transparent  o outline  T wood-light  t wood  u wood-dark  m metal  M metal-light
 *      g grey  y/O/R flame  b bone  d bone-dark  k black  s soft shadow  P primary (boomerang only)
 */

/**
 * 11×11 chevron, apex on the left, player colour along the inner edge. Rotated by 90° steps for the
 * spin animation, so it must stay square and centred. Up a quarter from the original 9×9 at Aaron's
 * request (2026-10-08; a doubled 18×18 was "way too big").
 */
export const BOOMERANG: string[] = [
  '...........',
  '.....oooo..',
  '....oTTTTo.',
  '...oTTTTTo.',
  '..oTTPPoo..',
  '.oTPPPo....',
  '..oTTPPoo..',
  '...oTTTTTo.',
  '....oTTTTo.',
  '.....oooo..',
  '...........',
]

export const CRATE: string[] = [
  'oooooooooooooo',
  'oMmTTTTTTTTmMo',
  'omuTtttttttumo',
  'ouTttttttttTuo',
  'ouuuuuuuuuuuuo',
  'oTTtttttttttTo',
  'otttttttttttto',
  'ottttttttttuto',
  'ouuuuuuuuuuuuo',
  'oTTtttttttttTo',
  'otttttttttttto',
  'omuttttttttumo',
  'oMmuuuuuuuumMo',
  'oooooooooooooo',
]

export const BARREL: string[] = [
  '...oooooo...',
  '..oTTTTTTo..',
  '.oTttttttTo.',
  '.ommmmmmmmo.',
  '.oTttttttuo.',
  '.oTttttttuo.',
  '.oTttttttuo.',
  '.ommmmmmmmo.',
  '.oTttttttuo.',
  '.oTttttttuo.',
  '.oTttttttuo.',
  '.ommmmmmmmo.',
  '..ouuuuuuo..',
  '...oooooo...',
]

/** Wall-mounted torch, 7×11, three flame frames. */
export const TORCH: string[][] = [
  [
    '...y...',
    '..yyO..',
    '..yOO..',
    '.yOORO.',
    '.OORRO.',
    '..ORR..',
    '..mmm..',
    '..umu..',
    '...m...',
    '...m...',
    '..mmm..',
  ],
  [
    '..y....',
    '..yyO..',
    '.yyOO..',
    '.yOORO.',
    '.OORRO.',
    '..ORR..',
    '..mmm..',
    '..umu..',
    '...m...',
    '...m...',
    '..mmm..',
  ],
  [
    '....y..',
    '..yyO..',
    '..yOOy.',
    '.yOORO.',
    '.OORRO.',
    '..ORR..',
    '..mmm..',
    '..umu..',
    '...m...',
    '...m...',
    '..mmm..',
  ],
]

/** Paper lantern on a hook, 7×11 like the torch; the hot spot wanders across the three frames. */
export const LANTERN: string[][] = [
  [
    '...m...',
    '..odo..',
    '.obbbo.',
    'obyyybo',
    'obyOybo',
    'obyyybo',
    '.obbbo.',
    '..odo..',
    '...R...',
    '...R...',
    '.......',
  ],
  [
    '...m...',
    '..odo..',
    '.obbbo.',
    'obOyybo',
    'obyyybo',
    'obyyybo',
    '.obbbo.',
    '..odo..',
    '...R...',
    '...R...',
    '.......',
  ],
  [
    '...m...',
    '..odo..',
    '.obbbo.',
    'obyyybo',
    'obyyybo',
    'obyyObo',
    '.obbbo.',
    '..odo..',
    '...R...',
    '...R...',
    '.......',
  ],
]

/** Wall lamp, 7×11 like the torch: a small flame in a metal cup on a backplate. */
export const LAMP: string[][] = [
  [
    '...y...',
    '..yyO..',
    '..yOO..',
    '..ORO..',
    '.MmmmM.',
    '..mmm..',
    '...m...',
    '...m...',
    '..mMm..',
    '..mmm..',
    '.......',
  ],
  [
    '..y....',
    '..yyO..',
    '.yyOO..',
    '..ORO..',
    '.MmmmM.',
    '..mmm..',
    '...m...',
    '...m...',
    '..mMm..',
    '..mmm..',
    '.......',
  ],
  [
    '....y..',
    '..yyO..',
    '..yOOy.',
    '..ORO..',
    '.MmmmM.',
    '..mmm..',
    '...m...',
    '...m...',
    '..mMm..',
    '..mmm..',
    '.......',
  ],
]

export const SHADOW_DUDE: string[] = [
  '..ssssss..',
  '.ssssssss.',
  '.ssssssss.',
  '..ssssss..',
]

export const SHADOW_BOOM: string[] = [
  '.ssss.',
  'ssssss',
]

export const DEBRIS: Record<string, string[]> = {
  bone: ['d...d', 'bbbbb', 'd...d'],
  skull: ['.bbb.', 'bkbkb', 'bbbbb', '.dbd.'],
  pebbles: ['g.g', '.g.'],
  shard: ['.d', 'dd'],
}
