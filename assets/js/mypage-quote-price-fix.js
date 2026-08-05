// ============================================================
// mypage-quote-price-fix.js
// 마이페이지 견적서 품목별 단가/금액 복원 보정
// ============================================================

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const firstPositive = (...values) => {
  for (const value of values) {
    const n = toNumber(value);
    if (n > 0) return n;
  }
  return 0;
};

const parseArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.items)) return parsed.items;
      return [];
    } catch (_) {
      return [];
    }
  }
  if (typeof value === 'object' && Array.isArray(value.items)) return value.items;
  return [];
};

const clonePlain = (value) => {
  if (!value || typeof value !== 'object') return {};
  try { return { ...value }; } catch (_) { return {}; }
};

function buildPricedItems(quote) {
  const formItems = parseArray(quote?.formData);
  const savedItems = parseArray(quote?.items);
  const breakdownItems = parseArray(
    quote?.breakdownData ?? quote?.breakdown ?? quote?.breakdown_data
  );

  const count = Math.max(formItems.length, savedItems.length, breakdownItems.length, 1);
  const totalQuote = firstPositive(
    quote?.finalPrice,
    quote?.totalPrice,
    quote?.total,
    quote?.totalRounded
  );

  const result = [];

  for (let index = 0; index < count; index += 1) {
    const form = clonePlain(formItems[index]);
    const saved = clonePlain(savedItems[index]);
    const breakdown = clonePlain(breakdownItems[index]);
    const digital = clonePlain(breakdown.digital_print);

    const merged = { ...form, ...saved };

    let quantity = firstPositive(
      saved.quantity,
      saved.qty,
      form.quantity,
      form.qty,
      breakdown.quantity,
      quote?.quantity,
      1
    );
    if (quantity <= 0) quantity = 1;

    let itemTotal = firstPositive(
      saved.itemTotal,
      saved.amount,
      saved.totalPrice,
      saved.total,
      form.itemTotal,
      form.amount,
      form.totalPrice,
      form.total,
      breakdown.itemTotal,
      breakdown.amount,
      breakdown.totalPrice,
      breakdown.total,
      digital.totalRounded,
      digital.totalRaw,
      digital.total
    );

    let unitPrice = firstPositive(
      saved.unitPrice,
      saved.price,
      saved.unit_cost,
      form.unitPrice,
      form.price,
      form.unit_cost,
      breakdown.unitPrice,
      breakdown.price,
      breakdown.unit_cost,
      digital.unitPrice,
      quote?.unitPrice
    );

    // 한 품목만 있는 구형 데이터는 전체 합계에서 품목 금액을 복구합니다.
    if (itemTotal <= 0 && count === 1 && totalQuote > 0) itemTotal = totalQuote;

    // 저장된 품목 합계가 있으면 실제 표시 단가를 역산해 금액과 정확히 맞춥니다.
    // 디지털인쇄는 사이즈계수·양면·오시가 반영된 최종 품목 금액을 우선합니다.
    if (itemTotal > 0 && quantity > 0) unitPrice = itemTotal / quantity;
    else if (unitPrice > 0 && quantity > 0) itemTotal = unitPrice * quantity;

    const title =
      saved.title || saved.orderName || saved.name || saved.productName ||
      form.title || form.orderName || form.name || form.productName ||
      breakdown.orderName || breakdown.title || quote?.orderName || `항목 ${index + 1}`;

    const specs =
      saved.specs || form.specs || breakdown.specs ||
      saved.spec || form.spec || '';

    result.push({
      ...merged,
      title,
      orderName: merged.orderName || title,
      quantity,
      unitPrice,
      itemTotal,
      specs,
      specsText: saved.specsText || form.specsText || merged.specsText,
      pricing: saved.pricing || form.pricing || merged.pricing,
    });
  }

  return result;
}

function normalizeQuoteTotals(quote) {
  const patched = { ...(quote || {}) };
  const total = firstPositive(
    patched.finalPrice,
    patched.totalPrice,
    patched.total,
    patched.totalRounded
  );
  const supply = firstPositive(
    patched.supplyPrice,
    patched.supply,
    total > 0 ? Math.round(total / 1.1) : 0
  );
  const vat = firstPositive(
    patched.vat,
    patched.vatPrice,
    total > 0 ? total - supply : 0
  );

  patched.finalPrice = total;
  patched.supplyPrice = supply;
  patched.vat = vat;
  return patched;
}

function installQuotePricePatch() {
  const original = window.generatePrintableQuote;
  if (typeof original !== 'function') return false;
  if (original.__mypageQuotePriceFix === true) return true;

  const wrapped = function generatePrintableQuoteWithPrices(quote, companyInfo, type, showDetails) {
    const patchedQuote = normalizeQuoteTotals(quote);
    const pricedItems = buildPricedItems(patchedQuote);

    if (pricedItems.length > 0) {
      const serialized = JSON.stringify(pricedItems);
      // 기존 생성기는 formData를 items보다 먼저 읽으므로 두 필드 모두 가격 포함 배열로 맞춥니다.
      patchedQuote.formData = serialized;
      patchedQuote.items = serialized;
    }

    return original.call(this, patchedQuote, companyInfo, type, showDetails);
  };

  wrapped.__mypageQuotePriceFix = true;
  wrapped.__original = original;
  window.generatePrintableQuote = wrapped;
  return true;
}

if (!installQuotePricePatch()) {
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (installQuotePricePatch() || attempts >= 40) clearInterval(timer);
  }, 100);
}
