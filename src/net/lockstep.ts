/**
 * Host-relayed deterministic lockstep (docs/05 §4). Every client runs the whole simulation; only
 * inputs cross the wire. A client produces its input for tick T + delay while it is simulating tick
 * T, and sends it to the host; the host waits until it holds every live human's input for a tick,
 * then broadcasts the complete bundle (its own input included) and everyone, host first, steps that
 * tick from the bundle. A client that is missing the next bundle waits: no prediction, no rollback
 * (that is the upgrade path in docs/05 §9). The delay hides a round trip to the host; past it, the
 * match stalls for everyone together rather than diverging.
 *
 * Host commands (a player leaving, a rematch) ride inside the bundle so every client applies them on
 * the same tick. Every 30 ticks each client hashes its state; guests send theirs to the host, which
 * compares and flags a desync for all if they ever differ.
 */
import type { DataConnection } from 'peerjs'
import { type Bundle, type GuestMsg, type HostMsg, type Input, type LobbyPlayer, NEUTRAL, type PackedInput, packInput, unpackInput } from './protocol.ts'

export const HASH_EVERY = 30

export interface TickInputs {
  /** by slot; a slot that sends no input (a bot, a player who left) is undefined */
  inputs: (Input | undefined)[]
  cmds: string[]
}

export class NetSession {
  readonly role: 'host' | 'guest'
  readonly localSlot: number
  readonly delay: number
  /** slots that send inputs, in slot order (bots are not here) */
  readonly humans: number[]
  readonly names: string[] = []
  /** the tick a desync was first seen at, or -1 */
  desyncTick = -1
  /** guest: the host's channel closed */
  hostGone = false
  /** highest tick whose local input has gone out */
  frontier = 0
  /** anything the host has told us since the last read (a name who left), for the HUD */
  notices: string[] = []
  /** Network activity can service a hidden tab's match without a render frame. */
  onActivity: (() => void) | null = null

  private readonly gone = new Set<number>()
  private readonly bundles = new Map<number, Bundle>()
  // host side
  private readonly conns = new Map<number, DataConnection>()
  private readonly pending = new Map<number, Map<number, PackedInput>>()
  private cmdQueue: string[] = []
  private nextBundle = 1
  private readonly ownHashes = new Map<number, number>()
  private readonly guestHashes = new Map<number, Map<number, number>>()
  // guest side
  private readonly hostConn: DataConnection | null

  constructor(role: 'host' | 'guest', localSlot: number, players: LobbyPlayer[], conns: Map<number, DataConnection> | DataConnection, delay: number) {
    this.role = role
    this.localSlot = localSlot
    this.delay = delay
    this.humans = players.map((p) => p.slot).sort((a, b) => a - b)
    for (const p of players) this.names[p.slot] = p.name
    if (conns instanceof Map) {
      this.hostConn = null
      for (const [slot, c] of conns) this.conns.set(slot, c)
    } else this.hostConn = conns
  }

  /** The local input for tick `t`. Call once per tick, in order: t = the tick just simulated + delay. */
  submitLocal(t: number, inp: Input): void {
    const p = packInput(inp)
    if (this.role === 'host') this.acceptInput(this.localSlot, t, p)
    else this.hostConn?.send(['i', t, p] satisfies GuestMsg)
    this.frontier = Math.max(this.frontier, t)
  }

  /** The first `delay` ticks have nobody's input yet: everyone stands still for them. */
  primeNeutral(): void {
    for (let t = 1; t <= this.delay; t++) this.submitLocal(t, unpackInput(NEUTRAL))
  }

  /** A visible player is stalled: wake hidden peers even if no complete bundle can be sent yet. */
  wakePeers(): void {
    if (this.role === 'host') this.broadcast(['w'])
    else this.hostConn?.send(['w'] satisfies GuestMsg)
  }

  /** Everyone's inputs for tick `t`, once the host has them all; null means wait. Consumed. */
  take(t: number): TickInputs | null {
    const b = this.bundles.get(t)
    if (!b) return null
    this.bundles.delete(t)
    const inputs: (Input | undefined)[] = []
    b.inputs.forEach((p, slot) => {
      if (p) inputs[slot] = unpackInput(p)
    })
    return { inputs, cmds: b.cmds ?? [] }
  }

  /** Who the next bundle is waiting on (names), for the HUD. */
  waitingOn(t: number): string[] {
    if (this.role === 'guest') return this.hostGone ? [] : [this.names[0] ?? 'HOST']
    const have = this.pending.get(t)
    return this.humans.filter((s) => !this.gone.has(s) && !have?.has(s)).map((s) => this.names[s] ?? `P${s + 1}`)
  }

