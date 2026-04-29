// ============================================================
// quote-print.js — 디지털 칼라인쇄 견적 페이지 로직
// 주요 기능:
//   - 용지 종류/사이즈/수량/단면양면 선택 → 자동 견적 계산
//   - 오시(접기선) 옵션 처리
//   - 파일 첨부 업로드 (Firebase Storage)
//   - 비회원 접수 (이름+연락처 입력 → Firestore 저장)
//   - 관리자 수정 모드 (adminEdit=1 파라미터)
//   - 폼 데이터 임시 저장/복구 (localStorage)
// ============================================================

import { app, auth, db, storage, doc, getDoc, collection, addDoc, updateDoc,
         serverTimestamp, runTransaction, Timestamp, onAuthStateChanged, signOut,
         signInAnonymously, setPersistence, browserLocalPersistence, browserSessionPersistence,
         ref as storageRef, uploadBytes, getDownloadURL } from "../firebase.js";
import { initHeader } from "../header.js";
import "../overlays.js";
import "../session.js";

// 페이지 로드 시 공통 헤더 렌더링
document.addEventListener("DOMContentLoaded", () => initHeader("print"));

// ── 폼 데이터 임시 저장 ──────────────────────────────────────
// 견적 페이지를 벗어나기 전에 입력 내용을 localStorage에 보존합니다.
// 다시 돌아왔을 때 loadTempFormData()로 복구됩니다.
function saveTempFormData() {
    const formData = {
        orderName: document.getElementById('orderName').value,
        quantity: document.getElementById('quantity').value,
        printSides: document.getElementById('printSides').value,
        paperSize: document.getElementById('paperSize').value,
        customW: document.getElementById('customW').value,
        customH: document.getElementById('customH').value,
        paperType: document.getElementById('paperType').value,
        paperWeight: document.getElementById('paperWeight').value,
        oshiEnabled: document.getElementById('oshiEnabled').checked,
        oshiLines: document.querySelector('input[name="oshiLines"]:checked')?.value || '1',
        timestamp: Date.now()
    };
    localStorage.setItem('temp_quote_print', JSON.stringify(formData));
}

// ── 유저 메뉴 팝업 요소 참조 ─────────────────────────────────
// overlays.js 에서 주입된 #userMenuModal 팝업의 버튼들을 가져옵니다.
const userMenuBtn          = document.getElementById('user-menu-btn');
const userMenuModal        = document.getElementById('userMenuModal');
const closeUserMenuBtn     = document.getElementById('closeUserMenuBtn');
const userMenuStatus       = document.getElementById('userMenuStatus');
const userMenuGoMyPageBtn  = document.getElementById('userMenuGoMyPageBtn');
const userMenuEditInfoBtn  = document.getElementById('userMenuEditInfoBtn');
const userMenuGoLoginBtn   = document.getElementById('userMenuGoLoginBtn');
const userMenuLogoutBtn    = document.getElementById('userMenuLogoutBtn');
const userMenuGuestLookupBtn = document.getElementById('guest-lookup-open');

// 1. UI 업데이트 함수
// ── 유저 메뉴 UI 상태 갱신 ──────────────────────────────────
// 회원/비회원/비로그인 상태에 따라 유저 메뉴 팝업 내용을 업데이트합니다.
function updateUserMenuUI() {
  const welcomeMsg = document.getElementById('welcome-message'); // 헤더 이름 표시 요소
  if (!userMenuStatus) return;

  if (currentUser && !currentUser.isAnonymous) {
    // [회원 상태]
    const name = currentUser.displayName || currentUser.email || '회원';
    // sessionStorage에 저장된 이름이 있으면 우선 사용
    const storedName = sessionStorage.getItem('userName');
    const dispName = storedName || name;
    
    // 모달 내부 텍스트 업데이트
    userMenuStatus.innerHTML = `<span class="font-bold text-brand-600">${(__isAdminEditMode() ? '관리자' : dispName)}</span>님<br><span class="text-xs text-slate-400">오늘도 좋은 하루 되세요!</span>`;
    
    // 버튼 상태 변경
    userMenuGoMyPageBtn?.classList.remove('hidden');
    userMenuEditInfoBtn?.classList.add('hidden');
    userMenuLogoutBtn?.classList.remove('hidden');
    userMenuGoLoginBtn?.classList.add('hidden');
    userMenuGuestLookupBtn?.classList.add('hidden');
    try{
      document.getElementById('tab-guest')?.classList.add('hidden');
      document.getElementById('signup-guest-tab')?.classList.add('hidden');
      document.getElementById('signup-member-tab')?.classList.remove('hidden');
      if (typeof switchSignupTab === 'function') switchSignupTab('member');
    }catch(e){}

    // ★ 헤더 표시 (updateAuthLabels에서 처리하지만 여기서도 백업)
    // if (welcomeMsg) welcomeMsg.textContent = `${(__isAdminEditMode() ? '관리자' : dispName)}님`;

  } else {
    // [비회원 상태]
    // 세션 스토리지에 저장된 비회원 이름이 있는지 확인
    const guestName = sessionStorage.getItem('guestName');
    const hasGuestSession = !!guestName || !!localStorage.getItem('guestLookupKey') || !!localStorage.getItem('guestPwLast4');

    
    if (guestName) {
        userMenuStatus.innerHTML = `<span class="font-bold text-slate-800">${guestName}</span>님 (비회원)<br><span class="text-xs text-slate-400">주문 조회 중입니다.</span>`;
    } else {
        userMenuStatus.innerHTML = '<span class="font-bold text-slate-800">방문자</span>님 환영합니다.<br><span class="text-xs text-slate-400">로그인 후 더 많은 기능을 이용해보세요.</span>';
    }

    userMenuEditInfoBtn?.classList.add('hidden');

    if (hasGuestSession) {
      // ✅ 비회원 조회/접수로 로그인(익명)된 상태: 마이페이지/로그아웃 제공
      userMenuGoMyPageBtn?.classList.remove('hidden');
      userMenuLogoutBtn?.classList.remove('hidden');
      userMenuGoLoginBtn?.classList.add('hidden');
      userMenuGuestLookupBtn?.classList.add('hidden');
    } else {
      // 방문자(세션 없음)
      userMenuGoMyPageBtn?.classList.add('hidden');
      userMenuLogoutBtn?.classList.add('hidden');
      userMenuGoLoginBtn?.classList.remove('hidden');
      userMenuGuestLookupBtn?.classList.remove('hidden');
    }
    try{ document.getElementById('tab-guest')?.classList.remove('hidden'); }catch(e){}
  }
  
  // Trigger global update
  if(window.updateAuthLabels) window.updateAuthLabels();
}

// 2. 모달 토글 함수
function toggleUserMenu() {
  if (!userMenuModal) return;
  if (userMenuModal.classList.contains('hidden')) {
    updateUserMenuUI(); // 열 때마다 상태 업데이트
    userMenuModal.classList.remove('hidden');
    userMenuModal.classList.add('flex');
  } else {
    userMenuModal.classList.add('hidden');
    userMenuModal.classList.remove('flex');
  }
}

// 3. 이벤트 리스너 연결
userMenuBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  toggleUserMenu();
});
closeUserMenuBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  toggleUserMenu();
});
userMenuModal?.addEventListener('click', (e) => {
  if (e.target === userMenuModal) toggleUserMenu();
});

// 버튼 동작 연결
userMenuGoMyPageBtn?.addEventListener('click', () => {
    const _k = localStorage.getItem('guestLookupKey') || sessionStorage.getItem('guestLookupKey') || localStorage.getItem('guestLookupKeyLegacy') || '';
    window.location.href = _k ? 'mypage.html?guest=1' : 'mypage.html';
});

userMenuEditInfoBtn?.addEventListener('click', () => {
    window.location.href = 'mypage.html#profile-edit';
});

// 로그인 버튼 동작
// 1. 헤더 유저 메뉴의 로그인 버튼
userMenuGoLoginBtn?.addEventListener('click', () => {
    saveTempFormData(); // ★ 추가됨: 데이터 저장
    try { localStorage.setItem('postLoginRedirect', 'quote-print.html?autopost=1'); } catch(e){}
    window.location.href = 'index.html';
});

// 2. 접수 모달 내의 로그인 버튼
document.getElementById('member-go-login-btn')?.addEventListener('click', () => {
    saveTempFormData();
    try { localStorage.setItem('postLoginRedirect', 'quote-print.html?autopost=1'); } catch(e){}
    location.href = 'index.html';
});

    
    
    
    

    // ✅ set auth persistence (local preferred; fallback to session)
        (async ()=>{
          try{
            await setPersistence(auth, browserLocalPersistence);
          }catch(e1){
            try{
              await setPersistence(auth, browserSessionPersistence);
            }catch(e2){
              console.warn('[quote-print] setPersistence failed:', e1, e2);
            }
          }
        })();

