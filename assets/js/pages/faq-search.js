import { db, collection, query, orderBy, getDocs, limit } from '../firebase.js';

function ready(fn){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn,{once:true});else fn();}
function text(v){return String(v||'').toLowerCase().replace(/\s+/g,' ').trim();}
function esc(str){return String(str||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[m]));}

let cachedFaqs=[];
let selectedCategory='전체';

function getEls(){return{input:document.getElementById('faqSearch'),clear:document.getElementById('faqSearchClear'),count:document.getElementById('faqSearchCount'),list:document.getElementById('faq-list'),categories:document.getElementById('faq-category-list')}}
function normalizeCategory(value){return String(value||'').trim()||'기타';}

function ensureCustomerCenterLabels(){
  const tab=document.getElementById('tab-faq');
  if(tab)tab.textContent='자주 묻는 질문';
  const searchLabel=document.querySelector('label[for="faqSearch"]');
  if(searchLabel)searchLabel.textContent='자주 묻는 질문 검색';
}

function ensureCategoryArea(){
  const list=document.getElementById('faq-list');
  if(!list||document.getElementById('faq-category-list'))return;
  const wrap=document.createElement('div');
  wrap.className='mb-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4';
  wrap.innerHTML=`
    <div class="flex items-center gap-2 mb-3 px-1">
      <span class="w-7 h-7 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center text-emerald-600"><i class="fas fa-layer-group text-xs"></i></span>
      <div>
        <h3 class="text-sm font-black text-slate-800 leading-none">질문 분류</h3>
        <p class="text-[11px] text-slate-400 mt-1">원하는 항목을 선택하세요</p>
      </div>
    </div>
    <div id="faq-category-list" class="flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible" style="scrollbar-width:none"></div>`;
  list.parentNode.insertBefore(wrap,list);
}

function getCategories(){
  const seen=new Set();
  cachedFaqs.forEach(item=>seen.add(normalizeCategory(item.category)));
  return Array.from(seen);
}
function categoryCount(category){return category==='전체'?cachedFaqs.length:cachedFaqs.filter(item=>normalizeCategory(item.category)===category).length;}

function renderCategories(){
  ensureCategoryArea();
  const {categories}=getEls();
  if(!categories)return;
  const values=['전체',...getCategories()];
  if(!values.includes(selectedCategory))selectedCategory='전체';
  categories.innerHTML=values.map((category,index)=>{
    const active=category===selectedCategory;
    return `<button type="button" data-faq-category-index="${index}" aria-pressed="${active}" class="shrink-0 inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] font-bold transition-all duration-200 ${active?'border-emerald-600 bg-white text-emerald-700 shadow-[0_2px_10px_rgba(15,118,110,0.10)] ring-1 ring-emerald-100':'border-transparent bg-transparent text-slate-500 hover:bg-white hover:border-slate-200 hover:text-slate-800'}"><span>${esc(category)}</span><span class="min-w-[20px] h-5 px-1.5 rounded-md flex items-center justify-center text-[10px] font-black ${active?'bg-emerald-600 text-white':'bg-slate-200/70 text-slate-500'}">${categoryCount(category)}</span></button>`;
  }).join('');
  categories.querySelectorAll('[data-faq-category-index]').forEach(btn=>btn.addEventListener('click',()=>{
    selectedCategory=values[Number(btn.dataset.faqCategoryIndex)]||'전체';
    renderCategories();renderFaqList();
  }));
}

function bindAccordion(root){
  root.querySelectorAll('[data-faq-toggle]').forEach(btn=>btn.addEventListener('click',()=>{
    const answer=btn.nextElementSibling;const icon=btn.querySelector('.fa-chevron-down');if(!answer)return;
    if(!answer.style.maxHeight){answer.style.maxHeight=answer.scrollHeight+'px';icon?.classList.add('rotate-180');}
    else{answer.style.maxHeight=null;icon?.classList.remove('rotate-180');}
  }));
}

function renderFaqList(){
  const {input,clear,count,list}=getEls();if(!input||!list)return;
  input.style.paddingLeft='3rem';input.style.paddingRight='3rem';
  const keyword=text(input.value);
  const rows=cachedFaqs.filter(item=>{const category=normalizeCategory(item.category);const categoryMatch=selectedCategory==='전체'||category===selectedCategory;const keywordMatch=!keyword||text((item.category||'')+' '+(item.keywords||'')+' '+(item.question||'')+' '+(item.answer||'')).includes(keyword);return categoryMatch&&keywordMatch;});
  if(clear)clear.classList.toggle('hidden',!keyword);
  if(count){if(!cachedFaqs.length)count.textContent='등록된 자주 묻는 질문이 없습니다.';else if(keyword||selectedCategory!=='전체')count.textContent=`현재 ${rows.length}개 / 전체 ${cachedFaqs.length}개 질문이 표시됩니다.`;else count.textContent=`전체 ${cachedFaqs.length}개의 자주 묻는 질문이 표시됩니다.`;}
  if(!rows.length){list.innerHTML='<div class="p-12 text-center text-slate-400 bg-slate-50 text-sm">'+((keyword||selectedCategory!=='전체')?'조건에 맞는 질문이 없습니다.':'등록된 자주 묻는 질문이 없습니다.')+'</div>';return;}
  list.innerHTML=rows.map(data=>`
    <div class="bg-white" data-search="${esc((data.category||'')+' '+(data.keywords||''))}">
      <button data-faq-toggle class="w-full px-5 sm:px-8 py-5 text-left flex justify-between items-center focus:outline-none hover:bg-slate-50 transition-colors group">
        <span class="font-bold text-slate-700 group-hover:text-brand-600 text-base flex items-center min-w-0">
          <span class="bg-brand-100 text-brand-600 text-xs font-extrabold px-2 py-1 rounded mr-3 shrink-0">Q</span>
          <span class="min-w-0 break-words">${esc(data.question)}</span>
          <span class="ml-2 shrink-0 text-[10px] font-bold px-2 py-1 rounded-md border border-slate-200 bg-slate-50 text-slate-400">${esc(normalizeCategory(data.category))}</span>
        </span>
        <i class="fas fa-chevron-down text-slate-300 group-hover:text-brand-600 transition-transform duration-200 ml-3 shrink-0"></i>
      </button>
      <div class="faq-answer bg-slate-50 border-t border-slate-100"><div class="px-5 sm:px-8 py-6 text-slate-600 leading-relaxed whitespace-pre-wrap sm:pl-16 text-sm"><span class="font-bold text-slate-800 mr-2 text-base">A.</span> ${esc(data.answer)}</div></div>
    </div>`).join('');
  bindAccordion(list);
}

async function loadFaqs(){
  const {list}=getEls();if(!list)return;
  try{let q=query(collection(db,'faq'),orderBy('order','asc'));try{await getDocs(query(collection(db,'faq'),limit(1)));}catch(e){q=query(collection(db,'faq'),orderBy('createdAt','desc'));}const snap=await getDocs(q);cachedFaqs=[];snap.forEach(d=>{const data=d.data()||{};if(data.isActive===false)return;cachedFaqs.push({id:d.id,...data});});renderCategories();renderFaqList();}catch(e){console.warn('[faq] public render failed:',e);}
}

ready(function(){ensureCustomerCenterLabels();ensureCategoryArea();const {input,clear}=getEls();if(input)input.addEventListener('input',renderFaqList);if(clear)clear.addEventListener('click',function(){input.value='';input.focus();renderFaqList();});setTimeout(loadFaqs,200);setTimeout(loadFaqs,1200);});
