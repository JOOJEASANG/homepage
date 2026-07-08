// ============================================================
// security-patches.js — 공통 보안 보정
//
// 역할:
//   - Firestore 등 외부 데이터가 innerHTML로 들어간 뒤 위험 속성이 남지 않도록 보정
//   - 큰 페이지 파일을 직접 교체하지 않아도 XSS 위험 구간을 즉시 완화
//   - 책자/제본 및 디지털인쇄 페이지 전용 보정 스크립트 로드
// ============================================================

const CURRENT_FILE = (() => {
  try { return (location.pathname || '').split('/').pop() || 'index.html'; }
  catch { return 'index.html'; }
})();

try {
  if (CURRENT_FILE === 'quote-book.html') {
    import('./wire-cover-patch.js').catch(() => null);
    import('./book-no-binding-cover-patch.js').catch(() => null);
    import('./book-item-unit-price-patch.js').catch(() => null);
  }
  if (CURRENT_FILE === 'quote-print.html') {
    import('./print-vat-included-patch.js').catch(() => null);
  }
} catch (_) {}

function sanitizeHtmlStrict(html) {
  try {
    const allowed = new Set(['B','STRONG','I','EM','U','BR','P','DIV','SPAN','UL','OL','LI','A','HR','BLOCKQUOTE']);
    const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
    const blockedHrefPrefix = 'java' + 'script:';

    Array.from(doc.body.querySelectorAll('*')).reverse().forEach(el => {
      if (!allowed.has(el.tagName)) {
        el.replaceWith(...el.childNodes);
        return;
      }
      Array.from(el.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        const value = String(attr.value || '').trim().toLowerCase();
        if (name.startsWith('on') || name === 'style') el.removeAttribute(attr.name);
        if ((name === 'href' || name === 'src') && value.startsWith(blockedHrefPrefix)) el.removeAttribute(attr.name);
        if (name === 'srcdoc') el.removeAttribute(attr.name);
      });
      if (el.tagName === 'A') {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    });

    return doc.body.firstElementChild?.innerHTML || '';
  } catch {
    return '';
  }
}

function hardenGuideHtml() {
  if (CURRENT_FILE !== 'quote-print.html') return;

  const apply = () => {
    const guide = document.getElementById('guideText');
    if (!guide) return false;

    const clean = sanitizeHtmlStrict(guide.innerHTML || '');
    if (guide.innerHTML !== clean) guide.innerHTML = clean;

    if (guide.dataset.securityPatchBound !== '1') {
      guide.dataset.securityPatchBound = '1';
      let scheduled = false;
      const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          const next = sanitizeHtmlStrict(guide.innerHTML || '');
          if (guide.innerHTML !== next) guide.innerHTML = next;
        });
      });
      observer.observe(guide, { childList: true, subtree: true, attributes: true, characterData: true });
    }
    return true;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (!apply()) setTimeout(apply, 500);
      setTimeout(apply, 1500);
    }, { once: true });
  } else {
    if (!apply()) setTimeout(apply, 500);
    setTimeout(apply, 1500);
  }
}

function addSharedPatchStyle() {
  if (document.getElementById('shared-request-fixes-style')) return;
  const style = document.createElement('style');
  style.id = 'shared-request-fixes-style';
  style.textContent = `
    #hdr-admin-modal input {
      color:#0f172a !important;
      background:#fff !important;
      -webkit-text-fill-color:#0f172a !important;
      caret-color:#0f172a !important;
    }
    #hdr-admin-modal input::placeholder {
      color:#94a3b8 !important;
      -webkit-text-fill-color:#94a3b8 !important;
      opacity:1 !important;
    }
    #hdr-admin-submit .btn-text { opacity:1 !important; }
    #hdr-admin-submit .fa-spinner { display:none !important; }
    #hdr-admin-submit[disabled] { opacity:1 !important; cursor:pointer !important; }
    .chat-read-receipt-badge {
      display:inline-flex;
      align-items:center;
      align-self:flex-end;
      margin:0 3px 2px;
      font-size:10px;
      line-height:1;
      white-space:nowrap;
      color:#94a3b8;
      font-weight:700;
    }
    .chat-read-receipt-badge.is-read { color:#2563eb; }
    .chat-read-receipt-badge.is-unread { color:#94a3b8; }
  `;
  document.head.appendChild(style);
}