  /** The sim's state hash at tick `t` (a multiple of HASH_EVERY). */
  reportHash(t: number, h: number): void {
    if (this.role === 'guest') {
      this.hostConn?.send(['h', t, h] satisfies GuestMsg)
      return
    }
    this.ownHashes.set(t, h)
    const theirs = this.guestHashes.get(t)
    if (theirs) {
      for (const [slot, g] of theirs) this.compare(t, slot, g)
      this.guestHashes.delete(t)
    }
    if (this.ownHashes.size > 40) this.ownHashes.delete(Math.min(...this.ownHashes.keys()))
  }

  /** Host only: a command every client applies on the same tick (`rematch`, `leave:<slot>`). */
  command(cmd: string): void {
    if (this.role !== 'host') return
    this.cmdQueue.push(cmd)
    this.flush()
  }

  /** Host: a guest's channel closed. Their inputs are no longer waited for and the sim is told. */
  guestLeft(slot: number): void {
    if (this.gone.has(slot)) return
    this.gone.add(slot)
    this.conns.delete(slot)
    this.notices.push(`${this.names[slot] ?? `P${slot + 1}`} LEFT`)
    this.command(`leave:${slot}`)
  }

  /** Guest: the host's channel closed. */
  hostLeft(): void {
    this.hostGone = true
  }

  /** A message from guest `slot` (host side). Returns false if it was not a lockstep message. */
  onGuestMsg(slot: number, msg: GuestMsg): boolean {
    if (msg[0] === 'i') {
      this.acceptInput(slot, msg[1], msg[2])
      this.onActivity?.()
      return true
    }
    if (msg[0] === 'w') {
      // A visible guest also wakes the other guests, even when the host itself is hidden.
      this.broadcast(['w'])
      this.onActivity?.()
      return true
    }
    if (msg[0] === 'h') {
      const t = msg[1]
      const mine = this.ownHashes.get(t)
      if (mine !== undefined) this.compare(t, slot, msg[2])
      else {
        let m = this.guestHashes.get(t)
        if (!m) this.guestHashes.set(t, (m = new Map()))
        m.set(slot, msg[2])
        if (this.guestHashes.size > 40) this.guestHashes.delete(Math.min(...this.guestHashes.keys()))
      }
      return true
    }
    return false
  }

  /** A message from the host (guest side). Returns false if it was not a lockstep message. */
  onHostMsg(msg: HostMsg): boolean {
    if (msg[0] === 'b') {
      this.bundles.set(msg[1], { inputs: msg[2], cmds: msg[3] })
      this.onActivity?.()
      return true
    }
    if (msg[0] === 'w') {
      this.onActivity?.()
      return true
    }
    if (msg[0] === 'd') {
      if (this.desyncTick < 0) this.desyncTick = msg[1]
      return true
    }
    return false
  }

  private compare(t: number, slot: number, theirs: number) {
    const mine = this.ownHashes.get(t)
    if (mine === undefined || mine === theirs || this.desyncTick >= 0) return
    this.desyncTick = t
    console.warn(`desync at tick ${t}: host ${mine} vs slot ${slot} ${theirs}`)
    this.broadcast(['d', t])
  }

  private acceptInput(slot: number, t: number, p: PackedInput) {
    // clients pump inputs a bounded window past their stepped tick; anything far beyond is a bug
    if (t < this.nextBundle || t > this.nextBundle + 240 || this.gone.has(slot)) return
    let m = this.pending.get(t)
    if (!m) this.pending.set(t, (m = new Map()))
    m.set(slot, p)
    this.flush()
  }

  /** Host: complete every bundle that can be completed, in tick order, and send it out. */
  private flush() {
    for (;;) {
      const t = this.nextBundle
      const m = this.pending.get(t)
      const live = this.humans.filter((s) => !this.gone.has(s))
      // the host is always live, so this waits on at least its own input and can never spin
      if (live.length === 0 || !live.every((s) => m?.has(s))) return
      const inputs: (PackedInput | null)[] = []
      for (const s of this.humans) inputs[s] = (!this.gone.has(s) && m?.get(s)) || null
      const cmds = this.cmdQueue.length ? this.cmdQueue : undefined
      this.cmdQueue = []
      this.bundles.set(t, { inputs, cmds })
      this.broadcast(cmds ? ['b', t, inputs, cmds] : ['b', t, inputs])
      this.pending.delete(t)
      this.nextBundle = t + 1
    }
  }

  private broadcast(msg: HostMsg) {
    for (const c of this.conns.values()) if (c.open) c.send(msg)
  }

  close(): void {
    this.onActivity = null
    for (const c of this.conns.values()) c.close()
    this.hostConn?.close()
  }
}
