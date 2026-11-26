import {layoutGeometry,sourcePlacement,mmRound} from './layout-model.js';
import {openSource,renderSource} from './layout-source.js';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const defaults={sheetW:330,sheetH:480,trimW:297,trimH:210,bleed:3,margin:5,cols:1,rows:2,gapX:3,gapY:3,edge:3,fold:'none',direction:'right',compensation:3,fit:'actual',rotation:0,imageDpi:300};
const fields=Object.keys(defaults).filter(k=>!['fit','rotation','imageDpi'].includes(k));
let s={...defaults},face='front';
const slots={front:{source:null,preview:null,page:1,fit:'actual',rotation:0,dpi:300,token:0},back:{source:null,preview:null,page:1,fit:'actual',rotation:0,dpi:300,token:0}};
function el(tag,attrs={},text){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!=null)n.textContent=text;return n;}
function rect(root,x,y,w,h,stroke,fill='none',dash=''){if(w<=0||h<=0)return;root.append(el('rect',{x,y,width:w,height:h,fill,stroke,'stroke-width':.45,'stroke-dasharray':dash}));}
function line(root,x,y,h){root.append(el('line',{x1:x,x2:x,y1:y,y2:y+h,stroke:'#2563eb','stroke-width':.55,'stroke-dasharray':'3 2'}));}
function status(t){$('layout-status').textContent=t;}
function sync(){
 for(const k of fields)$(k).value=s[k];
 for(const [prefix,w,h] of [['sheet',s.sheetW,s.sheetH],['trim',s.trimW,s.trimH]]){const select=$(prefix+'Preset');select.value=[...select.options].some(o=>o.value===w+','+h)?w+','+h:'custom';}
 const slot=slots[face];$('fit').value=slot.fit;$('rotation').value=slot.rotation;$('imageDpi').value=slot.dpi;
 for(const name of ['front','back']){$('face-'+name).setAttribute('aria-pressed',String(face===name));const a=slots[name],p=$('page-'+name);p.disabled=a.source?.kind!=='pdf';p.max=a.source?.pages||1;p.value=a.page;}
 $('same-pdf-back').disabled=slots.front.source?.kind!=='pdf'||slots.front.page>=slots.front.source.pages;
 $('direction').disabled=$('compensation').disabled=s.fold!=='roll';
}
function draw(){
 sync();const root=$('layout-svg');root.replaceChildren();let g;
 try{g=layoutGeometry(s,face==='back');}catch(e){$('layout-warning').textContent=e.message;return;}
 root.setAttribute('viewBox','0 0 '+g.sw+' '+g.sh);root.setAttribute('width',g.sw+'mm');root.setAttribute('height',g.sh+'mm');
 $('layout-dimensions').textContent=g.sw+' × '+g.sh+' mm · '+g.cells.length+'개 배치';
 $('panel-widths').textContent=g.panels.map((x,i)=>(i+1)+'면 '+mmRound(x)+'mm').join(' / ');
 rect(root,0,0,g.sw,g.sh,'#94a3b8','#fff');rect(root,g.edge,g.edge,g.sw-2*g.edge,g.sh-2*g.edge,'#cbd5e1','none','2 2');
 const slot=slots[face],source=slot.preview;const warnings=[...g.warnings];let p;
 if(source){p=sourcePlacement(source,g,slot.fit,slot.rotation);if(!p.trimCovered)warnings.push('원본 배치가 재단 영역 전체를 채우지 못합니다.');if(g.b&&!p.bleedCovered)warnings.push('원본 배치 크기가 도련 영역 전체를 채우지 못합니다. 실제 배경의 도련 유무는 눈으로 확인하세요.');if(p.dpi!=null&&p.dpi<300)warnings.push('이미지 배치 해상도 '+Math.round(p.dpi)+'dpi · 300dpi 미만입니다.');if(slot.fit!=='actual')warnings.push('비율 유지 확대/축소 적용: '+(p.scale*100).toFixed(1)+'%.');}
 else warnings.push((face==='front'?'앞면':'뒷면')+' 원본 파일을 선택해 주세요.');
 for(const [i,c] of g.cells.entries()){
   rect(root,c.x,c.y,c.w,c.h,'#64748b','#f8fafc','2 1');
   if(source&&p){const clipped=el('svg',{x:c.x,y:c.y,width:c.w,height:c.h,viewBox:'0 0 '+c.w+' '+c.h,overflow:'hidden'}),rot=slot.rotation===90||slot.rotation===270,iw=rot?p.h:p.w,ih=rot?p.w:p.h,cx=c.w/2,cy=c.h/2;
     clipped.append(el('image',{href:source.preview,x:cx-iw/2,y:cy-ih/2,width:iw,height:ih,preserveAspectRatio:'none',transform:'rotate('+slot.rotation+' '+cx+' '+cy+')'}));root.append(clipped);
   }else root.append(el('text',{x:c.x+c.w/2,y:c.y+c.h/2,'text-anchor':'middle','font-size':4,fill:'#94a3b8'},(face==='front'?'앞면':'뒷면')+' '+(i+1)));
   if($('show-trim').checked)rect(root,c.trimX,c.trimY,g.w,g.h,'#dc2626','none','3 1');
   let offset=0;for(const width of g.panels){if($('show-safe').checked)rect(root,c.trimX+offset+g.m,c.trimY+g.m,width-2*g.m,g.h-2*g.m,'#16a34a','none','2 2');offset+=width;}
   if($('show-fold').checked)for(const x of g.folds)line(root,c.trimX+x,c.trimY,g.h);
 }
 $('source-summary').textContent=source?source.name+' · '+mmRound(source.w)+' × '+mmRound(source.h)+' mm'+(source.kind==='pdf'?' · '+slot.page+'/'+source.pages+'페이지':' · '+source.pixels.w+'×'+source.pixels.h+'px')+' · 배치 '+(p.scale*100).toFixed(1)+'%':'파일을 선택해 주세요.';
 $('layout-warning').replaceChildren(...warnings.map(t=>{const p=document.createElement('p');p.textContent=t;return p;}));
}
async function refresh(name){
 const a=slots[name],token=++a.token;a.preview=null;if(!a.source){draw();return;}
 status('미리보기 생성 중…');
 try{const preview=await renderSource(a.source,a.page,a.dpi);if(a.token!==token)return;a.preview=preview;status('미리보기 준비 완료');}catch(e){if(a.token!==token)return;status('파일 미리보기 실패: '+e.message);}
 draw();
}
function release(source){if(source?.kind==='pdf'&&!Object.values(slots).some(a=>a.source===source))void source.doc.destroy().catch(()=>{});}
async function load(name,file){
 const a=slots[name],token=++a.token,old=a.source;a.source=null;a.preview=null;a.page=1;release(old);draw();status('파일 읽는 중…');
 try{const source=await openSource(file);if(a.token!==token){release(source);return;}a.source=source;face=name;await refresh(name);}catch(e){if(a.token===token){status('파일 열기 실패: '+e.message);draw();}}
}
for(const k of fields)$(k).onchange=()=>{s[k]=$(k).type==='number'?Number($(k).value):$(k).value;draw();};
for(const prefix of ['sheet','trim'])$(prefix+'Preset').onchange=()=>{const v=$(prefix+'Preset').value;if(v!=='custom'){[s[prefix+'W'],s[prefix+'H']]=v.split(',').map(Number);draw();}};
for(const name of ['front','back']){
 $('face-'+name).onclick=()=>{face=name;draw();};
 $('file-'+name).onchange=()=>{const file=$('file-'+name).files[0];if(file)void load(name,file);};
 $('page-'+name).onchange=()=>{const a=slots[name];if(!a.source)return;const p=Number($('page-'+name).value);a.page=Math.max(1,Math.min(a.source.pages,Math.trunc(p)||1));face=name;void refresh(name);};
}
$('same-pdf-back').onclick=()=>{const a=slots.front,b=slots.back,old=b.source;if(a.source?.kind!=='pdf'||a.page>=a.source.pages)return;b.source=a.source;b.page=a.page+1;face='back';release(old);void refresh('back');};
$('clear-file').onclick=()=>{const a=slots[face],old=a.source;++a.token;a.source=null;a.preview=null;a.page=1;$('file-'+face).value='';release(old);draw();status('현재 면 파일을 제거했습니다.');};
$('fit').onchange=()=>{slots[face].fit=$('fit').value;draw();};
$('rotation').onchange=()=>{slots[face].rotation=Number($('rotation').value);draw();};
$('imageDpi').onchange=()=>{const n=Number($('imageDpi').value);if(!Number.isFinite(n)||n<36||n>2400){status('DPI는 36~2400 범위로 입력하세요.');draw();return;}slots[face].dpi=n;void refresh(face);};
for(const id of ['show-trim','show-safe','show-fold'])$(id).onchange=draw;
$('layout-reset').onclick=()=>{s={...defaults};for(const a of Object.values(slots)){a.fit='actual';a.rotation=0;}draw();};
draw();
