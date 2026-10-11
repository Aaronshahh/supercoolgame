// Test-only exports are injected into a separate bundle; no test controls ship in the game.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { createServer } from 'node:net'
import { build } from 'esbuild'
import { Browser, buildAndServe } from './lib/headless.mjs'

async function freePort() {
  const s = createServer()
  await new Promise(r => s.listen(0, '127.0.0.1', r))
  const port = s.address().port
  await new Promise(r => s.close(r))
  return port
}
const browser = new Browser(`rules-audio-${Date.now()}`, await freePort())
let server
const files = ['dist/test-runtime.js', 'dist/test.html']
const timeout = setTimeout(() => { console.error('FAIL: rules/audio test timed out'); process.exit(1) }, 120000)
process.on('exit', () => { browser.close(); server?.kill() })
try {
  const port = await freePort()
  server = await buildAndServe(port)
  const extra = {
    '/demo/main.ts': `\nexport const rulesTest = { startGame, startMatch, match, players, makePlayer, die, respawn, removePlayer,
      step: () => advance(() => players.map(neutralFor)), render, hash: stateHash, resetMatch,
      killSlice, killBurn, killSquash, blast, lightFloor, stepFire, nearestEnemy, isAlly, gameSpeed, deathView, options,
      constants: {DASH_SPEED, DASH_SLIDE_SPEED, BOOM_SPEED, BOOM_RETURN_SPEED, DEFLECT_SPEED, SPAWN_PROTECT},
      setBooms: (v) => booms = v, newBoomerang, get booms() {return booms},
      aimAt: (x,y) => {mouseX=x;mouseY=y;return readLocalInput()},
      stepInputs: (inputs) => advance(() => inputs), neutralFor };`,
    '/audio/music.ts': '\nexport const musicTest = { engine, music, MUSIC_TRACKS };',
    '/game/roster.ts': '\nexport const rosterTest = { buildRoster, readyToStart };',
    '/audio/buffers.ts': '\nexport const bufferTest = { buffers, loading };',
    '/audio/sfx.ts': '\nexport const loopTest = { loop, endFrame, stopLoops, loops };',
  }
  await build({
    stdin: { contents: `export { rulesTest } from './src/demo/main.ts'; export { rosterTest } from './src/game/roster.ts'; export { musicTest } from './src/audio/music.ts'; export { loopTest } from './src/audio/sfx.ts'; export { SONGS } from './src/audio/songs.ts'; export { runAudioSmoke } from './src/audio/smoke.ts'; export { loadSamples } from './src/audio/sfx.ts'; export { bufferTest } from './src/audio/buffers.ts';`, resolveDir: process.cwd() },
    bundle: true, format: 'esm', outfile: files[0], logLevel: 'warning',
    plugins: [{ name: 'test-exports', setup(b) {
      b.onLoad({ filter: /src\/(demo\/main|game\/roster|audio\/(music|sfx|buffers))\.ts$/ }, args => {
        const suffix = Object.keys(extra).find(k => args.path.endsWith(k))
        return { contents: readFileSync(args.path, 'utf8') + extra[suffix], loader: 'ts' }
      })
    } }],
  })
  writeFileSync(files[1], '<!doctype html><div id="game"></div><div id="hint"></div>')
  await browser.launch(`http://127.0.0.1:${port}/test.html?t=0&mute=1&powerups=0`)
  const run = async (expression) => {
    const result = await browser.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    assert.ok(!result.exceptionDetails, result.exceptionDetails?.exception?.description)
    return result.result.value
  }
  const rules = await run(`(async () => {
    const {rulesTest:r} = await import('./test-runtime.js');
    const check = (ok, label) => { if (!ok) throw Error(label) };
    r.startGame({mode:'match',localSlot:0,arenaKey:'cellar',seed:3,
      rules:{target:3,rooms:'stay',lives:3},players:[0,1].map(slot=>({slot,name:'P'+slot,char:slot,color:slot,ai:false}))});
    const advance = n => { for(let i=0;i<n;i++) r.step() };
    const reports = [];
    for(const lives of [3,5,7]) {
      r.startMatch(3,'stay',0,lives); advance(90);
      const [a,b]=r.players;
      check(a.lives===lives && b.lives===lives, 'round starts with '+lives+' lives');
      r.die(a); r.die(a);
      check(a.lives===lives-1,'one life per death');
      r.die(b); advance(1);
      check(r.match.phase==='play','simultaneous temporary deaths keep round running');
      advance(89);
      check(a.state!=='dead' && b.state!=='dead' && a.invuln>0,'respawn with protection');
      // Let a round pass the former minute limit without ending.
      r.match.roundTick=3600; advance(1); check(r.match.phase==='play','lives decide round, not old clock');
      while(a.lives>0) { r.die(a); advance(1); if(a.lives>0) advance(89); }
      check(r.match.phase==='end' && r.match.lastWinner===b.id && b.score===1,'last life awards one round');
      advance(45); check(r.match.round===2 && a.lives===lives && b.lives===lives,'new round refills lives');
      check(b.score===1,'round win persists');
      reports.push(lives+' lives: respawns, elimination, round reset');
    }
    r.startMatch(3,'stay',0,3); advance(90);
    for(let i=0;i<3;i++) { r.players.forEach(r.die); advance(1); if(i<2) advance(89); }
    check(r.match.phase==='end' && r.match.lastWinner===-1 && r.players.every(p=>p.score===0),'simultaneous last deaths draw');
    r.resetMatch(); advance(90); r.removePlayer(1); advance(1);
    check(r.match.phase==='end' && r.match.lastWinner===0,'departed players cannot keep a round alive');
    r.players[1].gone=false; r.players.push(r.makePlayer(2,2,2,false,'P2'));
    r.startMatch(3,'stay',0,3); advance(90);
    for(let i=0;i<3;i++) { r.die(r.players[0]); advance(90); }
    check(r.match.phase==='play' && r.players[0].state==='dead' && r.players[0].lives===0, 'eliminated player stays out while others play');
    reports.push('three players: eliminated player stays out while the other two play');
    r.startMatch(3,'stay',0,7); advance(120); r.die(r.players[0]); r.render();
    return reports;
  })()`)
  rules.forEach(r => console.log(`PASS ${r}`))
  console.log('PASS simultaneous elimination draws; disconnect ends round')
  await browser.shot('shots/lives-respawn.png')

  const teams = await run(`(async () => {
    const {rulesTest:r,rosterTest:rr} = await import('./test-runtime.js');
    const check = (ok, label) => { if (!ok) throw Error(label) };
    const near = (a,b) => Math.abs(a-b)<1e-8;
    const reports=[];
    const advance=n=>{for(let i=0;i<n;i++)r.step()};
    r.players.push(r.makePlayer(3,3,1,false,'P3',1));
    const fresh=()=>{r.players.forEach((p,i)=>{p.gone=false;p.team=i%2;p.color=i%2});r.startMatch(3,'stay',0,3,'teams');advance(90)};
    fresh();
    const goldX=r.players.filter(p=>p.team===0).map(p=>p.x),tealX=r.players.filter(p=>p.team===1).map(p=>p.x);
    check(Math.max(...goldX)<Math.min(...tealX)||Math.max(...tealX)<Math.min(...goldX),'teammates spawn on opposite sides');
    const humans=r.players.slice(0,2).map(p=>({slot:p.id,name:p.name,char:p.char,color:p.color,team:0,host:p.id===0}));
    const settings={gameMode:'teams',bots:2,target:3,lives:3,delay:4,rooms:'stay',arena:'cellar'};
    check(rr.readyToStart(humans,settings),'two humans plus two bots can form 2v2');
    check(rr.buildRoster(humans,settings).map(p=>p.team).join(',')==='0,0,1,1','bots fill the other team');
    check(!rr.readyToStart([...humans,...humans.map((p,i)=>({...p,slot:i+2}))],settings),'4v0 is rejected');
    check(!rr.readyToStart(humans,{...settings,bots:1}),'incomplete 2v2 is rejected');
    reports.push('2v2 roster validation and bot team assignment');
    // A teammate can be fully eliminated without ending the round.
    for(let i=0;i<3;i++){r.die(r.players[0]);advance(1);if(i<2)advance(89)}
    check(r.match.phase==='play'&&r.players[0].lives===0&&r.players[2].lives===3,'1v2 remains playable');
    for(let i=0;i<3;i++){r.die(r.players[2]);advance(1);if(i<2)advance(89)}
    check(r.match.phase==='end'&&r.players[1].score===1&&r.players[3].score===1&&r.players[0].score===0,'only winning team earns a round');
    advance(45);check(r.players.every(p=>p.lives===3),'round refills separate lives');
    r.resetMatch();check(r.players.every(p=>p.score===0&&p.lives===3),'team rematch resets scores and lives');
    fresh();r.players.forEach(p=>{p.lives=1;r.die(p)});advance(1);
    check(r.match.lastWinner===-1&&r.players.every(p=>p.score===0),'simultaneous team elimination draws');
    fresh();r.removePlayer(0);advance(1);check(r.match.phase==='play','teammate can continue after disconnect');
    r.removePlayer(2);advance(1);check(r.match.phase==='end','empty team forfeits');advance(45);check(r.match.phase==='over','forfeit ends match');
    reports.push('2v2 becomes 1v2; team scoring, draws, rematches and disconnects');
    fresh();const ally=r.players[2];r.players.forEach(p=>{p.invuln=0;p.spawnProtect=0});
    for(const hit of [()=>r.killSlice(ally,1,0,0),()=>r.killBurn(ally,0),()=>r.killSquash(ally,0,'blink'),()=>r.blast(ally.x,ally.y,10,10,0)])hit();
    check(ally.state!=='dead'&&ally.lives===3,'teammate attacks cannot hurt each other');
    const b=r.newBoomerang(0,ally.x-10,ally.y-6,1,0);r.setBooms([b]);advance(1);
    check(ally.state!=='dead','friendly boomerang passes through teammate');
    check(r.nearestEnemy(r.players[0]).team===1,'bot aim chooses an enemy');
    r.setBooms([r.newBoomerang(1,ally.x-10,ally.y-6,1,0)]);advance(1);
    check(ally.state==='dead'&&ally.lives===2,'enemy boomerang still kills');
    reports.push('friendly fire off for boomerangs, melee, fire, bombs and blink; bots target enemies');
    fresh();const p=r.players[0];r.respawn(p);advance(60);
    check(p.spawnProtect===60&&p.invuln>=60,'protection persists beyond the old 40 ticks');
    r.killSlice(p,1,0,1);r.killBurn(p,1);r.killSquash(p,1,'test');
    r.lightFloor(Math.floor(p.x/16),Math.floor(p.y/16),1,true);r.stepFire();
    check(p.state!=='dead','respawn protection blocks direct attacks and floor fire');
    advance(60);check(p.state==='dead','enemy fire becomes dangerous once protection expires');
    check(near(r.constants.DASH_SPEED,5.13)&&near(r.constants.DASH_SLIDE_SPEED,3.8)&&near(r.constants.BOOM_SPEED,9.5)&&near(r.constants.BOOM_RETURN_SPEED,11.4)&&near(r.constants.DEFLECT_SPEED,7.125),'all requested speeds reduced five percent');
    reports.push('5% speed reductions and full two-second anti-camping protection');
    fresh();r.players.forEach(p=>{p.invuln=0;p.spawnProtect=0});r.options.hitstop=true;
    r.killSlice(r.players[0],1,0,1);check(r.gameSpeed()===0.6,'death starts shared slow-motion');advance(4);
    const view=r.deathView();check(view.zoom>1.08&&view.zoom<=1.09,'death zoom eases in');
    const aim=r.aimAt(180,140);check(near(aim.cursorX,view.sx+180/view.zoom)&&near(aim.cursorY,view.sy+126/view.zoom),'mouse aim follows the zoom');
    const hash=r.hash();r.options.hitstop=false;check(r.deathView().zoom===1&&r.hash()===hash&&r.gameSpeed()<1,'camera preference cannot change simulation');
    r.options.hitstop=true;r.render();
    window.finishDeathCheck=()=>{advance(14);check(r.gameSpeed()===1&&r.deathView().zoom===1,'death effect recovers completely')};
    reports.push('death slow-motion, zoom, mouse mapping, and independent camera option');
    return reports;
  })()`)
  teams.forEach(t=>console.log('PASS '+t))
  await browser.shot('shots/death-zoom.png')
  await run('window.finishDeathCheck()')

  // Render real soundtrack audio through the final mixer alongside changing loop recipes.
  const audio = await run(`(async () => {
    const {musicTest:m,loopTest:l} = await import('./test-runtime.js');
    m.music.stop(0); l.stopLoops();
    const ac = new OfflineAudioContext(2,48000*8,48000);
    const proxy = new Proxy(ac,{get(target,key){
      if(key==='state') return 'running';
      const value=target[key]; return typeof value==='function'?value.bind(target):value;
    }});
    m.engine.ctx=proxy; m.engine.build(); m.engine.setMuted(false);
    const track=m.MUSIC_TRACKS[0];
    const source=ac.createBufferSource();
    source.buffer=await ac.decodeAudioData(await (await fetch('./music/'+track.file)).arrayBuffer());
    source.loop=true;source.connect(m.engine.music);source.start(.05);
    l.loop('same-boomerang','flight',0); const old=l.loops.get('same-boomerang');
    l.loop('same-boomerang','hover',0);
    if(l.loops.get('same-boomerang').name!=='hover'||l.loops.get('same-boomerang')===old) throw Error('flight noise survived hover');
    l.loop('same-boomerang','flight',0);
    if(l.loops.get('same-boomerang').name!=='flight') throw Error('return failed to restore flight');
    l.stopLoops();
    const buffer=await ac.startRendering();
    let peak=0, sum=0, clipped=0, finite=true;
    for(let ch=0;ch<2;ch++) for(const v of buffer.getChannelData(ch)) {peak=Math.max(peak,Math.abs(v));sum+=v*v;if(Math.abs(v)>=.999) clipped++;if(!Number.isFinite(v))finite=false;}
    return {peak,rms:Math.sqrt(sum/(buffer.length*2)),clipped,finite};
  })()`)
  assert.ok(audio.finite && audio.rms > 0.01, 'mix renders finite, audible samples')
  assert.equal(audio.clipped, 0, 'soundtrack and effects do not hard clip')
  console.log(`PASS soundtrack mixer and loop transitions; ${JSON.stringify(audio)}`)
  // Fresh page: exercise every instrument, effect, loop and room with a real realtime context.
  await browser.send('Page.navigate', {url:`http://127.0.0.1:${port}/test.html?t=0`})
  const samples = await run(`(async () => {
    const m=await import('./test-runtime.js');
    m.musicTest.engine.unlock();
    await new Promise(r=>setTimeout(r,100)); m.loadSamples();
    for(let i=0;i<100 && m.bufferTest.loading.size;i++) await new Promise(r=>setTimeout(r,100));
    const count=m.bufferTest.buffers.size; m.runAudioSmoke(); return count;
  })()`)
  assert.ok(samples > 80, 'recorded sound assets load and decode'); console.log('PASS '+samples+' recorded sounds decoded')
  assert.ok(await browser.waitFor(/AUDIO SMOKE:.*0 error/, 25000), browser.log.slice(-10).join('\n'))
  assert.ok(!browser.log.some(l=>/Uncaught|Error:/.test(l)), 'no audio runtime errors')
  console.log(browser.log.find(l=>/AUDIO SMOKE:.*0 error/.test(l)))
} finally {
  clearTimeout(timeout)
  browser.close('shots/rules-audio.log')
  server?.kill()
  for(const file of files) try { unlinkSync(file) } catch {}
}
process.exit(0)
