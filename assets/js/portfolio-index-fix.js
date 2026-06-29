import { db, doc, onSnapshot } from './firebase.js';

function esc(v){return String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function currentFile(){try{return (location.pathname||'').split('/').pop()||'index.html';}catch(e){return 'index.html';}}

function getRawList(data){
  if(!data||typeof data!=='object')return [];
  if(Array.isArray(data.portfolio))return data.portfolio;
  if(Array.isArray(data.portfolios))return data.portfolios;
  if(Array.isArray(data.portfolioList))return data.portfolioList;
  if(data.portfolio&&Array.isArray(data.portfolio.items))return data.portfolio.items;
  if(data.portfolio&&typeof data.portfolio==='object')return Object.values(data.portfolio);
  return [];
}

function normalizeItem(x){
  if(!x)return null;
  if(typeof x==='string')return {imageUrl:x,title:'',description:''};
  if(typeof x!=='object')return null;
  const imageUrl=x.imageUrl||x.imageURL||x.url||x.src||x.image||x.photoUrl||x.downloadURL||x.thumbnail||'';
  const title=x.title||x.name||x.label||'';
  const description=x.description||x.desc||x.memo||'';
  if(!imageUrl&&!title&&!description)return null;
  return {imageUrl:String(imageUrl||''),title:String(title||''),description:String(description||'')};
}

function normalizedList(data){
  return getRawList(data).map(normalizeItem).filter(Boolean).filter(x=>x.imageUrl&&!/placehold\.co/i.test(x.imageUrl));
}

function ensureModal(){
  return {
    modal:document.getElementById('portfolio-image-modal'),
    img:document.getElementById('portfolio-image-img'),
    title:document.getElementById('portfolio-image-title'),
    desc:document.getElementById('portfolio-image-desc'),
    close:document.getElementById('close-portfolio-image-modal-btn'),
    prev:document.getElementById('portfolio-modal-prev'),
    next:document.getElementById('portfolio-modal-next')
  };
}

function renderModal(){
  const m=ensureModal();
  const list=window.__portfolioAllFixed||[];
  const item=list[window.__portfolioFixedIndex||0];
  if(!item||!m.modal)return;
  if(m.img)m.img.src=item.imageUrl;
  if(m.title)m.title.textContent=item.title||'Portfolio';
  if(m.desc)m.desc.textContent=item.description||'';
}
function openModal(idx){
  const list=window.__portfolioAllFixed||[];
  if(!list.length)return;
  window.__portfolioFixedIndex=(idx%list.length+list.length)%list.length;
  const m=ensureModal();
  renderModal();
  if(m.modal){m.modal.classList.remove('hidden');m.modal.classList.add('flex');}
  if(!window.__portfolioFixedModalBound){
    window.__portfolioFixedModalBound=true;
    const close=()=>{const mm=ensureModal();if(mm.img)mm.img.src='';if(mm.modal){mm.modal.classList.add('hidden');mm.modal.classList.remove('flex');}};
    m.close?.addEventListener('click',close);
    m.modal?.addEventListener('click',e=>{if(e.target===m.modal)close();});
    m.prev?.addEventListener('click',e=>{e.stopPropagation();const a=window.__portfolioAllFixed||[];if(a.length){window.__portfolioFixedIndex=(window.__portfolioFixedIndex-1+a.length)%a.length;renderModal();}});
    m.next?.addEventListener('click',e=>{e.stopPropagation();const a=window.__portfolioAllFixed||[];if(a.length){window.__portfolioFixedIndex=(window.__portfolioFixedIndex+1)%a.length;renderModal();}});
  }
}

function renderPager(pager,page,total,renderPage){
  if(!pager)return;
  if(total<=1){pager.classList.add('hidden');pager.innerHTML='';return;}
  pager.classList.remove('hidden');pager.innerHTML='';
  const mk=(txt,n,on)=>{const b=document.createElement('button');b.textContent=txt;b.className='w-8 h-8 flex items-center justify-center rounded border text-xs font-bold '+(on?'bg-slate-800 text-white border-slate-800':'bg-white text-slate-500 border-slate-200 hover:bg-slate-50');b.onclick=()=>renderPage(n);return b;};
  if(page>1)pager.appendChild(mk('<',page-1,false));
  for(let i=1;i<=total;i++)pager.appendChild(mk(String(i),i,i===page));
  if(page<total)pager.appendChild(mk('>',page+1,false));
}

function renderGrid(page=1){
  const grid=document.getElementById('portfolio-grid');
  const pager=document.getElementById('portfolio-page-controls');
  if(!grid)return;
  const list=window.__portfolioAllFixed||[];
  const per=10;
  const total=Math.max(1,Math.ceil(list.length/per));
  const safe=Math.min(Math.max(1,page),total);
  window.__portfolioFixedPage=safe;
  if(!list.length){grid.innerHTML='<div class="col-span-full text-center py-10 text-slate-300 text-sm">등록된 포트폴리오가 없습니다.</div>';renderPager(pager,1,1,renderGrid);return;}
  const start=(safe-1)*per;
  grid.innerHTML='';
  list.slice(start,start+per).forEach((item,i)=>{
    const title=(item.title||'작업 포트폴리오').trim();
    const desc=(item.description||'').trim();
    const div=document.createElement('div');
    div.className='group relative aspect-square bg-slate-100 border border-slate-200 overflow-hidden cursor-pointer rounded-sm';
    div.title=title;
    div.innerHTML='<img src="'+esc(item.imageUrl)+'" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt="'+esc(title)+'"><div class="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-slate-950/90 via-slate-950/55 to-transparent"><p class="text-white text-sm font-black truncate">'+esc(title)+'</p>'+(desc?'<p class="text-white/75 text-[11px] truncate mt-0.5">'+esc(desc)+'</p>':'')+'</div><div class="absolute inset-0 bg-slate-900/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><span class="text-white font-bold border border-white px-3 py-1 text-xs uppercase tracking-widest">View</span></div>';
    div.onclick=()=>openModal(start+i);
    grid.appendChild(div);
  });
  renderPager(pager,safe,total,renderGrid);
}

function start(){
  if(!['','index.html'].includes(currentFile()))return;
  const grid=document.getElementById('portfolio-grid');
  if(!grid)return;
  if(window.__portfolioIndexFixUnsub)try{window.__portfolioIndexFixUnsub();}catch(e){}
  window.__portfolioIndexFixUnsub=onSnapshot(doc(db,'settings','homepageContent'),snap=>{
    const list=normalizedList(snap.exists()?snap.data():{}).reverse();
    window.__portfolioAllFixed=list;
    renderGrid(window.__portfolioFixedPage||1);
  },err=>{console.error('[portfolio-index-fix]',err);grid.innerHTML='<div class="col-span-full text-center py-10 text-red-300 text-sm">포트폴리오를 불러오지 못했습니다.</div>';});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
