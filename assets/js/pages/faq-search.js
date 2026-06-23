import { db, collection, query, orderBy, getDocs, limit } from '../firebase.js';

function ready(fn){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn,{once:true});else fn();}
function text(v){return String(v||'').toLowerCase().replace(/\s+/g,' ').trim();}
function esc(str){return String(str||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}

let cachedFaqs=[];

function getEls(){return{input:document.getElementById('faqSearch'),clear:document.getElementById('faqSearchClear'),count:document.getElementById('faqSearchCount'),list:document.getElementById('faq-list')}}

function bindAccordion(root){
  root.querySelectorAll('[data-faq-toggle]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const answer=btn.nextElementSibling;
      const icon=btn.querySelector('.fa-chevron-down');
      if(!answer)return;
      if(!answer.style.maxHeight){answer.style.maxHeight=answer.scrollHeight+'px';icon?.classList.add('rotate-180');}
      else{answer.style.maxHeight=null;icon?.classList.remove('rotate-180');}
    });
  });
}

function renderFaqList(){
  const {input,clear,count,list}=getEls();
  if(!input||!list)return;
  input.style.paddingLeft='3rem';
  input.style.paddingRight='3rem';
  const keyword=text(input.value);
  const rows=cachedFaqs.filter(item=>!keyword||text((item.category||'')+' '+(item.keywords||'')+' '+(item.question||'')+' '+(item.answer||'')).includes(keyword));
  if(clear)clear.classList.toggle('hidden',!keyword);
  if(count)count.textContent=cachedFaqs.length?(keyword?'검색 결과 '+rows.length+'개 / 전체 '+cachedFaqs.length+'개':'전체 '+cachedFaqs.length+'개 FAQ가 표시됩니다.'):'등록된 FAQ가 없습니다.';
  if(!rows.length){list.innerHTML='<div class="p-12 text-center text-slate-400 bg-slate-50 text-sm">'+(keyword?'검색 결과가 없습니다.':'등록된 자주 묻는 질문이 없습니다.')+'</div>';return;}
  list.innerHTML=rows.map(data=>`
    <div class="bg-white" data-search="${esc((data.category||'')+' '+(data.keywords||''))}">
      <button data-faq-toggle class="w-full px-8 py-5 text-left flex justify-between items-center focus:outline-none hover:bg-slate-50 transition-colors group">
        <span class="font-bold text-slate-700 group-hover:text-brand-600 text-base flex items-center min-w-0">
          <span class="bg-brand-100 text-brand-600 text-xs font-extrabold px-2 py-1 rounded mr-3 shrink-0">Q</span>
          <span class="truncate">${esc(data.question)}</span>
          ${data.category?`<span class="ml-2 shrink-0 text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-500">${esc(data.category)}</span>`:''}
        </span>
        <i class="fas fa-chevron-down text-slate-300 group-hover:text-brand-600 transition-transform duration-200"></i>
      </button>
      <div class="faq-answer bg-slate-50 border-t border-slate-100">
        <div class="px-8 py-6 text-slate-600 leading-relaxed whitespace-pre-wrap pl-16 text-sm"><span class="font-bold text-slate-800 mr-2 text-base">A.</span> ${esc(data.answer)}</div>
      </div>
    </div>`).join('');
  bindAccordion(list);
}

async function loadFaqs(){
  const {list}=getEls();
  if(!list)return;
  try{
    let q=query(collection(db,'faq'),orderBy('order','asc'));
    try{await getDocs(query(collection(db,'faq'),limit(1)));}catch(e){q=query(collection(db,'faq'),orderBy('createdAt','desc'));}
    const snap=await getDocs(q);
    cachedFaqs=[];
    snap.forEach(d=>{const data=d.data()||{}; if(data.isActive===false)return; cachedFaqs.push({id:d.id,...data});});
    renderFaqList();
  }catch(e){console.warn('[faq] public render failed:',e);}
}

ready(function(){
  const {input,clear}=getEls();
  if(input){input.addEventListener('input',renderFaqList);}
  if(clear)clear.addEventListener('click',function(){input.value='';input.focus();renderFaqList();});
  setTimeout(loadFaqs,200);
  setTimeout(loadFaqs,1200);
});
