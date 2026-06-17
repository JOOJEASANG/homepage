// ============================================================
// company-info-loader.js — 관리자 공급자 정보(settings/companyInfo)를 화면에 반영
// ============================================================
import { db, doc, getDoc } from "./firebase.js";

function formatPhone(value) {
  const raw = String(value || '').trim();
  const n = raw.replace(/[^0-9]/g, '');
  if (n.length === 11) return n.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  if (n.length === 10) return n.replace(/(\d{2,3})(\d{3,4})(\d{4})/, '$1-$2-$3');
  if (n.length === 8) return n.replace(/(\d{4})(\d{4})/, '$1-$2');
  return raw;
}

function pickCompanyValue(info, key) {
  const data = info || {};
  const map = {
    companyName: data.companyName || data.name || '그린오피스',
    ceoName: data.ceoName || data.representative || data.ownerName || '',
    bizNum: data.bizNum || data.businessNumber || '',
    address: data.address || '',
    bizCategory: data.bizCategory || '',
    bizType: data.bizType || '',
    accountNum: data.accountNum || '',
    accountHolder: data.accountHolder || '',
    tel: formatPhone(data.tel || data.phone || data.contact || ''),
    fax: formatPhone(data.fax || ''),
    email: data.email || data.mail || '',
  };
  if (key === 'bizSummary') {
    return [map.bizCategory, map.bizType].filter(Boolean).join(' / ');
  }
  if (key === 'fullCompany') {
    const parts = [];
    if (map.companyName) parts.push(`상호: ${map.companyName}`);
    if (map.ceoName) parts.push(`대표자: ${map.ceoName}`);
    if (map.bizNum) parts.push(`사업자등록번호: ${map.bizNum}`);
    if (map.address) parts.push(`주소: ${map.address}`);
    if (map.tel) parts.push(`연락처: ${map.tel}`);
    if (map.email) parts.push(`이메일: ${map.email}`);
    return parts.join('\n');
  }
  return map[key] || '';
}

function setText(el, value) {
  const fallback = el.dataset.fallback || el.textContent || '';
  const next = value || fallback;
  if (el.dataset.prefix || el.dataset.suffix) {
    el.textContent = `${el.dataset.prefix || ''}${next}${el.dataset.suffix || ''}`;
  } else {
    el.textContent = next;
  }
}

function applyCompanyInfo(info) {
  document.querySelectorAll('[data-company]').forEach(el => {
    const key = el.dataset.company;
    const value = pickCompanyValue(info, key);
    setText(el, value);
  });

  document.querySelectorAll('[data-company-href]').forEach(el => {
    const key = el.dataset.companyHref;
    const value = pickCompanyValue(info, key);
    if (!value) return;
    if (key === 'tel') el.setAttribute('href', `tel:${String(value).replace(/[^0-9+]/g, '')}`);
    if (key === 'email') el.setAttribute('href', `mailto:${value}`);
  });
}

export async function loadCompanyInfo() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'companyInfo'));
    const info = snap.exists() ? (snap.data() || {}) : {};
    applyCompanyInfo(info);
    window.__companyInfo = info;
    return info;
  } catch (e) {
    console.warn('[company-info] load failed:', e);
    applyCompanyInfo({});
    return {};
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => loadCompanyInfo(), { once: true });
} else {
  loadCompanyInfo();
}
