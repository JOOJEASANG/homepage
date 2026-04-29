// ============================================================
// header.js — 공통 헤더 렌더링 및 모달 처리
// 모든 페이지에서 initHeader(activeKey) 를 호출해 사용합니다.
// 포함 기능:
//   ① 접수/주문조회 모달 (이름+연락처+비밀번호 → mypage.html 이동)
//   ② 관리자 로그인 모달 (이메일+비밀번호 → admin.html 이동)
//   ③ 가이드안내 레이어 (work-guide.html iframe)
//   ④ 모바일 드로어 메뉴
// ============================================================

import {
  auth, onAuthStateChanged, signOut,
  signInWithEmailAndPassword, signInAnonymously,
  setPersistence, browserSessionPersistence, db,
} from "./firebase.js";
import { getSessionState, hardLogout } from "./session.js";
// ※ Firestore doc/getDoc 은 관리자 로그인 role 확인 시 동적 import 로 사용합니다.

// ── 상단 메뉴 목록 ───────────────────────────────────────────
const MENU = [
  { key: "book",  label: "책자/제본",  href: "quote-book.html"  },
  { key: "print", label: "디지털인쇄", href: "quote-print.html" },
  { key: "cs",    label: "고객센터",   href: "qna.html"         },
  { key: "guide", label: "작업가이드", href: "work-guide.html"  },
];

// ── SHA-256 해시 생성 ─────────────────────────────────────────
// 비회원 조회키(이름|연락처|비밀번호)를 SHA-256 으로 해시해 저장·비교합니다.
// HTTPS 환경에서는 브라우저 내장 WebCrypto 사용, HTTP(개발환경)에서는 순수 JS fallback 사용
async function sha256Hex(str) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch(e) {
    // WebCrypto 미지원 환경(HTTP, 일부 웹뷰) 전용 순수 JS 구현
    function rightRotate(v, a) { return (v >>> a) | (v << (32 - a)); }
    var maxWord = Math.pow(2, 32), mathPow = Math.pow;
    var result = "", words = [];
    var asciiBitLength = str.length * 8;
    var hash = [], k = [], primeCounter = 0;
    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (var i = candidate * candidate; i < 313; i += candidate) isComposite[i] = true;
        hash[primeCounter]  = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++]   = (mathPow(candidate, 1/3) * maxWord) | 0;
      }
    }
    // ✅ 한글 등 비ASCII 문자 대응: UTF-8 바이트열로 변환 후 처리
    str = unescape(encodeURIComponent(str));
    str += "\x80";
    while (str.length % 64 - 56) str += "\x00";
    for (var i = 0; i < str.length; i++) {
      var j = str.charCodeAt(i);
      if (j >> 8) return "";
      words[i >> 2] |= j << ((3 - i) % 4 * 8);
    }
    words[words.length] = ((asciiBitLength / maxWord) | 0);
    words[words.length] = (asciiBitLength | 0);
    for (var j = 0; j < words.length;) {
      var w = words.slice(j, j += 16);
      var oldHash = hash;
      hash = hash.slice(0, 8);
      for (var i = 0; i < 64; i++) {
        var w15 = w[i-15], w2 = w[i-2];
        var a = hash[0], e = hash[4];
        var temp1 = hash[7] + (rightRotate(e,6)^rightRotate(e,11)^rightRotate(e,25)) + ((e&hash[5])^((~e)&hash[6])) + k[i] + (w[i] = (i<16) ? w[i] : (w[i-16]+(rightRotate(w15,7)^rightRotate(w15,18)^(w15>>>3))+w[i-7]+(rightRotate(w2,17)^rightRotate(w2,19)^(w2>>>10)))|0);
        var temp2 = (rightRotate(a,2)^rightRotate(a,13)^rightRotate(a,22)) + ((a&hash[1])^(a&hash[2])^(hash[1]&hash[2]));
        hash = [(temp1+temp2)|0].concat(hash);
        hash[4] = (hash[4]+temp1)|0;
        hash.length = 8;
      }
      for (var i = 0; i < 8; i++) hash[i] = (hash[i]+oldHash[i])|0;
    }
    for (var i = 0; i < 8; i++)
      for (var j = 3; j+1; j--) {
        var b = (hash[i] >> (j*8)) & 255;
        result += ((b < 16) ? "0" : "") + b.toString(16);
      }
    return result;
  }
}

