// ============================================================
// qna-conversation-thread.js — 1:1 문의 연속 대화 + 수신확인
// ============================================================
import { db, collection, query, where, orderBy, getDocs, getDoc, doc, onSnapshot, deleteDoc, updateDoc, serverTimestamp } from './firebase.js';

const CURRENT_PAGE = (() => { try { const raw=((location.pathname||'').split('/').pop()||'index.html').toLowerCase(); return raw==='admin'?'admin.html':raw; } catch (_) { return 'index.html'; } })();
const escapeHTML = value => String(value ?? '').replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[ch]));
const normalizeName = value => String(value||'').trim().replace(/\s+/g,'').toLowerCase();
function toMillis(value){try{if(value?.toMillis)return value.toMillis();if(value?.toDate)return value.toDate().getTime();if(value?.seconds)return Number(value.seconds)*1000;if(value instanceof Date)return value.getTime();}catch(_){}return 0;}
function formatDateTime(value){const ms=toMillis(value);if(!ms)return '-';try{return new Date(ms).toLocaleString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}catch(_){return '-';}}
function getConversationKey(item){if(item?.conversationKey)return `key:${item.conversationKey}`;if(item?.userId)return `user:${item.userId}`;return `legacy:${normalizeName(item?.name)}:${String(item?.pwHash||'')|| (item?.isSecret===false?'public':'secret')}`;}
const hasAnswer = item => !!String(item?.answer||'').trim();
const isSuperseded = item => item?.status==='superseded' || item?.superseded===true;

function addStyles(){
 if(document.getElementById('qna-conversation-thread-style'))return;
 const style=document.createElement('style');style.id='qna-conversation-thread-style';style.textContent=`
 .qna-thread-shell{border:1px solid #dfe9e3;border-radius:20px;overflow:hidden;background:#f7faf8;box-shadow:0 14px 40px rgba(17,45,31,.08)}
 .qna-thread-head{padding:16px 18px;background:#fff;border-bottom:1px solid #e5ece8;display:flex;align-items:center;justify-content:space-between;gap:12px}
 .qna-thread-list{padding:18px;display:flex;flex-direction:column;gap:14px;max-height:620px;overflow:auto;scroll-behavior:smooth}
 .qna-thread-row{display:flex;flex-direction:column;max-width:min(86%,680px)}.qna-thread-row.customer{align-self:flex-end;align-items:flex-end}.qna-thread-row.admin{align-self:flex-start;align-items:flex-start}
 .qna-thread-label{font-size:11px;font-weight:800;color:#78877f;margin:0 5px 5px}.qna-thread-bubble{padding:13px 15px;border-radius:17px;font-size:14px;line-height:1.65;white-space:pre-wrap;word-break:break-word}
 .qna-thread-row.customer .qna-thread-bubble{background:#148a54;color:#fff;border-bottom-right-radius:5px;box-shadow:0 8px 22px rgba(20,138,84,.18)}
 .qna-thread-row.admin .qna-thread-bubble{background:#fff;color:#24342c;border:1px solid #dfe8e3;border-bottom-left-radius:5px;box-shadow:0 7px 20px rgba(17,45,31,.07)}
 .qna-thread-title{display:block;font-size:12px;font-weight:900;margin-bottom:5px;opacity:.9}.qna-thread-time{font-size:10px;color:#93a099;margin:5px 5px 0}
 .qna-thread-wait,.qna-thread-continued{align-self:flex-start;margin:0 0 0 5px;font-size:11px;padding:6px 9px;border-radius:999px}.qna-thread-wait{color:#9a6b15;background:#fff7df;border:1px solid #f4dfaa}.qna-thread-continued{color:#66736c;background:#eef3f0;border:1px solid #dce5df}
 .qna-receipt{font-size:10px;margin-top:5px;display:inline-flex;align-items:center;gap:4px}.qna-receipt.read{color:#16824f}.qna-receipt.unread{color:#a16a11}.qna-thread-empty{padding:34px;text-align:center;color:#87948d;font-size:13px}
 .qna-thread-admin-view{max-height:430px;overflow:auto;padding:14px;background:#f5f8f6;border:1px solid #e1eae5;border-radius:16px}#inquiry-list-body tr[data-qna-thread-row="1"] td{vertical-align:middle}
 @media(max-width:640px){.qna-thread-list{padding:13px}.qna-thread-row{max-width:92%}.qna-thread-head{padding:14px}.qna-thread-bubble{font-size:13px}}
 `;document.head.appendChild(style);
}