function initAdminLoginModalFix() {
  addSharedPatchStyle();

  const applyInputStyle = () => {
    ['hdr-admin-email', 'hdr-admin-pw'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.add('text-slate-900', 'placeholder:text-slate-400', 'bg-white');
      el.style.color = '#0f172a';
      el.style.backgroundColor = '#fff';
      try { el.style.webkitTextFillColor = '#0f172a'; } catch (_) {}
    });
  };

  const resetAdminButton = () => {
    const btn = document.getElementById('hdr-admin-submit');
    if (!btn) return;
    const txt = btn.querySelector('.btn-text');
    const spin = btn.querySelector('.fa-spinner');
    btn.disabled = false;
    btn.removeAttribute('disabled');
    if (txt) txt.style.opacity = '1';
    if (spin) {
      spin.classList.add('hidden');
      spin.style.display = 'none';
    }
  };

  const forceStableButton = () => {
    resetAdminButton();
    setTimeout(resetAdminButton, 0);
    setTimeout(resetAdminButton, 80);
    setTimeout(resetAdminButton, 250);
    setTimeout(resetAdminButton, 700);
    setTimeout(resetAdminButton, 1500);
    setTimeout(resetAdminButton, 3000);
  };

  const onAdminModalOpened = () => {
    applyInputStyle();
    forceStableButton();
    setTimeout(applyInputStyle, 80);
    setTimeout(() => document.getElementById('hdr-admin-email')?.focus(), 90);
  };

  document.addEventListener('click', (e) => {
    if (e.target.closest?.('#btn-admin-login')) {
      setTimeout(onAdminModalOpened, 0);
      setTimeout(onAdminModalOpened, 150);
    }
    if (e.target.closest?.('#hdr-admin-close')) {
      setTimeout(forceStableButton, 0);
    }
    if (e.target.closest?.('#hdr-admin-submit')) {
      // 로그인 시도 자체는 기존 header.js에 맡기고, 버튼 표시만 즉시 정상화합니다.
      setTimeout(forceStableButton, 0);
      setTimeout(forceStableButton, 120);
      setTimeout(forceStableButton, 500);
      setTimeout(forceStableButton, 1200);
      setTimeout(() => {
        const modal = document.getElementById('hdr-admin-modal');
        const btn = document.getElementById('hdr-admin-submit');
        if (!modal || modal.classList.contains('hidden') || !btn) return;
        forceStableButton();
      }, 4000);
    }
  }, true);

  document.addEventListener('input', (e) => {
    if (e.target?.id === 'hdr-admin-email' || e.target?.id === 'hdr-admin-pw') {
      applyInputStyle();
      forceStableButton();
    }
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { applyInputStyle(); forceStableButton(); }, { once: true });
  else { applyInputStyle(); forceStableButton(); }
}

function initAdminEditSessionGuard() {
  const params = new URLSearchParams(location.search || '');
  const isAdminEditPage = params.get('adminEdit') === '1';

  const markAdminEdit = () => {
    try { sessionStorage.setItem('userRole', 'admin'); } catch (_) {}
    try { localStorage.setItem('userRole', 'admin'); } catch (_) {}
    try { sessionStorage.setItem('adminEditSession', '1'); } catch (_) {}
    try { localStorage.setItem('adminEditSession', '1'); } catch (_) {}
    try { sessionStorage.removeItem('guestLookupKey'); } catch (_) {}
  };

  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.admin-edit-quote-btn');
    if (!btn) return;
    markAdminEdit();
  }, true);

  if (isAdminEditPage) {
    markAdminEdit();
    window.addEventListener('beforeunload', markAdminEdit);

    const patchHardLogout = () => {
      try {
        if (!window.hardLogout || window.hardLogout.__adminEditGuard) return;
        const original = window.hardLogout;
        const guarded = async function(target = 'admin.html') {
          const stillAdminEdit = new URLSearchParams(location.search || '').get('adminEdit') === '1';
          if (stillAdminEdit) {
            markAdminEdit();
            location.href = target || 'admin.html';
            return;
          }
          return original.apply(this, arguments);
        };
        guarded.__adminEditGuard = true;
        window.hardLogout = guarded;
      } catch (_) {}
    };

    patchHardLogout();
    setTimeout(patchHardLogout, 100);
    setTimeout(patchHardLogout, 800);
    setInterval(markAdminEdit, 15000);
  }
}

