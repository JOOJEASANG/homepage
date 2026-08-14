// 관리자 모바일 헤더 정리
// - 화면에 중복 노출되던 로그아웃 버튼 제거
// - 모바일 툴바를 현재 메뉴 + 메뉴 버튼 중심으로 단순화
// - 실제 로그아웃은 모바일 메뉴 하단의 1개 버튼으로 유지

(function initAdminMobileHeaderFix() {
  const isAdminPath = (() => {
    try {
      const last = (location.pathname || '').split('/').pop() || '';
      return last === 'admin' || last === 'admin.html';
    } catch (_) {
      return false;
    }
  })();
  if (!isAdminPath) return;

  const apply = () => {
    const currentSection = document.getElementById('mobileCurrentSection');
    const toolbar = currentSection?.parentElement || null;
    const subbar = toolbar?.parentElement || null;

    if (toolbar) toolbar.classList.add('admin-mobile-toolbar');
    if (subbar) subbar.classList.add('admin-mobile-subbar');

    const sheetLogout = document.getElementById('mobileMenuLogoutBtn');
    if (sheetLogout) {
      sheetLogout.setAttribute('aria-label', '관리자 로그아웃');
      sheetLogout.title = '로그아웃';
    }

    if (!document.getElementById('admin-mobile-header-layout-style')) {
      const style = document.createElement('style');
      style.id = 'admin-mobile-header-layout-style';
      style.textContent = `
        @media (max-width: 1279px) {
          .glass-header {
            height: 56px !important;
            background: #172235 !important;
            box-shadow: 0 1px 0 rgba(255,255,255,.05), 0 8px 24px rgba(15,23,42,.10);
          }

          .glass-header > div {
            padding-left: 18px !important;
            padding-right: 18px !important;
          }

          .glass-header h1 {
            font-size: 17px !important;
            letter-spacing: -0.02em !important;
          }

          .glass-header p {
            font-size: 9px !important;
            letter-spacing: .18em !important;
          }

          /* 모바일에서는 상단 헤더 로그아웃과 기존 보조 로그아웃을 숨깁니다. */
          #logout-btn,
          #mobileLogoutBtn {
            display: none !important;
          }

          .admin-mobile-subbar {
            top: 56px !important;
            z-index: 35 !important;
            background: rgba(255,255,255,.96) !important;
            border-bottom: 1px solid #e7edf2 !important;
            box-shadow: 0 4px 14px rgba(15,23,42,.045) !important;
            -webkit-backdrop-filter: blur(12px);
            backdrop-filter: blur(12px);
          }

          .admin-mobile-toolbar {
            min-height: 54px !important;
            padding: 8px 16px !important;
            gap: 10px !important;
          }

          #mobileCurrentSection {
            min-width: 0 !important;
            flex: 1 1 auto !important;
            display: flex !important;
            align-items: center !important;
            gap: 9px !important;
            text-align: left !important;
            color: #172033 !important;
            font-size: 15px !important;
            font-weight: 800 !important;
            letter-spacing: -0.025em !important;
            padding: 0 2px !important;
          }

          #mobileCurrentSection::before {
            content: '';
            width: 8px;
            height: 8px;
            border-radius: 999px;
            flex: 0 0 8px;
            background: #22c55e;
            box-shadow: 0 0 0 4px rgba(34,197,94,.10);
          }

          #mobileMenuOpenBtn {
            min-width: 84px !important;
            height: 38px !important;
            padding: 0 13px !important;
            justify-content: center !important;
            gap: 7px !important;
            border-radius: 11px !important;
            border: 1px solid #dbe3e9 !important;
            background: #f8fafc !important;
            color: #334155 !important;
            font-size: 13px !important;
            font-weight: 800 !important;
            box-shadow: 0 1px 2px rgba(15,23,42,.04) !important;
          }

          #mobileMenuOpenBtn:active {
            transform: scale(.98);
            background: #f1f5f9 !important;
          }

          #mobileMenuOpenBtn i {
            color: #16a34a !important;
          }

          #mobileMenuLogoutBtn {
            color: #dc2626 !important;
            background: #fff7f7 !important;
            border: 1px solid #fee2e2 !important;
            border-radius: 12px !important;
            margin-top: 2px !important;
          }
        }
      `;
      document.head.appendChild(style);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  } else {
    apply();
  }

  setTimeout(apply, 150);
  setTimeout(apply, 600);
})();