// ── 모달 HTML 생성 ────────────────────────────────────────────
// 헤더가 렌더링될 때 두 개의 모달이 DOM에 함께 삽입됩니다.
function getModalsHtml() {
  return `
  <!-- ① 접수/주문조회 모달: 이름+연락처 입력 후 마이페이지로 이동 -->
  <div id="hdr-lookup-modal" class="fixed inset-0 z-[9998] hidden items-center justify-center p-4"
       style="background:rgba(15,23,42,0.65);backdrop-filter:blur(3px)">
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-slide-up">
      <div class="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <h2 class="font-bold text-slate-800"><i class="fas fa-magnifying-glass text-brand-600 mr-2"></i>접수 / 주문 조회</h2>
        <button id="hdr-lookup-close" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-lg"></i></button>
      </div>
      <div class="p-6">
        <div class="bg-brand-50 border border-brand-100 rounded-lg p-3 mb-5 text-xs text-brand-800">
          <i class="fas fa-circle-info mr-1 text-brand-500"></i>
          접수 시 입력한 <b>이름 · 연락처 · 비밀번호</b>로 조회합니다.
        </div>
        <!-- 미로그인 상태: 입력 폼 -->
        <div class="space-y-3" id="hdr-lookup-form">
          <div>
            <label class="block text-xs font-bold text-slate-500 mb-1">이름</label>
            <input id="hdr-lookup-name" type="text" placeholder="주문자명"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-500 mb-1">연락처</label>
            <input id="hdr-lookup-contact" type="tel" placeholder="010-1234-5678"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-500 mb-1">비밀번호 <span class="text-slate-400 font-normal">(연락처 끝 4자리)</span></label>
            <input id="hdr-lookup-pw" type="password" placeholder="끝 4자리"
              class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
          </div>
          <div id="hdr-lookup-error" class="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 hidden"></div>
          <button id="hdr-lookup-submit" class="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg text-sm transition mt-1">
            <span class="btn-text">조회하기</span>
            <i class="fas fa-spinner fa-spin ml-2 hidden"></i>
          </button>
        </div>
        <!-- 이미 세션 중인 상태: 이름 표시 + 주문 내역 보기/로그아웃 -->
        <div id="hdr-lookup-loggedin" class="hidden text-center py-2">
          <p class="text-sm font-bold text-slate-700 mb-4" id="hdr-lookup-username"></p>
          <div class="flex flex-col gap-2">
            <a href="mypage.html?guest=1" class="block w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg text-sm transition">
              <i class="fas fa-list mr-2"></i>주문 내역 보기
            </a>
            <button id="hdr-lookup-logout" class="w-full py-2.5 border border-slate-300 text-slate-600 font-bold rounded-lg text-sm hover:bg-slate-50 transition">
              <i class="fas fa-sign-out-alt mr-2"></i>로그아웃
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ② 관리자 로그인 모달: 이메일+비밀번호 → Firestore role 확인 → admin.html 이동 -->
  <div id="hdr-admin-modal" class="fixed inset-0 z-[9999] hidden items-center justify-center p-4"
       style="background:rgba(15,23,42,0.75);backdrop-filter:blur(3px)">
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-slide-up">
      <div class="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <h2 class="font-bold text-slate-800"><i class="fas fa-shield-halved text-slate-600 mr-2"></i>관리자 로그인</h2>
        <button id="hdr-admin-close" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-lg"></i></button>
      </div>
      <div class="p-6 space-y-3">
        <div>
          <label class="block text-xs font-bold text-slate-500 mb-1">이메일</label>
          <input id="hdr-admin-email" type="email" placeholder="admin@example.com"
            class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 mb-1">비밀번호</label>
          <input id="hdr-admin-pw" type="password" placeholder="비밀번호 입력"
            class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100">
        </div>
        <div id="hdr-admin-error" class="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 hidden"></div>
        <button id="hdr-admin-submit" class="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg text-sm transition mt-1">
          <span class="btn-text">로그인</span>
          <i class="fas fa-spinner fa-spin ml-2 hidden"></i>
        </button>
      </div>
    </div>
  </div>
  `;
}

