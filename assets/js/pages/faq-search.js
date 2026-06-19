function ready(fn){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn,{once:true});else fn();}
function text(v){return String(v||'').toLowerCase().replace(/\s+/g,' ').trim();}
ready(function(){
  var input=document.getElementById('faqSearch');
  var clear=document.getElementById('faqSearchClear');
  var count=document.getElementById('faqSearchCount');
  var list=document.getElementById('faq-list');
  if(!input||!list)return;
  function items(){return Array.prototype.slice.call(list.children).filter(function(el){return el.querySelector&&el.querySelector('button')&&el.querySelector('.faq-answer');});}
  function removeEmpty(){var e=document.getElementById('faqSearchEmpty');if(e)e.remove();}
  function apply(){
    var q=text(input.value);var arr=items();var shown=0;removeEmpty();
    arr.forEach(function(el){var ok=!q||text(el.textContent).indexOf(q)>-1;el.classList.toggle('hidden',!ok);if(ok)shown++;});
    if(clear)clear.classList.toggle('hidden',!q);
    if(count)count.textContent=arr.length?(q?'검색 결과 '+shown+'개 / 전체 '+arr.length+'개':'전체 '+arr.length+'개 FAQ가 표시됩니다.'):'등록된 FAQ가 없습니다.';
    if(q&&arr.length&&shown===0){var d=document.createElement('div');d.id='faqSearchEmpty';d.className='p-12 text-center text-slate-400 bg-slate-50 text-sm';d.textContent='검색 결과가 없습니다.';list.appendChild(d);}
  }
  input.addEventListener('input',apply);
  if(clear)clear.addEventListener('click',function(){input.value='';input.focus();apply();});
  new MutationObserver(apply).observe(list,{childList:true});
  apply();
});
