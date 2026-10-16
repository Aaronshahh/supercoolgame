/**
 * Rooms (docs/05 §3). The host claims a peer id made from the room code and keeps the roster; guests
 * open one data channel to the host, say hello, and get the roster back every time it changes. The
 * host alone edits the settings and presses start; the start message carries everything a client
 * needs to run the same match (seed, players, settings), after which the same channels carry the
 * lockstep traffic (lockstep.ts).
 */
import { characterIndex } from '../art/characters.ts'
import type Peer from 'peerjs'
import { nextTeam, playerLimit, readyToStart } from '../game/roster.ts'
import { NetSession } from './lockstep.ts'
import { connectTo, createPeer, describePeerError, makeCode, peerIdFor, roomLink, simulateLag, type DataConnection } from './peer.ts'
import { type GuestMsg, type HostMsg, type LobbyPlayer, type LobbySettings, type LobbyView, MAX_PLAYERS, PROTOCOL_VERSION, roundLives, type Team, type StartMsg } from './protocol.ts'

export type LobbyStatus = 'connecting' | 'open' | 'started' | 'closed' | 'error'

export interface Profile {
  name: string
  char: number
}

export const DEFAULT_SETTINGS: LobbySettings = { gameMode: 'ffa', target: 5, lives: 3, rooms: 'cycle', bots: 0, delay: 4, arena: 'cellar' }

const JOIN_TIMEOUT_MS = 15000

export class Lobby {
  readonly role: 'host' | 'guest'
  code: string
  status: LobbyStatus = 'connecting'
  error = ''
  view: LobbyView
  /** called whenever something a screen shows has changed */
  onChange: () => void = () => {}
  /** called on every client when the host starts the match */
  onStart: (msg: StartMsg, session: NetSession) => void = () => {}

  private peer: Peer | null = null
  private readonly profile: Profile
  // host
  private readonly conns = new Map<number, DataConnection>()
  // guest
  private hostConn: DataConnection | null = null
  private session: NetSession | null = null
  private joinTimer = 0

  private constructor(role: 'host' | 'guest', code: string, profile: Profile, settings: LobbySettings) {
    this.role = role
    this.code = code
    this.profile = profile
    this.view = { players: [], settings: { ...settings, lives: roundLives(settings.lives) }, you: role === 'host' ? 0 : -1 }
  }

  get link(): string {
    return roomLink(this.code)
  }

  get localSlot(): number {
    return this.view.you
  }

  get me(): LobbyPlayer | undefined {
    return this.view.players.find((p) => p.slot === this.view.you)
  }

  get isHost(): boolean {
    return this.role === 'host'
  }

  // ------------------------------------------------------------------ host
  static host(profile: Profile, settings: LobbySettings = DEFAULT_SETTINGS, code = makeCode()): Lobby {
    const l = new Lobby('host', code, profile, settings)
    l.view.players.push({ slot: 0, name: profile.name, char: profile.char, color: 0, host: true, team: 0 })
    l.claim(0)
    return l
  }

  /** Claim the room's peer id; a taken code is re-rolled a couple of times. */
  private claim(attempt: number) {
    const peer = createPeer(peerIdFor(this.code))
    this.peer = peer
    peer.on('open', () => {
      this.status = 'open'
      this.error = ''
      this.changed()
    })
    peer.on('connection', (conn) => this.accept(conn))
    peer.on('disconnected', () => {
      // the broker dropped us; existing channels keep working, new guests cannot find us
      if (this.status === 'open' && !peer.destroyed) peer.reconnect()
    })
    peer.on('error', (err) => {
      if ((err as { type?: string }).type === 'unavailable-id' && attempt < 3) {
        peer.destroy()
        this.code = makeCode()
        this.claim(attempt + 1)
        return
      }
      if ((err as { type?: string }).type === 'peer-unavailable') return // a guest we tried to reach is gone; not fatal
      this.fail(describePeerError(err))
    })
  }

