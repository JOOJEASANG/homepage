export const PAPER_SIZES={A5:[148,210],B5:[182,257],A4:[210,297],B4:[257,364],A3:[297,420]};
export const TEMPLATES=['plain','report','education','classic','soft'];
export const FONTS={sans:'"Noto Sans KR","Malgun Gothic",sans-serif',serif:'"Noto Serif KR","Batang",serif'};
export const roundMm=n=>Math.round(n*100)/100;
const num=(v,min,max,label)=>{const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw Error(label+' 값을 확인해 주세요.');return n;};
export function coverGeometry(s){
  const w=num(s.width,30,482,'가로'),h=num(s.height,30,482,'세로'),b=num(s.bleed,0,10,'도련'),m=num(s.margin,0,30,'안전 여백');
  if(m*2>=Math.min(w,h))throw Error('안전 여백이 표지보다 넓습니다.');
  const pages=num(s.pages,0,3000,'내지 페이지 수'),sides=Number(s.sides)===1?1:2;
  if(!Number.isInteger(pages))throw Error('페이지 수는 정수로 입력해 주세요.');
  const sheets=Math.ceil(pages/sides),caliper=num(s.caliper,.03,1,'용지 한 장 두께'),adjust=num(s.adjust,0,10,'제본 보정');
  const spine=s.mode==='spread'?roundMm(s.spineMode==='manual'?num(s.manualSpine,0,200,'책등'):sheets*caliper+adjust):0;
  if(spine>200)throw Error('책등이 200mm를 초과합니다. 매장에 문의해 주세요.');
  const trimWidth=s.mode==='spread'?2*w+spine:w, totalWidth=roundMm(trimWidth+2*b),totalHeight=roundMm(h+2*b);
  return {w,h,b,m,sheets,spine,trimWidth,totalWidth,totalHeight,back:s.mode==='spread'?{x:b,y:b,w,h}:null,front:{x:b+(s.mode==='spread'?w+spine:0),y:b,w,h},spineRect:s.mode==='spread'?{x:b+w,y:b,w:spine,h}:null};
}
export function defaultCover(){
  return {version:1,size:'A4',width:210,height:297,mode:'spread',pages:200,sides:2,caliper:.1,adjust:0,spineMode:'auto',manualSpine:10,bleed:3,margin:10,frontTemplate:'report',backTemplate:'report',spineColor:'#dbe9e1',layers:[
    {id:'title',face:'front',text:'2026 교육 결과보고서',font:'sans',size:24,color:'#173c31',align:'center',bold:true,x:50,y:30,lineHeight:1.25},
    {id:'subtitle',face:'front',text:'교육 프로그램 운영 결과',font:'sans',size:12,color:'#475569',align:'center',bold:false,x:50,y:42,lineHeight:1.25},
    {id:'spine',face:'spine',text:'2026 교육 결과보고서',font:'sans',size:10,color:'#173c31',align:'center',bold:false,x:50,y:50,lineHeight:1.25}
  ]};
}
export function normalizeCover(raw){
  if(!raw||raw.version!==1||!Array.isArray(raw.layers)||raw.layers.length>60)throw Error('지원하지 않는 편집 파일입니다.');
  const d=defaultCover(),s={...d,...raw};s.mode=raw.mode==='front'?'front':'spread';s.size=Object.hasOwn(PAPER_SIZES,raw.size)?raw.size:'CUSTOM';s.spineMode=raw.spineMode==='manual'?'manual':'auto';
  if(s.size!=='CUSTOM') [s.width,s.height]=PAPER_SIZES[s.size];
  for(const key of ['frontTemplate','backTemplate'])s[key]=TEMPLATES.includes(s[key])?s[key]:'plain';
  s.spineColor=/^#[0-9a-f]{6}$/i.test(s.spineColor)?s.spineColor:d.spineColor;
  const ids=new Set();
  s.layers=raw.layers.map((l,i)=>{let id=String(l.id||'layer-'+i);if(ids.has(id))id='layer-'+i+'-'+ids.size;ids.add(id);return {id,face:['front','back','spine'].includes(l.face)?l.face:'front',text:String(l.text||'').slice(0,1200),font:Object.hasOwn(FONTS,l.font)?l.font:'sans',size:num(l.size,4,120,'글자 크기'),color:/^#[0-9a-f]{6}$/i.test(l.color)?l.color:'#222222',align:['left','center','right'].includes(l.align)?l.align:'center',bold:!!l.bold,x:num(l.x,0,100,'가로 위치'),y:num(l.y,0,100,'세로 위치'),lineHeight:num(l.lineHeight??1.25,.8,3,'줄 간격')};});
  coverGeometry(s);return s;
}
