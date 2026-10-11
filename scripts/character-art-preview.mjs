// Dependency-free contact sheets of the authored pixel frames, for visual review.
import { build } from 'esbuild'
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
await build({stdin:{contents:"export {CHARACTERS} from './src/art/characters.ts'; export {CHAR_KEY,PLAYER_COLORS,withPrimary} from './src/art/palette.ts'; export {FONT} from './src/art/font.ts'",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',outfile:'node_modules/.cache/character-preview.mjs',logLevel:'warning'})
const {CHARACTERS,CHAR_KEY,PLAYER_COLORS,withPrimary,FONT}=await import('../node_modules/.cache/character-preview.mjs?'+Date.now())
const crc=data=>{let c=0xffffffff;for(const b of data){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
const chunk=(type,data)=>{const t=Buffer.from(type),size=Buffer.alloc(4),end=Buffer.alloc(4);size.writeUInt32BE(data.length);end.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([size,t,data,end])}
function png(w,h,pixels){const head=Buffer.alloc(13);head.writeUInt32BE(w);head.writeUInt32BE(h,4);head[8]=8;head[9]=2;const rows=Buffer.alloc(h*(w*3+1));for(let y=0;y<h;y++)pixels.copy(rows,y*(w*3+1)+1,y*w*3,(y+1)*w*3);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))])}
mkdirSync('shots',{recursive:true})
for(let ci=0;ci<CHARACTERS.length;ci++){
 const c=CHARACTERS[ci],key=withPrimary(CHAR_KEY,PLAYER_COLORS[ci%PLAYER_COLORS.length])
 const rows=[['IDLE D',c.stand.down],['IDLE S',c.stand.side],['RUN D',c.run.down],['RUN S',c.run.side],['RUN U',c.run.up],['THROW S',c.throw.side],['MELEE S',c.melee.side],['CATCH S',c.catch.side],['DASH',c.roll]]
 const w=730,h=rows.length*108+32,pixels=Buffer.alloc(w*h*3)
 const rect=(x,y,rw,rh,color)=>{const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));for(let yy=Math.max(0,y);yy<Math.min(h,y+rh);yy++)for(let xx=Math.max(0,x);xx<Math.min(w,x+rw);xx++)for(let ch=0;ch<3;ch++)pixels[(yy*w+xx)*3+ch]=rgb[ch]}
 const text=(s,x,y,color)=>{for(const ch of s){const glyph=FONT[ch];if(glyph)glyph.forEach((row,j)=>[...row].forEach((p,i)=>{if(p==='#')rect(x+i*2,y+j*2,2,2,color)}));x+=10}}
 rect(0,0,w,h,'#181522');text(c.name,12,8,'#efd9b0')
 rows.forEach(([label,frames],r)=>{const y=38+r*108;text(label,10,y+24,'#918299');frames.forEach((frame,i)=>{const x=90+i*79;rect(x-2,y+89,72,2,'#413448');frame.forEach((row,j)=>[...row].forEach((p,k)=>{if(p!=='.')rect(x+k*5,y+j*5,5,5,key[p])}))})})
 writeFileSync(`shots/${c.name.toLowerCase()}-poses.png`,png(w,h,pixels))
}
console.log('Wrote all seven character pose sheets to shots/')
