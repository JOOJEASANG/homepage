import {
  db,
  collection,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  query,
  where,
  getDocs,
  writeBatch,
  serverTimestamp,
} from './firebase.js';

function sanitizeNoticeHtml(html) {
  try {
    const allowedTags = new Set(['B','STRONG','I','EM','U','BR','P','DIV','SPAN','UL','OL','LI','A','HR','BLOCKQUOTE']);
    const docx = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
    Array.from(docx.body.querySelectorAll('*')).reverse().forEach(el => {
      if (!allowedTags.has(el.tagName)) {
        el.replaceWith(...el.childNodes);
        return;
      }
      Array.from(el.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on') || name === 'style' || (name === 'href' && /^javascript:/i.test(attr.value))) {
          el.removeAttribute(attr.name);
        }
      });
      if (el.tagName === 'A') {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    });
    return docx.body.firstElementChild?.innerHTML || '';
  } catch {
    return '';
  }
}

function showLocalToast(message, type = 'success') {
  const container = document.getElementById('toast-container') || document.body;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  if (!document.getElementById('notice-period-toast-style')) {
    const style = document.createElement('style');
    style.id = 'notice-period-toast-style';
    style.textContent = `
      #toast-container .notice-period-toast,
      .notice-period-toast {
        background:#1a2332;color:#fff;border-radius:10px;padding:.7rem 1rem;
        font-size:.8rem;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.18);
      }
      .notice-period-toast.success{border-left:3px solid #22c55e}
      .notice-period-toast.error{border-left:3px solid #ef4444}
    `;
    document.head.appendChild(style);
  }
  toast.className = `notice-period-toast ${type}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function injectPeriodFields() {
  const form = document.getElementById('notice-form');
  if (!form || document.getElementById('notice-publish-period-wrap')) return form;

  const footer = document.getElementById('notice-isImportant')?.closest('.flex.items-center.justify-between.pt-2');
  const wrap = document.createElement('div');
  wrap.id = 'notice-publish-period-wrap';
  wrap.className = 'rounded-xl border border-slate-200 bg-slate-50/70 p-3';
  wrap.innerHTML = `
    <div class="flex items-center gap-2 mb-2">
      <span class="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs"><i class="fas fa-calendar-days"></i></span>
      <div>
        <div class="text-xs font-extrabold text-slate-700">게시 기간</div>
        <div class="text-[11px] text-slate-400">비워두면 기간 제한 없이 계속 노출됩니다.</div>
      </div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <label class="block">
        <span class="block text-[11px] font-bold text-slate-500 mb-1">시작일</span>
        <input type="date" id="notice-publish-start" class="form-input w-full">
      </label>
      <label class="block">
        <span class="block text-[11px] font-bold text-slate-500 mb-1">종료일</span>
        <input type="date" id="notice-publish-end" class="form-input w-full">
      </label>
    </div>
  `;

  if (footer) form.insertBefore(wrap, footer);
  else form.appendChild(wrap);
  return form;
}

function resetNoticeForm() {
  const form = document.getElementById('notice-form');
  form?.reset();
  const id = document.getElementById('notice-id');
  if (id) id.value = '';
  const hidden = document.getElementById('notice-content');
  if (hidden) hidden.value = '';
  const editor = document.getElementById('notice-content-editor');
  if (editor) editor.innerHTML = '';
  const start = document.getElementById('notice-publish-start');
  const end = document.getElementById('notice-publish-end');
  if (start) start.value = '';
  if (end) end.value = '';
}

async function saveNoticeWithPeriod(e) {
  const form = document.getElementById('notice-form');
  if (!form || e.target !== form) return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  const id = (document.getElementById('notice-id')?.value || '').trim();
  const title = (document.getElementById('notice-title')?.value || '').trim();
  const editor = document.getElementById('notice-content-editor');
  const hidden = document.getElementById('notice-content');
  const contentText = (editor?.innerText || hidden?.value || '').trim();
  const contentHtml = sanitizeNoticeHtml(editor?.innerHTML || '');
  const publishStartDate = (document.getElementById('notice-publish-start')?.value || '').trim();
  const publishEndDate = (document.getElementById('notice-publish-end')?.value || '').trim();

  if (!title) {
    showLocalToast('공지 제목을 입력해주세요.', 'error');
    document.getElementById('notice-title')?.focus();
    return;
  }
  if (!contentText && !contentHtml) {
    showLocalToast('공지 내용을 입력해주세요.', 'error');
    editor?.focus();
    return;
  }
  if (publishStartDate && publishEndDate && publishEndDate < publishStartDate) {
    showLocalToast('종료일은 시작일보다 빠를 수 없습니다.', 'error');
    document.getElementById('notice-publish-end')?.focus();
    return;
  }

  const payload = {
    title,
    content: contentText,
    contentHtml,
    isImportant: !!document.getElementById('notice-isImportant')?.checked,
    isPopup: !!document.getElementById('notice-isPopup')?.checked,
    publishStartDate: publishStartDate || null,
    publishEndDate: publishEndDate || null,
  };

  const btn = document.getElementById('save-notice-btn');
  const originalHtml = btn?.innerHTML || '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>저장중';
  }

  try {
    let savedId = id;
    if (id) {
      await updateDoc(doc(db, 'notices', id), { ...payload, updatedAt: serverTimestamp() });
    } else {
      const ref = await addDoc(collection(db, 'notices'), { ...payload, createdAt: serverTimestamp() });
      savedId = ref.id;
    }

    if (payload.isPopup) {
      const snap = await getDocs(query(collection(db, 'notices'), where('isPopup', '==', true)));
      const batch = writeBatch(db);
      let changes = 0;
      snap.forEach(d => {
        if (d.id !== savedId) {
          batch.update(d.ref, { isPopup: false });
          changes += 1;
        }
      });
      if (changes) await batch.commit();
    }

    showLocalToast(id ? '공지사항이 수정되었습니다.' : '새 공지사항이 등록되었습니다.', 'success');
    resetNoticeForm();
  } catch (err) {
    console.error('[notice-period] save failed', err);
    showLocalToast('공지사항 저장에 실패했습니다.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml || '<i class="fas fa-check mr-1"></i>저장';
    }
  }
}

function bindEditPeriodRestore() {
  document.addEventListener('click', e => {
    const editBtn = e.target?.closest?.('.edit-notice-btn');
    if (!editBtn?.dataset?.id) return;
    const noticeId = editBtn.dataset.id;
    setTimeout(async () => {
      try {
        const snap = await getDoc(doc(db, 'notices', noticeId));
        if (!snap.exists()) return;
        const data = snap.data() || {};
        const start = document.getElementById('notice-publish-start');
        const end = document.getElementById('notice-publish-end');
        if (start) start.value = data.publishStartDate || '';
        if (end) end.value = data.publishEndDate || '';
      } catch (_) {}
    }, 40);
  }, true);

  document.getElementById('clear-notice-form-btn')?.addEventListener('click', () => {
    const start = document.getElementById('notice-publish-start');
    const end = document.getElementById('notice-publish-end');
    if (start) start.value = '';
    if (end) end.value = '';
  });
}

function init() {
  const form = injectPeriodFields();
  if (!form || form.dataset.noticePeriodBound === '1') return;
  form.dataset.noticePeriodBound = '1';
  form.addEventListener('submit', saveNoticeWithPeriod, true);
  bindEditPeriodRestore();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
setTimeout(init, 500);