function initChatReadReceipts() {
  if (CURRENT_FILE !== 'admin.html' && CURRENT_FILE !== 'mypage.html') return;
  addSharedPatchStyle();

  const side = CURRENT_FILE === 'admin.html' ? 'admin' : 'customer';
  const mine = side === 'admin' ? 'admin' : 'customer';
  const other = side === 'admin' ? 'customer' : 'admin';
  const readFlagForOtherMessages = side === 'admin' ? 'readByAdmin' : 'readByCustomer';
  const readFlagForMyMessages = side === 'admin' ? 'readByCustomer' : 'readByAdmin';
  const readAtForOtherMessages = `${readFlagForOtherMessages}At`;

  let currentQuoteId = null;
  let unsubscribe = null;
  let fb = null;

  const getChatBox = () => document.getElementById('chat-messages');
  const isModalOpen = () => {
    const modal = document.getElementById('detailsModal');
    return !!(modal && !modal.classList.contains('hidden'));
  };

  async function getFirebase() {
    if (fb) return fb;
    fb = await import('./firebase.js');
    return fb;
  }

  function visibleMessages(messages) {
    if (side === 'customer') return messages.filter(m => !m.isProof);
    return messages;
  }

  function messageRows() {
    const box = getChatBox();
    if (!box) return [];
    return Array.from(box.children).filter(el => el.querySelector?.('.chat-bubble'));
  }

  function decorate(messages) {
    const rows = messageRows();
    if (!rows.length) return;
    const vis = visibleMessages(messages);
    vis.forEach((msg, idx) => {
      const row = rows[idx];
      if (!row) return;
      row.querySelectorAll('.chat-read-receipt-badge').forEach(el => el.remove());
      if (msg.sender !== mine) return;
      const read = msg[readFlagForMyMessages] === true;
      const badge = document.createElement('span');
      badge.className = `chat-read-receipt-badge ${read ? 'is-read' : 'is-unread'}`;
      badge.textContent = read ? '읽음' : '안읽음';
      badge.title = read ? '상대방이 읽었습니다' : '상대방이 아직 읽지 않았습니다';
      const bubble = row.querySelector('.chat-bubble');
      const wrap = bubble?.parentElement || row;
      wrap.appendChild(badge);
    });
  }

  async function markRead(messages, quoteId) {
    if (!isModalOpen()) return;
    const api = await getFirebase();
    messages.forEach(msg => {
      if (!msg?.id || msg.sender !== other || msg[readFlagForOtherMessages] === true) return;
      api.updateDoc(api.doc(api.db, `quotes/${quoteId}/messages`, msg.id), {
        [readFlagForOtherMessages]: true,
        [readAtForOtherMessages]: api.serverTimestamp(),
      }).catch(() => null);
    });
  }

  async function listen(quoteId) {
    if (!quoteId || currentQuoteId === quoteId) return;
    currentQuoteId = quoteId;
    try { if (typeof unsubscribe === 'function') unsubscribe(); } catch (_) {}

    const api = await getFirebase();
    const q = api.query(api.collection(api.db, `quotes/${quoteId}/messages`), api.orderBy('timestamp'));
    unsubscribe = api.onSnapshot(q, (snap) => {
      const messages = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
      markRead(messages, quoteId).catch(() => null);
      setTimeout(() => decorate(messages), 0);
      setTimeout(() => decorate(messages), 80);
      setTimeout(() => decorate(messages), 250);
    }, () => null);
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.view-details-btn');
    if (!btn) return;
    const id = btn.dataset?.id;
    if (!id) return;
    setTimeout(() => listen(id), 60);
    setTimeout(() => listen(id), 300);
  }, true);

  document.addEventListener('click', (e) => {
    if (e.target.closest?.('#closeModalBtn')) {
      try { if (typeof unsubscribe === 'function') unsubscribe(); } catch (_) {}
      unsubscribe = null;
      currentQuoteId = null;
    }
  }, true);
}

hardenGuideHtml();
initAdminLoginModalFix();
initAdminEditSessionGuard();
initChatReadReceipts();