  private accept(conn: DataConnection) {
    simulateLag(conn)
    let slot = -1
    conn.on('data', (raw) => {
      const msg = raw as GuestMsg
      if (!Array.isArray(msg)) return
      if (slot >= 0 && this.session?.onGuestMsg(slot, msg)) return
      if (msg[0] === 'hello') {
        if (slot >= 0) return
        const h = msg[1]
        if (h.ver !== PROTOCOL_VERSION) return this.turnAway(conn, 'VERSION MISMATCH')
        if (this.status !== 'open') return this.turnAway(conn, 'MATCH ALREADY STARTED')
        slot = this.freeSlot()
        if (slot < 0) return this.turnAway(conn, 'ROOM FULL')
        this.conns.set(slot, conn)
        this.view.players.push({ slot, name: uniqueName(cleanRemoteName(h.name) || `P${slot + 1}`, this.view.players), char: characterIndex(h.char), color: slot, host: false, team: nextTeam(this.view.players) })
        this.view.players.sort((a, b) => a.slot - b.slot)
        this.broadcastLobby()
        this.changed()
        return
      }
      if (slot < 0 || this.status !== 'open') return
      if (msg[0] === 'set') {
        const p = this.view.players.find((q) => q.slot === slot)
        if (!p) return
        if (msg[1].team === 0 || msg[1].team === 1) p.team = msg[1].team
        if (msg[1].char !== undefined) p.char = characterIndex(msg[1].char)
        if (msg[1].name !== undefined) p.name = uniqueName(cleanRemoteName(msg[1].name) || p.name, this.view.players.filter((q) => q !== p))
        this.broadcastLobby()
        this.changed()
      }
    })
    conn.on('close', () => this.dropGuest(slot))
    conn.on('error', () => this.dropGuest(slot))
  }

  private turnAway(conn: DataConnection, reason: string) {
    conn.send(['bye', reason] satisfies HostMsg)
    setTimeout(() => conn.close(), 200)
  }

  private dropGuest(slot: number) {
    if (slot < 0 || !this.conns.has(slot)) return
    this.conns.delete(slot)
    if (this.session) this.session.guestLeft(slot)
    else {
      this.view.players = this.view.players.filter((p) => p.slot !== slot)
      this.broadcastLobby()
    }
    this.changed()
  }

  private freeSlot(): number {
    if (this.view.players.length >= playerLimit(this.view.settings)) return -1
    for (let s = 1; s < MAX_PLAYERS; s++) if (!this.view.players.some((p) => p.slot === s)) return s
    return -1
  }

  private broadcastLobby() {
    for (const [slot, c] of this.conns) if (c.open) c.send(['lobby', { ...this.view, you: slot }] satisfies HostMsg)
  }

  /** Host: change a setting; everyone sees it. */
  setSettings(patch: Partial<LobbySettings>): void {
    if (!this.isHost || this.status !== 'open') return
    if (patch.gameMode === 'teams' && this.view.players.length > 4) return
    if (patch.gameMode === 'teams' && this.view.settings.gameMode !== 'teams') {
      this.view.players.forEach((p, i) => p.team = (i % 2) as Team)
      this.view.settings.bots = 4 - this.view.players.length
    }
    Object.assign(this.view.settings, patch)
    this.view.settings.lives = roundLives(this.view.settings.lives)
    this.view.settings.bots = Math.max(0, Math.min(playerLimit(this.view.settings) - this.view.players.length, this.view.settings.bots))
    this.broadcastLobby()
    this.changed()
  }

  /** Change your own character or name. */
  setSelf(patch: Partial<Profile> & { team?: Team }): void {
    if (this.status !== 'open') return
    if (this.isHost) {
      const me = this.view.players[0]
      if (patch.team === 0 || patch.team === 1) me.team = patch.team
      if (patch.char !== undefined) me.char = characterIndex(patch.char)
      if (patch.name !== undefined) me.name = uniqueName(cleanRemoteName(patch.name) || me.name, this.view.players.slice(1))
      this.broadcastLobby()
      this.changed()
    } else this.hostConn?.send(['set', patch] satisfies GuestMsg)
  }

