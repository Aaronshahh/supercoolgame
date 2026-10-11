// Character/profile integration and real renderer coverage. Test controls never enter the game bundle.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { createServer } from 'node:net'
import { build } from 'esbuild'
import { Browser, buildAndServe, sleep } from './lib/headless.mjs'
async function freePort(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p}
const browser=new Browser('characters-'+Date.now(),await freePort())
let server
const files=['dist/character-test.js','dist/character-test.html']
const timeout=setTimeout(()=>{console.error('Character checks timed out');process.exit(1)},90000)
process.on('exit',()=>{browser.close();server?.kill()})
try{
 const port=await freePort();server=await buildAndServe(port)
 await browser.launch(`http://127.0.0.1:${port}/?mute=1`)
 const run=async expression=>{const r=await browser.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.ok(!r.exceptionDetails,r.exceptionDetails?.exception?.description);return r.result.value}
 if(!process.argv.includes('--runtime-only')) {
 await sleep(500)
 for(const key of ['ArrowDown','ArrowDown','ArrowDown','Enter'])await browser.key(key)
 await sleep(150)
 for(let i=1;i<=6;i++){
  await browser.key('ArrowRight');await sleep(80)
  assert.equal(await run(`JSON.parse(localStorage.getItem('boomerangeon.options.v1')).char`),i,'menu selects character '+i)
  if(i>=4)await browser.shot(`shots/character-menu-${i}.png`)
 }
 await browser.send('Page.reload');await sleep(500)
 assert.equal(await run(`JSON.parse(localStorage.getItem('boomerangeon.options.v1')).char`),6)
 for(const key of ['ArrowDown','ArrowDown','ArrowDown','Enter','ArrowRight'])await browser.key(key)
 assert.equal(await run(`JSON.parse(localStorage.getItem('boomerangeon.options.v1')).char`),0,'reload preserves fish, then selection wraps to slime')
 console.log('PASS all seven selections, saved fish profile, reload and wraparound')
 }
 await build({stdin:{contents:`export {CHARACTERS,characterIndex,timedFrame} from './src/art/characters.ts';export {characterTest} from './src/demo/main.ts';`,resolveDir:process.cwd()},bundle:true,format:'esm',outfile:files[0],logLevel:'warning',plugins:[{name:'test-export',setup(b){b.onLoad({filter:/demo\/main\.ts$/},args=>({loader:'ts',contents:readFileSync(args.path,'utf8')+`\nexport const characterTest={startGame,players,makePlayer,playerSprite,runFrame,runLift,render,neutralFor,stepInputs:inputs=>advance(()=>inputs),get booms(){return booms},setTick:v=>tick=v,reset:()=>{booms=[];slashes=[];}};`}))}}]})
 writeFileSync(files[1],'<!doctype html><div id="game"></div><div id="hint"></div>')
 await browser.send('Page.navigate',{url:`http://127.0.0.1:${port}/character-test.html?t=0&arena=floor&bots=0&powerups=0&mute=1&light=0`})
 const reports=await run(`(async()=>{
  const {characterTest:r,CHARACTERS,characterIndex,timedFrame}=await import('./character-test.js');const check=(v,m)=>{if(!v)throw Error(m)};
  r.startGame({mode:'practice',localSlot:0,players:[]});const reports=[];
  check(CHARACTERS.length===7&&characterIndex(6)===6&&characterIndex(999)===6&&characterIndex(NaN)===0,'character ID validation');
  for(let char=0;char<7;char++){
   const art=CHARACTERS[char],p=r.players[0];p.char=char;p.held=false;p.state='idle';p.anim='none';p.moving=true;
   for(const facing of ['down','side','up'])for(const flip of [false,true])for(let color=0;color<6;color++){
    p.facing=facing;p.flip=flip;p.aimX=flip?-1:1;p.color=color;
    const seen=new Set();for(let t=0;t<40;t++){p.walkT=t;const s=r.playerSprite(p);check(s.w===14&&s.h===18,'original frame size');seen.add(s)}
    check(seen.size===art.run[facing].length,art.name+' lost a run pose '+facing);if(color===0)r.render();
    p.moving=false;const idle=new Set();for(let t=0;t<120;t++){r.setTick(t);idle.add(r.playerSprite(p))}check(idle.size===art.stand[facing].length,art.name+' idle stuck');
    p.anim='throw';const throws=new Set();for(let t=0;t<24;t++){p.animT=t;throws.add(r.playerSprite(p))}check(throws.size===art.throw[facing].length,'original throw frames missing');if(color===0)r.render();
    p.anim='reach';p.animT=0;check(r.playerSprite(p),'incoming catch pose missing');
    p.anim='catch';const catches=new Set();for(let t=0;t<14;t++){p.animT=t;catches.add(r.playerSprite(p))}check(catches.size===art.catch[facing].length-1,'original catch frames missing');if(color===0)r.render();
    p.state='melee';p.anim='none';const melee=new Set();for(const t of [0,3,7,11]){p.stateT=t;melee.add(r.playerSprite(p))}check(melee.size===art.melee[facing].length,'original melee frames missing');
    p.state='dash';p.anim='roll';p.dashX=flip?-1:1;for(let t=0;t<18;t++){p.animT=t;r.playerSprite(p)}
    p.state='idle';p.anim='none';p.moving=true;
   }
   if(char===6){p.walkT=14;check(r.runLift(p)===4,'fish leaves ground at original apex');p.walkT=22;check(r.runLift(p)===0,'fish lands on ground')}
   reports.push(art.name+': every facing, colour, mirror, idle/run/throw/anticipation/catch/melee/dash');
  }
  // Identical controls must produce identical movement and projectiles for every cosmetic.
  let baseline;
  for(let char=0;char<7;char++){
   r.reset();r.setTick(0);const p=r.makePlayer(0,char,0,false,'TEST');p.x=120;p.y=120;p.spawnT=0;p.invuln=0;p.spawnProtect=0;r.players.splice(0,r.players.length,p);
   const trace=[];for(let t=0;t<90;t++){
    r.stepInputs([{mx:t<45?1:0,my:0,throw:t===7,hold:false,melee:t===65,dash:t===30,cursorX:500,cursorY:112}]);
    trace.push([p.x,p.y,p.vx,p.vy,p.state,p.held,...r.booms.flatMap(b=>[b.x,b.y,b.vx,b.vy,b.state])]);
   }
   const text=JSON.stringify(trace);if(baseline)check(text===baseline,'character changed simulation '+char);else baseline=text;
  }
  reports.push('all seven characters have identical movement, dash, melee and boomerang simulation');
  return reports;
 })()`)
 reports.forEach(r=>console.log('PASS '+r))
 for(const char of [0,1,2,3,4,5,6]){
  await browser.send('Page.navigate',{url:`http://127.0.0.1:${port}/?practice=1&arena=floor&bots=0&char=${char}&mute=1`})
  await sleep(350);await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'d',code:'KeyD',windowsVirtualKeyCode:68});await sleep(300)
  await browser.shot(`shots/character-play-${char}.png`);await browser.key('Space')
 }
 assert.ok(!browser.log.some(l=>/Uncaught|Error:/.test(l)),browser.log.slice(-10).join('\n'))
 console.log('PASS normal practice entry with all new character IDs')
}finally{clearTimeout(timeout);browser.close('shots/characters.log');server?.kill();for(const f of files)try{unlinkSync(f)}catch{}}
process.exit(0)
