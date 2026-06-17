// ============================================================
// legal-modal.js — 이용안내 / 개인정보처리방침 / 이용약관 레이어
// ============================================================
import { db, doc, getDoc } from './firebase.js';

const LEGAL_DATA = {
  guide: {
    title: '이용안내',
    label: '이용안내',
    badge: 'GUIDE',
    html: `
      <h3>1. 서비스 안내</h3>
      <p><b data-company="companyName">그린오피스</b>는 출력, 제본, 책자 제작, 디지털 인쇄물 제작을 위한 온라인 견적 및 접수 서비스를 제공합니다.</p>
      <h3>2. 이용 절차</h3>
      <ol>
        <li>원하는 견적 서비스를 선택합니다.</li>
        <li>용지, 인쇄 방식, 제본 방식, 수량, 페이지 수, 후가공 여부를 입력합니다.</li>
        <li>제작 파일을 첨부하고 접수합니다.</li>
        <li>관리자가 파일 상태, 제작 가능 여부, 최종 금액, 제작 일정을 확인합니다.</li>
        <li>최종 견적 확인 및 결제 후 제작이 진행됩니다.</li>
      </ol>
      <h3>3. 견적금액 안내</h3>
      <p>홈페이지 자동 견적은 입력한 사양과 단가 기준에 따른 예상금액입니다. 실제 파일 상태, 페이지 수, 후가공, 추가 요청사항에 따라 최종 금액이 달라질 수 있습니다.</p>
      <h3>4. 파일 접수 안내</h3>
      <ul>
        <li>PDF 파일 접수를 권장합니다.</li>
        <li>글꼴 깨짐 방지를 위해 PDF 변환 또는 아웃라인 처리를 권장합니다.</li>
        <li>이미지는 300dpi를 권장합니다.</li>
        <li>재단선, 여백, 페이지 순서를 확인해 주세요.</li>
      </ul>
      <h3>5. 취소 및 변경</h3>
      <p>제작 전에는 취소 또는 사양 변경이 가능합니다. 단, 파일 검수 후 제작 준비가 시작되었거나 실제 제작이 진행된 경우 취소 또는 변경이 제한될 수 있습니다.</p>
    `
  },
  privacy: {
    title: '개인정보처리방침',
    label: '개인정보처리방침',
    badge: 'PRIVACY',
    html: `
      <h3>1. 수집 항목</h3>
      <p>견적 및 제작 접수에 필요한 이름, 연락처, 이메일, 회사명 또는 소속, 제작 요청사항, 첨부파일, 견적 및 주문 내역, 문의 내용을 수집할 수 있습니다.</p>
      <h3>2. 이용 목적</h3>
      <ul>
        <li>견적 산출 및 제작 상담</li>
        <li>출력·제본·인쇄물 제작 접수</li>
        <li>파일 확인 및 제작 가능 여부 검토</li>
        <li>제작 진행상황 안내</li>
        <li>결제, 세금계산서 처리 및 문의 응대</li>
      </ul>
      <h3>3. 보유기간</h3>
      <p>수집 정보는 목적 달성 후 정리합니다. 견적·접수·상담 기록은 서비스 운영과 분쟁 예방을 위해 필요한 기간 동안 보관할 수 있으며, 제작 파일은 제작 완료 또는 상담 종료 후 30일 이내 삭제를 원칙으로 합니다.</p>
      <h3>4. 외부 연동</h3>
      <p>홈페이지 운영, 파일 저장, 결제, 알림 발송, 배송 등 필요한 업무를 위해 외부 서비스를 이용할 수 있습니다.</p>
      <h3>5. 고객 권리</h3>
      <p>고객은 본인 정보의 열람, 정정, 삭제, 처리정지를 요청할 수 있습니다. 회사는 본인 확인 후 필요한 조치를 진행합니다.</p>
      <h3>6. 쿠키 및 저장 정보</h3>
      <p>로그인 상태 유지, 비회원 접수 조회, 임시 견적 저장, 공지 팝업 설정 등 편의를 위해 브라우저 저장 기능을 사용할 수 있습니다.</p>
    `
  },
  terms: {
    title: '이용약관',
    label: '이용약관',
    badge: 'TERMS',
    html: `
      <h3>제1조 목적</h3>
      <p>본 약관은 <b data-company="companyName">그린오피스</b>가 제공하는 온라인 견적, 파일 접수, 제작 상담, 제작 진행, 접수 내역 조회 서비스의 이용 조건과 절차를 정합니다.</p>
      <h3>제2조 서비스</h3>
      <ul>
        <li>출력·제본·책자 제작 견적 서비스</li>
        <li>디지털 인쇄 견적 서비스</li>
        <li>파일 업로드 및 제작 상담 서비스</li>
        <li>접수 내역 조회 및 제작 진행 안내</li>
      </ul>
      <h3>제3조 견적 및 금액</h3>
      <p>홈페이지에서 표시되는 견적금액은 고객이 입력한 사양을 기준으로 산출된 예상금액입니다. 실제 파일의 페이지 수, 파일 상태, 인쇄 방식, 후가공 조건, 추가 요청사항에 따라 최종 금액이 변경될 수 있습니다.</p>
      <h3>제4조 파일 확인</h3>
      <p>이용자는 접수 전 오탈자, 페이지 순서, 인쇄 사이즈, 해상도, 여백, 제본 방향, 수량 및 사양을 확인해야 합니다.</p>
      <h3>제5조 취소 및 환불</h3>
      <p>제작 전에는 취소 요청이 가능합니다. 단, 파일 검수 후 제작 준비가 시작되었거나 실제 제작이 진행된 경우, 맞춤 제작 특성상 취소 또는 환불이 제한될 수 있습니다.</p>
      <h3>제6조 책임의 제한</h3>
      <p>고객이 입력한 정보 또는 업로드한 파일의 오류로 발생한 문제는 고객 확인 사항에 해당합니다. 회사의 명백한 제작 오류가 확인되는 경우에는 재제작, 보완, 환불 등 적절한 조치를 할 수 있습니다.</p>
    `
  }
};

