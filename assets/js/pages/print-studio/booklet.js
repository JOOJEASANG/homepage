// Single-signature saddle-stitch. The outer sheet always contains four cover faces.
// Included: source pages 1,2,n-1,n are the cover. Excluded: inner pages are numbered from 1.
export function bookletPlan(pages,direction='left',cover='included'){
 if(!['included','excluded'].includes(cover))throw new RangeError('표지 구성을 확인해 주세요.');
 const min=cover==='included'?4:1;
 if(!Number.isInteger(pages)||pages<min||pages>1000)throw new RangeError('페이지 수를 '+min+'~1000 사이의 정수로 입력해 주세요.');
 if(!['left','right'].includes(direction))throw new RangeError('제본 방향을 확인해 주세요.');
 const inner=cover==='included'?pages-4:pages,blanks=(4-inner%4)%4,total=inner+blanks+4,count=total/4;
 const covers=cover==='included'?[1,2,pages-1,pages]:['cover1','cover2','cover3','cover4'];
 const sequence=[covers[0],covers[1],...Array.from({length:inner},(_,i)=>i+(cover==='included'?3:1)),...Array(blanks).fill(null),covers[2],covers[3]];
 const pair=(a,b)=>(direction==='right'?[b,a]:[a,b]).map(n=>sequence[n-1]);
 const sheets=Array.from({length:count},(_,i)=>({number:i+1,front:pair(total-2*i,1+2*i),back:pair(2+2*i,total-1-2*i)}));
 const coverLabels=Object.fromEntries(covers.map((p,i)=>[p,['앞표지','앞표지 안쪽','뒤표지 안쪽','뒤표지'][i]]));
 return {pages,cover,total,count,innerCount:count-1,blanks,sheets,coverLabels};
}
if(typeof document!=='undefined'){
 const $=id=>document.getElementById(id);
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};
 function draw(){
  const error=$('booklet-error'),root=$('booklet-sheets'),metrics=$('booklet-metrics'),input=$('booklet-pages'),cover=$('booklet-cover').value,included=cover==='included';
  input.min=included?'4':'1';
  $('booklet-input-label').textContent=included?'총 페이지 수 (표지 포함)':'내지 페이지 수 (표지 미포함)';
  $('booklet-cover-note').textContent=included?'입력한 원고의 첫 두 쪽과 마지막 두 쪽을 표지로 사용합니다. 빈 페이지는 뒤표지 안쪽 앞에 추가합니다.':'입력한 내지에 별도 표지 4쪽(1장)을 추가합니다. 내지 번호는 1쪽부터 표시하고 부족한 페이지는 내지 끝에 추가합니다.';
  root.replaceChildren();let plan;
  try{plan=bookletPlan(input.valueAsNumber,$('booklet-direction').value,cover);}
  catch(e){error.textContent=e.message;error.hidden=false;metrics.hidden=true;input.setAttribute('aria-invalid','true');return;}
  error.hidden=true;metrics.hidden=false;input.removeAttribute('aria-invalid');
  $('booklet-total').textContent=plan.total+'쪽';$('booklet-count').textContent=plan.count+'장';$('booklet-cover-count').textContent='1장';$('booklet-inner-count').textContent=plan.innerCount+'장';$('booklet-blanks').textContent=plan.blanks+'쪽';
  const fragment=document.createDocumentFragment();
  for(const sheet of plan.sheets){
   const card=el('article','booklet-sheet'+(sheet.number===1?' cover-sheet':''));
   card.append(el('h2','',sheet.number+'번 용지'+(sheet.number===1?' · 표지 (가장 바깥쪽)':sheet.number===plan.count?' · 내지 (가장 안쪽)':' · 내지 '+(sheet.number-1))));
   const faces=el('div','booklet-faces');
   for(const [name,label] of [['front','앞면'],['back','뒷면']]){
    const face=el('section','booklet-face');face.dataset.face=name;face.append(el('h3','',label));const spread=el('div','booklet-spread');
    for(const page of sheet[name]){
     const coverLabel=page===null?null:plan.coverLabels[page],blank=page===null,numbered=typeof page==='number';
     const cell=el('div','booklet-page'+(blank?' is-blank':coverLabel?' is-cover':''));
     if(blank)cell.textContent='빈 페이지';
     else if(numbered){cell.append(el('span','page-number',page));if(coverLabel)cell.append(el('span','cover-label',coverLabel));}
     else cell.append(el('span','cover-label cover-label-only',coverLabel));
     cell.setAttribute('aria-label',blank?'빈 페이지':(numbered?page+'쪽':'')+(coverLabel?' '+coverLabel:''));
     spread.append(cell);
    }
    face.append(spread);faces.append(face);
   }
   card.append(faces);fragment.append(card);
  }
  root.append(fragment);
 }
 $('booklet-pages').addEventListener('input',draw);$('booklet-direction').addEventListener('change',draw);$('booklet-cover').addEventListener('change',draw);draw();
}