  /** Host: start the match for everyone in the room. */
  start(): void {
    if (!this.isHost || this.status !== 'open' || !readyToStart(this.view.players, this.view.settings)) return
    const bots = Math.max(0, Math.min(playerLimit(this.view.settings) - this.view.players.length, this.view.settings.bots))
    const seed = (crypto.getRandomValues(new Uint32Array(1))[0] >>> 1) || 1
    const msg: StartMsg = { seed, players: this.view.players.map((p) => ({ ...p })), settings: { ...this.view.settings, bots } }
    this.status = 'started'
    for (const c of this.conns.values()) if (c.open) c.send(['start', msg] satisfies HostMsg)
    this.session = new NetSession('host', 0, msg.players, this.conns, msg.settings.delay)
    this.changed()
    this.onStart(msg, this.session)
  }

  // ------------------------------------------------------------------ guest
  static join(code: string, profile: Profile): Lobby {
    const l = new Lobby('guest', code, profile, DEFAULT_SETTINGS)
    const peer = createPeer()
    l.peer = peer
    l.joinTimer = window.setTimeout(() => {
      if (l.status === 'connecting') l.fail('NO ANSWER FROM THE ROOM')
    }, JOIN_TIMEOUT_MS)
    peer.on('open', () => {
      const conn = connectTo(peer, peerIdFor(code))
      l.hostConn = conn
      conn.on('open', () => conn.send(['hello', { name: profile.name, char: profile.char, ver: PROTOCOL_VERSION }] satisfies GuestMsg))
      conn.on('data', (raw) => l.onHostData(raw as HostMsg))
      conn.on('close', () => l.hostClosed())
      conn.on('error', () => l.hostClosed())
    })
    peer.on('error', (err) => l.fail(describePeerError(err)))
    return l
  }

  private onHostData(msg: HostMsg) {
    if (!Array.isArray(msg)) return
    if (this.session?.onHostMsg(msg)) return
    switch (msg[0]) {
      case 'lobby':
        this.view = msg[1]
        if (this.status === 'connecting') {
          this.status = 'open'
          window.clearTimeout(this.joinTimer)
        }
        this.changed()
        break
      case 'bye':
        this.fail(msg[1])
        break
      case 'start': {
        const m = msg[1]
        this.view = { players: m.players, settings: m.settings, you: this.view.you }
        this.status = 'started'
        this.session = new NetSession('guest', this.view.you, m.players, this.hostConn!, m.settings.delay)
        this.changed()
        this.onStart(m, this.session)
        break
      }
    }
  }

  private hostClosed() {
    if (this.session) this.session.hostLeft()
    else if (this.status !== 'error') this.fail(this.status === 'connecting' ? 'ROOM NOT FOUND' : 'THE HOST LEFT')
    this.changed()
  }

  // ------------------------------------------------------------------ both
  private fail(reason: string) {
    if (this.status === 'error' || this.status === 'closed') return
    this.status = 'error'
    this.error = reason
    window.clearTimeout(this.joinTimer)
    this.changed()
  }

  private changed() {
    this.onChange()
  }

  /** Leave the room and free the code. */
  leave(): void {
    this.status = 'closed'
    window.clearTimeout(this.joinTimer)
    this.session?.close()
    this.peer?.destroy()
    this.peer = null
  }
}

function cleanRemoteName(s: unknown): string {
  return typeof s === 'string'
    ? s
        .toUpperCase()
        .replace(/[^A-Z0-9 \-]/g, '')
        .trim()
        .slice(0, 8)
    : ''
}

/** Two players with the same name get a number on the second. */
function uniqueName(name: string, others: LobbyPlayer[]): string {
  if (!others.some((p) => p.name === name)) return name
  for (let i = 2; i < 10; i++) {
    const n = `${name.slice(0, 6)} ${i}`
    if (!others.some((p) => p.name === n)) return n
  }
  return name
}