let companyInfo = null;

function fmtPhone(value) {
  const raw = String(value || '').trim();
  const n = raw.replace(/[^0-9]/g, '');
  if (n.length === 11) return n.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  if (n.length === 10) return n.replace(/(\d{2,3})(\d{3,4})(\d{4})/, '$1-$2-$3');
  return raw;
}

async function getCompanyInfo() {
  if (companyInfo) return companyInfo;
  try {
    const snap = await getDoc(doc(db, 'settings', 'companyInfo'));
    companyInfo = snap.exists() ? (snap.data() || {}) : {};
  } catch (e) {
    companyInfo = {};
  }
  return companyInfo;
}

function pick(info, key) {
  const data = info || {};
  const map = {
    companyName: data.companyName || data.name || '그린오피스',
    ceoName: data.ceoName || data.representative || data.ownerName || '주재상',
    bizNum: data.bizNum || data.businessNumber || '312-22-73242',
    address: data.address || '충남 천안시 서북구 쌍용14길 29 1층',
    tel: fmtPhone(data.tel || data.phone || data.contact || '041-571-4370'),
    email: data.email || data.mail || ''
  };
  return map[key] || '';
}

function ensureModal() {
  let modal = document.getElementById('legal-info-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'legal-info-modal';
  modal.className = 'fixed inset-0 z-[10000] hidden items-center justify-center p-4';
  modal.style.cssText = 'background:rgba(15,23,42,.72);backdrop-filter:blur(4px)';
  modal.innerHTML = `
    <div class="w-full max-w-3xl max-h-[86vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" onclick="event.stopPropagation()">
      <div class="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
        <div>
          <p id="legal-modal-badge" class="text-[11px] font-black tracking-[0.18em] text-emerald-600 uppercase mb-1">GUIDE</p>
          <h2 id="legal-modal-title" class="text-lg md:text-xl font-black text-slate-900">이용안내</h2>
        </div>
        <button id="legal-modal-close" type="button" class="w-9 h-9 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100"><i class="fas fa-times"></i></button>
      </div>
      <div class="px-5 pt-4 bg-white border-b border-slate-100 flex flex-wrap gap-2">
        <button type="button" data-legal-tab="guide" class="legal-tab px-3 py-2 rounded-lg text-xs font-black border">이용안내</button>
        <button type="button" data-legal-tab="privacy" class="legal-tab px-3 py-2 rounded-lg text-xs font-black border">개인정보처리방침</button>
        <button type="button" data-legal-tab="terms" class="legal-tab px-3 py-2 rounded-lg text-xs font-black border">이용약관</button>
      </div>
      <div class="overflow-y-auto px-5 md:px-7 py-6 text-sm text-slate-600 leading-8 legal-content" id="legal-modal-content"></div>
      <div class="px-5 md:px-7 py-4 bg-slate-50 border-t border-slate-100 text-[12px] text-slate-500 leading-6" id="legal-modal-company"></div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', closeLegalModal);
  modal.querySelector('#legal-modal-close')?.addEventListener('click', closeLegalModal);
  modal.querySelectorAll('[data-legal-tab]').forEach(btn => btn.addEventListener('click', () => openLegalModal(btn.dataset.legalTab || 'guide')));
  return modal;
}

function applyContentStyle(modal) {
  const styleId = 'legal-modal-style';
  if (document.getElementById(styleId)) return;
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .legal-content h3{font-size:1rem;font-weight:900;color:#0f172a;margin:1.35rem 0 .45rem}.legal-content h3:first-child{margin-top:0}
    .legal-content p{margin:.35rem 0;color:#475569}.legal-content ul,.legal-content ol{padding-left:1.25rem;margin:.35rem 0 .9rem;color:#475569}.legal-content ul{list-style:disc}.legal-content ol{list-style:decimal}.legal-content li{margin:.15rem 0}.legal-tab{background:#fff;color:#64748b;border-color:#e2e8f0}.legal-tab.active{background:#ecfdf5;color:#047857;border-color:#a7f3d0}
  `;
  document.head.appendChild(style);
}

function companyHtml(info) {
  const parts = [];
  parts.push(`상호: ${pick(info, 'companyName')}`);
  parts.push(`대표자: ${pick(info, 'ceoName')}`);
  parts.push(`사업자등록번호: ${pick(info, 'bizNum')}`);
  parts.push(`주소: ${pick(info, 'address')}`);
  parts.push(`연락처: ${pick(info, 'tel')}`);
  const email = pick(info, 'email');
  if (email) parts.push(`이메일: ${email}`);
  return parts.join(' · ');
}

export async function openLegalModal(type = 'guide') {
  const key = LEGAL_DATA[type] ? type : 'guide';
  const data = LEGAL_DATA[key];
  const modal = ensureModal();
  applyContentStyle(modal);
  const info = await getCompanyInfo();
  modal.querySelector('#legal-modal-badge').textContent = data.badge;
  modal.querySelector('#legal-modal-title').textContent = data.title;
  modal.querySelector('#legal-modal-content').innerHTML = data.html;
  modal.querySelector('#legal-modal-company').textContent = companyHtml(info);
  modal.querySelectorAll('[data-company]').forEach(el => {
    el.textContent = pick(info, el.dataset.company || 'companyName');
  });
  modal.querySelectorAll('[data-legal-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.legalTab === key));
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.style.overflow = 'hidden';
}

export function closeLegalModal() {
  const modal = document.getElementById('legal-info-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.body.style.overflow = '';
}

function bindLegalLinks() {
  document.addEventListener('click', (e) => {
    const target = e.target?.closest?.('[data-legal], a[href="guide.html"], a[href="personal-info.html"], a[href="terms.html"]');
    if (!target) return;
    const href = target.getAttribute('href') || '';
    let type = target.dataset.legal || '';
    if (!type && href.includes('guide.html')) type = 'guide';
    if (!type && href.includes('personal-info.html')) type = 'privacy';
    if (!type && href.includes('terms.html')) type = 'terms';
    if (!type) return;
    e.preventDefault();
    openLegalModal(type);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLegalModal();
  });
}

bindLegalLinks();
window.openLegalModal = openLegalModal;
window.closeLegalModal = closeLegalModal;
