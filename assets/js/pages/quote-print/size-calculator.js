const FORMATS = [['A5',148,210],['B5',182,257],['A4',210,297],['B4',257,364],['A3',297,420]];
export function nearestDigitalPrintFormat(size, cw, ch) {
  if(size==='IN12x18'||size==='IN13x19')return 'A3';
  if(size!=='CUSTOM')return size;
  const w=Number(cw),h=Number(ch);
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)return '';
  const short=Math.min(w,h),long=Math.max(w,h);
  if(short>330||long>482)throw Error('디지털 인쇄 최대 사이즈는 13×19인치(482×330mm) 이하입니다.');
  // Preserve the larger-than-A3 price cap, and compare the two dimensions in mm.
  if(short>=297&&long>=420)return 'A3';
  let closest='',distance=Infinity;
  for(const [name,x,y] of FORMATS){
    const d=(short-x)**2+(long-y)**2;
    // At an exact midpoint, prefer the larger format.
    if(d<=distance){distance=d;closest=name;}
  }
  return closest;
}
export function getDigitalPrintSizeMultiplier(size,cw,ch,cfg={}){
  const format=nearestDigitalPrintFormat(size,cw,ch);
  if(!format)return 0;
  // A5 shares B5's existing A4 rate; B4 shares A3's rate.
  const key=['A5','B5','A4'].includes(format)?'A4':['B4','A3'].includes(format)?'A3':'A4';
  const fallback=key==='A3'?2:1;
  const min=Number(cfg?.minMultiplier??.6);
  return Math.max(Number(cfg?.multipliers?.[key]??fallback)||fallback,Number.isFinite(min)?min:.6);
}
