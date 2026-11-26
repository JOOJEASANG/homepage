// Chat attachments only: never render untrusted HTML or delete another order's object.
const BUCKETS = new Set(['worklist-1e83a.firebasestorage.app','worklist-1e83a.appspot.com']);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
function parseFileUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    let bucket, object;
    if (u.hostname === 'firebasestorage.googleapis.com') {
      const match = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
      if (!match) return null;
      [,bucket,object] = match;
    } else if (u.hostname === 'storage.googleapis.com') {
      const match = u.pathname.match(/^\/([^/]+)\/(.+)$/);
      if (!match) return null;
      [,bucket,object] = match;
    } else return null;
    if (!BUCKETS.has(bucket)) return null;
    return {url:u.href, path:decodeURIComponent(object)};
  } catch { return null; }
}
export const safeChatFileUrl = value => parseFileUrl(value)?.url || '';
export function quoteAttachmentStoragePath(quoteId, item) {
  const parsed=parseFileUrl(item?.url);
  const path=String(item?.path || parsed?.path || '');
  const parts=path.split('/');
  if(parts.length!==4 || parts[0]!=='quotes' || parts[1]!==quoteId || parts[2]!=='attachments' || !parts[3] || ['.','..'].includes(parts[3]))return '';
  if(item?.url && (!parsed || parsed.path!==path))return '';
  return path;
}
export function chatStoragePath(quoteId, msg) {
  const parsed = parseFileUrl(msg?.fileURL);
  const path = String(msg?.filePath || parsed?.path || '');
  const parts = path.split('/');
  if (!quoteId || parts[0] !== 'quotes' || parts[1] !== quoteId || parts.some(part=>!part || part==='.' || part==='..')) return '';
  if (parts.length !== 3 && !(parts.length === 4 && parts[2] === 'admin' && msg.sender === 'admin')) return '';
  if (msg.sender !== 'admin' && msg.sender !== 'customer') return '';
  if (msg.fileURL && (!parsed || parsed.path !== path)) return '';
  return path;
}
export const isChatImage = msg => /\.(?:jpe?g|png|gif|webp)$/i.test(String(msg?.fileName || '')) && !!safeChatFileUrl(msg?.fileURL);
export function renderChatImage(msg) {
  if (!isChatImage(msg)) return '';
  const url = esc(safeChatFileUrl(msg.fileURL)), name = esc(msg.fileName);
  return '<button type="button" class="chat-image-preview" data-chat-preview="'+url+'" data-chat-message="'+esc(msg.id)+'" data-chat-name="'+name+'" aria-label="이미지 크게 보기: '+name+'"><img src="'+url+'" alt="'+name+'" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span>크게 보기</span></button>';
}
export function renderChatAttachment(msg) {
  const name = esc(msg.fileName || '첨부파일'), url = safeChatFileUrl(msg.fileURL);
  const proof = msg.isProof ? '<span class="chat-proof-tag">시안 · '+(msg.proofStatus==='approved'?'승인됨':msg.proofStatus==='rejected'?'수정 요청':'확인 대기')+'</span>' : '';
  const link = url ? '<a class="chat-file-download" href="'+esc(url)+'" data-force-download="1" download="'+name+'"><i class="fas fa-download" aria-hidden="true"></i> '+name+'</a>' : '<span>'+name+' (파일 주소 확인 필요)</span>';
  return '<div class="chat-attachment-content">'+proof+renderChatImage(msg)+link+(msg.text?'<p class="chat-file-caption">'+esc(msg.text)+'</p>':'')+'</div>';
}
let viewer;
export function bindChatImageViewer() {
  if (typeof document === 'undefined' || document.documentElement.dataset.chatImageViewer) return;
  document.documentElement.dataset.chatImageViewer='1';
  document.addEventListener('click', event => {
    const trigger=event.target.closest?.('[data-chat-preview]');
    if (!trigger) return;
    const url=safeChatFileUrl(trigger.dataset.chatPreview);
    if(!url) return;
    if(!viewer) {
      viewer=document.createElement('dialog');
      viewer.className='chat-image-dialog';
      viewer.setAttribute('aria-label','첨부 이미지 크게 보기');
      viewer.innerHTML='<div class="chat-image-dialog-bar"><strong></strong><button type="button" aria-label="이미지 닫기">×</button></div><img alt=""><p class="chat-image-error" hidden>이미지를 불러오지 못했습니다. 파일 다운로드를 이용해 주세요.</p>';
      viewer.querySelector('button').addEventListener('click',()=>viewer.close());
      viewer.addEventListener('click',e=>{if(e.target===viewer)viewer.close();});
      viewer.addEventListener('close',()=>{viewer.querySelector('img').removeAttribute('src');viewer.dataset.messageId='';});
      const image=viewer.querySelector('img');
      image.addEventListener('error',()=>{viewer.querySelector('p').hidden=false;});
      image.addEventListener('load',()=>{viewer.querySelector('p').hidden=true;});
      document.body.append(viewer);
    }
    viewer.dataset.messageId=trigger.dataset.chatMessage||'';
    viewer.querySelector('strong').textContent=trigger.dataset.chatName||'첨부 이미지';
    viewer.querySelector('p').hidden=true;
    const image=viewer.querySelector('img');
    image.alt=trigger.dataset.chatName||'첨부 이미지';
    image.referrerPolicy='no-referrer';image.src=url;
    if(!viewer.open)viewer.showModal();
  });
}
export function syncChatImageViewer(messages) {
  if(viewer?.open && !messages.some(m=>m.id===viewer.dataset.messageId && m.type==='file')) viewer.close();
}
// Delete the object first; do not report success or remove the record on Storage denial.
export async function deleteChatAttachment({quoteId,msg,deleteStorage,deleteRecord}) {
  if(msg?.type!=='file') throw Error('파일 메시지를 찾을 수 없습니다.');
  const path=chatStoragePath(quoteId,msg);
  if(!path) throw Error('파일 경로를 확인할 수 없습니다.');
  try { await deleteStorage(path); }
  catch(error) { if(error?.code!=='storage/object-not-found') throw error; }
  await deleteRecord();
}
