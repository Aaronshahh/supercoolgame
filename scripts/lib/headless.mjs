// Headless Chrome driven over the DevTools protocol with Node's built-in WebSocket: no dependencies.
// Chrome's own --screenshot flags only see the first frame of a live page (--timeout returns at
// load, --virtual-time-budget skips the rAF loop), so the live scripts open a page, let it run in
// real time, send keys and read the console through here.
import { execSync, spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

export const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Build the current source and serve dist/ on `port` (module scripts won't load from file://). */
export async function buildAndServe(port) {
  process.chdir(new URL('../..', import.meta.url).pathname)
  mkdirSync('shots', { recursive: true })
  execSync('npm run build --silent', { stdio: 'ignore' })
  const server = spawn('python3', ['-m', 'http.server', String(port), '--directory', 'dist', '--bind', '127.0.0.1'], { stdio: 'ignore' })
  await sleep(500)
  return server
}

const KEYS = {
  ArrowUp: [38, 'ArrowUp'], ArrowDown: [40, 'ArrowDown'], ArrowLeft: [37, 'ArrowLeft'], ArrowRight: [39, 'ArrowRight'],
  Enter: [13, 'Enter'], Escape: [27, 'Escape'], Tab: [9, 'Tab'], Backspace: [8, 'Backspace'], Space: [32, ' '],
}

export class Browser {
  constructor(name, port) {
    this.name = name
    this.port = port
    this.profile = `/tmp/bmr-${name}`
    this.log = []
    this.seq = 0
    this.pending = new Map()
  }

  async launch(url) {
    rmSync(this.profile, { recursive: true, force: true })
    this.proc = spawn(
      CHROME,
      ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1280,800', '--no-first-run', `--user-data-dir=${this.profile}`,
        `--remote-debugging-port=${this.port}`, '--autoplay-policy=no-user-gesture-required', 'about:blank'],
      { stdio: 'ignore' },
    )
    let page
    for (let i = 0; i < 100 && !page; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json()
        page = list.find((t) => t.type === 'page')
      } catch {
        await sleep(100)
      }
    }
    if (!page) throw new Error(`${this.name}: Chrome never answered on port ${this.port}`)
    this.ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((res, rej) => {
      this.ws.onopen = res
      this.ws.onerror = rej
    })
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id)
        this.pending.delete(m.id)
        m.error ? rej(new Error(m.error.message)) : res(m.result)
      } else if (m.method === 'Runtime.consoleAPICalled') {
        this.log.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
      } else if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails
        this.log.push(`Uncaught ${d.exception?.description ?? d.text}`)
      }
    }
    await this.send('Runtime.enable')
    await this.send('Page.enable')
    await this.send('Page.navigate', { url })
  }

  send(method, params = {}) {
    const id = ++this.seq
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  /** Press and release one key: a name from KEYS ('ArrowDown', 'Enter', …) or a single character. */
  async key(name) {
    const [vk, key] = KEYS[name] ?? [name.toUpperCase().charCodeAt(0), name]
    const code = KEYS[name] ? name : /[a-z]/i.test(name) ? `Key${name.toUpperCase()}` : /\d/.test(name) ? `Digit${name}` : name
    const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: key.length === 1 ? key : undefined })
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
  }

  /** Wait up to `ms` for a console line matching `pattern`. */
  async waitFor(pattern, ms) {
    const until = Date.now() + ms
    while (Date.now() < until) {
      if (this.log.some((l) => pattern.test(l))) return true
      await sleep(100)
    }
    return false
  }

  async shot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(file, Buffer.from(data, 'base64'))
  }

  close(logFile) {
    try {
      this.ws?.close()
    } catch {}
    this.proc?.kill()
    if (logFile) writeFileSync(logFile, this.log.join('\n') + '\n')
    try {
      rmSync(this.profile, { recursive: true, force: true })
    } catch {} // Chrome may still be writing its profile as it dies; the next launch wipes it anyway
  }
}
