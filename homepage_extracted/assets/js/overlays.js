// ============================================================
// overlays.js — 공통 팝업 DOM 주입 + TTS 기능
//
// 이 파일을 import 하면 즉시 실행되어 두 팝업을 body에 삽입합니다.
//   ① #guest-lookup-overlay  — 비회원 주문 조회 팝업
//   ② #userMenuModal         — 유저 메뉴 미니 팝업
//   ③ window.__speakToast    — 알림 TTS 전역 함수 (Web Speech API)
//
// 사용법: import "../overlays.js"; 한 줄만 추가하면 됩니다.
// ============================================================

(function () {
  try {
    if (!document.body) return;

    // ── ① 비회원 주문 조회 팝업 ──────────────────────────────
    // '비회원 주문 조회' 버튼 클릭 시 열립니다.
    // 이름 + 연락처 + 비밀번호(끝 4자리) 입력 → 마이페이지로 이동
    if (!document.getElementById("guest-lookup-overlay")) {
      document.body.insertAdjacentHTML("beforeend", `
        <div id="guest-lookup-overlay"
             class="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[110]
                    hidden items-center justify-center p-4">
          <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-slide-up"
               onclick="event.stopPropagation()">
            <div class="bg-slate-800 px-6 py-8 text-center relative">
              <div class="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white mx-auto mb-3">
                <i class="fas fa-search"></i>
              </div>
              <h3 class="text-lg font-bold text-white">비회원 주문 조회</h3>
              <button type="button" id="guest-lookup-close"
                      class="absolute top-4 right-4 text-white/50 hover:text-white">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="p-6 bg-white">
              <form id="guest-lookup-form" class="space-y-4">
                <div>
                  <label class="text-xs font-bold text-slate-600 block mb-1">주문자명</label>
                  <input id="guestName" type="text" required placeholder="이름 입력"
                    class="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm
                           focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none">
                </div>
                <div>
                  <label class="text-xs font-bold text-slate-600 block mb-1">연락처</label>
                  <input id="guestContact" type="tel" required placeholder="숫자만 입력"
                    class="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm
                           focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none">
                </div>
                <div>
                  <label class="text-xs font-bold text-slate-600 block mb-1">비밀번호</label>
                  <input id="guestPassword" type="password" required placeholder="연락처 끝 4자리"
                    class="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm
                           focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none">
                </div>
                <div id="guest-err" class="hidden text-red-600 text-xs font-bold text-center mt-2">
                  <i class="fas fa-exclamation-circle"></i> 정보를 다시 확인해주세요.
                </div>
                <button type="submit"
                  class="w-full py-3 rounded bg-slate-900 text-white font-bold
                         hover:bg-slate-800 transition text-sm mt-4">조회하기</button>
              </form>
            </div>
          </div>
        </div>`);
    }

    // ── ② 유저 메뉴 미니 팝업 ────────────────────────────────
    // 견적 페이지 상단 유저 아이콘 클릭 시 열립니다.
    // 현재 상태 표시 + 마이페이지 이동 / 비회원 조회 / 로그아웃 버튼 포함
    if (!document.getElementById("userMenuModal")) {
      document.body.insertAdjacentHTML("beforeend", `
        <div id="userMenuModal"
             class="fixed inset-0 modal-bg hidden items-center justify-center p-4 z-[9999] animate-fade-in">
          <div class="bg-white w-full max-w-sm rounded-lg shadow-xl overflow-hidden animate-slide-up"
               onclick="event.stopPropagation()">
            <div class="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 class="font-bold text-slate-800">마이페이지</h2>
              <button id="closeUserMenuBtn" class="text-slate-400 hover:text-slate-600">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="p-5 space-y-2">
              <!-- 현재 세션 상태 표시 (비회원/회원) -->
              <div id="userMenuStatus"
                   class="text-sm text-slate-600 bg-slate-50 rounded p-3 mb-3 border border-slate-200">
                정보 확인 중...
              </div>
              <!-- 알림 메시지 TTS 읽어주기 토글 -->
              <label class="flex items-center justify-between gap-3 text-sm text-slate-700
                            bg-white rounded p-3 border border-slate-200">
                <span class="font-bold">알림 메시지 읽어주기</span>
                <input id="ttsToastToggle" type="checkbox" class="w-5 h-5 accent-brand-600">
              </label>
              <button id="userMenuGoMyPageBtn"
                      class="w-full py-2.5 rounded bg-brand-600 text-white font-bold hover:bg-brand-700 hidden"
                      onclick="(function(){ var k = localStorage.getItem('guestLookupKey') || sessionStorage.getItem('guestLookupKey') || localStorage.getItem('guestLookupKeyLegacy') || sessionStorage.getItem('guestLookupKeyLegacy'); location.href = k ? 'mypage.html?guest=1' : 'mypage.html'; })()">마이페이지</button>
              <button id="userMenuEditInfoBtn"
                      class="w-full py-2.5 rounded bg-white border border-slate-300
                             text-slate-700 font-bold hover:bg-slate-50 hidden">정보수정</button>
              <button id="userMenuGoLoginBtn"
                      class="w-full py-2.5 rounded bg-navy-900 text-white font-bold hover:bg-navy-800 hidden"
                      onclick="location.href='index.html'">로그인 / 회원가입</button>
              <button id="guest-lookup-open"
                      class="w-full py-2.5 rounded border border-slate-300
                             text-slate-700 font-bold hover:bg-slate-50">비회원 주문 조회</button>
              <button id="userMenuLogoutBtn"
                      class="w-full py-2.5 rounded text-red-600 font-bold hover:bg-red-50 hidden">로그아웃</button>
            </div>
          </div>
        </div>`);
    }
  } catch(e) {}

  // ── ③ 알림 TTS (Web Speech API) ──────────────────────────
  // 관리자 메시지 도착 시 토스트 텍스트를 음성으로 읽어주는 기능입니다.
  // 유저 메뉴 팝업의 '알림 메시지 읽어주기' 체크박스로 켜고 끕니다.

  function getTtsEnabled() {
    try { return localStorage.getItem("ttsToast") === "1"; }
    catch(e) { return false; }
  }
  function setTtsEnabled(v) {
    try { localStorage.setItem("ttsToast", v ? "1" : "0"); }
    catch(e) {}
  }

  // showToast 등에서 window.__speakToast(텍스트) 로 호출
  window.__speakToast = function (text) {
    try {
      if (!getTtsEnabled() || !("speechSynthesis" in window)) return;
      const msg = (text || "").toString().trim();
      if (!msg) return;
      // 80자 초과 시 잘라서 읽기
      const cut = msg.length > 80 ? msg.slice(0, 80) + "..." : msg;
      try { window.speechSynthesis.cancel(); } catch(e) {}
      const ut   = new SpeechSynthesisUtterance(cut);
      ut.lang    = "ko-KR";
      ut.rate    = 1.05;
      ut.pitch   = 1.0;
      // 한국어 음성 우선 선택 (없으면 브라우저 기본 음성 사용)
      const voices = window.speechSynthesis.getVoices?.() || [];
      const koVoice = voices.find(v => (v.lang || "").toLowerCase().startsWith("ko"));
      if (koVoice) ut.voice = koVoice;
      window.speechSynthesis.speak(ut);
    } catch(e) {}
  };

  // TTS 체크박스: 저장된 설정으로 초기 상태 반영
  try {
    const cb = document.getElementById("ttsToastToggle");
    if (cb) {
      cb.checked = getTtsEnabled();
      cb.addEventListener("change", () => setTtsEnabled(cb.checked));
    }
  } catch(e) {}
})();

// 외부에서 재호출이 필요한 경우 (일반적으로는 import 시 자동 실행)
export function ensureOverlays() { /* import 시 자동 실행됨 */ }
