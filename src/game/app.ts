/**
 * The shell (docs/05 §6): main menu, character select, options, rooms (host / join / lobby) and the
 * hand-over to the game. It draws on its own canvas in the game's pixel font and is torn down when
 * a game starts; demo/main.ts owns the page from then on, and quitting is a reload.
 *
 * URL:  ?room=CODE joins that room straight away (the shareable link).
 *       ?practice=1, ?t=, ?audio=test, ?sheet=, ?arena=, ?at= skip the menu into practice, so the
 *       screenshot and smoke scripts and the practice URL itself keep working.
 *       ?match=1 is an offline match against bots (?bots=, ?target=, ?arena=, ?seed=).
 *       ?signal=host[:port][/path] names a self-hosted PeerServer instead of the public one.
 *       Dev: ?test=host&code=ABCDE hosts under a fixed code and starts when the first guest arrives.
 */
import { CHARACTERS, timedFrame, type Facing } from '../art/characters.ts'
import { CHAR_KEY, PAL, PLAYER_COLORS, PROP_KEY, rgba, withPrimary } from '../art/palette.ts'
import { BOOMERANG } from '../art/props.ts'
import { engine, loadSamples, music } from '../audio/index.ts'
import { ARENA_LIST } from '../demo/arenas.ts'
import type { GameConfig } from '../demo/main.ts'
import { buildRoster, playerLimit, readyToStart, TEAM_NAMES } from './roster.ts'
import { DEFAULT_SETTINGS, Lobby } from '../net/lobby.ts'
import { normalizeCode } from '../net/peer.ts'
import { DELAYS, LIVES, MAX_PLAYERS, TARGETS, roundLives, type StartMsg, type Team } from '../net/protocol.ts'
import { rotate90, spriteFromRows, type Sprite } from '../render/pixelart.ts'
import { createScreen, type Screen } from '../render/screen.ts'
import { drawText, textWidth } from '../render/text.ts'
import { mulberry32 } from '../util/rng.ts'
import { NAME_MAX, applyAudioOptions, cleanName, options, saveOptions } from './options.ts'
import { optionsItems } from './optionsMenu.ts'
import { Menu, drawCentered, drawPanel, drawPointer, drawTitle, type Item } from './ui.ts'

const W = 640
const H = 360
const params = new URLSearchParams(location.search)
const TEST = params.get('test') // dev harness, see the header

type ScreenName = 'main' | 'character' | 'options' | 'join' | 'lobby'

