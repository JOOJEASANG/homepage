import { auth, db, storage, doc, setDoc, ref, uploadBytesResumable, getDownloadURL } from './firebase.js';

const EDITOR_SIZE = 420;
const OUTPUT_SIZE = 1000;
let state = null;
let inputGuard = false;

function injectStyle() {
  if (document.getElementById('portfolio-crop-style')) return;
  const style = document.createElement('style');
  style.id = 'portfolio-crop-style';
  style.textContent = `
    #portfolio-list-admin .portfolio-item > .relative{aspect-ratio:1/1!important;height:auto!important;min-height:0!important;}
    #portfolio-list-admin .portfolio-image-preview{width:100%!important;height:100%!important;object-fit:cover!important;}
    #portfolio-list-admin .portfolio-item.is-new-portfolio{box-shadow:0 0 0 2px rgba(34,197,94,.22);}
    #portfolioCropModal{position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.72);display:none;align-items:center;justify-content:center;padding:18px;}
    #portfolioCropModal.open{display:flex;}
    .pcrop-box{width:min(94vw,620px);background:#fff;border-radius:24px;box-shadow:0 28px 80px rgba(15,23,42,.35);overflow:hidden;}
    .pcrop-head{padding:16px 18px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;gap:12px;}
    .pcrop-head b{font-size:16px;color:#0f172a}.pcrop-head p{font-size:12px;color:#64748b;margin-top:3px}.pcrop-close{width:34px;height:34px;border-radius:999px;border:1px solid #e2e8f0;background:#fff;color:#64748b;cursor:pointer;}
    .pcrop-body{padding:18px;background:#f8fafc}.pcrop-stage{width:min(100%,420px);aspect-ratio:1/1;margin:0 auto;border-radius:18px;overflow:hidden;background:#f8fafc;box-shadow:inset 0 0 0 1px rgba(15,23,42,.12);cursor:grab;touch-action:none;}.pcrop-stage:active{cursor:grabbing}.pcrop-stage canvas{width:100%;height:100%;display:block;}
    .pcrop-tools{margin:16px auto 0;width:min(100%,420px);display:grid;gap:10px}.pcrop-tools label{font-size:12px;font-weight:900;color:#475569}.pcrop-tools input[type=range]{width:100%;accent-color:#16a34a}.pcrop-hint{font-size:11px;color:#64748b;line-height:1.5}.pcrop-actions{display:flex;gap:10px;justify-content:flex-end;padding:14px 18px;border-top:1px solid #e2e8f0;background:#fff}.pcrop-btn{border:0;border-radius:12px;padding:10px 14px;font-weight:900;font-size:13px;cursor:pointer}.pcrop-cancel{background:#f1f5f9;color:#475569}.pcrop-save{background:#16a34a;color:#fff}.pcrop-save:disabled{opacity:.5;cursor:not-allowed}
  `;
  document.head.appendChild(style);
}

