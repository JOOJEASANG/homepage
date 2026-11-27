import {foldPanels,mmRound} from './layout-model.js';
import {openSource,renderSource} from './layout-source.js';
import {loadStudioSettings} from './settings-client.js';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const defaults={bleed:3,margin:10,compensation:3,fold:'none',direction:'right',imageDpi:300};
const names=['front','back'],slots=Object.fromEntries(names.map(n=>[n,{source:null,preview:null,page:1,token:0}]));
let touched=false;
let activeFace='front';
function selectFace(n){activeFace=n;for(const face of names){$('face-panel-'+face).hidden=face!==n;$('face-'+face).setAttribute('aria-pressed',String(face===n));}}
for(const face of names)$('face-'+face).onclick=()=>selectFace(face);
function el(tag,attrs={},text){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!=null)n.textContent=text;return n;}
function rect(root,x,y,w,h,stroke,dash='',fill='none',cls=''){if(w>0&&h>0)root.append(el('rect',{x,y,width:w,height:h,fill,stroke,'stroke-width':.45,'stroke-dasharray':dash,class:cls}));}
const label=n=>n==='front'?'앞면':'뒷면',status=t=>$('layout-status').textContent=t;
function num(id,min,max){const v=$(id).valueAsNumber;if(!Number.isFinite(v)||v<min||v>max)throw Error($(id).closest('label').textContent+' 값을 확인하세요.');return v;}
function draw(){
 const auto=$('trimPreset').value==='auto',reference=slots.front.preview||slots.back.preview;
 $('trimW').disabled=$('trimH').disabled=auto;
 $('direction').disabled=$('compensation').disabled=$('fold').value!=='roll';
 for(const n of names){const a=slots[n],p=$('page-'+n);p.disabled=a.source?.kind!=='pdf';p.max=a.source?.pages||1;p.value=a.page;$('review-'+n).replaceChildren();$('summary-'+n).textContent='파일을 선택해 주세요.';}
 $('same-pdf-back').disabled=slots.front.source?.kind!=='pdf'||slots.front.page>=slots.front.source.pages;
 try{
 const b=num('bleed',0,15),m=num('margin',0,50),w=auto?(reference?reference.w-2*b:297):num('trimW',1,1500),h=auto?(reference?reference.h-2*b:210):num('trimH',1,1500),fold=$('fold').value,direction=$('direction').value,c=num('compensation',0,10);
 if(w<=0||h<=0)throw Error('원본 크기에 비해 도련이 너무 큽니다.');
 if(auto){$('trimW').value=mmRound(w);$('trimH').value=mmRound(h);}
 const panels=foldPanels(w,fold,c,false,direction),warnings=[];
 $('panel-widths').textContent=panels.map((v,i)=>(i+1)+'면 '+mmRound(v)+'mm').join(' / ');
 if(panels.some(p=>p<=2*m)||h<=2*m)warnings.push('안전 여백이 완성 규격 또는 접지 면에 비해 큽니다.');
 const vw=Math.max(w+2*b,...names.map(n=>slots[n].preview?.w||0)),vh=Math.max(h+2*b,...names.map(n=>slots[n].preview?.h||0)),x=(vw-w)/2,y=(vh-h)/2;
 $('layout-dimensions').textContent=mmRound(w)+' × '+mmRound(h)+' mm · 재단 기준';
 for(const n of names){const a=slots[n],p=a.preview,root=$('review-'+n);root.setAttribute('viewBox','0 0 '+vw+' '+vh);root.setAttribute('width',vw);root.setAttribute('height',vh);
 rect(root,0,0,vw,vh,'#94a3b8','','#fff');
 if(p){root.append(el('image',{href:p.preview,x:(vw-p.w)/2,y:(vh-p.h)/2,width:p.w,height:p.h,preserveAspectRatio:'none'}));
 $('summary-'+n).textContent=p.name+' · '+mmRound(p.w)+' × '+mmRound(p.h)+' mm'+(p.kind==='pdf'?' · '+a.page+'/'+p.pages+'페이지':' · '+p.pixels.w+'×'+p.pixels.h+'px');
 if(p.w<w-.1||p.h<h-.1)warnings.push(label(n)+': 원본이 재단 규격보다 작습니다.');
 else if(p.w<w+2*b-.1||p.h<h+2*b-.1)warnings.push(label(n)+': 도련 크기가 부족합니다.');
 if(p.w>w+2*b+.1||p.h>h+2*b+.1)warnings.push(label(n)+': 원본이 설정한 도련 포함 규격보다 큽니다.');
 if(p.kind==='image'&&Number($('imageDpi').value)<300)warnings.push(label(n)+': 입력 이미지 DPI가 300 미만입니다.');
 }else root.append(el('text',{x:vw/2,y:vh/2,'text-anchor':'middle','font-size':Math.max(2,Math.min(vw,vh)*.045),fill:'#64748b'},label(n)+' 파일 없음'));
 if(b)rect(root,x-b,y-b,w+2*b,h+2*b,'#64748b','2 2','none','bleed-guide');
 if($('show-trim').checked)rect(root,x,y,w,h,'#dc2626','3 1','none','trim-guide');
 const ps=foldPanels(w,fold,c,n==='back',direction);let offset=0;
 for(const [i,v] of ps.entries()){if($('show-safe').checked)rect(root,x+offset+m,y+m,v-2*m,h-2*m,'#16a34a','2 2','none','safe-guide');offset+=v;
 if(i<ps.length-1&&$('show-fold').checked)root.append(el('line',{x1:x+offset,x2:x+offset,y1:y,y2:y+h,stroke:'#2563eb','stroke-width':.55,'stroke-dasharray':'3 2',class:'fold-guide'}));}
 }
 const f=slots.front.preview,r=slots.back.preview;if(f&&r&&(Math.abs(f.w-r.w)>.1||Math.abs(f.h-r.h)>.1))warnings.push('앞면과 뒷면의 원본 규격이 다릅니다.');
 $('layout-warning').replaceChildren(...warnings.map(t=>{const p=document.createElement('p');p.textContent=t;return p;}));
 }catch(e){for(const n of names)$('review-'+n).replaceChildren();$('layout-warning').textContent=e.message;$('layout-dimensions').textContent='';$('panel-widths').textContent='';}
}
function release(source){if(source?.kind==='pdf'&&!names.some(n=>slots[n].source===source))void source.doc.destroy().catch(()=>{});}
async function refresh(n){const a=slots[n],token=++a.token;a.preview=null;draw();if(!a.source)return;status(label(n)+' 미리보기 생성 중…');try{const p=await renderSource(a.source,a.page,num('imageDpi',36,2400));if(a.token!==token)return;a.preview=p;status(label(n)+' 확인 준비 완료');}catch(e){if(a.token===token)status(label(n)+' 미리보기 실패: '+e.message);}if(a.token===token)draw();}
async function load(n,file){const a=slots[n],token=++a.token,old=a.source;Object.assign(a,{source:null,preview:null,page:1});release(old);draw();try{const source=await openSource(file);if(a.token!==token){release(source);return;}a.source=source;await refresh(n);}catch(e){if(a.token===token){status(label(n)+' 파일 열기 실패: '+e.message);draw();}}}
for(const n of names){$('file-'+n).onchange=()=>{const f=$('file-'+n).files[0];if(f){selectFace(n);void load(n,f);}};$('page-'+n).onchange=()=>{const a=slots[n];if(!a.source)return;selectFace(n);a.page=Math.max(1,Math.min(a.source.pages,Math.trunc(Number($('page-'+n).value))||1));void refresh(n);};$('clear-'+n).onclick=()=>{const a=slots[n],old=a.source;++a.token;Object.assign(a,{source:null,preview:null,page:1});$('file-'+n).value='';release(old);draw();};}
$('same-pdf-back').onclick=()=>{const a=slots.front,b=slots.back,old=b.source;if(a.source?.kind!=='pdf'||a.page>=a.source.pages)return;b.source=a.source;b.page=a.page+1;$('file-back').value='';release(old);selectFace('back');void refresh('back');};
$('trimPreset').onchange=()=>{const v=$('trimPreset').value;if(v!=='auto'&&v!=='custom')[$('trimW').value,$('trimH').value]=v.split(',');draw();};
for(const id of ['trimW','trimH','bleed','margin','fold','direction','compensation','show-trim','show-safe','show-fold'])$(id).onchange=draw;
$('imageDpi').onchange=()=>{try{num('imageDpi',36,2400);}catch(e){status(e.message);return;}for(const n of names)if(slots[n].source?.kind==='image')void refresh(n);};
function reset(){for(const [k,v] of Object.entries(defaults))$(k).value=v;$('trimPreset').value='auto';for(const id of ['show-trim','show-safe','show-fold'])$(id).checked=true;for(const n of names)if(slots[n].source?.kind==='image')void refresh(n);draw();}
$('layout-reset').onclick=reset;selectFace(activeFace);reset();
for(const type of ['input','change','click'])document.querySelector('main').addEventListener(type,()=>{touched=true;},{capture:true});
void loadStudioSettings().then(settings=>{if(!settings)return;defaults.bleed=settings.layout.bleed;defaults.compensation=settings.layout.compensation;if(!touched)reset();});
