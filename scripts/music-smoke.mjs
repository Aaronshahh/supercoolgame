// Monitor actual audio-thread samples while deliberately blocking the game's main thread.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { createServer } from 'node:net'
import { build } from 'esbuild'
import { Browser, buildAndServe } from './lib/headless.mjs'
async function freePort() {
  const s=createServer(); await new Promise(r=>s.listen(0,'127.0.0.1',r))
  const port=s.address().port; await new Promise(r=>s.close(r)); return port
}
const browser=new Browser(`music-${Date.now()}`,await freePort())
let server
const files=['dist/music-test.js','dist/music-test.html','dist/music-meter.js']
const timeout=setTimeout(()=>{console.error('Music test timed out');process.exit(1)},120000)
process.on('exit',()=>{browser.close();server?.kill()})
try {
  const port=await freePort();server=await buildAndServe(port)
  await build({stdin:{contents:`import './src/audio/samples.ts'; export { music, MUSIC_TRACKS, musicTest } from './src/audio/music.ts'; export { engine } from './src/audio/engine.ts'; export { sfx } from './src/audio/sfx.ts';`,resolveDir:process.cwd()},bundle:true,format:'esm',outfile:files[0],logLevel:'warning',
    plugins:[{name:'test-exports',setup(b){b.onLoad({filter:/audio\/music\.ts$/},args=>({loader:'ts',contents:readFileSync(args.path,'utf8')+'\nexport const musicTest={get playing(){return playing},buffers,loads};'}))}}]})
  writeFileSync(files[1],'<!doctype html><title>Music regression test</title>')
  writeFileSync(files[2],`class Meter extends AudioWorkletProcessor {
    constructor(){super();this.sum=0;this.count=0;}
    process(inputs){const data=inputs[0]?.[0];if(data)for(const v of data)this.sum+=v*v;this.count+=data?.length||128;
      if(this.count>=sampleRate/10){this.port.postMessage({time:currentTime,rms:Math.sqrt(this.sum/this.count)});this.sum=0;this.count=0;}return true;}
  }registerProcessor('meter',Meter);`)
  await browser.launch(`http://127.0.0.1:${port}/music-test.html`)
  const run=async expression=>{
    const r=await browser.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})
    assert.ok(!r.exceptionDetails,r.exceptionDetails?.exception?.description);return r.result.value
  }
  const reports=await run(`(async()=>{
    const {music,engine,musicTest:m,MUSIC_TRACKS,sfx}=await import('./music-test.js');
    const check=(v,label)=>{if(!v)throw Error(label)};
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const until=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await wait(50)}throw Error('timed out waiting for music')};
    const reports=[];
    // A request cancelled before the first user gesture must stay cancelled.
    music.playRoom('pits');music.stop(0);engine.unlock();await wait(80);
    check(music.current()===null,'pre-unlock stop');
    const ac=engine.ctx;await ac.audioWorklet.addModule('./music-meter.js');
    const meter=new AudioWorkletNode(ac,'meter');engine.music.connect(meter);meter.connect(ac.destination);
    let samples=[];meter.port.onmessage=e=>samples.push(e.data);
    let created=0;const original=ac.createBufferSource.bind(ac);
    ac.createBufferSource=()=>{created++;return original()};
    music.playRoom('cellar',.05);await until(()=>music.current()?.key==='cellar');
    const first=m.playing.source;await wait(400);
    for(let i=0;i<100;i++)music.playRoom('cellar');
    check(m.playing.source===first&&created===1,'same room restarts or layers music');
    samples=[];const at=ac.currentTime;
    const end=performance.now()+2500;while(performance.now()<end){} // deliberately miss 12 old scheduling windows
    await wait(250);
    const during=samples.filter(s=>s.time>at+.2&&s.time<at+2.3);
    check(during.length>=18,'audio thread did not keep rendering during stall');
    check(during.every(s=>s.rms>.001),'music dropped out during main-thread stall');
    check(created===1,'music created extra note sources');
    reports.push('2.5-second main-thread stall: '+during.length+' audible audio windows, one looping source');
    music.deathSlow();await wait(120);check(Math.abs(first.playbackRate.value-.9)<.001,'death slowdown');
    music.deathSlow();await wait(700);check(first.playbackRate.value===1&&m.playing.source===first,'death recovery restarted/stalled music');
    music.deathSlow();music.clearDeathSlow();await wait(100);check(first.playbackRate.value===1,'clear slowdown');
    const musicGain=engine.music.gain.value;
    for(const name of ['slice','blast','deflect','burn','squash','win'])sfx(name);
    await wait(100);check(engine.music.gain.value===musicGain,'effects changed music volume');
    reports.push('repeated deaths recover to normal speed; effects leave music gain steady');
    engine.setMusicOn(false);await wait(650);check(samples.at(-1).rms<.00001,'music mute leaks audio');
    engine.setMusicOn(true);await wait(350);check(samples.at(-1).rms>.001&&m.playing.source===first,'unmute lost song position');
    await ac.suspend();engine.unlock();await until(()=>engine.running);check(m.playing.source===first,'context resume restarted music');
    reports.push('music mute/unmute and audio-context resume preserve the playing track');
    // Delayed, failed and out-of-order requests must never silence or replace the active room.
    const realFetch=window.fetch.bind(window);let release;
    window.fetch=(url,opts)=>String(url).includes('/pits-')?new Promise(r=>release=()=>r(realFetch(url,opts))):realFetch(url,opts);
    music.playRoom('pits',.05);await until(()=>!!release);await wait(150);
    check(m.playing.source===first,'old track stopped before replacement loaded');
    music.playRoom('greenhouse',.05);await until(()=>music.current()?.key==='greenhouse');release();
    await until(()=>m.loads.size===0);check(music.current().key==='greenhouse','stale room won load race');
    window.fetch=(url,opts)=>String(url).includes('/lab-')?Promise.reject(Error('test network failure')):realFetch(url,opts);
    music.playRoom('lab',.05);await wait(200);check(music.current().key==='greenhouse','failed load stopped current music');
    window.fetch=realFetch;music.playRoom('lab',.05);await until(()=>music.current()?.key==='lab');
    music.stop(.05);await wait(300);check(music.current()===null,'stop kept current track');
    check(samples.at(-1).rms<.00001,'old tracks remain audible after crossfades/stop');
    m.buffers.clear();release=null;
    window.fetch=(url,opts)=>String(url).includes('/pits-')?new Promise(r=>release=()=>r(realFetch(url,opts))):realFetch(url,opts);
    music.playRoom('pits',.05);await until(()=>!!release);music.stop(.05);release();
    await until(()=>m.loads.size===0);check(music.current()===null,'download completion resurrected stopped music');window.fetch=realFetch;
    reports.push('crossfades, delayed downloads, load failure/retry, room races and stop cancellation');
    // Validate every shipped recording, its gapless duration and audible loop boundary.
    for(const track of MUSIC_TRACKS){
      const buffer=await ac.decodeAudioData(await(await fetch('./music/'+track.file)).arrayBuffer());
      check(Math.abs(buffer.duration-track.seconds)<.001,track.key+' encoder padding broke loop length');
      let peak=0,sum=0,edge=0;
      for(let ch=0;ch<buffer.numberOfChannels;ch++){
        const data=buffer.getChannelData(ch);
        for(const v of data){check(Number.isFinite(v),'nonfinite PCM');peak=Math.max(peak,Math.abs(v));sum+=v*v;}
        edge=Math.max(edge,Math.abs(data[0]-data.at(-1)));
      }
      check(peak<.99&&sum>1,track.key+' invalid recording');check(edge<.15,track.key+' discontinuous loop edge');
      const offline=new OfflineAudioContext(2,ac.sampleRate*2,ac.sampleRate);
      const source=offline.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(offline.destination);source.start(0,buffer.duration-.5);
      const rendered=await offline.startRendering();const data=rendered.getChannelData(0);
      for(let j=4;j<=6;j++){let energy=0;for(let i=j*ac.sampleRate/10;i<(j+1)*ac.sampleRate/10;i++)energy+=data[Math.floor(i)]**2;check(energy>.001,track.key+' silent loop seam');}
    }
    reports.push(MUSIC_TRACKS.length+' tracks decoded: correct loop lengths, audible seams, no clipping');
    return reports;
  })()`)
  reports.forEach(r=>console.log('PASS '+r))
  assert.ok(!browser.log.some(l=>l.startsWith('Uncaught')),'no uncaught runtime errors')
} finally {
  clearTimeout(timeout);browser.close('shots/music.log');server?.kill()
  for(const file of files)try{unlinkSync(file)}catch{}
}
process.exit(0)