// ✅ expose for common header scripts
        try { window.auth = auth; } catch(e) {}
        
        try { window.signOut = signOut; } catch(e) {}
        try { window.signInAnonymously = signInAnonymously; } catch(e) {}
        try { window.onAuthStateChanged = onAuthStateChanged; } catch(e) {}
        try { window.__currentUser = auth.currentUser || null; } catch(e) {}
        try { window.currentUser = auth.currentUser || null; } catch(e) {}
        try { window.__AUTH_READY = false; } catch(e) {}

        // ✅ keep header/login button in sync across page transitions
        onAuthStateChanged(auth, (u) => {
            try { window.__currentUser = u || null; } catch(e) {}
            try { window.currentUser = u || null; } catch(e) {}
            try { window.__AUTH_READY = true; } catch(e) {}
            try { window.updateAuthLabels && window.updateAuthLabels(); } catch(e) {}
        });

    // === 접수번호(Receipt No) 자동 생성 ===
    const _pad4 = (n) => String(n).padStart(4, '0');
    const _ymd = () => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}${m}${da}`;
    };

    async function generateReceiptNo() {
      // NOTE: Firestore 권한(403) 문제를 피하기 위해,
      // 클라이언트에서 DB 카운터(meta/quoteReceiptCounter)를 읽지 않고
      // 시간 기반 접수번호를 생성합니다.
      // 형식: QYYYYMMDD-HHMMSS-XXX
      const d = new Date();
      const ymd = _ymd();
      const hh = String(d.getHours()).padStart(2,'0');
      const mm = String(d.getMinutes()).padStart(2,'0');
      const ss = String(d.getSeconds()).padStart(2,'0');
      const rnd = String(Math.floor(Math.random()*1000)).padStart(3,'0');
      return `Q${ymd}-${hh}${mm}${ss}-${rnd}`;
    }

    // ---------- UI Helpers ----------
    const toast = document.getElementById('toast');
    function showToast(msg, type='info') {
      const bg = type === 'error' ? 'bg-red-600' : (type === 'success' ? 'bg-brand-600' : 'bg-slate-800');
      toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 ${bg} text-white px-4 py-3 rounded-xl shadow-float text-sm font-bold`;
      toast.textContent = msg;
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 2500);
    }

    function sanitizePhoneDigits(v){ return (v||'').toString().replace(/[^0-9]/g,''); }
    function formatPhoneHyphen(v){
      const d = sanitizePhoneDigits(v);
      if (d.length === 11) return d.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
      if (d.length === 10) return d.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
      return v || '';
    }

    // ---------- Config ----------
    // 기본 두께 옵션(단가관리에서 별도 설정이 없을 때만 사용)
    // ※ 단가관리(quote-print-price)에서 weight_factor에 등록된 두께가 있으면,
    //    해당 용지(snow/arte)별 등록된 두께만 표시하도록 동작합니다.
    const WEIGHTS = {
      // 스노우지: 단가관리 기본값과 호환
      snow: [120,150,180,200,220,250,300],
      // 아르떼: 단가관리 기본값과 호환
      arte: [180,200,210,250]
    };

    const A4_AREA = 210 * 297;

    function sizeMultiplier(size, cw, ch) {
      const A4_AREA = 210*297;
      const cfg = unitPriceConfig?.digital_print?.size || {};
      const preset = cfg?.multipliers || {};
      const minMul = Number(cfg?.minMultiplier ?? 0.6);

      // max size 제한: 13×19in (482×330mm) 이내 (회전 허용)
      const MAX_W = 482;
      const MAX_H = 330;

      // Inch presets -> treat as custom with fixed dims
      if (size === 'IN12x18') { cw = 457; ch = 305; size = 'CUSTOM'; }
      if (size === 'IN13x19') { cw = 482; ch = 330; size = 'CUSTOM'; }

      // Custom size -> area ratio (A4 기준) + 최소계수
      if (size === 'CUSTOM') {
        const w = Number(cw) || 0;
        const h = Number(ch) || 0;
        if (w <= 0 || h <= 0) return 0;

        const ok = (w <= MAX_W && h <= MAX_H) || (w <= MAX_H && h <= MAX_W);
        if (!ok) {
          throw new Error('디지털 인쇄 최대 사이즈는 13×19인치(482×330mm) 이하입니다.');
        }
        const areaCustom = w * h;
        const mulCustom = areaCustom / A4_AREA;
        return Math.max(mulCustom, minMul);
      }

      // Preset override (admin-configurable)
      if (preset && preset[size] != null) {
        const v = Number(preset[size]) || 0;
        return Math.max(v, minMul);
      }

      // Fallback: area ratio for known presets
      const map = {
        A4: 210*297,
        A3: 297*420,
        A5: 148*210,
        B5: 176*250,
        B4: 257*364
      };
      const area = map[size] || A4_AREA;
      const mul = area / A4_AREA;
      return Math.max(mul, minMul);
    }




    let unitPriceConfig = {};
    async function loadUnitPriceConfig(){
      try{
        const snap = await getDoc(doc(db, "settings", "unitPriceConfig"));
        unitPriceConfig = snap.exists() ? (snap.data()||{}) : {};
      } catch(e){
        unitPriceConfig = {};
      }
    }


    async function loadPrintGuide(){
      const elGuide = document.getElementById('guideText');
      if (!elGuide) return;
      try{
        const snap = await getDoc(doc(db, "settings", "print"));
        const data = snap.exists() ? (snap.data()||{}) : {};
        const guideHtml = (data.guideHtml || '').trim();
        const guide = (data.guide || '').trim();
        if (guideHtml) elGuide.innerHTML = guideHtml;
        else elGuide.textContent = guide ? guide : '등록된 안내문이 없습니다.';
      }catch(e){
        elGuide.textContent = "안내문을 불러오지 못했습니다.";
      }
    }

    function findPrice(category, spec, quantity){
      const config = unitPriceConfig?.digital_print;
      const categoryData = config?.[category];
      const tiers = categoryData?.[spec];
      if (!Array.isArray(tiers) || tiers.length === 0) return { price: 0, min: 0, hasSpec: false };

      const sorted = [...tiers].sort((a,b)=> (b.threshold||0) - (a.threshold||0));
      const minTh = (sorted[sorted.length-1]?.threshold)||0;
      if (quantity < minTh) return { price: 0, min: minTh, hasSpec: true };

      for (const t of sorted){
        if (quantity >= (t.threshold||0)) return { price: Number(t.price||0), min: minTh, hasSpec: true };
      }
      return { price: 0, min: minTh, hasSpec: true };
    }

    function getWeightFactor(paperType, weight){
      const defaults = {
        snow: {150:0.92,180:0.97,200:1.00,220:1.06,250:1.12,120:0.85},
        arte: {180:0.95,200:1.00,210:1.05,250:1.15}
      };
      const cfg = unitPriceConfig?.digital_print?.weight_factor || {};
      const key = `${paperType}_${weight}`;
      const v = (cfg && cfg[key] != null) ? Number(cfg[key]) : (defaults[paperType]?.[Number(weight)]);
      return (Number.isFinite(v) && v>0) ? v : 1;
    }

    function getOshiPrice(lines){
      const cfg = unitPriceConfig?.digital_print?.oshi || {};
      if (lines === 1) return Number(cfg.oneLine||0);
      if (lines === 2) return Number(cfg.twoLine||0);
      if (lines === 3) return Number(cfg.threeLine||0);
      return 0;
    }

    // Run after DOM is ready (prevents null addEventListener issues)
    window.addEventListener('DOMContentLoaded', async () => {
    // ===== Edit Load via URL id (디지털인쇄 수정 불러오기) =====
    async function initEditLoadFromUrl(){
  try{
    const params = new URLSearchParams(location.search);
    const quoteId = params.get('id');
    // edit 파라미터가 없거나 id가 없으면 중단
    if (params.get('edit') !== '1' || !quoteId) return;

    const snap = await getDoc(doc(db, 'quotes', quoteId));
    if (!snap.exists()) return;

    const q = snap.data() || {};
    // ★ 핵심: 저장된 spec 객체 가져오기 (없으면 빈 객체)
    const s = q.spec || {}; 
    
    // formData 호환 (혹시 spec이 없을 경우 대비)
    let legacyData = {};
    if (q.formData) {
        try { 
            const parsed = typeof q.formData === 'string' ? JSON.parse(q.formData) : q.formData;
            legacyData = Array.isArray(parsed) ? parsed[0] : parsed;
        } catch(e){}
    }

    // 값 설정 헬퍼 함수
    const setVal = (idOrName, v) => {
      if (v === undefined || v === null) return;
      const elx = document.getElementById(idOrName) || document.querySelector(`[name="${CSS.escape(idOrName)}"]`);
      if (!elx) return;
      
      if (elx.type === 'checkbox'){ 
         elx.checked = !!v; 
         elx.dispatchEvent(new Event('change', {bubbles:true})); 
      } else if (elx.type === 'radio') {
         const radio = document.querySelector(`input[name="${idOrName}"][value="${v}"]`);
         if(radio) {
             radio.checked = true;
             radio.dispatchEvent(new Event('change', {bubbles:true}));
         }
      } else {
         elx.value = String(v);
         elx.dispatchEvent(new Event('input', {bubbles:true}));
         elx.dispatchEvent(new Event('change', {bubbles:true}));
      }
    };

    // --- 데이터 매핑 시작 ---
    
    // 1. 기본 정보 (제목, 수량, 인쇄면)
    setVal('orderName', q.orderName || legacyData.title || '');
    setVal('quantity', s.quantity || q.quantity || legacyData.quantity || '');
    setVal('printSides', s.sides || q.printSides || legacyData.printSides || '1');

    // 2. 용지 설정 (순서 중요: 종류 -> 두께 채우기 -> 두께 선택)
    // 저장 시 paperTypeKey(예: snow)로 저장됨
    const pType = s.paperTypeKey || s.paperType || q.paperType || 'snow';
    setVal('paperType', pType);
    
    // 용지 종류 변경에 따른 두께 옵션 갱신 함수 강제 실행
    fillWeightOptions(); 

    // 두께 설정
    const pWeight = s.weight || q.paperWeight || '200';
    setVal('paperWeight', pWeight);

    // 3. 사이즈 설정
    const pSize = s.size || q.paperSize || 'A4';
    setVal('paperSize', pSize);
    
    // 직접입력(CUSTOM)일 경우 가로/세로 값 복원
    if (pSize === 'CUSTOM') {
        setVal('customW', s.customW || '');
        setVal('customH', s.customH || '');
        toggleCustom(); // UI 갱신
    }

    // 4. 후가공 (오시) 설정
    if (s.oshiEnabled) {
        const oshiChk = document.getElementById('oshiEnabled');
        if(oshiChk) {
            oshiChk.checked = true;
            toggleOshi(); // 옵션창 보이기
        }
        // 오시 줄 수 선택 (라디오 버튼)
        const lines = s.oshiLines || 1;
        const radio = document.querySelector(`input[name="oshiLines"][value="${lines}"]`);
        if (radio) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change', {bubbles:true}));
        }
    }

    // 버튼 문구 변경 (수정 모드임을 인지)
    const submitBtn = document.getElementById('submitBtn');
    if(submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-pen-to-square mr-2"></i>이 내용으로 견적 접수하기';
    }

    // 최종 금액 재계산
    setTimeout(() => { try { compute(); } catch(e) {} }, 200);

  } catch(e){
    console.warn('initEditLoadFromUrl failed', e);
  }
}

    // 현재 페이지 메뉴 active 자동 처리
    document.querySelectorAll('.nav-item').forEach(a => {
      a.classList.remove('active');
      const href = a.getAttribute('href') || '';
      const current = location.pathname.split('/').pop();
      if (href === current) a.classList.add('active');
    });



    // ---------- Elements ----------

    const $id = (id, fallbackSelector) => document.getElementById(id) || (fallbackSelector ? document.querySelector(fallbackSelector) : null);
    const editState = { enabled:false, quoteId:null, adminEdit:false }; // moved up to avoid TDZ on early calls

const el = {
      form: document.getElementById('quoteForm'),
      orderName: document.getElementById('orderName'),
      quantity: $id('quantity','[name="quantity"],[data-field="quantity"]'),
      printSides: $id('printSides','[name="printSides"],[data-field="printSides"]'),
      paperSize: $id('paperSize','[name="paperSize"],[data-field="paperSize"]'),
      customWrap: document.getElementById('customSizeWrap'),
      customW: document.getElementById('customW'),
      customH: document.getElementById('customH'),
      paperType: $id('paperType','[name="paperType"],[data-field="paperType"]'),
      paperWeight: $id('paperWeight','[name="paperWeight"],[data-field="paperWeight"]'),
      oshiEnabled: document.getElementById('oshiEnabled'),
      oshiOptions: document.getElementById('oshiOptions'),
      breakdown: document.getElementById('breakdown'),
      supplyPrice: document.getElementById('supplyPrice'),
      vatPrice: document.getElementById('vatPrice'),
      totalPrice: document.getElementById('totalPrice'),
      minQtyHint: document.getElementById('minQtyHint'),
      refreshBtn: document.getElementById('refreshBtn'),
      submitBtn: document.getElementById('submitBtn'),
      logoutBtn: document.getElementById('logoutBtn'),
      loginBadge: document.getElementById('loginBadge'),
      attachments: document.getElementById('attachments'),

      // modal
      signupModal: document.getElementById('signupModal'),
      closeSignupModalBtn: document.getElementById('closeSignupModalBtn'),
      tabGuest: document.getElementById('tab-guest'),
      tabMember: document.getElementById('tab-member'),
      guestTab: document.getElementById('guest-tab-content'),
      memberTab: document.getElementById('member-tab-content'),
      signupForm: document.getElementById('signup-form'),
      signupName: document.getElementById('signup-name'),
      signupContact: document.getElementById('signup-contact'),
      signupPassword: document.getElementById('signup-password'),
      memberStatusText: document.getElementById('member-status-text'),
      memberGoLoginBtn: document.getElementById('member-go-login-btn'),
      memberSubmitBtn: document.getElementById('member-submit-btn'),
    };

loadEditPayloadIfAny();

    // Guard: if core UI elements are missing, abort initialization gracefully.
    if (!el.paperType || !el.paperWeight || !el.quantity || !el.printSides || !el.paperSize) {
      console.error('[quote-print] Core elements not found. Check element IDs in HTML.');
      return;
    }


    function fillWeightOptions(){
      const type = el.paperType.value;
      const prev = Number(el.paperWeight.value || 0);
      // Prefer admin-configured weights from quote-print-price (settings/unitPriceConfig)
      const wf = unitPriceConfig?.digital_print?.weight_factor || {};
      const prefix = type === 'snow' ? 'snow_' : 'arte_';
      const fromCfg = Object.keys(wf)
        .filter(k => k.startsWith(prefix))
        .map(k => Number(String(k).replace(prefix,'')))
        .filter(n => Number.isFinite(n))
        .sort((a,b)=>a-b);

      // ✅ 용지별 두께 옵션 표시 규칙
      // - 단가관리(weight_factor)에 해당 용지의 두께가 1개라도 등록되어 있으면: 그 두께만 표시
      // - 없으면: 기본값(WEIGHTS) 사용
      //   (기본값은 quote-print-price의 DEFAULTS와 맞춰 둠)
      const base = (WEIGHTS[type] || []);
      const weights = (fromCfg.length ? fromCfg : base)
        .map(Number)
        .filter(n => Number.isFinite(n))
        .sort((a,b)=>a-b);

      // 혹시라도 비어있으면 최소 200g는 보여주기
      if (!weights.length) weights.push(200);

      el.paperWeight.innerHTML = '';
      weights.forEach(w=>{
        const opt = document.createElement('option');
        opt.value = String(w);
        opt.textContent = `${w}g`;
        el.paperWeight.appendChild(opt);
      });
      // keep selection if possible

      // 기존 선택값 유지(가능하면), 아니면 200g 우선
      if (prev && weights.includes(prev)) {
        el.paperWeight.value = String(prev);
      } else {
        el.paperWeight.value = String(weights.includes(200) ? 200 : weights[0]);
      }
    }

    function getOshiLines(){
      if (!el.oshiEnabled.checked) return 0;
      const v = document.querySelector('input[name="oshiLines"]:checked')?.value;
      return Number(v || 1);
    }

    function compute(){
      const qty = Number(el.quantity.value) || 0;
      const sides = Number(el.printSides.value) || 1;
      const size = el.paperSize.value;
      let mul = 0;
      try {
        mul = sizeMultiplier(size, el.customW.value, el.customH.value);
      } catch (e) {
        if (e?.message && /is not defined/i.test(String(e.message))) {
          console.error(e);
          alert('일시적인 오류가 발생했습니다. (코드 변수 참조)\n새로고침 후 다시 시도해주세요.');
        } else {
          alert(e?.message || '사이즈를 확인해주세요.');
        }
        mul = 0;
      }
      const paperType = el.paperType.value;
      const weight = el.paperWeight.value;
      const baseSpecKey = `${paperType}_200`;
      const wFactor = getWeightFactor(paperType, weight);
      const specKey = `${paperType}_${weight}`; // for display only
      const oshiLines = getOshiLines();

      el.minQtyHint.classList.add('hidden');

      if (qty <= 0){
        el.breakdown.innerHTML = `<div class="text-slate-400">수량을 입력하세요.</div>`;
        el.supplyPrice.textContent = '0원';
        el.vatPrice.textContent = '0원';
        el.totalPrice.textContent = '0원';
        return { ok:false };
      }
      if (size === 'CUSTOM' && mul === 0){
        el.breakdown.innerHTML = `<div class="text-red-600 font-bold">직접입력 사이즈(가로/세로)를 확인하세요.</div>`;
        el.supplyPrice.textContent = '0원';
        el.vatPrice.textContent = '0원';
        el.totalPrice.textContent = '0원';
        return { ok:false };
      }

      const unit = findPrice('output_base', baseSpecKey, qty);
      if (unit.price === 0){
        if (unit.hasSpec && unit.min > 0){
          el.breakdown.innerHTML = `<div class="text-red-600 font-bold">최소 ${unit.min.toLocaleString()}매 이상부터 견적 가능합니다.</div>`;
          el.minQtyHint.classList.remove('hidden');
        } else {
          el.breakdown.innerHTML = `<div class="text-red-600 font-bold">단가 정보가 없습니다. (단가관리에서 '${paperType === 'snow' ? '스노우지' : '아르떼'} 200g 기준(A4·1면) 출력단가'를 입력하세요)</div>`;
        }
        el.supplyPrice.textContent = '주문 불가';
        el.vatPrice.textContent = '-';
        el.totalPrice.textContent = '주문 불가';
        return { ok:false, minQty: unit.min || 0 };
      }

      const basePrint = unit.price * qty * sides * mul * wFactor;

      let oshiCost = 0;
      if (oshiLines > 0){
        const oshiUnit = getOshiPrice(oshiLines);
        oshiCost = oshiUnit * qty * mul;
      }

      const supplyRaw = basePrint + oshiCost;
      const totalRaw = supplyRaw * 1.1;
      const totalRounded = cut10(totalRaw); // 10원단위 절삭
      const supply = cut10(totalRounded / 1.1);
      const vat = totalRounded - supply;
      const total = totalRounded;

      // breakdown
      const sizeLabel = size === 'CUSTOM'
        ? `커스텀(${el.customW.value||'?'}×${el.customH.value||'?'})`
        : size;
      const mulPct = (mul * 100).toFixed(1);

      let html = '';
      html += `<div class="flex justify-between"><span class="text-slate-500">기준 출력단가(A4·1면·200g)</span><span class="font-bold">${Math.round(unit.price).toLocaleString()}원</span></div>`;
      html += `<div class="flex justify-between"><span class="text-slate-500">사이즈 계수</span><span class="font-bold">${mul.toFixed(3)} <span class="text-[11px] text-slate-400">(${sizeLabel}, ${mulPct}%)</span></span></div>`;
      html += `<div class="flex justify-between"><span class="text-slate-500">인쇄면</span><span class="font-bold">${sides === 1 ? '단면(1면)' : '양면(2면)'}</span></div>`;
      html += `<div class="flex justify-between"><span class="text-slate-500">용지</span><span class="font-bold">${paperType === 'snow' ? '스노우지' : '아르떼'} ${weight}g</span></div><div class="flex justify-between"><span class="text-slate-500">두께 계수</span><span class="font-bold">${wFactor.toFixed(2)} <span class="text-[11px] text-slate-400">(200g 기준)</span></span></div>`;
      if (oshiLines > 0){
        const oshiUnit = getOshiPrice(oshiLines);
        html += `<div class="flex justify-between"><span class="text-slate-500">오시(${oshiLines}줄)</span><span class="font-bold">${Math.round(oshiUnit).toLocaleString()}원/매 × ${qty.toLocaleString()}매 × ${mul.toFixed(3)}</span></div>`;
        html += `<div class="flex justify-between"><span class="text-slate-500">오시비</span><span class="font-extrabold text-slate-800">${Math.round(oshiCost).toLocaleString()}원</span></div>`;
      }
      html += `<div class="border-t border-dashed border-slate-200 mt-2 pt-2 space-y-1">`;
      html += `<div class="flex justify-between"><span class="text-slate-500">공급가액</span><span class="font-extrabold">${supply.toLocaleString()}원</span></div>`;
      html += `<div class="flex justify-between"><span class="text-slate-500">부가세 (10%)</span><span class="font-bold">${vat.toLocaleString()}원</span></div>`;
      html += `</div>`;
      html += `<div class="bg-slate-800 rounded-lg p-3 mt-2 flex justify-between items-center"><span class="font-bold text-white text-sm">최종결제금액</span><span class="text-lg font-extrabold text-brand-300">${totalRounded.toLocaleString()}원</span></div>`;
      el.breakdown.innerHTML = html;

      el.supplyPrice.textContent = `${supply.toLocaleString()}원`;
      el.vatPrice.textContent = `${vat.toLocaleString()}원`;
      el.totalPrice.textContent = `${total.toLocaleString()}원`;

      const roundingUnit = 10;
      const roundingDiff = totalRounded - totalRaw;

      return { ok:true, supply, vat, total, unitPrice: unit.price, mul, specKey, oshiLines, oshiCost, basePrint, supplyRaw, totalRaw, totalRounded, roundingUnit, roundingDiff };
    }

    // ---------- Auth ----------
    let currentUser = null;
    window.currentUser = null;
    // ── Firebase 인증 확보 ──────────────────────────────────────
    // 접수 시 Firestore 쓰기 권한을 얻기 위해 Firebase 로그인 상태를 확인합니다.
    // 비회원 접수는 익명(anonymous) 로그인을 사용하며, 이는 UI 세션과 무관합니다.
    async function ensureAuth(){
      // 1) Wait for auth state restoration
      const user = await new Promise((resolve) => {
        let resolved = false;
        const unsub = onAuthStateChanged(auth, (u) => {
          if (resolved) return;
          resolved = true;
          try { unsub && unsub(); } catch(e) {}
          currentUser = u || null;
          try { window.currentUser = currentUser; } catch(e) {}
          try { window.__currentUser = currentUser; } catch(e) {}
          updateUserMenuUI();
          resolve(currentUser);
        });

        // safety timeout
        setTimeout(() => {
          if (resolved) return;
          resolved = true;
          try { unsub && unsub(); } catch(e) {}
          currentUser = auth.currentUser || null;
          try { window.currentUser = currentUser; } catch(e) {}
          try { window.__currentUser = currentUser; } catch(e) {}
          updateUserMenuUI();
          resolve(currentUser);
        }, 2500);
      });

      // 2) If not signed in, try anonymous sign-in for guest flows
      if (!user){
        try{
          return await ensureGuestAuth();
        }catch(_){
          return null;
        }
      }
      return user;
    }

    async function ensureGuestAuth() {
      const existing = auth.currentUser;
      if (existing) return existing;
      try{
        const cred = await signInAnonymously(auth);
        currentUser = cred.user;
        updateUserMenuUI();
        return currentUser;
      }catch(e){
        console.warn('[quote-print] anonymous sign-in failed:', e);
        throw e;
      }
    }

// ---------- Submit ----------
    
    // ---------- Guest Lookup Key (same as quote-book) ----------
    // SHA-256 helper
    // - Uses WebCrypto when available (HTTPS / secure context).
    // - Falls back to a pure-JS SHA-256 implementation when crypto.subtle is unavailable
    //   (e.g., http://, file://, some embedded webviews).
    async function sha256Hex(message){
      try{
        if (globalThis.crypto && crypto.subtle && typeof crypto.subtle.digest === 'function'){
          const msgUint8 = new TextEncoder().encode(message);
          const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }
      }catch(e){
        console.warn('[sha256Hex] WebCrypto failed, using fallback:', e);
      }
      return sha256HexFallback(message);
    }

    // Pure-JS SHA-256 (fallback) — deterministic, no external deps
    function sha256HexFallback(ascii){
      function rightRotate(value, amount){ return (value>>>amount) | (value<<(32-amount)); }

      const mathPow = Math.pow;
      const maxWord = mathPow(2, 32);
      let result = '';

      const words = [];
      let asciiBitLength = ascii.length * 8;

      // Caches for constants
      const hash = sha256HexFallback.h = sha256HexFallback.h || [];
      const k = sha256HexFallback.k = sha256HexFallback.k || [];
      let primeCounter = k.length;

      // Generate constants (first 64 primes)
      if (primeCounter === 0){
        const isPrime = (n) => {
          for (let i=2; i*i<=n; i++) if (n % i === 0) return false;
          return true;
        };
        let candidate = 2;
        while (primeCounter < 64){
          if (isPrime(candidate)){
            if (primeCounter < 8) hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
            k[primeCounter] = (mathPow(candidate, 1/3) * maxWord) | 0;
            primeCounter++;
          }
          candidate++;
        }
      }

      // Pre-processing (UTF-8)
      // Convert to UTF-8 bytes (so Korean/emoji doesn't break determinism)
      const utf8 = unescape(encodeURIComponent(ascii));
      ascii = utf8;
      asciiBitLength = ascii.length * 8;

      // Append '1' bit (0x80)
      words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
      // Append length (in bits) as 64-bit big-endian integer
      words[((asciiBitLength + 64 >> 9) << 4) + 15] = asciiBitLength;

      // Convert string to words
      for (let i=0; i<ascii.length; i++){
        const j = i >> 2;
        words[j] = words[j] || 0;
        words[j] |= ascii.charCodeAt(i) << (24 - (i % 4) * 8);
      }

      // Process each 512-bit chunk
      for (let j=0; j<words.length; ){
        const w = words.slice(j, j += 16);
        const oldHash = hash.slice(0);

        // Extend to 64 words
        for (let i=16; i<64; i++){
          const s0 = rightRotate(w[i-15], 7) ^ rightRotate(w[i-15], 18) ^ (w[i-15] >>> 3);
          const s1 = rightRotate(w[i-2], 17) ^ rightRotate(w[i-2], 19) ^ (w[i-2] >>> 10);
          w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
        }

        let a = hash[0], b = hash[1], c = hash[2], d = hash[3];
        let e = hash[4], f = hash[5], g = hash[6], h = hash[7];

        for (let i=0; i<64; i++){
          const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
          const ch = (e & f) ^ (~e & g);
          const temp1 = (h + S1 + ch + k[i] + w[i]) | 0;
          const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
          const maj = (a & b) ^ (a & c) ^ (b & c);
          const temp2 = (S0 + maj) | 0;

          h = g;
          g = f;
          f = e;
          e = (d + temp1) | 0;
          d = c;
          c = b;
          b = a;
          a = (temp1 + temp2) | 0;
        }

        hash[0] = (hash[0] + a) | 0;
        hash[1] = (hash[1] + b) | 0;
        hash[2] = (hash[2] + c) | 0;
        hash[3] = (hash[3] + d) | 0;
        hash[4] = (hash[4] + e) | 0;
        hash[5] = (hash[5] + f) | 0;
        hash[6] = (hash[6] + g) | 0;
        hash[7] = (hash[7] + h) | 0;

        // Restore hash state for next block
        // (We keep cumulative hash as per SHA-256 standard; oldHash not used here)
      }

      for (let i=0; i<8; i++){
        for (let j=3; j+1; j--){
          const b = (hash[i] >> (j * 8)) & 255;
          result += (b < 16 ? '0' : '') + b.toString(16);
        }
      }
      return result;
    }

    // ── 주문자 정보 입력 모달 열기/닫기 ──────────────────────────
    // 비회원 접수 시 이름+연락처를 입력받는 팝업을 엽니다.
    function openSignupModal(){
      el.signupModal.classList.remove('hidden');
      el.signupModal.classList.add('flex');
      // tab switching is only needed if tab elements exist (old multi-tab modal)
      // new modal is single-form guest-only, so these are no-ops when elements are absent
      try { switchSignupTab('guest'); } catch(e) {}
      try { refreshMemberTabUI(); } catch(e) {}
      // focus
      setTimeout(()=>{ try { (el.signupName || el.signupContact)?.focus?.(); } catch(e) {} }, 50);
    }
    function closeSignupModal(){
      el.signupModal.classList.add('hidden');
      el.signupModal.classList.remove('flex');
    }

    function switchSignupTab(tab){
      // Tab elements may not exist in the simplified single-form modal
      if (!el.tabGuest && !el.tabMember) return;
      const isGuestTab = (tab === 'guest');
      if (isGuestTab){
        el.tabGuest?.classList.add('bg-white','text-brand-700','shadow-sm');
        el.tabGuest?.classList.remove('text-slate-500');
        el.tabMember?.classList.remove('bg-white','text-brand-700','shadow-sm');
        el.tabMember?.classList.add('text-slate-500');
        el.guestTab?.classList.remove('hidden');
        el.memberTab?.classList.add('hidden');
      } else {
        el.tabMember?.classList.add('bg-white','text-brand-700','shadow-sm');
        el.tabMember?.classList.remove('text-slate-500');
        el.tabGuest?.classList.remove('bg-white','text-brand-700','shadow-sm');
        el.tabGuest?.classList.add('text-slate-500');
        el.guestTab?.classList.add('hidden');
        el.memberTab?.classList.remove('hidden');
      }
    }

    function refreshMemberTabUI(){
      const loggedIn = !!(currentUser && !currentUser.isAnonymous);
      if (loggedIn){
        if (el.memberStatusText) el.memberStatusText.textContent = '로그인 확인 완료. 회원으로 접수할 수 있습니다.';
        el.memberGoLoginBtn?.classList.add('hidden');
        el.memberSubmitBtn?.classList.remove('hidden');
      } else {
        if (el.memberStatusText) el.memberStatusText.textContent = '회원 접수는 로그인 후 이용 가능합니다.';
        el.memberGoLoginBtn?.classList.remove('hidden');
        el.memberSubmitBtn?.classList.add('hidden');
      }
    }

    
    // ---------- Member Contact Resolve ----------
    function normalizeContactDigits(v){
      const raw = (v ?? '').toString();
      const digits = raw.replace(/[^0-9]/g,'');
      return digits;
    }
    function pickContactFromUserData(userData){
      if(!userData) return '';
      const cands = [];
      const push=(v)=>{ if(v!==undefined && v!==null && String(v).trim()!=='') cands.push(v); };
      if(typeof userData.contact==='string' || typeof userData.contact==='number') push(userData.contact);
      if(userData.contact && typeof userData.contact==='object'){
        push(userData.contact.phone); push(userData.contact.tel); push(userData.contact.mobile); push(userData.contact.value);
      }
      push(userData.phone); push(userData.phoneNumber); push(userData.phone_number);
      push(userData.mobile); push(userData.cell); push(userData.tel); push(userData.telephone);
      if(userData.profile && typeof userData.profile==='object'){
        push(userData.profile.phone); push(userData.profile.tel); push(userData.profile.mobile);
      }
      for(const v of cands){
        const d = normalizeContactDigits(v);
        if(d) return d;
      }
      return '';
    }
    async function resolveMemberContact(uid){
      if(!uid) return '';
      try{
        const snap = await getDoc(doc(db,'users', uid));
        if(snap.exists()){
          return pickContactFromUserData(snap.data()) || '';
        }
        return '';
      }catch(e){
        console.warn('resolveMemberContact failed:', e);
        return '';
      }
    }

    // ── 폼 데이터 복구 ────────────────────────────────────────
    // 페이지 로드 시 localStorage 에 저장된 임시 데이터를 복원합니다.
    async function loadTempFormData() {
        const saved = localStorage.getItem('temp_quote_print');
        if (!saved) return;
        
        // 수정 모드인 경우 복구 로직 스킵
        if (new URLSearchParams(location.search).get('edit') === '1') return;

        // ★ [핵심 추가] 관리자 체크 및 리다이렉트
        // 로그인된 상태라면 권한을 확인합니다.
        if (window.currentUser && !window.currentUser.isAnonymous) {
             try {
                // DB에서 유저 정보(권한) 조회
                const userRef = doc(db, "users", window.currentUser.uid);
                const userSnap = await getDoc(userRef);
                
                if (userSnap.exists() && userSnap.data().role === 'admin') {
                    // 관리자라면 복구 알림을 띄우지 않고, 즉시 관리자 페이지로 이동
                    location.replace('admin.html');
                    return; 
                }
             } catch(e) {
                 console.warn('Admin check failed:', e);
             }
        }

        // 일반 회원/비회원일 경우에만 복구 알림 표시
        try {
            const d = JSON.parse(saved);
            // 1시간 지난 데이터는 폐기
            if (Date.now() - d.timestamp > 3600000) { 
                localStorage.removeItem('temp_quote_print'); 
                return; 
            }

            if(confirm('로그인 전 작성하던 내용이 있습니다. 불러오시겠습니까?')) {
                const setVal = (id, v) => {
                    const el = document.getElementById(id);
                    if(el) { el.value = v || ''; el.dispatchEvent(new Event('change')); }
                };
                
                setVal('orderName', d.orderName);
                setVal('quantity', d.quantity);
                setVal('printSides', d.printSides);
                setVal('paperType', d.paperType);
                fillWeightOptions(); // 용지 변경 후 두께 옵션 갱신
                setVal('paperWeight', d.paperWeight);
                setVal('paperSize', d.paperSize);
                setVal('customW', d.customW);
                setVal('customH', d.customH);
                toggleCustom();

                if (d.oshiEnabled) {
                    document.getElementById('oshiEnabled').checked = true;
                    toggleOshi();
                    const radio = document.querySelector(`input[name="oshiLines"][value="${d.oshiLines}"]`);
                    if(radio) radio.checked = true;
                }
                
                setTimeout(compute, 100); 
            }
            // 불러온 후(또는 취소 후) 삭제하여 중복 알림 방지
            localStorage.removeItem('temp_quote_print');
        } catch(e) {}
    }


// ---------- Submit Core ----------
// === EDIT_MODE_PRINT_V5 (수정5차) ===
// (editState moved near the top to avoid TDZ)
function loadEditPayloadIfAny(){
  try{
    const raw = localStorage.getItem('quoteToReload');
    if(!raw) return;
    const data = JSON.parse(raw);
    if(!data || (data.mode!=='edit' && data.mode!=='admin_edit')) return;
    if(data.productType!=='print') return;

    editState.enabled = true;
    editState.quoteId = data.quoteId || null;
    editState.adminEdit = (data.mode==='admin_edit');

    // --- Prefill (NEW: supports both new spec format and legacy mypage format) ---
    // 1) order name
    if (data.orderName) el.orderName.value = data.orderName;
    else if (data.title) el.orderName.value = data.title;

    // 2) spec format (preferred)
    const spec = data.spec || null;

    // 3) legacy fields from mypage (title/size/quantity/options...)
    //    legacy.options may include: { paperTypeKey, weight, sides, oshiEnabled, oshiLines, customW, customH, ... }
    const legacy = (!spec && (data.size || data.quantity || data.options)) ? {
      paperTypeKey: data.options?.paperTypeKey || data.options?.paperType || null,
      weight: data.options?.weight || data.options?.paperWeight || null,
      size: data.size || data.options?.size || null,
      customW: data.options?.customW || data.options?.width || null,
      customH: data.options?.customH || data.options?.height || null,
      sides: data.options?.sides || data.options?.printSides || null,
      quantity: data.quantity || data.options?.quantity || null,
      oshiEnabled: data.options?.oshiEnabled ?? null,
      oshiLines: data.options?.oshiLines ?? null,
    } : null;

    const s = spec || legacy;

    if (s){
      try{
        if (s.paperTypeKey) el.paperType.value = s.paperTypeKey;
        if (s.weight) el.paperWeight.value = String(s.weight);
        if (s.size) el.paperSize.value = s.size;

        if (s.size === 'CUSTOM'){
          el.customW.value = s.customW != null ? String(s.customW) : '';
          el.customH.value = s.customH != null ? String(s.customH) : '';
          document.getElementById('custom-size-wrap')?.classList.remove('hidden');
        }

        if (s.sides) el.printSides.value = String(s.sides);
        if (s.quantity) el.quantity.value = String(s.quantity);

        if (s.oshiEnabled != null) el.oshiEnabled.checked = !!s.oshiEnabled;
        if (s.oshiLines != null){
          const r = document.querySelector(`input[name="oshiLines"][value="${s.oshiLines}"]`);
          if (r) r.checked = true;
        }
      }catch(e){}
    }

    // 게스트 세션 주입(비회원 수정/재신청 시 동일하게 동작)
    // ⚠️ mypage는 가능하면 guestLookupKey + guestPwLast4로 조회하므로, edit 진입 시에도 pwLast4/연락처 등을 함께 복원해야 함
    if (data.isGuest && data.guestLookupKey){
      // 기존 키가 있으면 legacy로 보관 (수정 후 마이페이지에서 두 견적 모두 보이도록)
      try{
        const prevKey = (sessionStorage.getItem('guestLookupKey') || localStorage.getItem('guestLookupKey') || '').trim();
        if (prevKey && prevKey !== data.guestLookupKey){
          try{ sessionStorage.setItem('guestLookupKeyLegacy', prevKey); }catch(e){}
          try{ localStorage.setItem('guestLookupKeyLegacy', prevKey); }catch(e){}
        }
      }catch(e){}
      // 기존 키가 있으면 legacy로 보관 (수정 후 마이페이지에서 두 견적 모두 보이도록)
      try{
        const prevKey = (sessionStorage.getItem('guestLookupKey') || localStorage.getItem('guestLookupKey') || '').trim();
        if (prevKey && prevKey !== data.guestLookupKey){
          try{ sessionStorage.setItem('guestLookupKeyLegacy', prevKey); }catch(e){}
          try{ localStorage.setItem('guestLookupKeyLegacy', prevKey); }catch(e){}
        }
      }catch(e){}
      try{ sessionStorage.setItem('guestLookupKey', data.guestLookupKey); }catch(e){}
      try{ localStorage.setItem('guestLookupKey', data.guestLookupKey); }catch(e){}

      if (data.guestLookupKeyLegacy){
        try{ sessionStorage.setItem('guestLookupKeyLegacy', data.guestLookupKeyLegacy); }catch(e){}
        try{ localStorage.setItem('guestLookupKeyLegacy', data.guestLookupKeyLegacy); }catch(e){}
      }

      if (data.guestName) {
        try{ sessionStorage.setItem('guestName', data.guestName); }catch(e){}
        try{ localStorage.setItem('guestName', data.guestName); }catch(e){}
      }
      if (data.guestContact){
        try{ sessionStorage.setItem('guestContact', data.guestContact); }catch(e){}
        try{ localStorage.setItem('guestContact', data.guestContact); }catch(e){}
      }
      if (data.guestContactRaw){
        try{ sessionStorage.setItem('guestContactRaw', data.guestContactRaw); }catch(e){}
        try{ localStorage.setItem('guestContactRaw', data.guestContactRaw); }catch(e){}
      }
      const pw4 = (data.guestPwLast4 || (data.guestContact||'').toString().replace(/[^0-9]/g,'').slice(-4) || '').toString();
      if (pw4){
        try{ sessionStorage.setItem('guestPwLast4', pw4); }catch(e){}
        try{ localStorage.setItem('guestPwLast4', pw4); }catch(e){}
      }
    }

    // 버튼 문구
    try{
      el.submitBtn.innerHTML = editState.adminEdit
        ? '<i class="fas fa-pen-to-square mr-2"></i>관리자 수정 저장'
        : '<i class="fas fa-pen-to-square mr-2"></i>수정 저장';
    }catch(e){}

    // ✅ 수정모드 1회성: 로딩 후에는 상태 제거 (일반 진입 시 수정페이지 자동로딩 방지)
    try{ localStorage.removeItem('quoteToReload'); }catch(e){}
  }catch(e){ console.warn('loadEditPayloadIfAny failed', e); }
}
// === /EDIT_MODE_PRINT_V5 ===

// ── Firestore 견적 문서 저장 ─────────────────────────────────
// 실제 Firestore 에 접수 데이터를 저장합니다.
async function submitQuoteRequest(user, ordererName, ordererContact, ordererCompany = '', opts = {}){
      // UI만 갱신하고, 계산 결과는 compute()의 반환값을 사용
      refreshMemberTabUI();
      const calc = compute();
      if (!calc.ok){
        showToast('사양/최소수량/단가를 확인해주세요.', 'error');
        return;
      }

      const isGuest = !!opts.isGuest && (!user || user.isAnonymous === true || opts.forceGuest === true);
      const guestLookupKey = opts.guestLookupKey || null;
      const guestContactRaw = opts.guestContactRaw || null;
      const normalizedContact = (ordererContact || '').toString().replace(/[^0-9]/g, '');

      if (isGuest){
        if (!guestLookupKey || !ordererName || !normalizedContact){
          showToast('비회원 정보(이름/연락처)를 확인해주세요.', 'error');
          return;
        }
      } else {
        if (!user || !user.uid || user.isAnonymous){
          showToast('로그인 상태를 확인해주세요.', 'error');
          return;
        }
      }

      if (isGuest && !auth.currentUser) { await ensureGuestAuth(); }

      // UI lock
      const setBtnLoading = (btn, on) => {
        if (!btn) return;
        btn.disabled = !!on;
        const spinner = btn.querySelector('i.fa-spinner');
        const textEl = btn.querySelector('.btn-text');
        if (spinner) spinner.classList.toggle('hidden', !on);
        if (textEl) textEl.textContent = on ? '접수 중...' : (btn.id === 'member-submit-btn' ? '회원으로 접수하기' : '동의하고 접수하기');
      };

      try {
        // reflect to main submit button
        el.submitBtn.disabled = true;
        el.submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>접수 중...';

        const paperTypeKey = el.paperType.value || 'snow';
        const paperTypeText = paperTypeKey === 'snow' ? '스노우지' : '아르떼';
        const weight = el.paperWeight.value;
        const size = el.paperSize.value;
        const sizeText = size === 'CUSTOM'
          ? `${Number(el.customW.value||0)}x${Number(el.customH.value||0)}`
          : size;

        const qty = Number(el.quantity.value||0);
        const sides = Number(el.printSides.value||1);

        const oshiEnabled = !!el.oshiEnabled.checked;
        const oshiLines = oshiEnabled ? Number((document.querySelector('input[name="oshiLines"]:checked')||{}).value || 0) : 0;

        const quoteDoc = {
          type: 'digital_print',
          product: '디지털 인쇄',
          productType: 'print',
          orderName: (el.orderName.value || '').trim() || '디지털 인쇄',

          spec: {
            paperTypeKey,
            paperTypeText,
            weight,
            size,
            sizeText,
            customW: size==='CUSTOM' ? Number(el.customW.value||0) : null,
            customH: size==='CUSTOM' ? Number(el.customH.value||0) : null,
            sides,
            quantity: qty,
            oshiEnabled,
            oshiLines,
          },

          // pricing
          supplyPrice: calc.supply,
          vatPrice: calc.vat,
          totalPrice: calc.total,
          unitPrice: calc.unitPrice,
          sizeMultiplier: calc.mul,
          basePrint: calc.basePrint,
          oshiCost: calc.oshiCost,
          breakdownHtml: el.breakdown.innerHTML,
          breakdownData: JSON.stringify([{ digital_print: { unitPrice: calc.unitPrice, mul: calc.mul, sides, basePrint: calc.basePrint, oshiLines, oshiCost: calc.oshiCost, supplyRaw: calc.supplyRaw, totalRaw: calc.totalRaw, totalRounded: calc.totalRounded, roundingUnit: calc.roundingUnit, roundingDiff: calc.roundingDiff } }]),
          // For multi-item compatible rendering in admin/mypage
          formData: JSON.stringify([{
            productType: 'print',
            category: 'digital_print',
            orderName: (el.orderName.value || '').trim() || '디지털 인쇄',
            title: (el.orderName.value || '').trim() || '디지털 인쇄',
            quantity: qty,
            unit: '매',
            unitPrice: calc.unitPrice,
            itemTotal: calc.total,
            specsText: {
              용지: `${paperTypeText} ${weight}g`,
              사이즈: sizeText,
              인쇄면: (sides === 1 ? '단면(1면)' : '양면(2면)'),
              수량: `${qty.toLocaleString()}매`,
              오시: (oshiLines > 0 ? `${oshiLines}줄` : '없음'),
              '사이즈계수': (calc.mul || 0).toFixed(3),
              '10원단위절삭': `${(calc.totalRaw||0).toLocaleString()}원 → ${(calc.totalRounded||0).toLocaleString()}원 (차이 ${(calc.roundingDiff||0).toLocaleString()}원)`
            },
            breakdownHtml: el.breakdown.innerHTML,
            pricing: {
              supplyRaw: calc.supplyRaw,
              totalRaw: calc.totalRaw,
              totalRounded: calc.totalRounded,
              roundingUnit: calc.roundingUnit,
              roundingDiff: calc.roundingDiff,
              supply: calc.supply,
              vat: calc.vat,
              total: calc.total,
              basePrint: calc.basePrint,
              oshiCost: calc.oshiCost
            }
          }]),


          // customer
          userId: isGuest ? 'guest' : user.uid,
          isGuest,
          
          guestUid: isGuest ? (auth.currentUser ? auth.currentUser.uid : null) : null,
ordererName: ordererName,
          ordererContact: normalizedContact,
          ordererCompany: ordererCompany || '',

          guestName: isGuest ? ordererName : null,
          guestContact: isGuest ? normalizedContact : null,
          guestContactRaw: isGuest ? (guestContactRaw || null) : null,
          guestContactHyphen: isGuest ? (formatPhoneHyphen(normalizedContact) || null) : null,
          guestLookupKey: isGuest ? guestLookupKey : null,
          guestPwLast4: isGuest ? (normalizedContact || '').slice(-4) : null,
          guestNameNorm: isGuest ? (ordererName || '').replace(/\s+/g,'').trim() : null,

          status: '접수완료',
          createdAt: Timestamp.now(),
          hasUnreadAdminMessage: false,
          hasUnreadCustomerMessage: false,
        };

        // DIFF_SUMMARY_PRINT_V6
function makeDiffSummaryPrint(oldDoc, newDoc){
  // 간단 알림만 남기기(마이페이지 메시지 과도한 상세 방지)
  return '견적이 수정되었습니다.';
}
// /DIFF_SUMMARY_PRINT_V6

// SAVE_LOGIC_PRINT_V5
// save: create or update
let savedDocId = null;
let existingAttachments = [];
if (editState.enabled && editState.quoteId){
  savedDocId = editState.quoteId;
  const targetRef = doc(db, "quotes", savedDocId);
  const snap = await getDoc(targetRef);
  if (snap.exists()){
    const existing = snap.data() || {};
    existingAttachments = Array.isArray(existing.attachments) ? existing.attachments : [];
    // 고객 수정 잠금: Firestore Rules와 동일하게 "접수완료"일 때만 고객 수정 허용 (관리자 예외)
    if (!editState.adminEdit && (existing.status !== '접수완료')) {
      showToast(`현재 상태(${existing.status || '-'})에서는 수정이 불가합니다. (접수완료 상태에서만 수정 가능)`, 'error');
      throw new Error('CUSTOMER_EDIT_LOCKED');
    }
    const payload = { ...quoteDoc };
     delete payload.createdAt;
     delete payload.receiptNo;
	     // ✅ 비회원(guest) 수정 시, Rules에서 신원/키 필드는 보통 immutable 이므로 기존 값을 유지
	     // (guestUid, guestLookupKey, guestPwLast4, userId/isGuest 등)
	     if (existing.isGuest === true || existing.userId === 'guest' || existing.userId === 'GUEST'){
	       const immutable = [
	         'userId','isGuest','guestUid','guestLookupKey','guestPwLast4',
	         'guestName','guestContact','guestContactRaw','guestContactHyphen','guestNameNorm',
	         'ordererName','ordererContact','ordererCompany'
	       ];
	       immutable.forEach((k)=>{
	         if (existing[k] !== undefined && existing[k] !== null){
	           payload[k] = existing[k];
	         }
	       });
	     }
     
     // ✅ 관리자 수정 모드: 회원 견적의 소유자/주문자 정보가 관리자 계정으로 덮이는 것을 방지
// ✅ 관리자 수정 모드: 회원/비회원 구분과 주문자 정보가 관리자 계정/비회원 값으로 덮이지 않도록 고정
     if (editState.adminEdit){
       // 기존 문서 기준으로 소유/구분을 강제 고정
       const existingIsGuest = (existing.isGuest === true || existing.userId === 'guest' || existing.userId === 'GUEST');
       payload.userId = existing.userId;
       payload.isGuest = existingIsGuest;

       if (existingIsGuest){
         // 비회원 문서는 게스트 신원/키 필드를 기존값으로 유지 (규칙/일관성)
         const immutable = [
           'userId','isGuest','guestUid','guestLookupKey','guestPwLast4',
           'guestName','guestContact','guestContactRaw','guestContactHyphen','guestNameNorm',
           'ordererName','ordererContact','ordererCompany'
         ];
         immutable.forEach((k)=>{
           if (existing[k] !== undefined && existing[k] !== null){
             payload[k] = existing[k];
           }
         });
       } else {
         // ✅ 회원 문서는 '비회원 값/관리자 값'이 섞이지 않게 주문자 정보를 기존값으로 강제 유지
         payload.ordererName = existing.ordererName || payload.ordererName || '';
         payload.ordererContact = existing.ordererContact || payload.ordererContact || '';
         payload.ordererCompany = existing.ordererCompany || payload.ordererCompany || '';

         // 회원 문서에서 게스트 관련 필드가 남아있지 않도록 정리(있어도 무방하지만 혼선을 방지)
         const guestFields = ['guestUid','guestLookupKey','guestPwLast4','guestName','guestContact','guestContactRaw','guestContactHyphen','guestNameNorm'];
         guestFields.forEach((k)=>{ if (k in payload) delete payload[k]; });
       }
     }

// 진행중/완료 상태를 덮어쓰지 않도록 기존 상태 유지 (Firestore Rules: guest status immutable)
     payload.status = existing.status || payload.status;
    // ✅ Rules 호환: 회원/비회원 공통 불변 필드(소유/타입)는 항상 기존값 유지
    if (!editState.adminEdit) {
      if (existing.userId !== undefined) payload.userId = existing.userId;
      if (existing.isGuest !== undefined) payload.isGuest = existing.isGuest;
      if (existing.productType !== undefined) payload.productType = existing.productType;
    }
     payload.updatedAt = Timestamp.now();
payload.lastEditedBy = editState.adminEdit ? 'admin' : 'customer';
    payload.lastEditedAt = Timestamp.now();
    payload.hasUnreadAdminMessage = editState.adminEdit ? false : true;
    payload.hasUnreadCustomerMessage = editState.adminEdit ? true : false;
    const diffText = editState.adminEdit ? '관리자가 견적을 수정했습니다.' : '견적이 수정되었습니다.';
    await updateDoc(targetRef, payload);
    try{
      await addDoc(collection(db, `quotes/${savedDocId}/messages`), {
        sender: editState.adminEdit ? 'admin' : 'customer',
        timestamp: serverTimestamp(),
        text: diffText,
        type: 'system'
      });
    }catch(e){ console.warn('diff message failed', e); }
} else {
    quoteDoc.receiptNo = await generateReceiptNo();
    const newRef = await addDoc(collection(db, "quotes"), quoteDoc);
    savedDocId = newRef.id;
    editState.enabled = false;
    editState.quoteId = null;
  }
} else {
  quoteDoc.receiptNo = await generateReceiptNo();
  const newRef = await addDoc(collection(db, "quotes"), quoteDoc);
  savedDocId = newRef.id;
}

        // attachments
        const files = Array.from(el.attachments?.files || []);
        const baseAttachments = Array.isArray(existingAttachments) ? existingAttachments : [];
        if (files.length > 0){
          const uploads = await Promise.all(files.map(async(file)=>{
            const safeName = file.name.replace(/[^a-zA-Z0-9._-가-힣\s]/g, '_');
            const path = `quotes/${savedDocId}/attachments/${Date.now()}_${safeName}`;
            const r = storageRef(storage, path);
            await uploadBytes(r, file);
            const url = await getDownloadURL(r);
            return { name: file.name, url, path, size: file.size, type: file.type || '' };
          }));
          await updateDoc(doc(db, "quotes", savedDocId), { attachments: uploads });
        }

        // save guest session for mypage lookup
        if (isGuest){
          // guest session persist
           const pwLast4 = (normalizedContact||'').toString().slice(-4);
           let legacyKey = null;
           try { if (guestContactRaw) legacyKey = await sha256Hex(`${ordererName}|${guestContactRaw}|${pwLast4}`); } catch(e) {}

           sessionStorage.setItem('guestLookupKey', guestLookupKey);
           if (legacyKey) sessionStorage.setItem('guestLookupKeyLegacy', legacyKey);
           sessionStorage.setItem('guestName', ordererName);
           sessionStorage.setItem('guestContact', normalizedContact);
           sessionStorage.setItem('guestPwLast4', pwLast4);
           if (guestContactRaw) sessionStorage.setItem('guestContactRaw', guestContactRaw);

           // persist to localStorage too (prevent session loss on refresh/new tab)
           try{
             localStorage.setItem('guestLookupKey', guestLookupKey);
             if (legacyKey) localStorage.setItem('guestLookupKeyLegacy', legacyKey);
             localStorage.setItem('guestName', ordererName);
             localStorage.setItem('guestContact', normalizedContact);
             localStorage.setItem('guestPwLast4', pwLast4);
             if (guestContactRaw) localStorage.setItem('guestContactRaw', guestContactRaw);
           }catch(e){}
         }
closeSignupModal();
        showToast('접수 완료! 마이페이지에서 진행상황을 확인할 수 있어요.', 'success');
        setTimeout(()=> location.href = isGuest ? 'mypage.html?guest=1' : 'mypage.html', 900);

      } catch(err){
        console.error(err);
        (function(){
          const msg = (err && (err.message || err.code)) ? String(err.message || err.code) : '';
          if (String(err?.code||'').includes('permission') || msg.toLowerCase().includes('permission') || msg.includes('403')){
            showToast('Firestore 권한(403) 오류: Firestore Rules에서 quotes 쓰기 권한을 허용해야 합니다.', 'error');
          } else {
            showToast('접수 중 오류가 발생했습니다.', 'error');
          }
        })();
        el.submitBtn.disabled = false;
        el.submitBtn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>견적 접수하기';
      }
    }

    // ---------- Submit Entry (open modal) ----------
    // ── 견적 접수 진입점 ─────────────────────────────────────────
    // 폼 제출 버튼 클릭 시 호출됩니다.
    // 우선순위: ① 기존 비회원 세션 → ② 회원 로그인 → ③ 관리자 수정 → ④ 주문자 정보 입력 모달 오픈
    let __QUOTE_SUBMIT_LOCK = false;
    async function submitQuote(e){
  e.preventDefault();
  if (__QUOTE_SUBMIT_LOCK) return;
  __QUOTE_SUBMIT_LOCK = true;
  try{const calc = compute();
  if (!calc.ok){
    showToast('사양/최소수량/단가를 확인해주세요.', 'error');
    return;
  }

  // ✅ 비회원(익명 로그인) 상태면 모달 없이 바로 접수/수정
  // - 수정(edit)이어도, 신규 접수여도 동일하게 작동
  try{
    const gKey = (sessionStorage.getItem('guestLookupKey') || localStorage.getItem('guestLookupKey') || '').trim();
    const gName = (sessionStorage.getItem('guestName') || localStorage.getItem('guestName') || '').trim();
    const gContact = (sessionStorage.getItem('guestContact') || localStorage.getItem('guestContact') || '').trim();
    const gContactRaw = (sessionStorage.getItem('guestContactRaw') || localStorage.getItem('guestContactRaw') || gContact || '').trim();

    if (gKey && gName && gContact){
      const u = await ensureAuth(); // 익명 로그인 포함
      if (!u){
        showToast('비회원 로그인(익명) 상태를 확인해주세요.', 'error');
        return;
      }
      await submitQuoteRequest(u, gName, gContact, '', { isGuest:true, guestLookupKey:gKey, guestContactRaw:gContactRaw });
      return;
    }
  }catch(err){
    console.warn('guest direct submit failed', err);
  }

// ✅ 회원 로그인 상태면 모달 없이 바로 접수/수정
  try{
    const u = auth.currentUser;
    if (u && u.uid && !u.isAnonymous){
      // 수정 모드: 기존 고객 정보 유지(이름이 바뀌는 문제 방지)
      if (editState?.enabled && !editState.adminEdit && editState.quoteId){
        try{
          const snap = await getDoc(doc(db,'quotes', editState.quoteId));
          if (snap.exists()){
            const ex = snap.data() || {};
            await submitQuoteRequest(u,
              (ex.ordererName || ''),
              (ex.ordererContact || ''),
              (ex.ordererCompany || ''),
              { isGuest:false }
            );
            return;
          }
        }catch(e){}
      }

      // 신규 접수: 회원 프로필/세션에서 가져와 접수
      const ordererName = (sessionStorage.getItem('userName') || (u.displayName || u.email || '회원')).toString();
      let contact = '';
      try{
        const userSnap = await getDoc(doc(db,'users',u.uid));
        if (userSnap.exists()){
          const d = userSnap.data() || {};
          contact = (d.contact || d.phone || d.phoneNumber || d.mobile || d.hp || '').toString().trim();
        }
      }catch(_){}
      if(!contact) contact = '연락처 없음';
      await submitQuoteRequest(u, ordererName, contact, '', { isGuest:false });
      return;
    }
  }catch(_){}

// ✅ 관리자 수정 모드(edit=1&adminEdit=1): 접수정보 입력 모달 없이 바로 '수정' 저장
  if (editState.enabled && editState.quoteId && editState.adminEdit){
    try{
      const targetRef = doc(db, "quotes", editState.quoteId);
      const snap = await getDoc(targetRef);
      if (snap.exists()){
        const ex = snap.data() || {};
        if (ex.isGuest === true || ex.userId === 'guest' || ex.userId === 'GUEST'){
          await submitQuoteRequest(null,
            ex.guestName || ex.ordererName || '',
            ex.guestContact || ex.ordererContact || '',
            ex.ordererCompany || '',
            { isGuest:true, guestLookupKey: ex.guestLookupKey || null, guestContactRaw: ex.guestContactRaw || null, guestPwLast4: ex.guestPwLast4 || '' }
          );
        } else {
          await submitQuoteRequest(auth.currentUser,
            ex.ordererName || '',
            ex.ordererContact || '',
            ex.ordererCompany || '',
            { isGuest:false }
          );
        }
        return;
      }
    }catch(e){
      // fallthrough
    }
  }
openSignupModal();
  } finally {
    __QUOTE_SUBMIT_LOCK = false;
  }
}


// ---------- Init ----------
    function toggleCustom(){
      const v = el.paperSize.value;
      const isCustomLike = (v === 'CUSTOM' || v === 'IN12x18' || v === 'IN13x19');
      el.customWrap.classList.toggle('hidden', !isCustomLike);

      if (v === 'IN12x18') { el.customW.value = 457; el.customH.value = 305; }
      if (v === 'IN13x19') { el.customW.value = 482; el.customH.value = 330; }
    }
    function toggleOshi(){
      el.oshiOptions.classList.toggle('hidden', !el.oshiEnabled.checked);
    }

    el.paperType.addEventListener('change', ()=>{ fillWeightOptions(); compute(); });
    el.paperWeight.addEventListener('change', compute);
    el.quantity.addEventListener('input', compute);
    el.printSides.addEventListener('change', compute);
    el.paperSize.addEventListener('change', ()=>{ toggleCustom(); compute(); });
    el.customW.addEventListener('input', compute);
    el.customH.addEventListener('input', compute);
    el.oshiEnabled.addEventListener('change', ()=>{ toggleOshi(); compute(); });
    document.querySelectorAll('input[name="oshiLines"]').forEach(r=> r.addEventListener('change', compute));
    el.refreshBtn.addEventListener('click', compute);
    el.form.addEventListener('submit', submitQuote);

    el.logoutBtn?.addEventListener('click', async ()=>{
      try{ await signOut(auth); } catch(e){}
      location.href = 'index.html';
    });
    userMenuLogoutBtn?.addEventListener('click', (e) => { e.preventDefault(); window.hardLogout('index.html'); });


    // signup modal events
    el.closeSignupModalBtn?.addEventListener('click', closeSignupModal);
    el.signupModal?.addEventListener('click', (ev)=>{ if(ev.target === el.signupModal) closeSignupModal(); });

    el.tabGuest?.addEventListener('click', ()=> switchSignupTab('guest'));
    el.tabMember?.addEventListener('click', ()=> { switchSignupTab('member'); refreshMemberTabUI(); });

    el.signupContact?.addEventListener('input', ()=>{
      const digits = (el.signupContact.value||'').replace(/[^0-9]/g,'');
      el.signupPassword.value = digits ? digits.slice(-4) : '';
    });

    el.signupForm?.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      const name = (el.signupName.value||'').trim();
      const contactRaw = (el.signupContact.value||'').trim();
      const contact = contactRaw.replace(/[^0-9]/g,'');
      if(!name || !contact){ showToast('이름/연락처를 입력해주세요.', 'error'); return; }
      const pw = (contact||'').slice(-4);
      el.signupPassword.value = pw;

      const btn = el.signupForm.querySelector('button[type="submit"]');
      const spinner = btn?.querySelector('i.fa-spinner');
      if(btn){ btn.disabled = true; }
      if(spinner) spinner.classList.remove('hidden');

      try{
        const guestLookupKey = await sha256Hex(`${name}|${contact}|${pw}`);
        const u = await ensureAuth();
        if (!u){
          showToast('비회원 접수를 위한 로그인(익명)이 실패했습니다. Firebase 콘솔에서 Anonymous 로그인을 활성화했는지 확인해주세요.', 'error');
          return;
        }
        await submitQuoteRequest(u, name, contact, '', { isGuest: true, guestLookupKey, guestContactRaw: contactRaw });
      } finally {
        if(btn){ btn.disabled = false; }
        if(spinner) spinner.classList.add('hidden');
      }
    });

    // ============================================================
    // [회원 접수 흐름 개선]
    // 비로그인 상태에서 "견적 접수하기" → 회원 탭에서 로그인하면,
    // 로그인 완료 후 자동으로 동일 견적이 접수되도록 pending 데이터를 저장합니다.
    // (첨부파일(File)은 localStorage에 저장할 수 없어 자동 이관되지 않습니다.)
    // ============================================================
    function __savePendingMemberSubmit(){
      try{
        const payload = {
          productType: 'print',
          timestamp: Date.now(),
          orderName: (el.orderName.value||'').trim(),
          quantity: el.quantity.value,
          printSides: el.printSides.value,
          paperType: el.paperType.value,
          paperWeight: el.paperWeight.value,
          paperSize: el.paperSize.value,
          customW: el.customW.value,
          customH: el.customH.value,
          oshiEnabled: !!el.oshiEnabled.checked,
          oshiLines: (document.querySelector('input[name="oshiLines"]:checked')||{}).value || '',
          // NOTE: attachments are not persisted
        };
        localStorage.setItem('pending_member_submit_print', JSON.stringify(payload));
      }catch(e){
        console.warn('save pending failed', e);
      }
    }

    function __applyPendingMemberSubmitIfAny(){
      try{
        const raw = localStorage.getItem('pending_member_submit_print');
        if(!raw) return null;
        const d = JSON.parse(raw);
        if(!d || d.productType!=='print') return null;
        // 2시간 지난 데이터는 폐기
        if(d.timestamp && (Date.now() - Number(d.timestamp)) > 2*60*60*1000){
          localStorage.removeItem('pending_member_submit_print');
          return null;
        }

        const setVal = (id, v) => {
          const x = document.getElementById(id);
          if(x){ x.value = (v==null? '' : v); x.dispatchEvent(new Event('change')); }
        };

        setVal('orderName', d.orderName);
        setVal('quantity', d.quantity);
        setVal('printSides', d.printSides);
        setVal('paperType', d.paperType);
        fillWeightOptions();
        setVal('paperWeight', d.paperWeight);
        setVal('paperSize', d.paperSize);
        setVal('customW', d.customW);
        setVal('customH', d.customH);
        toggleCustom();

        try{
          document.getElementById('oshiEnabled').checked = !!d.oshiEnabled;
          toggleOshi();
          if(d.oshiLines){
            const r = document.querySelector(`input[name="oshiLines"][value="${d.oshiLines}"]`);
            if(r) r.checked = true;
          }
        }catch(_){ }

        return d;
      }catch(e){
        console.warn('apply pending failed', e);
        return null;
      }
    }

    async function __autoSubmitAfterLoginIfNeeded(){
      // URL에 autopost=1이 있거나, pending이 있고 회원 로그인 상태면 자동 접수
      let shouldTry = false;
      try{
        const p = new URLSearchParams(location.search||'');
        if(p.get('autopost') === '1') shouldTry = true;
      }catch(_){ }

      const pending = __applyPendingMemberSubmitIfAny();
      if(!pending) return;
      if(!shouldTry) return; // 실수 방지: redirect로 온 경우만 자동 제출

      try{
        const u = auth.currentUser;
        if(!(u && u.uid && !u.isAnonymous)) return;

        // contact 조회
        const displayName = u.displayName || (sessionStorage.getItem('userName')||'회원');
        const memberContact = await resolveMemberContact(u.uid);

        // 계산 갱신 후 제출
        compute();
        showToast('로그인 완료! 저장된 견적을 자동 접수합니다.', 'success');
        await submitQuoteRequest(u, displayName, memberContact, '', { isGuest:false });
        // 성공 시 pending 삭제 (submitQuoteRequest 내부에서 mypage로 이동)
        localStorage.removeItem('pending_member_submit_print');
      }catch(e){
        console.warn('auto submit failed', e);
        // 실패 시에는 pending 유지 (사용자가 다시 시도 가능)
      }
    }

    el.memberGoLoginBtn?.addEventListener('click', ()=>{
      // 현재 작성한 사양을 저장해두고 로그인 페이지로 이동
      __savePendingMemberSubmit();
      try{
        // 로그인 후 다시 이 페이지로 돌아오게 설정
        localStorage.setItem('postLoginRedirect', 'quote-print.html?autopost=1');
      }catch(e){}
      location.href='index.html';
    });
    el.memberSubmitBtn?.addEventListener('click', async ()=>{
      refreshMemberTabUI();
      if(!(currentUser && !currentUser.isAnonymous)){ showToast('로그인 후 이용해주세요.', 'error'); return; }
      const company = ''; // (삭제됨) 소속/회사 입력란 없음
      const displayName = currentUser.displayName || '회원';
      // If phone not present, save empty; mypage can still show by uid
      const memberContact = await resolveMemberContact(currentUser.uid);
      await submitQuoteRequest(currentUser, displayName, memberContact, company, { isGuest:false });
    });

    // boot
    toggleCustom();
    toggleOshi();

    await loadUnitPriceConfig();
    await loadPrintGuide();
    fillWeightOptions();

    await ensureAuth();