function renderTimeline(items,{adminView=false}={}){
 const sorted=[...items].sort((a,b)=>toMillis(a.createdAt)-toMillis(b.createdAt));const latestId=sorted[sorted.length-1]?.id||'';const rows=[];
 sorted.forEach(item=>{
  rows.push(`<div class="qna-thread-row customer"><div class="qna-thread-label">${adminView?escapeHTML(item.name||'고객'):'나'}</div><div class="qna-thread-bubble"><span class="qna-thread-title">${escapeHTML(item.title||'문의')}</span>${escapeHTML(item.body||'')}</div><div class="qna-thread-time">${escapeHTML(formatDateTime(item.createdAt))}</div></div>`);
  if(hasAnswer(item)){
   const read=item.answerReadByCustomer===true;
   rows.push(`<div class="qna-thread-row admin"><div class="qna-thread-label">그린오피스 관리자</div><div class="qna-thread-bubble">${escapeHTML(item.answer||'')}</div><div class="qna-thread-time">${escapeHTML(formatDateTime(item.answeredAt))}</div><div class="qna-receipt ${read?'read':'unread'}"><i class="fas ${read?'fa-check-double':'fa-clock'}"></i>${adminView?(read?'고객 수신확인':'고객 미수신'):(read?'답변 확인됨':'새 답변')}</div></div>`);
  }else if(isSuperseded(item)) rows.push('<div class="qna-thread-continued"><i class="fas fa-arrow-turn-down mr-1"></i>새 문의로 이어졌습니다. 이전 문의의 답변 대기는 종료되었습니다.</div>');
  else if(item.id===latestId) rows.push('<div class="qna-thread-wait"><i class="fas fa-clock mr-1"></i>답변을 기다리고 있습니다.</div>');
  else rows.push('<div class="qna-thread-continued"><i class="fas fa-comments mr-1"></i>후속 문의로 대화가 이어졌습니다.</div>');
 });return rows.join('');
}

async function sha256Hex(value){const data=new TextEncoder().encode(String(value||''));const hash=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(hash)).map(v=>v.toString(16).padStart(2,'0')).join('');}
function showInlineMessage(container,message,error=false){if(container)container.innerHTML=`<div class="qna-thread-empty ${error?'text-red-500':''}">${escapeHTML(message)}</div>`;}

async function markCustomerAnswersRead(items){const unread=items.filter(item=>hasAnswer(item)&&item.answerReadByCustomer!==true);if(!unread.length)return;await Promise.all(unread.map(item=>updateDoc(doc(db,'qna',item.id),{answerReadByCustomer:true,answerReadAt:serverTimestamp()}).catch(()=>null)));}

function initCustomerNewQuestionStatus(){
 if(CURRENT_PAGE!=='qna.html')return;
 document.addEventListener('click',event=>{const button=event.target?.closest?.('#submitBtn');if(!button)return;const name=document.getElementById('qnaName')?.value?.trim();const pw=document.getElementById('qnaPw')?.value?.trim();const secret=document.getElementById('qnaSecret')?.checked;if(!name||!pw||!secret)return;
  setTimeout(async()=>{try{const pwHash=await sha256Hex(pw);const snap=await getDocs(query(collection(db,'qna'),where('name','==',name)));const open=snap.docs.map(d=>({id:d.id,...(d.data()||{})})).filter(item=>item.pwHash===pwHash&&!hasAnswer(item)&&!isSuperseded(item));if(open.length<2)return;const newest=open.sort((a,b)=>toMillis(b.createdAt)-toMillis(a.createdAt))[0];await Promise.all(open.filter(item=>item.id!==newest.id).map(item=>updateDoc(doc(db,'qna',item.id),{status:'superseded',superseded:true,supersededAt:serverTimestamp()}).catch(()=>null)));}catch(_){}},1200);
 },true);
}

