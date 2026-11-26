import {auth,db,storage,onAuthStateChanged,doc,getDoc,runTransaction,ref,uploadBytes,getDownloadURL,deleteObject} from '../../firebase.js';
import {BUILTIN_NAMES,normalizeStudioSettings,publicStudioSettings,validatePresetRows,validTemplatePath} from './settings-model.js';
const $=id=>document.getElementById(id),form=$('studio-settings-form'),button=$('studio-save');
const privateRef=doc(db,'settings','printStudioAdmin'),publicRef=doc(db,'settings','printStudio');
let revision=0,authEpoch=0,adminUid='',busy=false,originalPaths=[],pending=[],designs=[],stagedPaths=[];
const status=t=>$('admin-studio-status').textContent=t;
const trim=v=>String(v||'').trim();
function control(tag,attrs={}){const n=document.createElement(tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;}
function field(row,name,value,type='text',min,max,step){const wrap=control('label');wrap.textContent=name;const input=control('input',{type,'aria-label':name});input.value=value??'';if(min!=null){input.min=min;input.max=max;input.step=step;}wrap.append(input);row.append(wrap);return input;}
function addPreset(kind,data={}){
  const list=$(kind+'-rows'),limit=kind==='paper'?40:30;if(list.children.length>=limit){status('등록 가능한 개수를 초과했습니다.');return;}
  const row=control('div',{'class':'preset-row'}),name=field(row,'이름',data.name);name.dataset.field='name';name.maxLength=80;
  if(kind==='paper'){field(row,'한 장 두께(mm)',data.caliper,'number',.03,1,.001).dataset.field='caliper';}
  else {field(row,'가로(mm)',data.width,'number',30,1500,.1).dataset.field='width';field(row,'세로(mm)',data.height,'number',30,1500,.1).dataset.field='height';}
  const del=control('button',{type:'button','class':'danger'});del.textContent='삭제';del.onclick=()=>row.remove();row.append(del);list.append(row);
}
function addDesign(data={}){
  if(designs.length>=30){status('디자인은 최대 30개까지 등록할 수 있습니다.');return;}
  const item={...data,enabled:data.enabled!==false,file:null,localUrl:''};designs.push(item);
  const row=control('div',{'class':'admin-design-row'}),img=control('img',{alt:'디자인 미리보기'});if(item.url)img.src=item.url;row.append(img);
  const name=field(row,'디자인 이름',item.name);name.maxLength=80;name.oninput=()=>item.name=name.value;
  const category=field(row,'분류',item.category);category.maxLength=40;category.oninput=()=>item.category=category.value;
  const open=control('label',{'class':'check'}),check=control('input',{type:'checkbox'});check.checked=item.enabled;check.onchange=()=>item.enabled=check.checked;open.append(check,document.createTextNode('고객 목록에 공개'));row.append(open);
  const file=control('input',{type:'file',accept:'image/jpeg,image/png','aria-label':'디자인 이미지 파일'});file.onchange=async()=>{
    const picked=file.files[0];if(!picked)return;
    try{if(picked.size>20*1024*1024||!['image/jpeg','image/png'].includes(picked.type))throw Error('JPG·PNG 20MB 이하 파일을 선택해 주세요.');
      const bmp=await createImageBitmap(picked);const w=bmp.width,h=bmp.height;bmp.close();
      if(w>12000||h>12000||w*h>60000000)throw Error('최대 12,000px, 6천만 화소 이내의 이미지를 선택해 주세요.');
      if(item.localUrl)URL.revokeObjectURL(item.localUrl);item.file=picked;item.width=w;item.height=h;item.localUrl=URL.createObjectURL(picked);img.src=item.localUrl;if(!trim(item.name)){name.value=picked.name.replace(/\.[^.]+$/,'');item.name=name.value;}resolution.textContent=w+' × '+h+' px · 저장 대기';
    }catch(e){status(e.message);file.value='';}
  };row.append(file);
  const resolution=control('p',{'class':'muted'});resolution.textContent=item.width?item.width+' × '+item.height+' px':'이미지 선택 필요';row.append(resolution);
  const del=control('button',{type:'button','class':'danger'});del.textContent='디자인 삭제';del.onclick=()=>{if(item.localUrl)URL.revokeObjectURL(item.localUrl);designs=designs.filter(x=>x!==item);row.remove();};row.append(del);$('design-rows').append(row);
}
function fill(raw){
  const s=normalizeStudioSettings(raw);
  for(const input of form.querySelectorAll('[data-setting]')){const [group,key]=input.dataset.setting.split('.');input.value=s[group][key];}
  for(const kind of ['paper','sheet'])$(kind+'-rows').replaceChildren();
  s.papers.forEach(x=>addPreset('paper',x));s.sheets.forEach(x=>addPreset('sheet',x));
  for(const x of designs)if(x.localUrl)URL.revokeObjectURL(x.localUrl);designs=[];$('design-rows').replaceChildren();s.templates.forEach(addDesign);
  $('builtin-toggles').replaceChildren();
  for(const [id,name] of Object.entries(BUILTIN_NAMES)){const label=control('label',{'class':'check'}),input=control('input',{type:'checkbox','data-builtin':id});input.checked=!s.hiddenBuiltins.includes(id);input.disabled=id==='plain';label.append(input,document.createTextNode(name));$('builtin-toggles').append(label);}
  originalPaths=s.templates.map(t=>t.path);pending=(Array.isArray(raw.pendingCleanup)?raw.pendingCleanup:[]).filter(validTemplatePath);revision=Number(raw.revision)||0;
  $('cleanup-status').textContent=pending.length?'삭제 재시도 대기: '+pending.length+'개. 설정 저장 시 다시 정리합니다.':'';
}
function collect(){
  if(!form.reportValidity())throw Error('기본값 또는 입력 범위를 확인해 주세요.');
  const s={cover:{},layout:{}};
  for(const input of form.querySelectorAll('[data-setting]')){const [group,key]=input.dataset.setting.split('.');s[group][key]=Number(input.value);}
  const rows=kind=>[...$(kind+'-rows').children].map(row=>Object.fromEntries([...row.querySelectorAll('[data-field]')].map(i=>[i.dataset.field,i.value])));
  s.papers=validatePresetRows(rows('paper'),'paper');s.sheets=validatePresetRows(rows('sheet'),'sheet');
  s.hiddenBuiltins=[...form.querySelectorAll('[data-builtin]:not(:checked)')].map(i=>i.dataset.builtin);
  for(const t of designs)if(!trim(t.name)||(!t.file&&!t.url))throw Error('디자인 이름과 이미지 파일을 모두 입력해 주세요.');
  return s;
}
async function cleanup(paths){
  const deleted=[];
  for(const path of paths.filter(validTemplatePath)){
    try{await deleteObject(ref(storage,path));deleted.push(path);}catch(e){if(e?.code==='storage/object-not-found')deleted.push(path);}
  }
  if(deleted.length){await runTransaction(db,async tx=>{const snap=await tx.get(privateRef);if(snap.exists()){const data=snap.data();tx.update(privateRef,{pendingCleanup:(data.pendingCleanup||[]).filter(p=>!deleted.includes(p))});}});pending=pending.filter(p=>!deleted.includes(p));}
  $('cleanup-status').textContent=pending.length?'일부 파일 삭제 실패 ('+pending.length+'개). 다시 저장하면 재시도합니다.':'';
}
async function save(){
  if(busy||!adminUid||auth.currentUser?.uid!==adminUid)return;
  let data;try{data=collect();}catch(e){status(e.message);return;}
  busy=true;button.disabled=true;form.inert=true;status('설정을 저장하는 중…');
  try{
    for(const t of designs)if(t.file){const id=crypto.randomUUID(),path='public/print-studio/templates/'+id+(t.file.type==='image/png'?'.png':'.jpg');const dest=ref(storage,path);
      await uploadBytes(dest,t.file,{contentType:t.file.type});let url;try{url=await getDownloadURL(dest);}catch(e){try{await deleteObject(dest);}catch{}throw e;}
      stagedPaths.push(path);Object.assign(t,{id:'custom-'+id,path,url,file:null});}
    data.templates=designs.map(({id,name,category,url,path,width,height,enabled})=>({id,name,category,url,path,width,height,enabled}));
    const normalized=normalizeStudioSettings(data);
    if(normalized.templates.length!==designs.length)throw Error('저장할 디자인 파일의 주소를 확인하지 못했습니다.');
    const nextPaths=normalized.templates.map(t=>t.path),nextPending=[...new Set([...pending,...originalPaths.filter(p=>!nextPaths.includes(p)),...stagedPaths.filter(p=>!nextPaths.includes(p))])].filter(p=>!nextPaths.includes(p));
    await runTransaction(db,async tx=>{const snap=await tx.get(privateRef);if((Number(snap.exists()?snap.data().revision:0)||0)!==revision)throw Error('다른 관리자에서 설정을 변경했습니다. 새로 열어 확인해 주세요.');tx.set(privateRef,{...normalized,revision:revision+1,pendingCleanup:nextPending});tx.set(publicRef,publicStudioSettings(normalized));});
    revision++;originalPaths=nextPaths;pending=nextPending;stagedPaths=[];status('설정이 저장되었습니다. 고객 화면을 새로 열면 반영됩니다.');
    try{await cleanup(pending);}catch{ $('cleanup-status').textContent='파일 정리 기록 갱신 실패. 다음 저장에서 재시도합니다.'; }
  }catch(e){status('저장 실패: '+(e?.message||'다시 시도해 주세요.')+(stagedPaths.length?' · 업로드된 파일이 있으므로 창을 닫지 말고 다시 저장해 주세요.':''));}
  finally{busy=false;form.inert=false;button.disabled=!adminUid;}
}
$('add-paper').onclick=()=>addPreset('paper');$('add-sheet').onclick=()=>addPreset('sheet');$('add-design').onclick=()=>addDesign();
window.addEventListener('beforeunload',event=>{if(busy||stagedPaths.length){event.preventDefault();event.returnValue='';}});
button.onclick=save;form.onsubmit=e=>{e.preventDefault();void save();};
onAuthStateChanged(auth,async user=>{const epoch=++authEpoch;adminUid='';button.disabled=true;form.hidden=true;
  try{if(!user||user.isAnonymous)throw Error('관리자 로그인이 필요합니다.');const role=await getDoc(doc(db,'users',user.uid));if(!role.exists()||role.data().role!=='admin')throw Error('관리자 권한이 필요합니다.');
    const snap=await getDoc(privateRef);if(epoch!==authEpoch)return;fill(snap.exists()?snap.data():{});adminUid=user.uid;form.hidden=false;button.disabled=false;status('관리자 확인 완료');
  }catch(e){if(epoch===authEpoch)status(e.message);}
});
