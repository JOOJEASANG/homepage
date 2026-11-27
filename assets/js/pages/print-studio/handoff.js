// Explicit local handoff only. Never uploads or submits an order.
const DB='gprint-studio-handoff',STORE='files',TTL=30*60*1000,MAX=300*1024*1024;
const key=type=>'gprint-studio-handoff-'+type;
const targets={book:'quote-book.html',print:'quote-print.html'};
function marker(type){
 try{const v=JSON.parse(sessionStorage.getItem(key(type))||'null');if(v&&typeof v.id==='string'&&Number.isFinite(v.expires)&&v.expires>Date.now())return v;if(v)sessionStorage.removeItem(key(type));}catch{}
 return null;
}
export const hasStudioHandoff=type=>!!marker(type);
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('임시 보관함을 열 수 없습니다.'));});}
async function transact(mode,action){
 const db=await openDB();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);let result;const r=action(store);if(r)r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error||Error('임시 파일 처리 실패'));});}finally{db.close();}
}
async function prune(){
 await transact('readwrite',store=>{const r=store.openCursor();r.onsuccess=()=>{const c=r.result;if(!c)return;if(c.value.expires<=Date.now())c.delete();c.continue();};});
}
export async function sendStudioFile(type,file){
 if(!Object.hasOwn(targets,type)||!(file instanceof Blob)||file.size===0||file.size>MAX||!String(file.name||'').toLowerCase().endsWith('.pdf'))throw Error('300MB 이하의 PDF 파일을 선택해 주세요.');
 const sig=new TextDecoder().decode(await file.slice(0,5).arrayBuffer());if(sig!=='%PDF-')throw Error('PDF 형식의 파일이 아닙니다.');
 await prune();const previous=marker(type),id=crypto.randomUUID(),expires=Date.now()+TTL;
 const record={id,expires,type,file:new File([file],file.name,{type:'application/pdf',lastModified:file.lastModified||Date.now()})};
 await transact('readwrite',store=>store.put(record));
 try{sessionStorage.setItem(key(type),JSON.stringify({id,expires}));}catch(e){await transact('readwrite',store=>store.delete(id));throw Error('브라우저 임시 저장이 허용되지 않습니다. PDF를 다운로드한 뒤 직접 첨부해 주세요.');}
 if(previous)await transact('readwrite',store=>store.delete(previous.id)).catch(()=>{});
 location.href=targets[type]+'#studio-handoff';
}
const attached=new Map();
function matches(a,b){return a&&b&&a.name===b.name&&a.size===b.size&&a.lastModified===b.lastModified;}
export function studioAttachmentReady(type,input){
 if(!hasStudioHandoff(type))return true;
 return Array.from(input?.files||[]).some(f=>matches(f,attached.get(type)));
}
export async function clearStudioHandoff(type){
 const m=marker(type);try{sessionStorage.removeItem(key(type));}catch{}attached.delete(type);
 if(m)await transact('readwrite',store=>store.delete(m.id)).catch(()=>{});
 const box=document.getElementById('studio-handoff');if(box)box.hidden=true;
}
export async function mountStudioHandoff(type,input){
 const box=document.getElementById('studio-handoff');if(!box||!input)return;
 const status=box.querySelector('[data-studio-status]'),add=box.querySelector('[data-studio-add]'),discard=box.querySelector('[data-studio-discard]');
 const m=marker(type);if(!m){if(location.hash==='#studio-handoff'){box.hidden=false;add.disabled=true;status.textContent='임시 파일이 없거나 만료되었습니다. PDF를 다시 선택해 주세요.';}void prune().catch(()=>{});return;}
 box.hidden=false;add.disabled=true;
 let record;
 try{await prune();record=await transact('readonly',store=>store.get(m.id));if(!record||record.type!==type||record.expires<=Date.now()||!(record.file instanceof Blob))throw Error('임시 파일이 없거나 만료되었습니다.');status.textContent=record.file.name+' · 첨부 버튼을 눌러 기존 파일에 추가하세요. (30분 임시 보관)';add.disabled=false;}
 catch(e){status.textContent=e.message+' PDF를 다시 선택하거나 임시 파일을 취소해 주세요.';}
 add.onclick=()=>{
  if(!record||marker(type)?.id!==record.id){status.textContent='임시 파일이 만료되었습니다. 다시 선택해 주세요.';return;}
  try{const f=record.file,existing=Array.from(input.files||[]);if(!existing.some(x=>matches(x,f))){
   if(existing.reduce((sum,x)=>sum+x.size,0)+f.size>600*1024*1024)throw Error('전체 파일 용량이 600MB를 초과합니다.');
   const dt=new DataTransfer();existing.forEach(x=>dt.items.add(x));dt.items.add(f);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  }
  if(!Array.from(input.files||[]).some(x=>matches(x,f)))throw Error('첨부에 실패했습니다. PDF를 직접 선택해 주세요.');
  attached.set(type,f);status.textContent='첨부되었습니다. 견적 사양을 확인한 뒤 직접 접수해 주세요.';
  }catch(e){status.textContent=e.message;}
 };
 discard.onclick=async()=>{const f=attached.get(type);if(f){try{const dt=new DataTransfer();Array.from(input.files||[]).filter(x=>!matches(x,f)).forEach(x=>dt.items.add(x));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));}catch{status.textContent='파일을 직접 제거한 뒤 취소해 주세요.';return;}}await clearStudioHandoff(type);};
}