function initCustomerConversationView(){
 if(CURRENT_PAGE!=='qna.html')return;
 document.addEventListener('click',async event=>{const button=event.target?.closest?.('#searchBtn');if(!button)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
  const name=(document.getElementById('searchName')?.value||'').trim();const password=(document.getElementById('searchPw')?.value||'').trim();const resultArea=document.getElementById('search-result-area');const list=document.getElementById('my-qna-list');if(!name||!password){resultArea?.classList.remove('hidden');showInlineMessage(list,'이름과 비밀번호를 모두 입력해주세요.',true);return;}
  const oldHtml=button.innerHTML;button.disabled=true;button.innerHTML='<i class="fas fa-spinner fa-spin mr-1"></i>조회 중';
  try{const pwHash=await sha256Hex(password);const snap=await getDocs(query(collection(db,'qna'),where('name','==',name)));const items=snap.docs.map(d=>({id:d.id,...(d.data()||{})})).filter(item=>item.pwHash===pwHash).sort((a,b)=>toMillis(a.createdAt)-toMillis(b.createdAt));resultArea?.classList.remove('hidden');if(!items.length){showInlineMessage(list,'일치하는 문의 대화가 없습니다. 이름이나 비밀번호를 확인해주세요.');return;}
   const latest=items[items.length-1];const latestWaiting=!hasAnswer(latest)&&!isSuperseded(latest);list.innerHTML=`<section class="qna-thread-shell" aria-label="${escapeHTML(name)}님의 1대1 문의 대화"><div class="qna-thread-head"><div><div class="font-extrabold text-slate-800"><i class="fas fa-comments text-brand-600 mr-2"></i>${escapeHTML(name)}님의 문의 대화</div><div class="text-xs text-slate-400 mt-1">총 ${items.length}건의 문의가 시간순으로 이어집니다.</div></div><span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${latestWaiting?'bg-amber-50 text-amber-700 border border-amber-200':'bg-emerald-50 text-emerald-700 border border-emerald-200'}">${latestWaiting?'답변대기':'답변확인'}</span></div><div class="qna-thread-list">${renderTimeline(items)}</div></section><p class="text-xs text-slate-400 text-center mt-3">같은 이름과 비밀번호로 새 문의를 등록하면 이 대화에 계속 이어서 표시됩니다.</p>`;
   const thread=list.querySelector('.qna-thread-list');if(thread)thread.scrollTop=thread.scrollHeight;await markCustomerAnswersRead(items);setTimeout(()=>{const t=list.querySelector('.qna-thread-list');if(t)t.innerHTML=renderTimeline(items.map(x=>({...x,answerReadByCustomer:hasAnswer(x)?true:x.answerReadByCustomer})));},50);
  }catch(error){console.warn('[qna-thread] customer lookup failed:',error);resultArea?.classList.remove('hidden');showInlineMessage(list,'문의 대화를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',true);}finally{button.disabled=false;button.innerHTML=oldHtml||'조회하기';}
 },true);
}

function groupAdminItems(items){const map=new Map();items.forEach(item=>{const key=getConversationKey(item);if(!map.has(key))map.set(key,[]);map.get(key).push(item);});return Array.from(map.entries()).map(([key,entries])=>{const sorted=[...entries].sort((a,b)=>toMillis(a.createdAt)-toMillis(b.createdAt));const latest=sorted[sorted.length-1]||{};const waiting=!hasAnswer(latest)&&!isSuperseded(latest);return{key,items:sorted,latest,unanswered:waiting?1:0};}).sort((a,b)=>toMillis(b.latest.createdAt)-toMillis(a.latest.createdAt));}

function initAdminAnswerReceiptBridge(){if(CURRENT_PAGE!=='admin.html')return;document.addEventListener('submit',event=>{const form=event.target?.closest?.('#inquiry-reply-form');if(!form)return;setTimeout(async()=>{try{const id=document.getElementById('inquiry-modal-id')?.value;const answer=document.getElementById('inquiry-modal-answer')?.value?.trim();if(!id||!answer)return;await updateDoc(doc(db,'qna',id),{answerReadByCustomer:false,answerReadAt:null,answerSentAt:serverTimestamp()});}catch(_){}},900);},true);}

