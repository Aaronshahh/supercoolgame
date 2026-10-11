#!/usr/bin/env node
// Publish the current working copy as static files without committing source changes.
// GitHub Pages must use the gh-pages branch, / (root), as its publishing source.
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const branch = 'gh-pages'
const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: 'inherit' })
const read = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const remote = read(['remote', 'get-url', 'origin'])
const author = { name: read(['config', 'user.name']), email: read(['config', 'user.email']) }

run('npm', ['run', 'typecheck'])
run('npm', ['run', 'build'])

const existing = read(['ls-remote', '--heads', remote, `refs/heads/${branch}`])
const staging = mkdtempSync(join(tmpdir(), 'boomerangeon-pages-'))
try {
  run('git', ['init', '--quiet', '--initial-branch', branch], staging)
  run('git', ['config', 'user.name', author.name], staging)
  run('git', ['config', 'user.email', author.email], staging)
  run('git', ['remote', 'add', 'origin', remote], staging)
  if (existing) {
    run('git', ['fetch', '--quiet', '--depth=1', 'origin', branch], staging)
    run('git', ['checkout', '--quiet', '-B', branch, 'FETCH_HEAD'], staging)
    // Keep hashed bundles so cached HTML and already-open tabs can still load their version.
    // Only this freshly created temporary checkout is cleared; the source tree is untouched.
    for (const entry of readdirSync(staging)) {
      if (entry !== '.git' && entry !== 'assets') rmSync(join(staging, entry), { recursive: true, force: true })
    }
  }
  cpSync(join(root, 'dist'), staging, { recursive: true })
  cpSync(join(root, 'docs', 'audio-credits.md'), join(staging, 'audio-credits.md'))
  writeFileSync(join(staging, '.nojekyll'), '')
  run('git', ['add', '--all'], staging)
  const changes = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: staging, encoding: 'utf8' }).trim()
  if (changes) {
    run('git', ['commit', '--quiet', '-m', 'Publish Boomerangeon to GitHub Pages'], staging)
    run('git', ['push', 'origin', `HEAD:refs/heads/${branch}`], staging)
    console.log('Published build to gh-pages. GitHub Pages may take a few minutes to update.')
  } else {
    console.log('The published build already matches the current game.')
  }
} finally {
  rmSync(staging, { recursive: true, force: true })
}