// login UI
    if (currentUser && !currentUser.isAnonymous){
      el.loginBadge && (el.loginBadge.className = 'pill bg-blue-50 text-blue-700 border border-blue-100');
      el.loginBadge && (el.loginBadge.textContent = '회원');
      el.logoutBtn?.classList.remove('hidden');
    } else {
      el.loginBadge && (el.loginBadge.className = 'pill bg-yellow-50 text-yellow-800 border border-yellow-100');
      el.loginBadge && (el.loginBadge.textContent = '비회원');
      el.logoutBtn?.classList.add('hidden');
    }


    compute();
    loadTempFormData();
    // 로그인 페이지에서 돌아온 경우, 저장된 "회원 접수" 데이터를 자동 접수
    await __autoSubmitAfterLoginIfNeeded();

// ============================================================
    // [추가] 비회원 주문 조회 모달 로직 (누락된 부분 복구)
    // ============================================================
    const guestLookupBtn = document.getElementById('guest-lookup-open');
    const guestLookupModal = document.getElementById('guest-lookup-overlay');
    const guestLookupCloseBtn = document.getElementById('guest-lookup-close');
    const guestLookupForm = document.getElementById('guest-lookup-form');
    
    // 1. 모달 열기
    if (guestLookupBtn && guestLookupModal) {
        guestLookupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // 유저 메뉴 모달이 열려있다면 닫기
            if (userMenuModal) {
                userMenuModal.classList.add('hidden');
                userMenuModal.classList.remove('flex');
            }
            // 조회 모달 열기
            guestLookupModal.classList.remove('hidden');
            guestLookupModal.classList.add('flex');
            
            // 입력창 초기화 및 포커스
            const nameInput = document.getElementById('guestName');
            if (nameInput) setTimeout(() => nameInput.focus(), 50);
        });
    }

    // 2. 모달 닫기
    function closeGuestLookup() {
        if (guestLookupModal) {
            guestLookupModal.classList.add('hidden');
            guestLookupModal.classList.remove('flex');
        }
        // 에러 메시지 초기화
        const errDiv = document.getElementById('guest-err');
        if (errDiv) errDiv.classList.add('hidden');
    }

    if (guestLookupCloseBtn) {
        guestLookupCloseBtn.addEventListener('click', closeGuestLookup);
    }
    
    // 배경 클릭 시 닫기
    if (guestLookupModal) {
        guestLookupModal.addEventListener('click', (e) => {
            if (e.target === guestLookupModal) closeGuestLookup();
        });
    }

    // 3. 연락처 입력 시 자동 하이픈 및 비밀번호 자동완성 (조회창 전용)
    const guestContactInput = document.getElementById('guestContact');
    const guestPwInput = document.getElementById('guestPassword');
    
    if (guestContactInput) {
        let pwModified = false;
        if (guestPwInput) guestPwInput.addEventListener('input', () => { pwModified = true; });

        guestContactInput.addEventListener('input', (e) => {
            const raw = e.target.value.replace(/[^0-9]/g, '');
            // 하이픈 포맷팅
            if (raw.length > 3 && raw.length < 8) {
                e.target.value = raw.replace(/(\d{3})(\d+)/, '$1-$2');
            } else if (raw.length >= 8) {
                if (raw.length === 11) e.target.value = raw.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
                else if (raw.length === 10) e.target.value = raw.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
                else e.target.value = raw; // fallback
            } else {
                e.target.value = raw;
            }

            // 비밀번호 자동 입력 (뒤 4자리)
            if (!pwModified && guestPwInput) {
                guestPwInput.value = raw.slice(-4);
            }
        });
    }

    // 4. 조회 폼 제출 처리
    if (guestLookupForm) {
        guestLookupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errDiv = document.getElementById('guest-err');
            if (errDiv) errDiv.classList.add('hidden');

            const name = (document.getElementById('guestName')?.value || '').trim();
            const contactRaw = (document.getElementById('guestContact')?.value || '').trim();
            const contact = contactRaw.replace(/[^0-9]/g, '');
            const pw = (document.getElementById('guestPassword')?.value || '').trim();

            if (!name || !contact || !pw) {
                if (errDiv) {
                    errDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> 정보를 모두 입력해주세요.';
                    errDiv.classList.remove('hidden');
                }
                return;
            }

            const btn = guestLookupForm.querySelector('button[type="submit"]');
            const originalText = btn ? btn.innerText : '조회하기';
            if (btn) { btn.disabled = true; btn.innerText = '확인 중...'; }

            try {
                // 키 생성 (SHA-256)
                const key = await sha256Hex(`${name}|${contact}|${pw}`);
                const legacyKey = await sha256Hex(`${name}|${contactRaw}|${pw}`);

                // 세션 저장
                sessionStorage.setItem('guestLookupKey', key);
                sessionStorage.setItem('guestLookupKeyLegacy', legacyKey);
                sessionStorage.setItem('guestName', name);
                sessionStorage.setItem('guestContact', contact); // 숫자만
                sessionStorage.setItem('guestContactRaw', contactRaw); // 원본
                
                // 마이페이지로 이동 (guest=1 파라미터 포함)
                location.href = 'mypage.html?guest=1';
            } catch (err) {
                console.error(err);
                if (errDiv) {
                    errDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> 오류가 발생했습니다.';
                    errDiv.classList.remove('hidden');
                }
                if (btn) { btn.disabled = false; btn.innerText = originalText; }
            }
        });
    }

    });


        // ===== Mobile Navigation =====
        const mobileNavBtn = document.getElementById('mobile-nav-btn');
        const mobileNavModal = document.getElementById('mobileNavModal');
        const closeMobileNavBtn = document.getElementById('closeMobileNavBtn');

        function openMobileNav() {
            if (!mobileNavModal) return;
            mobileNavModal.classList.remove('hidden');
            mobileNavModal.classList.add('flex');
            document.body.style.overflow = 'hidden';
        }
        function closeMobileNav() {
            if (!mobileNavModal) return;
            mobileNavModal.classList.add('hidden');
            mobileNavModal.classList.remove('flex');
            document.body.style.overflow = '';
        }
        mobileNavBtn?.addEventListener('click', openMobileNav);
        closeMobileNavBtn?.addEventListener('click', closeMobileNav);
        mobileNavModal?.addEventListener('click', closeMobileNav);


// ✅ 사용자 메뉴(모달) 내 로그아웃 버튼 바인딩 (누락 방지)
(() => {
  const btn = document.getElementById('userMenuLogoutBtn');
  if (!btn) return;
  // 중복 바인딩 방지
  if (btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    try {
      // 모달 닫기
      const modal = document.getElementById('userMenuModal');
      if (modal) modal.classList.add('hidden');
    } catch (err) {}
    window.hardLogout(); // 공통 로그아웃
  });
})();