function initAdminConversationView(){
 if(CURRENT_PAGE!=='admin.html')return;let allItems=[];let groups=[];let rendering=false;let renderTimer=null;
 const renderRows=()=>{const tbody=document.getElementById('inquiry-list-body');if(!tbody||rendering)return;rendering=true;groups=groupAdminItems(allItems);tbody.innerHTML='';if(!groups.length){tbody.innerHTML='<tr><td colspan="5" class="text-center py-10 text-slate-400">문의 내역이 없습니다.</td></tr>';rendering=false;return;}
  groups.forEach(group=>{const latest=group.latest;const tr=document.createElement('tr');tr.dataset.qnaThreadRow='1';tr.dataset.threadKey=group.key;tr.className=`border-b border-slate-100 hover:bg-slate-50 transition-colors ${group.unanswered?'bg-amber-50/30':''}`;const read=hasAnswer(latest)&&latest.answerReadByCustomer===true;tr.innerHTML=`<td class="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">${escapeHTML(formatDateTime(latest.createdAt))}</td><td class="px-6 py-4 font-bold text-slate-700">${escapeHTML(latest.name||'이름없음')}<div class="text-[10px] text-slate-400 mt-1">대화 ${group.items.length}건</div></td><td class="px-6 py-4 text-slate-600 max-w-xs"><div class="truncate font-medium">${escapeHTML(latest.title||'문의')}</div><div class="truncate text-[11px] text-slate-400 mt-1">${escapeHTML(latest.body||'')}</div></td><td class="px-6 py-4 text-center"><span class="px-2 py-1 rounded text-[10px] ${group.unanswered?'bg-red-50 text-red-600 font-bold':read?'bg-emerald-50 text-emerald-700 font-bold':'bg-amber-50 text-amber-700 font-bold'}">${group.unanswered?'답변대기':read?'답변 수신확인':'답변 미수신'}</span></td><td class="px-6 py-4 text-center"><div class="flex justify-center gap-2"><button type="button" class="view-qna-thread-btn btn btn-sm bg-white border border-slate-200 hover:bg-brand-50 hover:text-brand-600 text-slate-600" data-thread-key="${escapeHTML(group.key)}">대화보기</button><button type="button" class="delete-qna-thread-btn btn btn-sm bg-white border border-slate-200 hover:bg-red-50 hover:text-red-600 text-slate-500" data-thread-key="${escapeHTML(group.key)}">삭제</button></div></td>`;tbody.appendChild(tr);});tbody.dataset.qnaThreadSignature=groups.map(g=>`${g.key}:${g.items.length}:${g.unanswered}:${toMillis(g.latest.createdAt)}:${g.latest.answerReadByCustomer?'1':'0'}`).join('|');setTimeout(()=>{rendering=false;},0);};
 const scheduleRender=()=>{clearTimeout(renderTimer);renderTimer=setTimeout(renderRows,20);};
 const openThread=group=>{if(!group)return;const target=[...group.items].reverse().find(item=>!hasAnswer(item)&&!isSuperseded(item))||group.latest;const modal=document.getElementById('inquiry-details-modal');const idEl=document.getElementById('inquiry-modal-id');const userEl=document.getElementById('inquiry-modal-user');const dateEl=document.getElementById('inquiry-modal-date');const titleEl=document.getElementById('inquiry-modal-title');const questionEl=document.getElementById('inquiry-modal-question');const answerEl=document.getElementById('inquiry-modal-answer');if(idEl)idEl.value=target?.id||'';if(userEl)userEl.textContent=`${group.latest.name||'고객'} · 대화 ${group.items.length}건`;if(dateEl)dateEl.textContent=formatDateTime(group.latest.createdAt);if(titleEl)titleEl.textContent=target?.title||group.latest.title||'1:1 문의';if(questionEl)questionEl.innerHTML=`<div class="qna-thread-admin-view"><div class="qna-thread-list !p-0 !max-h-none">${renderTimeline(group.items,{adminView:true})}</div></div>`;if(answerEl){answerEl.value=target?.answer||'';answerEl.placeholder=group.unanswered?'가장 최근의 미답변 문의에 답변을 입력하세요.':'기존 답변을 수정할 수 있습니다.';}modal?.classList.remove('hidden');setTimeout(()=>{const box=questionEl?.querySelector('.qna-thread-admin-view');if(box)box.scrollTop=box.scrollHeight;},0);};
 document.addEventListener('click',async event=>{const openBtn=event.target?.closest?.('.view-qna-thread-btn');const deleteBtn=event.target?.closest?.('.delete-qna-thread-btn');if(!openBtn&&!deleteBtn)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();const key=(openBtn||deleteBtn).dataset.threadKey;const group=groups.find(item=>item.key===key);if(!group)return;if(openBtn){openThread(group);return;}if(!confirm(`${group.latest.name||'고객'}님의 문의 대화 ${group.items.length}건을 모두 삭제할까요?`))return;try{await Promise.all(group.items.map(item=>deleteDoc(doc(db,'qna',item.id))));}catch(error){console.warn('[qna-thread] delete failed:',error);alert('문의 대화를 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.');}},true);
 const start=()=>{const tbody=document.getElementById('inquiry-list-body');if(!tbody){setTimeout(start,300);return;}const observer=new MutationObserver(()=>{if(!rendering&&allItems.length)scheduleRender();});observer.observe(tbody,{childList:true,subtree:true});onSnapshot(query(collection(db,'qna'),orderBy('createdAt','desc')),snap=>{allItems=snap.docs.map(d=>({id:d.id,...(d.data()||{})}));scheduleRender();},error=>console.warn('[qna-thread] admin watch failed:',error));};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}

addStyles();initCustomerNewQuestionStatus();initCustomerConversationView();initAdminAnswerReceiptBridge();initAdminConversationView();