function modal() {
  let m = document.getElementById('portfolioCropModal');
  if (m) return m;
  m = document.createElement('div');
  m.id = 'portfolioCropModal';
  m.innerHTML = `
    <div class="pcrop-box">
      <div class="pcrop-head"><div><b>포트폴리오 이미지 맞춤</b><p>이미지 비율을 자동으로 맞춘 뒤 1:1 정사각형으로 저장합니다.</p></div><button type="button" class="pcrop-close" data-pcrop-close>×</button></div>
      <div class="pcrop-body"><div class="pcrop-stage"><canvas id="portfolioCropCanvas" width="${EDITOR_SIZE}" height="${EDITOR_SIZE}"></canvas></div><div class="pcrop-tools"><label for="portfolioCropZoom">확대 / 축소</label><input id="portfolioCropZoom" type="range" min="1" max="4" step="0.01" value="1"><div class="pcrop-hint">처음에는 사진 전체가 보이도록 자동 맞춤됩니다. 필요할 때만 확대하거나 마우스로 위치를 조정하세요.</div></div></div>
      <div class="pcrop-actions"><button type="button" class="pcrop-btn pcrop-cancel" data-pcrop-close>취소</button><button type="button" class="pcrop-btn pcrop-save" id="portfolioCropSave">맞춰서 업로드</button></div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-pcrop-close]')) closeModal(); });
  m.querySelector('#portfolioCropZoom').addEventListener('input', e => {
    if (!state) return;
    const next = Number(e.target.value || 1);
    state.scale = state.baseScale * next;
    draw();
  });
  m.querySelector('#portfolioCropSave').addEventListener('click', saveCrop);
  bindCanvasDrag(m.querySelector('#portfolioCropCanvas'));
  return m;
}

function closeModal() {
  const m = document.getElementById('portfolioCropModal');
  if (m) m.classList.remove('open');
  if (state?.input) state.input.value = '';
  state = null;
}

function bindCanvasDrag(canvas) {
  let dragging = false, lastX = 0, lastY = 0;
  const point = e => {
    const t = e.touches?.[0] || e;
    const r = canvas.getBoundingClientRect();
    return { x: (t.clientX - r.left) * (EDITOR_SIZE / r.width), y: (t.clientY - r.top) * (EDITOR_SIZE / r.height) };
  };
  const start = e => { if (!state) return; e.preventDefault(); dragging = true; const p = point(e); lastX = p.x; lastY = p.y; };
  const move = e => { if (!dragging || !state) return; e.preventDefault(); const p = point(e); state.x += p.x - lastX; state.y += p.y - lastY; lastX = p.x; lastY = p.y; draw(); };
  const end = () => { dragging = false; };
  canvas.addEventListener('mousedown', start); window.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive:false }); window.addEventListener('touchmove', move, { passive:false }); window.addEventListener('touchend', end);
}

function clampPosition() {
  if (!state) return;
  const w = state.img.width * state.scale;
  const h = state.img.height * state.scale;
  if (w <= EDITOR_SIZE) state.x = (EDITOR_SIZE - w) / 2;
  else state.x = Math.min(0, Math.max(EDITOR_SIZE - w, state.x));
  if (h <= EDITOR_SIZE) state.y = (EDITOR_SIZE - h) / 2;
  else state.y = Math.min(0, Math.max(EDITOR_SIZE - h, state.y));
}

function draw(targetCanvas = null, output = false) {
  if (!state) return;
  clampPosition();
  const canvas = targetCanvas || document.getElementById('portfolioCropCanvas');
  const ctx = canvas.getContext('2d');
  const size = output ? OUTPUT_SIZE : EDITOR_SIZE;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, size, size);
  const ratio = size / EDITOR_SIZE;
  ctx.drawImage(state.img, state.x * ratio, state.y * ratio, state.img.width * state.scale * ratio, state.img.height * state.scale * ratio);
}

async function openCrop(input, file) {
  injectStyle();
  const image = new Image();
  const url = URL.createObjectURL(file);
  image.onload = () => {
    URL.revokeObjectURL(url);
    // 전체 이미지가 잘리지 않도록 contain 방식으로 자동 비율 맞춤
    const baseScale = Math.min(EDITOR_SIZE / image.width, EDITOR_SIZE / image.height);
    state = { input, file, img:image, baseScale, scale:baseScale, x:(EDITOR_SIZE - image.width * baseScale) / 2, y:(EDITOR_SIZE - image.height * baseScale) / 2 };
    const zoom = document.getElementById('portfolioCropZoom');
    if (zoom) zoom.value = '1';
    modal().classList.add('open');
    draw();
  };
  image.onerror = () => { URL.revokeObjectURL(url); input.value = ''; alert('이미지를 불러오지 못했습니다.'); };
  image.src = url;
}

function collectPortfolio() {
  const items = [];
  document.querySelectorAll('.portfolio-item').forEach(el => {
    items.push({ imageUrl: el.querySelector('.portfolio-image-preview')?.src || '', title: el.querySelector('.portfolio-title')?.value || '', description: el.querySelector('.portfolio-description')?.value || '' });
  });
  return items;
}

function enableNewPortfolioInputs() {
  const list = document.getElementById('portfolio-list-admin');
  if (!list || inputGuard) return;
  inputGuard = true;
  try {
    list.querySelectorAll('.portfolio-item').forEach(item => {
      const title = item.querySelector('.portfolio-title');
      const desc = item.querySelector('.portfolio-description');
      const img = item.querySelector('.portfolio-image-preview');
      const src = img?.getAttribute('src') || img?.src || '';
      const emptyText = !(title?.value || '').trim() && !(desc?.value || '').trim();
      const looksNew = emptyText && (/placehold\.co|No\+Image|150/.test(src) || item.dataset.index === String((list.children.length || 1) - 1));
      if (!looksNew) return;
      item.classList.add('is-new-portfolio');
      if (title) title.disabled = false;
      if (desc) desc.disabled = false;
      item.querySelector('.edit-portfolio-btn')?.classList.add('hidden');
      item.querySelector('.save-portfolio-item-btn')?.classList.remove('hidden');
    });
  } finally {
    inputGuard = false;
  }
}

async function saveCrop() {
  if (!state) return;
  const btn = document.getElementById('portfolioCropSave');
  const input = state.input;
  const itemEl = input.closest('.portfolio-item');
  const imgEl = itemEl?.querySelector('.portfolio-image-preview');
  const btnChange = itemEl?.querySelector('.change-image-btn');
  try {
    if (!auth.currentUser?.uid) throw new Error('AUTH_REQUIRED');
    if (btn) { btn.disabled = true; btn.textContent = '업로드 중...'; }
    if (btnChange) { btnChange.disabled = true; btnChange.textContent = '업로드...'; }
    const out = document.createElement('canvas');
    out.width = OUTPUT_SIZE; out.height = OUTPUT_SIZE;
    draw(out, true);
    const blob = await new Promise(resolve => out.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) throw new Error('CROP_FAILED');
    const name = `portfolio/${Date.now()}_square.jpg`;
    const storageRef = ref(storage, name);
    const task = await uploadBytesResumable(storageRef, blob, { contentType:'image/jpeg' });
    const imageUrl = await getDownloadURL(task.ref);
    if (imgEl) imgEl.src = imageUrl;
    const portfolio = collectPortfolio();
    await setDoc(doc(db, 'settings', 'homepageContent'), { portfolio }, { merge:true });
    if (window.homepageContentCache) window.homepageContentCache.portfolio = portfolio;
    if (btnChange) btnChange.textContent = '완료';
    itemEl?.classList.remove('is-new-portfolio');
    closeModal();
  } catch (err) {
    console.error('[portfolio crop upload]', err);
    alert('이미지 업로드에 실패했습니다. 관리자 로그인/권한을 확인해 주세요.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '맞춰서 업로드'; }
    if (btnChange) { btnChange.disabled = false; setTimeout(() => { btnChange.textContent = '이미지 변경'; }, 1200); }
  }
}

function init() {
  injectStyle();
  enableNewPortfolioInputs();
  const list = document.getElementById('portfolio-list-admin');
  if (list) {
    new MutationObserver(() => setTimeout(enableNewPortfolioInputs, 30)).observe(list, { childList:true, subtree:true });
    list.addEventListener('click', () => setTimeout(enableNewPortfolioInputs, 30), true);
  }
  document.addEventListener('change', e => {
    const input = e.target?.closest?.('.portfolio-image-upload');
    if (!input) return;
    const file = input.files?.[0];
    if (!file) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!/^image\//.test(file.type || '')) { alert('이미지 파일만 업로드할 수 있습니다.'); input.value = ''; return; }
    openCrop(input, file);
  }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
else init();
