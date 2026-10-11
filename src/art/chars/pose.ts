import type { Facing, FacingFrames } from '../characters.ts'
/** Small integer-pixel drawing tools for authoring poses. Frames are built once, never per tick. */
export type Point = readonly [number, number]
export const POSE_W = 14
export const POSE_H = 18
export class Pose {
  private pixels = Array.from({ length: POSE_H }, () => Array<string>(POSE_W).fill('.'))
  dot(x: number, y: number, color: string): this {
    x = Math.round(x); y = Math.round(y)
    if (x >= 0 && x < POSE_W && y >= 0 && y < POSE_H) this.pixels[y][x] = color
    return this
  }
  stamp(rows: string[], x: number, y: number): this {
    rows.forEach((row, j) => [...row].forEach((c, i) => { if (c !== '.') this.dot(x + i, y + j, c) }))
    return this
  }
  line(points: readonly Point[], color: string, radius = 0): this {
    for (let i = 1; i < points.length; i++) {
      const [x0,y0] = points[i-1], [x1,y1] = points[i]
      const n = Math.max(Math.abs(x1-x0), Math.abs(y1-y0), 1) * 2
      for (let j=0;j<=n;j++) for(let y=-radius;y<=radius;y++) for(let x=-radius;x<=radius;x++) {
        if (x*x+y*y <= radius*radius) this.dot(x0+(x1-x0)*j/n+x,y0+(y1-y0)*j/n+y,color)
      }
    }
    return this
  }
  limb(points: readonly Point[], color = 'P'): this {
    return this.line(points,'o',1).line(points,color)
  }
  oval(cx: number, cy: number, rx: number, ry: number, color: string, outline = true): this {
    for (let y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++) for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++) {
      const inside=(px:number,py:number)=>(px-cx)**2/(rx*rx)+(py-cy)**2/(ry*ry)<=1.04
      if (inside(x,y)) this.dot(x,y,outline && [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>!inside(x+dx,y+dy))?'o':color)
    }
    return this
  }
  poly(points: readonly Point[], color: string, outline = true): this {
    for(let y=0;y<POSE_H;y++)for(let x=0;x<POSE_W;x++){
      let inside=false
      for(let i=0,j=points.length-1;i<points.length;j=i++){
        const [xi,yi]=points[i], [xj,yj]=points[j]
        if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside
      }
      if(inside)this.dot(x,y,color)
    }
    return this.line([...points,points[0]],outline?'o':color)
  }
  /** Outline the union of a filled shape, avoiding seams between its component pieces. */
  outline(): this {
    const source = this.pixels.map(row=>[...row])
    for(let y=0;y<POSE_H;y++)for(let x=0;x<POSE_W;x++)if(source[y][x]!=='.' && [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>!source[y+dy]?.[x+dx]||source[y+dy][x+dx]==='.'))this.pixels[y][x]='o'
    return this
  }
  layer(): string[] { return this.pixels.map(row=>row.join('')) }
  /** The game adds height above the shadow separately; every pose shares the same foot anchor. */
  rows(): string[] {
    let last=POSE_H-1
    while(last>0&&this.pixels[last].every(c=>c==='.'))last--
    const rows=[...Array.from({length:POSE_H-1-last},()=>'.'.repeat(POSE_W)),...this.pixels.slice(0,last+1).map(r=>r.join(''))]
    return rows
  }
}

/** A small wooden V, held by the character in the catch recoil poses. */
export function heldBoom(p: Pose, x: number, y: number): void {
  const path: Point[] = [[x,y],[x+2,y+2],[x+4,y]]
  p.line(path,'o',1).line(path,'T')
}

export function facings(count: number, draw: (facing: Facing, frame: number) => string[]): FacingFrames {
  const make = (facing: Facing) => Array.from({length:count},(_,i)=>draw(facing,i))
  return {down:make('down'),side:make('side'),up:make('up')}
}
