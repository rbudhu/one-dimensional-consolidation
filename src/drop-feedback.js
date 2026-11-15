// Client-pixel destination zones shared by pointer input and native rendering.
export function zoneFromPoints(points, rect, margin=10, minimum=44) {
  if(!rect || ![rect.left,rect.top,rect.width,rect.height].every(Number.isFinite) || rect.width<=0 || rect.height<=0 || !points.length) return null;
  if(points.some(p=>![p.x,p.y,p.z].every(Number.isFinite) || p.z < -1 || p.z > 1)) return null;
  let left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));
  if(right<rect.left || left>rect.left+rect.width || bottom<rect.top || top>rect.top+rect.height) return null;
  const cx=(left+right)/2,cy=(top+bottom)/2,w=Math.max(minimum,right-left+2*margin),h=Math.max(minimum,bottom-top+2*margin);
  left=Math.max(rect.left,cx-w/2);right=Math.min(rect.left+rect.width,cx+w/2);top=Math.max(rect.top,cy-h/2);bottom=Math.min(rect.top+rect.height,cy+h/2);
  return {left,right,top,bottom,width:right-left,height:bottom-top};
}
export function cueStyle({inside=false,reducedMotion=false,now=0}={}) {
  return {color:inside ? '#47ef88' : '#ffb52e',opacity:inside ? .98 : reducedMotion ? .85 : .8+.18*Math.sin(now*2*Math.PI/2400)};
}
export function containsClientPoint(zone,point) {
  return !!zone && Number.isFinite(point?.x) && Number.isFinite(point?.y) && point.x>=zone.left && point.x<=zone.right && point.y>=zone.top && point.y<=zone.bottom;
}
