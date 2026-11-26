// Pinned PDF.js version, loaded only when a PDF is selected. The file stays in browser memory.
const PDF_ROOT='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/';
const PDF_BASE=PDF_ROOT+'build/';
let engine;
async function pdfEngine(){
  if(!engine)engine=import(PDF_BASE+'pdf.min.mjs').then(pdf=>{pdf.GlobalWorkerOptions.workerSrc=PDF_BASE+'pdf.worker.min.mjs';return pdf;}).catch(e=>{engine=null;throw Error('PDF 미리보기 모듈을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');});
  return engine;
}
export async function openSource(file){
  if(!file||file.size>100*1024*1024)throw Error('파일은 100MB 이하만 확인할 수 있습니다.');
  const ext=file.name.split('.').pop().toLowerCase();
  if(ext==='pdf'){
    const pdf=await pdfEngine();
    const doc=await pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,enableXfa:false,disableFontFace:false,stopAtErrors:true,cMapUrl:PDF_ROOT+'cmaps/',cMapPacked:true,standardFontDataUrl:PDF_ROOT+'standard_fonts/'}).promise;
    return {kind:'pdf',doc,name:file.name,pages:doc.numPages};
  }
  if(!['jpg','jpeg','png','webp'].includes(ext))throw Error('PDF, JPG, PNG, WebP 파일을 선택해 주세요.');
  const bitmap=await createImageBitmap(file);
  const w=bitmap.width,h=bitmap.height,scale=Math.min(1,1800/Math.max(w,h));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  return {kind:'image',name:file.name,pages:1,pixels:{w,h},preview:canvas.toDataURL('image/png')};
}
export async function renderSource(source,pageNumber,dpi){
  if(source.kind==='image')return {...source,w:source.pixels.w*25.4/dpi,h:source.pixels.h*25.4/dpi};
  const page=await source.doc.getPage(pageNumber);
  const base=page.getViewport({scale:1}),scale=Math.min(2,1800/Math.max(base.width,base.height));
  const viewport=page.getViewport({scale}),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.ceil(viewport.width));canvas.height=Math.max(1,Math.ceil(viewport.height));
  await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
  const preview=canvas.toDataURL('image/png');page.cleanup?.();
  return {kind:'pdf',name:source.name,pages:source.pages,w:base.width*25.4/72,h:base.height*25.4/72,preview};
}