// ── 헤더 HTML 렌더링 ─────────────────────────────────────────
// activeKey: 현재 페이지에 해당하는 메뉴 키 (예: "book", "print", "cs", "guide")
export function renderHeader(activeKey = "") {
  const mount = document.getElementById("site-header");
  if (!mount) return;

  const { isMember, isGuest, displayName } = getSessionState();
  const authed = isMember || isGuest; // 세션 중인지 여부 (비회원 조회 포함)

  // 상단 메뉴 링크 생성 (현재 페이지는 굵은 밑줄 표시)
  const menuHtml = MENU.map(m => {
    const active = activeKey === m.key;
    const cls = active
      ? "text-brand-700 font-bold border-b-2 border-brand-600"
      : "text-slate-600 font-medium hover:text-brand-600 hover:bg-slate-50";
    if (m.key === "guide") {
      // 가이드안내는 페이지 이동 대신 레이어 팝업으로 열기
      return `<button type="button" data-action="work-guide" class="h-16 px-4 flex items-center transition-colors text-[15px] ${cls}">${m.label}</button>`;
    }
    return `<a href="${m.href}" class="h-16 px-4 flex items-center transition-colors text-[15px] ${cls}">${m.label}</a>`;
  }).join("");

  // 우측 버튼: 세션 중이면 이름 표시, 아니면 "주문조회" / 모바일은 아이콘/축약
  const lookupLabel = authed && displayName
    ? `<span class="hidden sm:inline">${displayName}님</span><span class="sm:hidden text-[13px]"><i class="fas fa-user text-[12px]"></i></span>`
    : `<span class="hidden sm:inline">주문조회</span><span class="sm:hidden text-[13px]">조회</span>`;

  const rightHtml = `
    <button id="btn-order-lookup" type="button"
      class="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-[14px] sm:text-[15px] font-medium rounded-lg
             ${authed ? "bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100" : "text-slate-600 hover:text-brand-600 hover:bg-slate-50"}
             transition">
      <i class="fas fa-magnifying-glass text-[13px]"></i>
      ${lookupLabel}
    </button>
    <button id="btn-admin-login" type="button" title="관리자"
      class="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition">
      <i class="fas fa-shield-halved text-[14px] sm:text-[15px]"></i>
    </button>
  `;

  mount.innerHTML = `
  <header class="fixed w-full top-0 z-50 bg-white border-b border-slate-200 shadow-sm h-16" id="main-header">
    <nav class="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
      <!-- 로고 -->
      <a class="flex items-center gap-2 group mr-2 lg:mr-8 shrink-0" href="index.html" aria-label="그린오피스 홈">
        <div class="w-8 h-8 bg-brand-600 rounded flex items-center justify-center text-white shadow-sm group-hover:bg-brand-700 transition-colors">
          <i class="fas fa-print"></i>
        </div>
        <span class="text-lg font-extrabold text-slate-800 tracking-tight leading-none">그린오피스</span>
      </a>

      <!-- PC 메뉴 (lg 이상에서 표시) -->
      <div class="hidden lg:flex items-center gap-1 h-full flex-grow">
        ${menuHtml}
      </div>

      <!-- 우측 버튼 영역 -->
      <div class="flex items-center gap-1">
        <!-- 모바일 햄버거 버튼 (lg 미만에서 표시) -->
        <div class="lg:hidden mr-1">
          <button id="btn-mobile-menu" class="p-2 text-slate-600 hover:text-brand-600 transition" aria-label="메뉴 열기">
            <i class="fa-solid fa-bars text-lg"></i>
          </button>
        </div>
        ${rightHtml}
      </div>
    </nav>

    <!-- 모바일 드로어 메뉴 (햄버거 클릭 시 펼쳐짐) -->
    <div id="mobile-menu" class="lg:hidden hidden absolute top-16 left-0 w-full bg-white border-b border-slate-200 shadow-xl">
      <div class="flex flex-col">
        ${MENU.map(m => {
          if (m.key === "guide") {
            return `<button type="button" data-action="work-guide" class="text-left w-full px-6 py-4 border-b border-slate-50 font-bold text-slate-700 hover:bg-brand-50 hover:text-brand-700">${m.label}</button>`;
          }
          return `<a href="${m.href}" class="w-full px-6 py-4 border-b border-slate-50 font-bold text-slate-700 hover:bg-brand-50 hover:text-brand-700">${m.label}</a>`;
        }).join("")}
      </div>
    </div>
  </header>
  ${getModalsHtml()}
  `;

  _bindEvents();
}

