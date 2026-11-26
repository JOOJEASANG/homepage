import {PAPER_SIZES,TEMPLATES,FONTS,coverGeometry,defaultCover,normalizeCover} from './cover-model.js';
import {loadStudioSettings} from './settings-client.js';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const names={plain:'흰색',report:'보고서',education:'교육',classic:'클래식',soft:'파스텔'},faces={front:'앞표지',back:'뒷표지',spine:'책등'};
let touched=false,paperOptions=[],catalog=[],hiddenBuiltins=[];
let state=defaultCover(),selected='title',g=null,history=[],future=[],drag=null,assets=new Map(),ready=false;
const fields=['size','width','height','mode','pages','sides','caliper','adjust','spineMode','manualSpine','bleed','margin','frontTemplate','backTemplate','spineColor'];
const layerFields=['text','font','size','color','align','bold','x','y','lineHeight'];
const copy=s=>JSON.parse(JSON.stringify(s));
function msg(s){$('studio-status').textContent=s;}
function svg(tag,attrs={},content){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(content!=null)n.textContent=content;return n;}
function snapshot(){touched=true;history.push(copy(state));if(history.length>80)history.shift();future=[];}
function change(fn){snapshot();fn();render();}
function syncControls(){for(const k of fields)$(k).value=state[k];$('paperPreset').value=String(paperOptions.findIndex(p=>p.caliper===Number(state.caliper)));if($('paperPreset').selectedIndex<0)$('paperPreset').value='';$('width').disabled=$('height').disabled=state.size!=='CUSTOM';$('manualSpine').disabled=state.spineMode!=='manual';$('spine-settings').hidden=state.mode==='front';$('backTemplate').disabled=$('spineColor').disabled=state.mode==='front';}
function art(parent,key,x,y,w,h){const source=assets.get(key);const n=svg('svg',{x,y,width:w,height:h,viewBox:'0 0 210 297',preserveAspectRatio:'none'});if(source?.url)n.append(svg('image',{href:source.url,width:210,height:297,preserveAspectRatio:'xMidYMid slice'}));else if(source)for(const child of source.children)n.append(document.importNode(child,true));else n.append(svg('rect',{width:210,height:297,fill:'#fff'}));parent.append(n);}
function drawText(root,l,r){
 if(!r||r.w<=0||!l.text)return;
 const x=r.x+r.w*l.x/100,y=r.y+r.h*l.y/100,mm=l.size*25.4/72;
 const node=svg('text',{x,y,'font-family':FONTS[l.font],'font-size':mm,'font-weight':l.bold?'700':'400',fill:l.color,'text-anchor':({left:'start',center:'middle',right:'end'})[l.align],class:'art-text','data-layer':l.id});
 if(l.face==='spine')node.setAttribute('transform','rotate(90 '+x+' '+y+')');
 l.text.split('\n').forEach((line,i)=>node.append(svg('tspan',{x,dy:i?mm*l.lineHeight:0},line||' ')));root.append(node);
}
function guide(root,r,color,dash='2 1'){if(!r||r.w<=0||r.h<=0)return;root.append(svg('rect',{x:r.x,y:r.y,width:r.w,height:r.h,fill:'none',stroke:color,'stroke-width':.45,'stroke-dasharray':dash,class:'guide','pointer-events':'none'}));}
function render(){
  syncControls();$('undo').disabled=!history.length;$('redo').disabled=!future.length;
  const root=$('cover-svg');root.replaceChildren();try{g=coverGeometry(state);}catch(e){g=null;$('cover-warning').textContent=e.message;$('print-cover').disabled=true;return;}
  $('sheet-count').textContent=g.sheets;$('spine-width').textContent=g.spine;$('cover-dimensions').textContent=g.totalWidth+' × '+g.totalHeight+' mm (도련 포함)';
  root.setAttribute('viewBox','0 0 '+g.totalWidth+' '+g.totalHeight);
  root.setAttribute('width',g.totalWidth+'mm');root.setAttribute('height',g.totalHeight+'mm');
  const b=g.b;
  if(g.back){art(root,state.backTemplate,0,0,g.w+b,g.totalHeight);root.append(svg('rect',{x:g.spineRect.x,y:0,width:g.spine,height:g.totalHeight,fill:state.spineColor}));art(root,state.frontTemplate,g.front.x,0,g.w+b,g.totalHeight);}
  else art(root,state.frontTemplate,0,0,g.totalWidth,g.totalHeight);
  for(const layer of state.layers)drawText(root,layer,g[layer.face==='spine'?'spineRect':layer.face]);
  let warnings=[];
  for(const el of root.querySelectorAll('[data-layer]')){
    const layer=state.layers.find(l=>l.id===el.dataset.layer),r=g[layer.face==='spine'?'spineRect':layer.face];if(!r)continue;
    try{let box=el.getBBox();if(layer.face==='spine'){const mm=layer.size*25.4/72;if(mm*1.2>r.w||box.width>r.h-2*g.m)warnings.push('책등 문자 크기 또는 길이를 확인하세요.');}else if(box.x<r.x+g.m||box.y<r.y+g.m||box.x+box.width>r.x+r.w-g.m||box.y+box.height>r.y+r.h-g.m)warnings.push(faces[layer.face]+' 문자 안전 여백을 확인하세요.');}catch{}
  }
  if($('show-guides').checked){guide(root,{x:b,y:b,w:g.trimWidth,h:g.h},'#dc2626');for(const r of [g.front,g.back])if(r)guide(root,{x:r.x+g.m,y:r.y+g.m,w:r.w-2*g.m,h:r.h-2*g.m},'#16a34a');guide(root,g.spineRect,'#2563eb');}
  for(const [key,r] of [[state.frontTemplate,g.front],[state.backTemplate,g.back]]){const image=assets.get(key);if(r&&image?.url){const dpi=Math.min(image.width/(r.w+g.b)/.03937007874,image.height/g.totalHeight/.03937007874);if(dpi<300)warnings.push('등록 디자인의 예상 해상도가 300dpi 미만입니다.');}}
  $('cover-warning').textContent=[...new Set(warnings)].join('\n');$('print-cover').disabled=!ready||![state.frontTemplate,...(g.back?[state.backTemplate]:[])].every(key=>assets.has(key));
  const layers=$('layer-list');layers.replaceChildren();
  for(const l of state.layers.filter(l=>state.mode==='spread'||l.face==='front')){const button=document.createElement('button');button.type='button';button.textContent=faces[l.face]+' · '+(l.text.split('\n')[0]||'(빈 문자)');button.setAttribute('aria-pressed',String(selected===l.id));button.onclick=()=>{selected=l.id;render();};layers.append(button);}
  let l=state.layers.find(x=>x.id===selected&&(state.mode==='spread'||x.face==='front'));
  if(!l){selected=state.layers.find(x=>state.mode==='spread'||x.face==='front')?.id;l=state.layers.find(x=>x.id===selected);}
  $('text-editor').hidden=!l;if(l)for(const k of layerFields){const el=$('layer-'+k);if(k==='bold')el.checked=l[k];else el.value=l[k];}
  for(const btn of $('template-gallery').children)btn.setAttribute('aria-pressed',String(btn.dataset.template===state.frontTemplate));
}
function rebuildGallery(){
 const entries=[...TEMPLATES.filter(id=>!hiddenBuiltins.includes(id)||[state.frontTemplate,state.backTemplate].includes(id)).map(id=>({id,name:names[id],url:'assets/img/cover-templates/'+id+'.svg',hidden:hiddenBuiltins.includes(id)})),...catalog];
 for(const key of ['frontTemplate','backTemplate']){$(key).replaceChildren();for(const entry of entries){const option=document.createElement('option');option.value=entry.id;option.textContent=entry.name+(entry.hidden?' (기존 선택)':'');option.disabled=!!entry.hidden&&state[key]!==entry.id;$(key).append(option);}}
 const gallery=$('template-gallery');gallery.replaceChildren();
 for(const entry of entries.filter(x=>!x.hidden)){const b=document.createElement('button');b.type='button';b.dataset.template=entry.id;const img=document.createElement('img');img.src=entry.url;img.alt='';const name=document.createElement('span');name.textContent=entry.name;b.title=entry.category||entry.name;b.append(img,name);b.onclick=()=>change(()=>state.frontTemplate=entry.id);gallery.append(b);}
}
const available=()=>[...TEMPLATES,...catalog.map(t=>t.id)];
$('paperPreset').onchange=()=>{const p=paperOptions[Number($('paperPreset').value)];if($('paperPreset').value!==''&&p)change(()=>state.caliper=p.caliper);};
rebuildGallery();
for(const k of fields)$(k).addEventListener('change',()=>{const el=$(k),v=el.type==='number'?Number(el.value):el.value;change(()=>{state[k]=v;if(k==='size'&&PAPER_SIZES[v])[state.width,state.height]=PAPER_SIZES[v];});});
for(const k of layerFields)$('layer-'+k).addEventListener('change',()=>{const l=state.layers.find(x=>x.id===selected);if(!l)return;const el=$('layer-'+k),v=k==='bold'?el.checked:el.type==='number'?Number(el.value):el.value;if(el.type==='number'&&(!Number.isFinite(v)||v<Number(el.min)||v>Number(el.max))){msg('입력 범위를 확인해 주세요.');render();return;}change(()=>l[k]=v);});
$('show-guides').onchange=render;
$('add-text').onclick=()=>{if(state.layers.length>=60){msg('문자는 최대 60개까지 추가할 수 있습니다.');return;}change(()=>{const face=state.mode==='front'?'front':$('add-face').value;selected=crypto.randomUUID();state.layers.push({id:selected,face,text:'새 문구',font:'sans',size:14,color:'#173c31',align:'center',bold:false,x:50,y:55,lineHeight:1.25});});};
$('remove-text').onclick=()=>change(()=>{state.layers=state.layers.filter(l=>l.id!==selected);selected='';});
$('undo').onclick=()=>{if(!history.length)return;future.push(copy(state));state=history.pop();render();};
$('redo').onclick=()=>{if(!future.length)return;history.push(copy(state));state=future.pop();render();};
function position(event){const r=$('cover-svg');const p=r.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(r.getScreenCTM().inverse());}
$('cover-svg').addEventListener('pointerdown',e=>{const node=e.target.closest('[data-layer]');if(!node||!g)return;const l=state.layers.find(x=>x.id===node.dataset.layer);const r=g[l.face==='spine'?'spineRect':l.face];if(!r||!r.w)return;selected=l.id;const p=position(e);snapshot();drag={id:l.id,r,dx:p.x-r.x-r.w*l.x/100,dy:p.y-r.y-r.h*l.y/100};$('cover-svg').setPointerCapture(e.pointerId);render();});
$('cover-svg').addEventListener('pointermove',e=>{if(!drag)return;const p=position(e),l=state.layers.find(x=>x.id===drag.id),r=drag.r;if(!l)return;const clamp=n=>Math.round(Math.max(0,Math.min(100,n))*10)/10;l.x=clamp((p.x-r.x-drag.dx)/r.w*100);l.y=clamp((p.y-r.y-drag.dy)/r.h*100);render();});
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('cover-svg').addEventListener(type,()=>{drag=null;});
$('save-project').onclick=()=>{try{const data=normalizeCover(state,available()),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='그린오피스-표지편집.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);msg('편집 파일을 저장했습니다.');}catch(e){msg(e.message);}};
$('load-project').onchange=async()=>{try{const file=$('load-project').files[0];if(!file)return;if(file.size>2000000)throw Error('편집 파일이 너무 큽니다.');const loaded=normalizeCover(JSON.parse(await file.text()),available());change(()=>{state=loaded;selected=state.layers[0]?.id;});msg('편집 파일을 불러왔습니다.');}catch(e){msg(e.message);}finally{$('load-project').value='';}};
$('print-cover').onclick=async()=>{if(!g||!ready)return;await document.fonts.ready;const output=$('print-output'),art=$('cover-svg').cloneNode(true);art.removeAttribute('id');art.querySelectorAll('.guide').forEach(el=>el.remove());art.style.width=g.totalWidth+'mm';art.style.height=g.totalHeight+'mm';output.replaceChildren(art);let style=$('cover-page-style');if(!style){style=document.createElement('style');style.id='cover-page-style';document.head.append(style);}style.textContent='@page { size: '+g.totalWidth+'mm '+g.totalHeight+'mm; margin: 0; }';msg('인쇄 창에서 PDF로 저장, 배율 100%, 여백 없음, 머리글/바닥글 끄기, 배경 그래픽 켜기를 선택하세요.');window.print();};
render();
void loadStudioSettings().then(async settings=>{if(!settings)return;paperOptions=settings.papers;const select=$('paperPreset');paperOptions.forEach((p,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=p.name+' · '+p.caliper+'mm';select.append(o);});
 const results=await Promise.all(settings.templates.map(async t=>{try{const image=new Image();image.src=t.url;await image.decode();assets.set(t.id,t);return t;}catch{return null;}}));catalog=results.filter(Boolean);hiddenBuiltins=settings.hiddenBuiltins;if(!touched){Object.assign(state,settings.cover);for(const k of ['frontTemplate','backTemplate'])if(hiddenBuiltins.includes(state[k]))state[k]='plain';}rebuildGallery();render();if(results.some(t=>!t))msg('일부 등록 디자인을 불러오지 못했습니다. 기본 디자인은 사용할 수 있습니다.');});
Promise.all(TEMPLATES.map(async key=>{const response=await fetch('assets/img/cover-templates/'+key+'.svg');if(!response.ok)throw Error('디자인 로딩 실패');const doc=new DOMParser().parseFromString(await response.text(),'image/svg+xml');if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')throw Error('디자인 파일 오류');assets.set(key,doc.documentElement);})).then(()=>{ready=true;render();msg('디자인 파일을 불러왔습니다.');}).catch(e=>msg(e.message+' · 새로고침 후 다시 시도해 주세요.'));
