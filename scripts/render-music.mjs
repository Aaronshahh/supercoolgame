// Rebuild the checked-in music assets after editing a score. Requires Chrome and ffmpeg.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Browser } from './lib/headless.mjs'
const temporary = mkdtempSync(join(tmpdir(),'bmr-music-render-'))
let browser
const server = createServer((req,res) => {
  try {
    const file = req.url === '/render.js' ? join(temporary,'render.js') : req.url?.startsWith('/sfx/') ? join(process.cwd(),'public',req.url) : null
    res.setHeader('Content-Type', req.url === '/render.js' ? 'text/javascript' : file ? 'audio/mpeg' : 'text/html')
    res.end(file ? readFileSync(file) : '<!doctype html><title>Render music</title>')
  } catch { res.writeHead(404).end() }
})
try {
  await build({entryPoints:['src/audio/render-music.ts'],bundle:true,format:'esm',outfile:join(temporary,'render.js'),logLevel:'warning'})
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const port = server.address().port
  // Let Chrome choose a debugger port from a separate ephemeral server.
  const probe = createServer(); await new Promise(r=>probe.listen(0,'127.0.0.1',r))
  const debugPort=probe.address().port; await new Promise(r=>probe.close(r))
  browser = new Browser(`render-music-${Date.now()}`,debugPort)
  await browser.launch(`http://127.0.0.1:${port}`)
  mkdirSync('public/music',{recursive:true})
  const catalog=[]
  for(const key of ['cellar','pits','greenhouse','forge','lab','armoury','icebox','gatehouse','chapel']) {
    console.log(`Rendering ${key}…`)
    const result=await browser.send('Runtime.evaluate',{expression:`import('./render.js').then(m=>m.renderSong(${JSON.stringify(key)}))`,awaitPromise:true,returnByValue:true})
    assert.ok(!result.exceptionDetails,result.exceptionDetails?.exception?.description)
    const {wav,peak,rms,...track}=result.result.value
    const wavFile=join(temporary,`${key}.wav`), mp3File=join(temporary,`${key}.mp3`)
    writeFileSync(wavFile,Buffer.from(wav,'base64'))
    execFileSync('ffmpeg',['-v','error','-y','-i',wavFile,'-codec:a','libmp3lame','-q:a','3',mp3File])
    const data=readFileSync(mp3File)
    const hash=createHash('sha256').update(data).digest('hex').slice(0,10)
    const file=`${key}-${hash}.mp3`
    writeFileSync(`public/music/${file}`,data)
    catalog.push({...track,file})
    console.log(`  ${track.seconds.toFixed(1)} s; ${(data.length/1024).toFixed(0)} KB; peak ${peak.toFixed(3)}, RMS ${rms.toFixed(3)}`)
  }
  writeFileSync('src/audio/music-tracks.json',JSON.stringify(catalog,null,2)+'\n')
  console.log('Rendered all 9 room themes. No music synthesis runs during gameplay.')
} finally {
  browser?.close()
  server.close()
  rmSync(temporary,{recursive:true,force:true})
}