// ---------------------------------------------------------------- the hand-over
let launching = false
/** Tear the shell down and start the game. The game module is only loaded here, so the menu never touches its state. */
async function launch(cfg: GameConfig) {
  if (launching) return
  launching = true
  shell?.destroy()
  shell = null
  const { startGame } = await import('../demo/main.ts')
  startGame(cfg)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function myName(): string {
  return options.name || 'PLAYER'
}

function rosterFrom(msg: StartMsg): GameConfig['players'] {
  return buildRoster(msg.players, msg.settings)
}

/** URLs that skip the menu: the demo's own parameters, the scripts' and the offline match. */
function bypass(): GameConfig | null {
  if (params.get('match') === '1') {
    const gameMode = params.get('mode') === 'teams' ? 'teams' : 'ffa'
    const bots = gameMode === 'teams' ? 3 : clamp(Number(params.get('bots') ?? 2) || 0, 1, MAX_PLAYERS - 1)
    const settings: StartMsg['settings'] = { ...DEFAULT_SETTINGS, gameMode, bots, target: Number(params.get('target') ?? 5) || 5,
      rooms: params.get('rooms') === 'stay' ? 'stay' : 'cycle', lives: roundLives(Number(params.get('lives') ?? 3)) }
    const me = { slot: 0, name: myName(), char: options.char, color: 0, team: 0 as Team, host: true }
    return { mode: 'match', localSlot: 0, players: buildRoster([me], settings), seed: Number(params.get('seed') ?? 7) || 7,
      arenaKey: params.get('arena') ?? DEFAULT_SETTINGS.arena, rules: settings }

  }
  const practice = params.has('t') || params.get('audio') === 'test' || params.has('sheet') || params.has('arena') || params.has('at') || params.get('practice') === '1'
  return practice ? { mode: 'practice', localSlot: 0, players: [] } : null
}

// ---------------------------------------------------------------- sprites for the menus
const spriteCache = new Map<string, Sprite>()
type PreviewAction = 'stand' | 'run' | 'throw' | 'catch' | 'melee' | 'roll'
function charSprite(char: number, color: number, action: PreviewAction = 'stand', frame = 0, facing?: Facing): Sprite {
  const ch = CHARACTERS[char] ?? CHARACTERS[0]
  const view = facing ?? ch.portraitFacing ?? 'down'
  const frames = action === 'roll' ? ch.roll : ch[action][view]
  const i = frame % frames.length
  const k = `${char}:${color}:${action}:${view}:${i}`
  let s = spriteCache.get(k)
  if (!s) {
    s = spriteFromRows(frames[i], withPrimary(CHAR_KEY, PLAYER_COLORS[color % PLAYER_COLORS.length]), ch.name)
    spriteCache.set(k, s)
  }
  return s
}

function drawScaled(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, k: number, alpha = 1) {
  ctx.globalAlpha = alpha
  ctx.drawImage(s.img, Math.round(x), Math.round(y), s.w * k, s.h * k)
  ctx.globalAlpha = 1
}

// ---------------------------------------------------------------- backdrop
interface Chevron {
  x: number
  y: number
  vx: number
  vy: number
  spin: number
  color: number
  k: number
}
const backRng = mulberry32(0xb00f)
const boomFrames: Sprite[][] = PLAYER_COLORS.map((col) => {
  const f0 = spriteFromRows(BOOMERANG, withPrimary(PROP_KEY, col), 'boomerang')
  const f1 = rotate90(f0)
  const f2 = rotate90(f1)
  return [f0, f1, f2, rotate90(f2)]
})
const chevrons: Chevron[] = []
for (let i = 0; i < 16; i++) {
  const a = backRng() * Math.PI * 2
  const sp = 0.25 + backRng() * 0.5
  chevrons.push({ x: backRng() * W, y: backRng() * H, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, spin: backRng() * 40, color: Math.floor(backRng() * PLAYER_COLORS.length), k: backRng() < 0.3 ? 3 : 2 })
}
function drawBackdrop(ctx: CanvasRenderingContext2D, t: number) {
  ctx.fillStyle = PAL.bg
  ctx.fillRect(0, 0, W, H)
  // a faint floor grid, like the rooms' mortar lines
  ctx.fillStyle = rgba(PAL.hudLine, 0.35)
  for (let x = 0; x < W; x += 32) ctx.fillRect(x, 0, 1, H)
  for (let y = 0; y < H; y += 32) ctx.fillRect(0, y, W, 1)
  for (const c of chevrons) {
    c.x += c.vx
    c.y += c.vy
    c.spin += 0.6
    const m = 24
    if (c.x < -m) c.x = W + m
    if (c.x > W + m) c.x = -m
    if (c.y < -m) c.y = H + m
    if (c.y > H + m) c.y = -m
    const f = boomFrames[c.color][Math.floor(c.spin / 10) & 3]
    drawScaled(ctx, f, c.x - (f.w * c.k) / 2, c.y - (f.h * c.k) / 2, c.k, c.k === 3 ? 0.14 : 0.22)
  }
  // a vignette so the panels read
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9)
  g.addColorStop(0, 'rgba(10,8,12,0)')
  g.addColorStop(1, 'rgba(10,8,12,0.75)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  void t
}

// ---------------------------------------------------------------- the shell
interface Shell {
  destroy(): void
}
let shell: Shell | null = null

function runShell() {
  const mount = document.getElementById('game')!
  const screen: Screen = createScreen(W, H, mount)
  const ctx = screen.ctx
  const hint = document.getElementById('hint')
  const setHint = (html: string, selectable = false) => {
    if (!hint) return
    hint.innerHTML = html
    hint.style.userSelect = selectable ? 'text' : 'none'
  }
  setHint('<b>Arrows</b> / <b>WASD</b> move · <b>Enter</b> select · <b>Esc</b> back · the mouse works too')

  // the menu plays the Cellar theme, quietly, once the first key or click unlocks audio
  applyAudioOptions()
  music.playRoom(DEFAULT_SETTINGS.arena)
  engine.onUnlock(loadSamples)

  let current: ScreenName = 'main'
  let menu = new Menu([])
  let lobby: Lobby | null = null
  let joinText = ''
  let joinError = ''
  let copied = 0 // > 0: frames the COPIED notice stays; < 0: the copy failed
  let mouseX = W / 2
  let mouseY = H / 2
  let frame = 0
  let raf = 0

  // ------------------------------------------------------------ screens
  function go(name: ScreenName) {
    current = name
    joinError = ''
    copied = 0
    menu = new Menu(itemsFor(name))
    if (name !== 'lobby') setHint('<b>Arrows</b> / <b>WASD</b> move · <b>Enter</b> select · <b>Esc</b> back · the mouse works too')
  }

  function itemsFor(name: ScreenName): Item[] {
    switch (name) {
      case 'main':
        return mainItems()
      case 'character':
        return characterItems()
      case 'options':
        return optionsItems(() => go('main'))
      case 'join':
        return joinItems()
      case 'lobby':
        return lobbyItems()
    }
  }

  function mainItems(): Item[] {
    return [
      { kind: 'button', label: 'PRACTICE', onSelect: () => void launch({ mode: 'practice', localSlot: 0, players: [] }), hint: 'THE ROOMS, A SPARRING BOT, TAB TO SWAP ROOMS' },
      { kind: 'button', label: 'HOST ROOM', onSelect: () => hostRoom(), hint: 'GET A LINK TO SEND YOUR FRIENDS' },
      { kind: 'button', label: 'JOIN ROOM', onSelect: () => go('join'), hint: 'PASTE A LINK OR TYPE A CODE' },
      { kind: 'gap' },
      { kind: 'button', label: 'CHARACTER', onSelect: () => go('character'), hint: `${CHARACTERS[options.char].name.toUpperCase()} AS ${myName()}` },
      { kind: 'button', label: 'OPTIONS', onSelect: () => go('options') },
    ]
  }

  function characterItems(): Item[] {
    return [
      { kind: 'select', label: 'CHARACTER', values: CHARACTERS.map((c) => c.name.toUpperCase()), get: () => options.char, set: (i) => ((options.char = i), saveOptions()), hint: 'LEFT / RIGHT TO CHOOSE' },
      { kind: 'text', label: 'NAME', get: () => options.name, set: (v) => ((options.name = cleanName(v)), saveOptions()), max: NAME_MAX, placeholder: 'PLAYER', hint: `UP TO ${NAME_MAX} LETTERS, WHAT THE OTHERS SEE` },
      { kind: 'gap' },
      { kind: 'button', label: 'BACK', onSelect: () => go('main') },
    ]
  }

  function joinItems(): Item[] {
    return [
      { kind: 'text', label: 'CODE OR LINK', get: () => joinText, set: (v) => ((joinText = v), (joinError = '')), max: 120, allowed: /^[A-Z0-9:/?=.&%_\-#]$/, onEnter: tryJoin, placeholder: 'ABCDE', hint: 'TYPE A CODE, OR PASTE THE LINK YOU WERE SENT' },
      { kind: 'button', label: 'JOIN', onSelect: tryJoin },
      { kind: 'gap' },
      { kind: 'button', label: 'BACK', onSelect: () => go('main') },
    ]
  }

  function tryJoin() {
    const code = normalizeCode(joinText)
    if (!code) {
      joinError = 'THAT IS NOT A ROOM CODE OR LINK'
      return
    }
    joinRoom(code)
  }

  // ------------------------------------------------------------ rooms
  function hostRoom(code?: string) {
    const settings = { ...DEFAULT_SETTINGS }
    if (TEST) {
      // the dev harness takes its settings from the URL
      settings.bots = clamp(Number(params.get('bots') ?? 0) || 0, 0, MAX_PLAYERS - 1)
      settings.target = Number(params.get('target') ?? settings.target) || settings.target
      settings.gameMode = params.get('mode') === 'teams' ? 'teams' : 'ffa'
      settings.lives = roundLives(Number(params.get('lives') ?? 3))
      settings.delay = Number(params.get('delay') ?? settings.delay) || settings.delay
      settings.arena = params.get('arena') ?? settings.arena
    }
    attachLobby(Lobby.host({ name: myName(), char: options.char }, settings, code))
  }

  function joinRoom(code: string) {
    attachLobby(Lobby.join(code, { name: myName(), char: options.char }))
  }

  function attachLobby(l: Lobby) {
    lobby?.leave()
    lobby = l
    l.onChange = () => {
      if (lobby !== l) return
      if (current === 'lobby') menu.setItems(lobbyItems())
      if (l.isHost && l.status === 'open') {
        setHint(`Room link: <b>${l.link}</b> &nbsp;·&nbsp; code <b>${l.code}</b> &nbsp;·&nbsp; select and copy it, or press COPY LINK`, true)
        if (TEST === 'host' && l.view.players.length >= 2) l.start()
      } else if (!l.isHost && l.status === 'open') setHint(`In room <b>${l.code}</b> · the host starts the match · <b>Esc</b> leave`)
      else if (l.status === 'error') setHint(`<b>${l.error}</b> · <b>Esc</b> back`)
      if (TEST) console.log(`NET lobby ${l.role} ${l.status} code=${l.code} players=${l.view.players.map((p) => p.name).join(',')} lives=${l.view.settings.lives} mode=${l.view.settings.gameMode} teams=${l.view.players.map(p => p.team).join(',')} chars=${l.view.players.map(p => p.char).join(',')}`)
    }
    l.onStart = (msg, session) => {
      if (TEST) console.log(`NET start seed=${msg.seed} slot=${l.localSlot} players=${msg.players.length} bots=${msg.settings.bots} lives=${msg.settings.lives} mode=${msg.settings.gameMode} teams=${rosterFrom(msg).map(p => p.team).join(',')} chars=${rosterFrom(msg).map(p => p.char).join(',')}`)
      void launch({
        mode: 'match',
        localSlot: l.localSlot,
        players: rosterFrom(msg),
        seed: msg.seed,
        arenaKey: msg.settings.arena,
        rules: { target: msg.settings.target, rooms: msg.settings.rooms, lives: msg.settings.lives, gameMode: msg.settings.gameMode },
        net: session,
      })
    }
    go('lobby')
    setHint(l.isHost ? 'Claiming a room code…' : `Joining room <b>${l.code}</b>…`)
  }

  function leaveLobby() {
    lobby?.leave()
    lobby = null
    go('main')
  }

  function copyLink() {
    if (!lobby) return
    const link = lobby.link
    const clip = navigator.clipboard
    if (!clip) {
      copied = -1
      return
    }
    clip.writeText(link).then(
      () => (copied = 150),
      () => (copied = -1),
    )
  }

  function lobbyItems(): Item[] {
    const l = lobby
    if (!l) return [{ kind: 'button', label: 'BACK', onSelect: () => go('main') }]
    if (l.status === 'error' || l.status === 'closed') return [{ kind: 'button', label: 'BACK', onSelect: leaveLobby }]
    const charItem: Item = { kind: 'select', label: 'CHARACTER', values: CHARACTERS.map((c) => c.name.toUpperCase()), get: () => l.me?.char ?? options.char, set: (i) => ((options.char = i), saveOptions(), l.setSelf({ char: i })), hint: 'LEFT / RIGHT TO CHOOSE' }
    const teamItems: Item[] = l.view.settings.gameMode === 'teams' ? [{ kind: 'select', label: 'TEAM', values: [...TEAM_NAMES], get: () => l.me?.team ?? 0, set: i => l.setSelf({ team: i as Team }), hint: 'TWO TEAMMATES PER SIDE, EACH WITH THEIR OWN LIVES' }] : []
    if (!l.isHost) {
      return [charItem, ...teamItems, { kind: 'gap' }, { kind: 'button', label: 'LEAVE', onSelect: leaveLobby, color: PAL.red }]
    }
    const s = l.view.settings
    const humans = l.view.players.length
    const maxBots = playerLimit(s) - humans
    const botValues = Array.from({ length: maxBots + 1 }, (_, i) => String(i))
    const open = l.status === 'open'
    const enough = readyToStart(l.view.players, s)
    return [
      { kind: 'button', label: 'COPY LINK', onSelect: copyLink, disabled: !open, hint: 'THE LINK IS IN THE LINE UNDER THE GAME TOO' },
      { kind: 'gap' },
      { kind: 'select', label: 'MODE', values: ['FREE FOR ALL', '2V2'], get: () => s.gameMode === 'teams' ? 1 : 0, set: i => l.setSettings({ gameMode: i ? 'teams' : 'ffa' }), disabled: humans > 4, hint: humans > 4 ? '2V2 NEEDS FOUR SEATS' : '2V2: SEPARATE LIVES, FRIENDLY FIRE OFF' },
      { kind: 'select', label: 'FIRST TO', values: TARGETS.map(String), get: () => Math.max(0, TARGETS.indexOf(s.target)), set: (i) => l.setSettings({ target: TARGETS[i] }), hint: 'ROUND WINS TO TAKE THE MATCH' },
      { kind: 'select', label: 'LIVES PER ROUND', values: LIVES.map(String), get: () => LIVES.indexOf(s.lives), set: (i) => l.setSettings({ lives: LIVES[i] }), hint: 'RESPAWN UNTIL YOUR LIVES RUN OUT' },
      { kind: 'select', label: 'ROOMS', values: ['CYCLE', 'STAY'], get: () => (s.rooms === 'stay' ? 1 : 0), set: (i) => l.setSettings({ rooms: i ? 'stay' : 'cycle' }), hint: 'A NEW ROOM EVERY ROUND, OR THE SAME ONE' },
      { kind: 'select', label: 'FIRST ROOM', values: ARENA_LIST.map((a) => a.title.toUpperCase()), get: () => Math.max(0, ARENA_LIST.findIndex((a) => a.key === s.arena)), set: (i) => l.setSettings({ arena: ARENA_LIST[i].key }) },
      { kind: 'select', label: 'BOTS', values: botValues, get: () => Math.min(s.bots, maxBots), set: (i) => l.setSettings({ bots: i }), hint: 'AI PLAYERS IN THE EMPTY SLOTS' },
      { kind: 'select', label: 'INPUT DELAY', values: DELAYS.map((d) => `${d} TICKS`), get: () => Math.max(0, DELAYS.indexOf(s.delay)), set: (i) => l.setSettings({ delay: DELAYS[i] }), hint: 'HIGHER RIDES OUT A SLOW CONNECTION, LOWER FEELS SNAPPIER' },
      charItem,
      ...teamItems,
      { kind: 'gap' },
      { kind: 'button', label: 'START', onSelect: () => l.start(), disabled: !open || !enough, color: PAL.cream, hint: enough ? 'EVERYONE IN THE ROOM PLAYS' : s.gameMode === 'teams' ? 'NEEDS TWO PER TEAM, BOTS COUNT' : 'NEEDS TWO PLAYERS, BOTS COUNT' },
      { kind: 'button', label: 'LEAVE', onSelect: leaveLobby, color: PAL.red },
    ]
  }

  // ------------------------------------------------------------ drawing
  function drawMain() {
    drawTitle(ctx, 'BOOMERANGEON', W / 2, 54, PAL.cream, 4)
    drawCentered(ctx, 'A BOOMERANG BRAWL FOR 2 TO 6', W / 2, 92, PAL.hudDim)
    const w = 200
    const x = Math.round(W / 2 - w / 2)
    const y = 124
    drawPanel(ctx, x, y, w, 110)
    menu.draw(ctx, x + 8, y + 10, w - 16, { rowH: 14 })
    const h = menu.hint()
    if (h) drawCentered(ctx, h, W / 2, y + 110 + 8, PAL.hudDim)
    // you, as you will appear
    const s = charSprite(options.char, 0)
    drawScaled(ctx, s, W / 2 + w / 2 + 30, y + 30, 3)
    drawCentered(ctx, myName(), W / 2 + w / 2 + 30 + (s.w * 3) / 2, y + 30 + s.h * 3 + 6, PLAYER_COLORS[0])
    drawCentered(ctx, 'ESC IN THE GAME: MENU', W / 2, H - 14, PAL.hudDim)
  }

  function drawCharacter() {
    drawTitle(ctx, 'CHARACTER', W / 2, 28, PAL.bone, 2)
    const previewTick = Math.floor(performance.now() * 0.06)
    // The whole roster fits in one row, with authored idle movement in each portrait.
    const k = 3
    const gap = 70
    const x0 = W / 2 - (gap * (CHARACTERS.length - 1)) / 2
    CHARACTERS.forEach((c, i) => {
      const idle = c.idleTicks ? timedFrame(previewTick + i * 17, c.idleTicks) : 0
      const s = charSprite(i, 0, 'stand', idle)
      const sel = i === options.char
      const x = x0 + i * gap - (s.w * k) / 2
      const y = 70 - (sel ? 6 : 0)
      ctx.fillStyle = rgba(PAL.outline, 0.6)
      ctx.fillRect(Math.round(x - 4), 70 + s.h * k - 6, s.w * k + 8, 6)
      drawScaled(ctx, s, x, y, k, sel ? 1 : 0.45)
      drawCentered(ctx, c.name.toUpperCase(), x0 + i * gap, 70 + s.h * k + 8, sel ? PAL.cream : PAL.hudDim)
      if (sel) {
        // a small pointer over the chosen one (the font has no arrow glyph)
        ctx.fillStyle = PAL.cream
        const cx = x0 + i * gap
        for (let r = 0; r < 4; r++) ctx.fillRect(cx - 3 + r, 49 + r * 2, 7 - r * 2, 2)
      }
    })
    const w = 260
    const x = Math.round(W / 2 - w / 2)
    const y = 160
    drawPanel(ctx, x, y, w, 70)
    menu.draw(ctx, x + 8, y + 8, w - 16, { rowH: 14, valueW: 110 })
    const h = menu.hint()
    if (h) drawCentered(ctx, h, W / 2, y + 70 + 8, PAL.hudDim)
    const art = CHARACTERS[options.char]
    drawCentered(ctx, art.style ?? 'MOVE, THROW, CATCH, STRIKE, DASH', W / 2, 256, PAL.cream)
    const cycle = previewTick % 80
    const previews: [string, PreviewAction, number][] = [
      ['MOVE', 'run', art.runTicks ? timedFrame(previewTick, art.runTicks) : Math.floor(previewTick / art.runPeriod) % art.run.side.length],
      ['THROW', cycle < 24 ? 'throw' : 'stand', cycle < 24 ? art.throwTicks ? timedFrame(cycle, art.throwTicks, false) : Math.floor(cycle / 8) : 0],
      ['CATCH', cycle < 22 ? 'catch' : 'stand', cycle < 6 ? 0 : cycle < 12 || art.catch.side.length < 3 ? 1 : cycle < 22 ? 2 : 0],
      ['MELEE', cycle < 15 ? 'melee' : 'stand', cycle < 3 ? 0 : cycle < 7 ? 1 : cycle < 11 ? 2 : cycle < 15 ? 3 : 0],
      ['DASH', cycle < 18 ? 'roll' : 'stand', cycle < 18 ? Math.floor(cycle / 3) : 0],
    ]
    previews.forEach(([label, action, frame], i) => {
      const cx = W / 2 + (i - 2) * 78
      const s = charSprite(options.char, 0, action, frame, 'side')
      ctx.fillStyle = rgba(PAL.outline, 0.7)
      ctx.fillRect(cx - 12, 317, 24, 4)
      const lift = action === 'run' ? art.runLift[frame] : 0
      drawScaled(ctx, s, cx - s.w, 318 - s.h * 2 - lift * 2, 2)
      drawCentered(ctx, label, cx, 329, PAL.hudDim)
    })

  }

  function drawOptions() {
    drawTitle(ctx, 'OPTIONS', W / 2, 28, PAL.bone, 2)
    const w = 280
    const x = Math.round(W / 2 - w / 2)
    const y = 56
    const h = 12 * 9 + 6 * 2 + 20
    drawPanel(ctx, x, y, w, h)
    menu.draw(ctx, x + 8, y + 10, w - 16, { rowH: 12, valueW: 90 })
    const hint = menu.hint()
    if (hint) drawCentered(ctx, hint, W / 2, y + h + 8, PAL.hudDim)
  }

  function drawJoin() {
    drawTitle(ctx, 'JOIN ROOM', W / 2, 28, PAL.bone, 2)
    const w = 360
    const x = Math.round(W / 2 - w / 2)
    const y = 80
    drawPanel(ctx, x, y, w, 76)
    menu.draw(ctx, x + 8, y + 10, w - 16, { rowH: 14, valueW: 250 })
    const h = menu.hint()
    if (joinError) drawCentered(ctx, joinError, W / 2, y + 76 + 8, PAL.red)
    else if (h) drawCentered(ctx, h, W / 2, y + 76 + 8, PAL.hudDim)
    drawCentered(ctx, 'THE HOST SEES YOU ARRIVE AND STARTS THE MATCH', W / 2, y + 76 + 30, PAL.hudDim)
  }

  function lobbyStatus(l: Lobby): [string, string] {
    switch (l.status) {
      case 'connecting':
        return [l.isHost ? 'CLAIMING A ROOM CODE' + dots() : 'CONNECTING' + dots(), PAL.bone]
      case 'open':
        return l.isHost ? [`${l.view.players.length} OF ${playerLimit(l.view.settings)} IN   SEND THE LINK, THEN START`, PAL.bone] : ['WAITING FOR THE HOST TO START', PAL.bone]
      case 'started':
        return ['STARTING' + dots(), PAL.cream]
      case 'error':
        return [l.error || 'SOMETHING WENT WRONG', PAL.red]
      case 'closed':
        return ['LEFT THE ROOM', PAL.hudDim]
    }
  }
  function dots(): string {
    return '.'.repeat(1 + (Math.floor(frame / 20) % 3))
  }

  function drawLobby() {
    const l = lobby
    if (!l) return
    const title = l.status === 'connecting' && l.isHost ? 'ROOM' : `ROOM ${l.code}`
    drawTitle(ctx, title, W / 2, 22, PAL.bone, 2)
    const [status, scol] = lobbyStatus(l)
    drawCentered(ctx, status, W / 2, 46, scol)
    if (l.status === 'open' || l.status === 'started') {
      const link = l.link
      const lw = textWidth(link)
      const scale = lw > W - 40 ? 1 : 1
      drawCentered(ctx, link.toUpperCase(), W / 2, 58, PAL.hudDim, scale)
    }
    if (copied > 0) {
      copied--
      drawCentered(ctx, 'LINK COPIED', W / 2, 70, PAL.cream)
    } else if (copied < 0) drawCentered(ctx, 'COULD NOT COPY: SELECT THE LINK UNDER THE GAME', W / 2, 70, PAL.red)

    // left: the settings (host) or your seat (guest); right: who is here
    const lx = 30
    const ly = 84
    const lw = 310
    const teams = l.view.settings.gameMode === 'teams'
    const lh = l.isHost ? 12 * (teams ? 14 : 13) + 16 : 12 * (teams ? 4 : 3) + 16
    drawPanel(ctx, lx, ly, lw, lh)
    menu.draw(ctx, lx + 8, ly + 8, lw - 16, { rowH: 12, valueW: 120 })
    const h = menu.hint()
    if (h) drawText(ctx, h, lx + 8, ly + lh + 6, PAL.hudDim)
    if (!l.isHost && (l.status === 'open' || l.status === 'started')) {
      // what the host has set, read-only (not before the roster has arrived: those would be our defaults)
      const s = l.view.settings
      const lines = [`MODE ${teams ? '2V2' : 'FREE FOR ALL'}`, `FIRST TO ${s.target}`, `LIVES PER ROUND ${s.lives}`, `ROOMS ${s.rooms.toUpperCase()}`, `FIRST ROOM ${(ARENA_LIST.find((a) => a.key === s.arena)?.title ?? s.arena).toUpperCase()}`, `BOTS ${s.bots}`, `INPUT DELAY ${s.delay} TICKS`]
      let y = ly + lh + 22
      drawText(ctx, 'THE HOST HAS SET', lx + 8, y, PAL.hudDim)
      y += 10
      for (const line of lines) {
        drawText(ctx, line, lx + 8, y, PAL.bone)
        y += 8
      }
    }

    const rx = lx + lw + 16
    const rw = W - rx - 30
    const rh = 20 + playerLimit(l.view.settings) * 26
    drawPanel(ctx, rx, ly, rw, rh)
    drawText(ctx, 'PLAYERS', rx + 8, ly + 6, PAL.hudDim)
    const s = l.view.settings
    const humans = l.view.players.length
    const bots = Math.min(s.bots, playerLimit(s) - humans)
    const seats: { name: string; char: number; color: number; tag: string; dim: boolean }[] = []
    for (const p of buildRoster(l.view.players, s)) {
      const human = l.view.players.find(q => q.slot === p.slot)
      const role = p.ai ? 'BOT' : `${human?.host ? 'HOST ' : ''}${p.slot === l.localSlot ? 'YOU' : ''}`.trim()
      seats.push({ name: p.name, char: p.char, color: p.color, tag: [teams ? TEAM_NAMES[p.team] : '', role].filter(Boolean).join(' - '), dim: p.ai })
    }
    while (seats.length < playerLimit(s)) seats.push({ name: '', char: 0, color: seats.length, tag: '', dim: true })
    seats.forEach((seat, i) => {
      const y = ly + 18 + i * 26
      ctx.fillStyle = rgba(PLAYER_COLORS[seat.color % PLAYER_COLORS.length], seat.name ? 0.9 : 0.25)
      ctx.fillRect(rx + 8, y + 2, 3, 20)
      if (!seat.name) {
        drawText(ctx, 'OPEN SEAT', rx + 48, y + 9, PAL.hudLine)
        return
      }
      drawScaled(ctx, charSprite(seat.char, seat.color), rx + 16, y + 3, 1, seat.dim ? 0.6 : 1)
      drawText(ctx, seat.name, rx + 36, y + 5, seat.dim ? PAL.hudDim : PAL.bone)
      if (seat.tag) drawText(ctx, seat.tag, rx + 36, y + 14, seat.dim ? PAL.hudLine : PAL.hudDim)
    })
  }

  function draw() {
    frame++
    drawBackdrop(ctx, frame)
    switch (current) {
      case 'main':
        drawMain()
        break
      case 'character':
        drawCharacter()
        break
      case 'options':
        drawOptions()
        break
      case 'join':
        drawJoin()
        break
      case 'lobby':
        drawLobby()
        break
    }
    drawPointer(ctx, mouseX, mouseY)
    screen.present()
  }

  // ------------------------------------------------------------ input
  function back() {
    if (current === 'lobby') leaveLobby()
    else if (current !== 'main') go('main')
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return
    engine.unlock()
    if (e.code === 'Escape') {
      e.preventDefault()
      back()
      return
    }
    if (menu.key(e)) e.preventDefault()
    if (current === 'main' && menu.current?.kind === 'button') {
      // the hint under the main menu names the costume and name; keep it current
    }
  }
  const onMove = (e: MouseEvent) => {
    ;[mouseX, mouseY] = screen.toInternal(e.clientX, e.clientY)
    menu.mouseMove(mouseX, mouseY)
  }
  const onDown = (e: MouseEvent) => {
    engine.unlock()
    if (e.button !== 0) return
    const [mx, my] = screen.toInternal(e.clientX, e.clientY)
    menu.click(mx, my)
  }
  const onPaste = (e: ClipboardEvent) => {
    const text = e.clipboardData?.getData('text') ?? ''
    if (!text) return
    if (current === 'join') {
      // a paste anywhere on the join screen goes into the code field
      menu.select(0)
      menu.paste(text)
      joinError = ''
      e.preventDefault()
    } else if (menu.paste(text)) e.preventDefault()
  }
  const onHide = () => lobby?.leave()
  window.addEventListener('keydown', onKey)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mousedown', onDown)
  window.addEventListener('paste', onPaste)
  window.addEventListener('pagehide', onHide)
  window.addEventListener('contextmenu', (e) => e.preventDefault())

  const loop = () => {
    draw()
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)

  shell = {
    destroy() {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('pagehide', onHide)
      screen.destroy()
      // the lobby stays: its peer and channels carry the match
    },
  }

  // the way in from a link, or the dev harness
  const roomParam = params.get('room')
  const code = roomParam ? normalizeCode(roomParam) : null
  if (code) {
    joinText = code
    joinRoom(code)
  } else if (TEST === 'host') hostRoom(params.get('code') ?? undefined)
  else go('main')
}

// ---------------------------------------------------------------- entry
const direct = bypass()
if (direct) void launch(direct)
else runShell()
