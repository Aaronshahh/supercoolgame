/**
 * Deterministic sine and cosine for the simulation (docs/05 §4). `Math.sin`/`Math.cos` are not
 * specified bit-for-bit and the engines differ in the last place (V8 and SpiderMonkey ship fdlibm
 * ports, JavaScriptCore calls the system libm), which is enough to split a lockstep match over a
 * few thousand ticks. These use only +, −, ×, ÷ and floor, which IEEE 754 rounds identically
 * everywhere, so every browser gets the same bits. Error is under 1e-9 on the whole circle, far
 * below anything the game can see. Render code is free to keep using Math.sin.
 */
const PI = Math.PI
const TAU = 2 * Math.PI
const HALF_PI = Math.PI / 2
// Taylor coefficients to x^13, evaluated as literal divisions so every engine rounds them the same
const C3 = -1 / 6
const C5 = 1 / 120
const C7 = -1 / 5040
const C9 = 1 / 362880
const C11 = -1 / 39916800
const C13 = 1 / 6227020800

export function dsin(a: number): number {
  // reduce to [-π, π), then fold onto [-π/2, π/2] where the series converges fast
  let x = a - TAU * Math.floor((a + PI) / TAU)
  if (x > HALF_PI) x = PI - x
  else if (x < -HALF_PI) x = -PI - x
  const x2 = x * x
  return x * (1 + x2 * (C3 + x2 * (C5 + x2 * (C7 + x2 * (C9 + x2 * (C11 + x2 * C13))))))
}

export function dcos(a: number): number {
  return dsin(a + HALF_PI)
}
