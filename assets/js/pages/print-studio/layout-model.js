const n=(v,min,max,label)=>{const x=Number(v);if(!Number.isFinite(x)||x<min||x>max)throw Error(label+' 값을 확인하세요.');return x;};
export const mmRound=x=>Math.round(x*100)/100;
export function foldPanels(width,mode,compensation=3,back=false,direction='right'){
  if(mode==='none')return [width];
  if(mode==='half')return [width/2,width/2];
  if(mode==='z')return [width/3,width/3,width/3];
  if(mode!=='roll')throw Error('접지 방식을 확인하세요.');
  const c=n(compensation,0,10,'접지 보정');
  const outer=(width+c)/3,inner=outer-c;
  if(inner<=0)throw Error('접지 보정값이 너무 큽니다.');
  const narrowLeft=(direction==='left')!==back;
  return narrowLeft?[inner,outer,outer]:[outer,outer,inner];
}
export function layoutGeometry(s,back=false){
  const sw=n(s.sheetW,30,1500,'용지 가로'),sh=n(s.sheetH,30,1500,'용지 세로'),w=n(s.trimW,10,1500,'완성 가로'),h=n(s.trimH,10,1500,'완성 세로');
  const b=n(s.bleed,0,15,'도련'),m=n(s.margin,0,50,'안전 여백'),gapX=n(s.gapX,0,100,'가로 간격'),gapY=n(s.gapY,0,100,'세로 간격'),edge=n(s.edge,0,100,'용지 여백');
  const cols=n(s.cols,1,8,'열'),rows=n(s.rows,1,8,'행');
  if(!Number.isInteger(cols)||!Number.isInteger(rows))throw Error('행과 열은 정수로 입력하세요.');
  const cellW=w+2*b,cellH=h+2*b,usedW=cols*cellW+(cols-1)*gapX,usedH=rows*cellH+(rows-1)*gapY;
  const x=(sw-usedW)/2,y=(sh-usedH)/2;
  const panels=foldPanels(w,s.fold,s.compensation,back,s.direction),folds=panels.slice(0,-1).map((_,i)=>panels.slice(0,i+1).reduce((a,v)=>a+v,0));
  const cells=[];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const cx=x+c*(cellW+gapX),cy=y+r*(cellH+gapY);cells.push({x:cx,y:cy,w:cellW,h:cellH,trimX:cx+b,trimY:cy+b});}
  const warnings=[];
  if(x<edge-.01||y<edge-.01)warnings.push('배치가 용지의 지정 여백을 벗어납니다. 규격 또는 배치 수를 줄여 주세요.');
  if(panels.some(p=>p<=2*m)||h<=2*m)warnings.push('안전 여백이 접지 면 또는 완성 규격에 비해 큽니다.');
  return {sw,sh,w,h,b,m,edge,cells,panels,folds,usedW,usedH,x,y,warnings};
}
export function sourcePlacement(source,g,mode,rotation){
  const turned=rotation===90||rotation===270;
  const w=turned?source.h:source.w,h=turned?source.w:source.h;
  const targetW=mode==='trim'?g.w:g.w+2*g.b,targetH=mode==='trim'?g.h:g.h+2*g.b;
  const scale=mode==='actual'?1:Math.min(targetW/w,targetH/h);
  const placedW=w*scale,placedH=h*scale;
  return {w:placedW,h:placedH,scale,bleedCovered:placedW>=g.w+2*g.b-.05&&placedH>=g.h+2*g.b-.05,trimCovered:placedW>=g.w-.05&&placedH>=g.h-.05,dpi:source.pixels?Math.min(source.pixels.w/(source.w*scale/25.4),source.pixels.h/(source.h*scale/25.4)):null};
}