// ── 이벤트 바인딩 ─────────────────────────────────────────────
function _bindEvents() {
  // 모바일 햄버거 메뉴 토글
  const mobileBtn  = document.getElementById("btn-mobile-menu");
  const mobileMenu = document.getElementById("mobile-menu");
  mobileBtn?.addEventListener("click", () => mobileMenu?.classList.toggle("hidden"));

  // 가이드안내 버튼 → iframe 레이어 팝업
  document.getElementById("site-header")?.querySelectorAll('[data-action="work-guide"]').forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      mobileMenu?.classList.add("hidden");
      openWorkGuideLayer();
    });
  });

  // ── ① 접수/주문조회 모달 ──────────────────────────────────
  const lookupModal    = document.getElementById("hdr-lookup-modal");
  const lookupForm     = document.getElementById("hdr-lookup-form");
  const lookupLoggedin = document.getElementById("hdr-lookup-loggedin");

  // 버튼 클릭: 세션 중이면 이름+버튼 표시, 아니면 입력 폼 표시
  document.getElementById("btn-order-lookup")?.addEventListener("click", () => {
    const st = getSessionState();
    const isAuthed = st.isMember || st.isGuest;
    lookupForm?.classList.toggle("hidden", isAuthed);
    if (lookupLoggedin) {
      lookupLoggedin.classList.toggle("hidden", !isAuthed);
      const nameEl = document.getElementById("hdr-lookup-username");
      if (nameEl) nameEl.textContent = (st.displayName ? st.displayName + "님" : "조회 중") + " — 로그인 상태입니다.";
    }
    _clearLookupError();
    lookupModal?.classList.remove("hidden");
    lookupModal?.classList.add("flex");
  });

  // 모달 닫기 (× 버튼 또는 배경 클릭)
  document.getElementById("hdr-lookup-close")?.addEventListener("click", () => {
    lookupModal?.classList.add("hidden"); lookupModal?.classList.remove("flex");
  });
  lookupModal?.addEventListener("click", e => {
    if (e.target === lookupModal) { lookupModal.classList.add("hidden"); lookupModal.classList.remove("flex"); }
  });

  // 연락처 입력 시 하이픈 자동 포맷 + 비밀번호 자동 채움(끝 4자리)
  document.getElementById("hdr-lookup-contact")?.addEventListener("input", e => {
    const v = e.target.value.replace(/[^0-9]/g, "");           // 숫자만 추출
    e.target.value = v.replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
    const pw = document.getElementById("hdr-lookup-pw");
    if (!pw) return;
    // 연락처가 10~11자리 완성됐을 때만 끝 4자리를 비밀번호에 채움
    // (중간 입력 중에는 pw를 비워서 사용자가 직접 입력하도록 유도)
    if (v.length >= 10) {
      pw.value = v.slice(-4);                                   // 항상 최신 끝 4자리로 갱신
    } else {
      pw.value = "";                                            // 완성 전이면 비워둠
    }
  });

  // 조회 제출: SHA-256 해시 → sessionStorage/localStorage 저장 → mypage.html 이동
  document.getElementById("hdr-lookup-submit")?.addEventListener("click", async () => {
    const btn        = document.getElementById("hdr-lookup-submit");
    const name       = (document.getElementById("hdr-lookup-name")?.value    || "").trim();
    const contactRaw = (document.getElementById("hdr-lookup-contact")?.value || "").trim();
    const contact    = contactRaw.replace(/[^0-9]/g, "");
    let pw           = (document.getElementById("hdr-lookup-pw")?.value       || "").replace(/\D/g, "").trim();
    // 비밀번호 미입력 또는 불완전 입력 시 연락처 끝 4자리로 자동 설정
    if (!pw || pw.length < 4) pw = contact.slice(-4);
    // 비밀번호는 항상 끝 4자리만 사용
    pw = pw.slice(-4);

    if (!name || contact.length < 10 || pw.length < 4) {
      if (!name) { _showLookupError("이름을 입력해주세요."); return; }
      if (contact.length < 10) { _showLookupError("연락처를 정확히 입력해주세요."); return; }
      _showLookupError("비밀번호(끝 4자리)를 입력해주세요.");
      return;
    }

    _setBtnLoading(btn, true);
    _clearLookupError();

    try {
      // 비회원 조회키: "이름|연락처숫자|비번" 을 SHA-256 해시
      const key       = await sha256Hex(`${name}|${contact}|${pw}`);
      const legacyKey = await sha256Hex(`${name}|${contactRaw}|${pw}`); // 구버전 호환

      // Firestore 조회용 Firebase 익명 로그인 (UI 상태와는 무관)
      try {
        if (!auth.currentUser) {
          await setPersistence(auth, browserSessionPersistence);
          await signInAnonymously(auth);
        }
      } catch(e) {}

      // 세션에 비회원 정보 저장 (sessionStorage + localStorage 양쪽)
      const pw4 = pw.slice(-4); // 반드시 4자리
      const sets = {
        guestLookupKey: key, guestLookupKeyLegacy: legacyKey,
        guestName: name, guestContact: contact,
        guestContactRaw: contactRaw, guestPwLast4: pw4,
      };
      Object.entries(sets).forEach(([k, v]) => {
        try { sessionStorage.setItem(k, v); } catch(e) {}
        try { localStorage.setItem(k, v); } catch(e) {}
      });

      location.href = "mypage.html?guest=1";
    } catch(err) {
      _showLookupError("조회 중 오류가 발생했습니다. 다시 시도해주세요.");
      _setBtnLoading(btn, false);
    }
  });

  // Enter 키로 조회 제출
  document.getElementById("hdr-lookup-pw")?.addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("hdr-lookup-submit")?.click();
  });

  // 세션 중 상태에서 로그아웃
  document.getElementById("hdr-lookup-logout")?.addEventListener("click", async () => {
    lookupModal?.classList.add("hidden"); lookupModal?.classList.remove("flex");
    await hardLogout("index.html");
  });

  // ── ② 관리자 로그인 모달 ──────────────────────────────────
  const adminModal = document.getElementById("hdr-admin-modal");

  document.getElementById("btn-admin-login")?.addEventListener("click", () => {
    _clearAdminError();
    adminModal?.classList.remove("hidden");
    adminModal?.classList.add("flex");
    document.getElementById("hdr-admin-email")?.focus();
  });

  // 모달 닫기 (× 버튼 또는 배경 클릭)
  document.getElementById("hdr-admin-close")?.addEventListener("click", () => {
    adminModal?.classList.add("hidden"); adminModal?.classList.remove("flex");
  });
  adminModal?.addEventListener("click", e => {
    if (e.target === adminModal) { adminModal.classList.add("hidden"); adminModal.classList.remove("flex"); }
  });

  // 관리자 로그인 제출: Firebase 이메일 로그인 → Firestore role 확인 → admin.html
  document.getElementById("hdr-admin-submit")?.addEventListener("click", async () => {
    const btn   = document.getElementById("hdr-admin-submit");
    const email = (document.getElementById("hdr-admin-email")?.value || "").trim();
    const pw    = (document.getElementById("hdr-admin-pw")?.value    || "").trim();
    if (!email || !pw) { _showAdminError("이메일과 비밀번호를 입력해주세요."); return; }

    _setBtnLoading(btn, true);
    _clearAdminError();

    try {
      const cred = await signInWithEmailAndPassword(auth, email, pw);
      // Firestore users 문서에서 role 확인 (admin 이 아니면 로그아웃)
      try {
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        const snap = await getDoc(doc(db, "users", cred.user.uid));
        const role = snap.exists() ? (snap.data().role || "") : "";
        if (role !== "admin") {
          await signOut(auth);
          _showAdminError("관리자 권한이 없는 계정입니다.");
          _setBtnLoading(btn, false);
          return;
        }
        try { localStorage.setItem("userRole", "admin"); } catch(e) {}
      } catch(e) {
        // Firestore 조회 실패 시 일단 진입 허용 (admin.js에서 재확인)
      }
      location.href = "admin.html";
    } catch(err) {
      let msg = "로그인에 실패했습니다.";
      if (["auth/user-not-found", "auth/wrong-password", "auth/invalid-credential"].includes(err.code))
        msg = "이메일 또는 비밀번호가 올바르지 않습니다.";
      else if (err.code === "auth/too-many-requests")
        msg = "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.";
      _showAdminError(msg);
      _setBtnLoading(btn, false);
    }
  });

  // Enter 키로 관리자 로그인 제출
  document.getElementById("hdr-admin-pw")?.addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("hdr-admin-submit")?.click();
  });
}

