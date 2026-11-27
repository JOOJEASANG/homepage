import {layoutGeometry,sourcePlacement} from './layout-model.js';
const PT=72/25.4;
const PDF_LIB='https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js';
let engine;
async function getEngine(){
 if(!engine)engine=import(PDF_LIB).catch(()=>{engine=null;throw Error('PDF 저장 모듈을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');});
 return engine;
}
// SVG coordinates are top-down; PDF coordinates are bottom-up.
export function centeredPlacement(cell,sheetHeight,placement,clockwise){
 const theta=-clockwise*Math.PI/180,turned=((clockwise%360+360)%360)%180!==0;
 const width=(turned?placement.h:placement.w)*PT,height=(turned?placement.w:placement.h)*PT;
 const cx=(cell.x+cell.w/2)*PT,cy=(sheetHeight-cell.y-cell.h/2)*PT;
 return {x:cx-(Math.cos(theta)*width-Math.sin(theta)*height)/2,y:cy-(Math.sin(theta)*width+Math.cos(theta)*height)/2,width,height,angle:-clockwise};
}
async function embedSource(out,lib,slot,cache){
 const {source,page}=slot;const file=source.file;
 if(!file)throw Error('원본 파일을 다시 선택해 주세요.');
 if(source.kind==='pdf'){
  let doc=cache.get(file);
  if(!doc){doc=await lib.PDFDocument.load(await file.arrayBuffer(),{ignoreEncryption:false,updateMetadata:false});cache.set(file,doc);}
  const original=doc.getPage(page-1),media=original.getMediaBox(),crop=original.getCropBox();
  const left=Math.max(media.x,crop.x),bottom=Math.max(media.y,crop.y),right=Math.min(media.x+media.width,crop.x+crop.width),top=Math.min(media.y+media.height,crop.y+crop.height);
  if(!(right>left&&top>bottom))throw Error('PDF 페이지 표시 영역이 올바르지 않습니다.');
  const rotation=((original.getRotation().angle%360)+360)%360;
  if(rotation%90)throw Error('지원하지 않는 PDF 페이지 회전입니다.');
  const userUnit=original.node.get(lib.PDFName.of('UserUnit'));
  if(userUnit&&Number(userUnit.asNumber?.())!==1)throw Error('특수 PDF 단위(UserUnit)는 아직 저장을 지원하지 않습니다.');
  const expectedW=(rotation%180?top-bottom:right-left)/PT,expectedH=(rotation%180?right-left:top-bottom)/PT;
  if(Math.abs(expectedW-slot.preview.w)>.1||Math.abs(expectedH-slot.preview.h)>.1)throw Error('PDF 원본과 미리보기의 표시 크기가 다릅니다. 저장을 중단했습니다.');
  const embedded=await out.embedPage(original,{left,bottom,right,top});
  return {embedded,rotation,kind:'pdf'};
 }
 const ext=file.name.split('.').pop().toLowerCase();
 let embedded;
 if(ext==='png')embedded=await out.embedPng(await file.arrayBuffer());
 else if(['jpg','jpeg','webp'].includes(ext)){
  // Decode original dimensions, including browser-applied EXIF orientation, not the scaled preview.
  const bitmap=await createImageBitmap(file);
  try{
   if(bitmap.width>12000||bitmap.height>12000||bitmap.width*bitmap.height>60000000)throw Error('이미지 저장은 12,000px 및 6천만 화소 이하만 지원합니다.');
   const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
   canvas.getContext('2d').drawImage(bitmap,0,0);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   if(!blob)throw Error('원본 이미지 변환에 실패했습니다.');
   embedded=await out.embedPng(await blob.arrayBuffer());
  }finally{bitmap.close();}
 }else throw Error('지원하지 않는 이미지 형식입니다.');
 if(embedded.width!==source.pixels.w||embedded.height!==source.pixels.h)throw Error('원본 이미지와 미리보기의 픽셀 크기가 다릅니다.');
 return {embedded,rotation:0,kind:'image'};
}
export async function createLayoutPDF(settings,slots,providedEngine){
 if(!slots.front.source)throw Error('앞면 원본 파일을 먼저 선택해 주세요.');
 const faces=['front','back'].filter(name=>slots[name].source);
 for(const name of faces){
  if(!slots[name].preview)throw Error('원본 미리보기가 준비된 뒤 저장해 주세요.');
  const g=layoutGeometry(settings,name==='back');
  if(g.x<g.edge-.01||g.y<g.edge-.01)throw Error('배치가 용지의 지정 여백을 벗어납니다. 규격 또는 배치 수를 줄여 주세요.');
 }
 const lib=providedEngine||await getEngine(),out=await lib.PDFDocument.create(),cache=new Map();
 out.setTitle('Print Studio layout');
 for(const name of faces){
  const slot=slots[name],g=layoutGeometry(settings,name==='back'),p=sourcePlacement(slot.preview,g,slot.fit,slot.rotation);
  const src=await embedSource(out,lib,slot,cache),sheet=out.addPage([g.sw*PT,g.sh*PT]);
  for(const c of g.cells){
   const pos=centeredPlacement(c,g.sh,p,slot.rotation+src.rotation),opts={x:pos.x,y:pos.y,width:pos.width,height:pos.height,rotate:lib.degrees(pos.angle)};
   sheet.pushOperators(lib.pushGraphicsState(),lib.rectangle(c.x*PT,(g.sh-c.y-c.h)*PT,c.w*PT,c.h*PT),lib.clip(),lib.endPath());
   if(src.kind==='pdf')sheet.drawPage(src.embedded,opts);else sheet.drawImage(src.embedded,opts);
   sheet.pushOperators(lib.popGraphicsState());
  }
 }
 return out.save();
}
