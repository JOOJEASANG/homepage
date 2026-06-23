function go(url){location.href=url}
function btn(id,label,url){var b=document.createElement('button');b.id=id;b.type='button';b.className='dropdown-item';b.textContent=label;b.onclick=function(){go(url)};return b}
function mbtn(id,label,url){var b=document.createElement('button');b.id=id;b.type='button';b.className='mobile-menu-item';b.textContent=label;b.onclick=function(){go(url)};return b}
function run(){
  var file=(location.pathname||'').split('/').pop()||''; if(file!=='admin.html')return;
  var home=document.getElementById('homepage-management-btn');
  var maint=document.getElementById('maintenance-mode-btn');
  var menu=(home&&home.closest('.nav-dropdown-menu'))||(maint&&maint.closest('.nav-dropdown-menu'));
  if(menu){
    if(!document.getElementById('cc-admin-title')){var t=document.createElement('div');t.id='cc-admin-title';t.className='px-4 py-2 text-xs font-black text-slate-400 border-t border-slate-100 mt-1';t.textContent='고객센터 관리';(maint||home||menu.lastElementChild).insertAdjacentElement('beforebegin',t)}
    var anchor=document.getElementById('cc-admin-title');
    if(!document.getElementById('cc-faq-btn'))anchor.insertAdjacentElement('afterend',btn('cc-faq-btn','FAQ 관리','admin-faq.html'));
    if(!document.getElementById('cc-ai-btn'))document.getElementById('cc-faq-btn').insertAdjacentElement('afterend',btn('cc-ai-btn','AI 상담 관리','admin-ai-chat.html'));
    if(!document.getElementById('cc-pay-btn'))document.getElementById('cc-ai-btn').insertAdjacentElement('afterend',btn('cc-pay-btn','결제안내 관리','admin-payment-guide.html'));
  }
  var hm=document.querySelector('.mobile-menu-item[data-click="#homepage-management-btn"]');
  var mm=document.querySelector('.mobile-menu-item[data-click="#maintenance-mode-btn"]');
  var sec=(hm&&hm.closest('.mobile-menu-section'))||(mm&&mm.closest('.mobile-menu-section'));
  if(sec&&!document.getElementById('m-cc-faq-btn')){sec.appendChild(mbtn('m-cc-faq-btn','FAQ 관리','admin-faq.html'));sec.appendChild(mbtn('m-cc-ai-btn','AI 상담 관리','admin-ai-chat.html'));sec.appendChild(mbtn('m-cc-pay-btn','결제안내 관리','admin-payment-guide.html'));}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
setTimeout(run,500);setTimeout(run,1500);setTimeout(run,3000);
