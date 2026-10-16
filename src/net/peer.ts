/**
 * The signaling side (docs/05 §2): PeerJS gives us a brokered WebRTC data channel per guest and a
 * public PeerServer to broker it on, so a room is just a peer id the host claims. The room code is
 * five characters from an alphabet without 0/O/1/I; the peer id is `bmr-<code>`; the link is this
 * page with `?room=<code>`. `?signal=host[:port][/path]` points everyone at a self-hosted PeerServer.
 */
import Peer, { type DataConnection, type PeerJSOption } from 'peerjs'

export type { DataConnection }

export const CODE_LEN = 5
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 32 symbols, so a random byte mod 32 is uniform

export function makeCode(): string {
  const b = new Uint8Array(CODE_LEN)
  crypto.getRandomValues(b)
  return Array.from(b, (v) => ALPHABET[v % ALPHABET.length]).join('')
}

export function peerIdFor(code: string): string {
  return `bmr-${code.toLowerCase()}`
}

/** A code, a pasted room link, or a bare peer id → the code, or null if it is not one. */
export function normalizeCode(text: string): string | null {
  const m = /room=([A-Za-z0-9]+)/i.exec(text)
  const s = (m ? m[1] : text)
    .trim()
    .toUpperCase()
    .replace(/^BMR-/, '')
    .replace(/[^A-Z0-9]/g, '')
  return s.length === CODE_LEN ? s : null
}

export function roomLink(code: string): string {
  const u = new URL(location.href)
  u.search = ''
  u.hash = ''
  u.searchParams.set('room', code)
  const signal = new URLSearchParams(location.search).get('signal')
  if (signal) u.searchParams.set('signal', signal)
  return u.toString()
}

/** Where to broker: the public PeerServer cloud unless `?signal=` names our own. */
export function signalOptions(): PeerJSOption {
  const p = new URLSearchParams(location.search).get('signal')
  if (!p) return { debug: 1 }
  const m = /^(?:(wss?|https?):\/\/)?([^:/]+)(?::(\d+))?(\/.*)?$/.exec(p)
  if (!m) return { debug: 1 }
  const secure = m[1] ? m[1] === 'wss' || m[1] === 'https' : location.protocol === 'https:'
  return { host: m[2], port: m[3] ? Number(m[3]) : secure ? 443 : 9000, path: m[4] ?? '/', secure, debug: 1 }
}

export function createPeer(id?: string): Peer {
  return id ? new Peer(id, signalOptions()) : new Peer(signalOptions())
}

/** Open a data channel to `peerId`: reliable and ordered (lockstep wants every input, in order), JSON on the wire. */
export function connectTo(peer: Peer, peerId: string): DataConnection {
  return simulateLag(peer.connect(peerId, { reliable: true, serialization: 'json' }))
}

/** `?lag=<ms>` holds every outgoing message that long: fake one-way latency, for netcode testing only. */
const LAG_MS = Number(new URLSearchParams(location.search).get('lag')) || 0
export function simulateLag(conn: DataConnection): DataConnection {
  if (LAG_MS > 0) {
    const send = conn.send.bind(conn)
    // a constant delay keeps the order: same-deadline timers fire in the order they were set
    ;(conn as { send: (data: unknown) => void }).send = (data) => void setTimeout(() => conn.open && send(data), LAG_MS)
  }
  return conn
}

/** The human-readable reason behind a PeerJS error, for the lobby's status line. */
export function describePeerError(err: unknown): string {
  const type = (err as { type?: string } | null)?.type ?? ''
  switch (type) {
    case 'peer-unavailable':
      return 'ROOM NOT FOUND'
    case 'unavailable-id':
      return 'CODE TAKEN'
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'SIGNALING SERVER UNREACHABLE'
    case 'browser-incompatible':
      return 'BROWSER HAS NO WEBRTC'
    case 'disconnected':
      return 'LOST THE SIGNALING SERVER'
    case 'webrtc':
      return 'CONNECTION FAILED'
    default:
      return type ? type.toUpperCase().replace(/-/g, ' ') : 'CONNECTION ERROR'
  }
}
