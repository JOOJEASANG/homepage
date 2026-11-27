// Standard single-signature saddle-stitch imposition. Null denotes a padded blank.
export function bookletPlan(pages,direction='left'){
 if(!Number.isInteger(pages)||pages<1||pages>1000)throw new RangeError('총 페이지 수를 1~1000 사이의 정수로 입력해 주세요.');
 if(!['left','right'].includes(direction))throw new RangeError('읽는 방향을 확인해 주세요.');
 const total=Math.ceil(pages/4)*4, count=total/4;
 const pair=(a,b)=>(direction==='right'?[b,a]:[a,b]).map(n=>n>pages?null:n);
 const sheets=Array.from({length:count},(_,i)=>({number:i+1,front:pair(total-2*i,1+2*i),back:pair(2+2*i,total-1-2*i)}));
 return {pages,total,count,blanks:total-pages,sheets};
}
if(typeof document!=='undefined'){
 const $=id=>document.getElementById(id);
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};
 function draw(){
  const error=$('booklet-error'),root=$('booklet-sheets'),metrics=$('booklet-metrics'),input=$('booklet-pages');
  root.replaceChildren();let plan;
  try{plan=bookletPlan(input.valueAsNumber,$('booklet-direction').value);}
  catch(e){error.textContent=e.message;error.hidden=false;metrics.hidden=true;input.setAttribute('aria-invalid','true');return;}
  error.hidden=true;metrics.hidden=false;input.removeAttribute('aria-invalid');
  $('booklet-total').textContent=plan.total+'쪽';$('booklet-count').textContent=plan.count+'장';$('booklet-blanks').textContent=plan.blanks+'쪽';
  const fragment=document.createDocumentFragment();
  for(const sheet of plan.sheets){
   const card=el('article','booklet-sheet');card.append(el('h2','',sheet.number+'번 용지'+(sheet.number===1?' · 가장 바깥쪽':sheet.number===plan.count?' · 가장 안쪽':'')));
   const faces=el('div','booklet-faces');
   for(const [name,label] of [['front','앞면'],['back','뒷면']]){
    const face=el('section','booklet-face');face.dataset.face=name;face.append(el('h3','',label));const spread=el('div','booklet-spread');
    for(const page of sheet[name]){const cell=el('div','booklet-page'+(page===null?' is-blank':''),page===null?'빈 페이지':page);cell.setAttribute('aria-label',page===null?'빈 페이지':page+'쪽');spread.append(cell);}
    face.append(spread);faces.append(face);
   }
   card.append(faces);fragment.append(card);
  }
  root.append(fragment);
 }
 $('booklet-pages').addEventListener('input',draw);$('booklet-direction').addEventListener('change',draw);draw();
}
