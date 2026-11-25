// ZIP32, stored (uncompressed), UTF-8 names. No third-party CDN or server copies.
// Sequential fetches and chunked CRC keep transient memory below the total archive size.
const LIMIT = 600 * 1024 * 1024;
const encoder = new TextEncoder();
const CRC_TABLE = Uint32Array.from({length:256}, (_, n) => {
  let c = n;
  for(let i=0;i<8;i++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  return c >>> 0;
});
async function crc32(blob) {
  let crc = 0xffffffff;
  for(let start=0;start<blob.size;start+=4*1024*1024) {
    const bytes=new Uint8Array(await blob.slice(start,start+4*1024*1024).arrayBuffer());
    for(const byte of bytes) crc=CRC_TABLE[(crc^byte)&255]^(crc>>>8);
  }
  return (crc^0xffffffff)>>>0;
}
function safeName(value) {
  return String(value || '첨부파일').replace(/[\\/\u0000-\u001f\u007f<>:"|?*]/g,'_').replace(/^\.+|[. ]+$/g,'').slice(0,160) || '첨부파일';
}
function uniqueName(value, used) {
  const name=safeName(value);
  const dot=name.lastIndexOf('.');
  const stem=dot>0?name.slice(0,dot):name, ext=dot>0?name.slice(dot):'';
  let candidate=name, n=2;
  while(used.has(candidate.toLowerCase())) candidate=stem+' ('+(n++)+')'+ext;
  used.add(candidate.toLowerCase()); return candidate;
}
function header(size, signature) {
  const bytes=new Uint8Array(size), view=new DataView(bytes.buffer);
  view.setUint32(0,signature,true); return {bytes,view};
}
export async function buildAttachmentZip(entries) {
  if(!entries.length || entries.length>65535) throw Error('압축할 파일 수를 확인해 주세요.');
  let total=0,offset=0,centralSize=0;
  const local=[],central=[],used=new Set();
  for(const {name,blob} of entries) {
    total+=blob.size;
    if(total>LIMIT) throw Error('전체 용량이 600MB를 초과합니다. 개별 다운로드를 이용해 주세요.');
    const filename=encoder.encode(uniqueName(name,used)), crc=await crc32(blob);
    const h=header(30,0x04034b50), v=h.view;
    v.setUint16(4,20,true); v.setUint16(6,0x800,true); v.setUint16(12,0x21,true);
    v.setUint32(14,crc,true); v.setUint32(18,blob.size,true); v.setUint32(22,blob.size,true); v.setUint16(26,filename.length,true);
    local.push(h.bytes,filename,blob);
    const ch=header(46,0x02014b50), cv=ch.view;
    cv.setUint16(4,20,true); cv.setUint16(6,20,true); cv.setUint16(8,0x800,true); cv.setUint16(14,0x21,true);
    cv.setUint32(16,crc,true); cv.setUint32(20,blob.size,true); cv.setUint32(24,blob.size,true); cv.setUint16(28,filename.length,true); cv.setUint32(42,offset,true);
    central.push(ch.bytes,filename); centralSize+=46+filename.length; offset+=30+filename.length+blob.size;
  }
  const e=header(22,0x06054b50);
  e.view.setUint16(8,entries.length,true); e.view.setUint16(10,entries.length,true); e.view.setUint32(12,centralSize,true); e.view.setUint32(16,offset,true);
  return new Blob([...local,...central,e.bytes],{type:'application/zip'});
}
function attachmentUrl(value) {
  const url=new URL(value);
  const buckets=['worklist-1e83a.firebasestorage.app','worklist-1e83a.appspot.com'];
  if(url.protocol!=='https:' || url.username || url.password) throw Error('지원하지 않는 파일 주소입니다.');
  if(url.hostname==='firebasestorage.googleapis.com' && buckets.some(b=>url.pathname.startsWith('/v0/b/'+b+'/o/'))) return url.href;
  if(url.hostname==='storage.googleapis.com' && buckets.some(b=>url.pathname.startsWith('/'+b+'/'))) return url.href;
  throw Error('지원하지 않는 파일 주소입니다. 개별 다운로드를 이용해 주세요.');
}
export async function downloadAttachmentZip(files, receipt, progress=()=>{}) {
  if(files.length<2) throw Error('전체 다운로드할 파일이 없습니다.');
  if(files.reduce((sum,f)=>sum+Math.max(0,Number(f.size)||0),0)>LIMIT) throw Error('전체 용량이 600MB를 초과합니다. 개별 다운로드를 이용해 주세요.');
  const entries=[]; let total=0;
  for(const [i,file] of files.entries()) {
    progress('파일 가져오는 중 ('+(i+1)+'/'+files.length+')');
    try {
      const response=await fetch(attachmentUrl(file.url),{mode:'cors',credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok) throw Error('HTTP '+response.status);
      const blob=await response.blob();
      total+=blob.size;
      if(total>LIMIT) throw Error('LIMIT');
      entries.push({name:file.name,blob});
    } catch(error) {
      if(error.message==='LIMIT') throw Error('전체 용량이 600MB를 초과합니다. 개별 다운로드를 이용해 주세요.');
      throw Error('파일 '+(i+1)+'개째 다운로드 실패. 개별 다운로드를 이용해 주세요.');
    }
  }
  progress('ZIP 파일 만드는 중…');
  const zip=await buildAttachmentZip(entries);
  const url=URL.createObjectURL(zip);
  const link=document.createElement('a');
  link.href=url;link.download=safeName(receipt)+'_첨부파일.zip';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
