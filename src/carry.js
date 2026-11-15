// Metres. Pure conservative AABB kinematics; contact at the boundary is allowed.
export const CLEARANCE_M = .012;
// Point and footprint are in the support mesh's local horizontal coordinates.
export function containsSupportPoint(footprint, point) {
  if(!Array.isArray(point) || point.length!==2 || !point.every(Number.isFinite)) return false;
  if(footprint?.shape==='rectangle') {
    const {min,max}=footprint;
    return [min,max].every(a=>Array.isArray(a) && a.length===2 && a.every(Number.isFinite)) &&
      point.every((v,i)=>min[i]<=max[i] && v>=min[i]-1e-9 && v<=max[i]+1e-9);
  }
  if(footprint?.shape==='circle') {
    const {center,radius}=footprint;
    return Array.isArray(center) && center.length===2 && center.every(Number.isFinite) &&
      Number.isFinite(radius) && radius>=0 && Math.hypot(...point.map((v,i)=>v-center[i]))<=radius+1e-9;
  }
  return false;
}
export function translated(bounds, delta) {
  return {min:bounds.min.map((v,i)=>v+delta[i]),max:bounds.max.map((v,i)=>v+delta[i])};
}
export function intersects(a,b) {
  return [0,1,2].every(i=>a.min[i]<b.max[i]-1e-7 && a.max[i]>b.min[i]+1e-7);
}
export function sweptClear(bounds, from, to, obstacles) {
  // Exact segment against the Minkowski-expanded obstacle (not endpoint-only).
  return !obstacles.some(o=>{
    let low=0,high=1;
    for(let i=0;i<3;i++) {
      const min=o.min[i]-bounds.max[i]+1e-7,max=o.max[i]-bounds.min[i]-1e-7,d=to[i]-from[i];
      if(Math.abs(d)<1e-12) { if(from[i]<=min || from[i]>=max) return false; }
      else { const a=(min-from[i])/d,b=(max-from[i])/d; low=Math.max(low,Math.min(a,b)); high=Math.min(high,Math.max(a,b)); if(low>=high) return false; }
    }
    return high>0 && low<1;
  });
}
export function planCarry(bounds, start, destination, supportY, obstacles, {seatObstacles=obstacles, ceilingY=.19}={}) {
  if(![...bounds.min,...bounds.max,...start,...destination,supportY,ceilingY].every(Number.isFinite)) return {ok:false,points:[],message:'Invalid physical bounds.'};
  const end=[destination[0],supportY+start[1]-bounds.min[1],destination[2]];
  const relative=translated(bounds,start.map(v=>-v));
  // Find a low overhead path, including a front corridor under the loading crosshead.
  for(const corridor of [null,.18,.38]) {
    const horizontal=corridor===null ? [start,end] : [start,[start[0],start[1],corridor],[end[0],end[1],corridor],end];
    const footprint={min:[relative.min[0],-10,relative.min[2]],max:[relative.max[0],10,relative.max[2]]};
    // A native drag has already lifted the payload. Clearance belongs above
    // supports/obstacles, not above its own current bottom: lifting it again
    // can push a tall, already-clear bottle through the permitted ceiling.
    let bottom=Math.max(bounds.min[1],supportY+CLEARANCE_M);
    for(let j=1;j<horizontal.length;j++) for(const o of obstacles) {
      if(o.max[1]>ceilingY) continue; // overhead parts are checked, never blindly overtopped
      if(!sweptClear(footprint,horizontal[j-1],horizontal[j],[o])) bottom=Math.max(bottom,o.max[1]+CLEARANCE_M);
    }
    const carryY=bottom-relative.min[1];
    const points=[start.slice(),...horizontal.map(p=>[p[0],carryY,p[2]]),end];
    if(points[1][1]+relative.max[1]>ceilingY) continue;
    if(points.slice(1).every((p,j)=>sweptClear(relative,points[j],p,j===points.length-2?seatObstacles:obstacles)))
      return {ok:true,points};
  }
  return {ok:false,points:[],message:'Blocked path: move clear of equipment before lowering.'};
}
export function sampleRoute(route,fraction) {
  const t=Math.max(0,Math.min(1,fraction))*(route.points.length-1),i=Math.min(route.points.length-2,Math.floor(t)),u=t-i;
  return route.points[i].map((v,k)=>v+(route.points[i+1][k]-v)*u);
}