// ── 에러 메시지 표시/숨김 헬퍼 ──────────────────────────────
function _showLookupError(msg) {
  const el = document.getElementById("hdr-lookup-error");
  if (el) { el.textContent = msg; el.classList.remove("hidden"); }
}
function _clearLookupError() {
  const el = document.getElementById("hdr-lookup-error");
  if (el) { el.textContent = ""; el.classList.add("hidden"); }
}
function _showAdminError(msg) {
  const el = document.getElementById("hdr-admin-error");
  if (el) { el.textContent = msg; el.classList.remove("hidden"); }
}
function _clearAdminError() {
  const el = document.getElementById("hdr-admin-error");
  if (el) { el.textContent = ""; el.classList.add("hidden"); }
}

// ── 버튼 로딩 상태 토글 ──────────────────────────────────────
function _setBtnLoading(btn, loading) {
  if (!btn) return;
  const txt  = btn.querySelector(".btn-text");
  const spin = btn.querySelector(".fa-spinner");
  btn.disabled = loading;
  if (txt)  txt.style.opacity = loading ? "0.5" : "1";
  if (spin) spin.classList.toggle("hidden", !loading);
}

// ── 가이드안내 iframe 레이어 팝업 ────────────────────────────
// work-guide.html 을 iframe 으로 전체화면 팝업으로 열고,
// ESC 키 / 배경 클릭 / 가이드 내부 닫기 버튼으로 닫힘
function openWorkGuideLayer() {
  if (document.getElementById("wg-layer-overlay")) return; // 중복 방지

  const overlay = document.createElement("div");
  overlay.id = "wg-layer-overlay";
  overlay.className = "fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in";

  const panel = document.createElement("div");
  panel.className = "relative w-full h-[90vh] max-w-6xl bg-white rounded-xl shadow-2xl overflow-hidden animate-slide-up";

  const iframe = document.createElement("iframe");
  iframe.src   = "work-guide.html?embed=1";
  iframe.className = "w-full h-full border-0 block";
  iframe.title = "가이드안내";

  panel.appendChild(iframe);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  // 정리(cleanup): 이벤트 리스너 해제 + overlay 제거 + 스크롤 복원
  const cleanup = () => {
    try { window.removeEventListener("message", onMsg); } catch(e) {}
    try { document.removeEventListener("keydown", onKey); } catch(e) {}
    try { overlay.remove(); } catch(e) {}
    document.body.style.overflow = "";
  };
  const onKey = ev => { if (ev.key === "Escape") cleanup(); };
  const onMsg = ev => { if (ev?.data?.type === "CLOSE_WORK_GUIDE") cleanup(); };

  overlay.addEventListener("click", ev => { if (ev.target === overlay) cleanup(); });
  document.addEventListener("keydown", onKey);
  window.addEventListener("message", onMsg);
}

// ── 헤더 초기화 (외부 진입점) ────────────────────────────────
// 각 페이지에서 호출: initHeader("book") / initHeader("print") 등
// Firebase Auth 상태가 바뀔 때마다 헤더를 다시 렌더링해 세션 표시 동기화
export function initHeader(activeKey = "") {
  renderHeader(activeKey);
  try {
    onAuthStateChanged(auth, () => renderHeader(activeKey));
  } catch(e) {}
}
