const QUOTE_IDENTITY_FIELDS = [
  'userId','isGuest',
  'guestUid','guestLookupKey','guestPwLast4',
  'guestName','guestContact','guestContactRaw','guestContactHyphen','guestNameNorm',
  'ordererName','ordererContact','ordererCompany'
];

const A5_PRICE_MULTIPLIER = 0.70;

function isGuestQuote(existing = {}) {
  return existing.isGuest === true || existing.userId === 'guest' || existing.userId === 'GUEST';
}

function isA5FormItem(item = {}) {
  return Array.isArray(item.innerSections) && item.innerSections.some(section => section?.paperSize === 'a5');
}

function discountNumber(value, multiplier = A5_PRICE_MULTIPLIER) {
  const n = Number(value);
  return Number.isFinite(n) ? n * multiplier : value;
}

/**
 * A5 계산은 최종 금액 단계에서 70%를 일괄 적용하므로,
 * 저장되는 상세 단가도 같은 비율로 맞춰 고객/관리자 상세표시의 단가-금액 불일치를 줄입니다.
 */
export function normalizeA5Breakdown(breakdown = [], allItemsData = []) {
  return Array.from(breakdown || []).map((item, index) => {
    if (!isA5FormItem(allItemsData[index])) return item;

    const normalized = {
      ...item,
      cover: item?.cover ? { ...item.cover } : item?.cover,
      inners: Array.isArray(item?.inners) ? item.inners.map(inner => ({ ...inner })) : item?.inners,
      interleaf: item?.interleaf ? { ...item.interleaf } : item?.interleaf,
      binding: item?.binding ? { ...item.binding } : item?.binding,
      etc: item?.etc ? { ...item.etc } : item?.etc,
    };

    if (normalized.cover && Number.isFinite(Number(normalized.cover.unitPrice))) {
      const wireMultiplier = normalized.binding?.type === 'wire' ? 0.5 : 1;
      normalized.cover.unitPrice = discountNumber(normalized.cover.unitPrice, A5_PRICE_MULTIPLIER * wireMultiplier);
    }

    if (Array.isArray(normalized.inners)) {
      normalized.inners = normalized.inners.map(inner => ({
        ...inner,
        unitPricePerPage: discountNumber(inner?.unitPricePerPage),
      }));
    }

    if (normalized.interleaf && Number.isFinite(Number(normalized.interleaf.unitPrice))) {
      normalized.interleaf.unitPrice = discountNumber(normalized.interleaf.unitPrice);
    }

    if (normalized.binding && Number.isFinite(Number(normalized.binding.unitPrice))) {
      normalized.binding.unitPrice = discountNumber(normalized.binding.unitPrice);
    }

    return normalized;
  });
}

export function buildQuoteRequestData({
  calculatedQuote = {},
  userId = null,
  isGuest = false,
  ordererName = '',
  ordererContact = '',
  normalizedContact = '',
  ordererCompany = '',
  guestLookupKey = null,
  guestContactRaw = null,
  guestContactHyphen = null,
  guestUid = null,
  createdAt = null,
  breakdownHtml = '',
  allItemsData = [],
} = {}) {
  const normalizedBreakdown = normalizeA5Breakdown(calculatedQuote.breakdown || [], allItemsData);
  return {
    ...calculatedQuote,
    breakdown: normalizedBreakdown,
    userId: isGuest ? 'guest' : userId,
    isGuest,
    guestName: isGuest ? ordererName : null,
    guestContact: isGuest ? normalizedContact : null,
    guestContactRaw: isGuest ? (guestContactRaw || null) : null,
    guestContactHyphen: isGuest ? (guestContactHyphen || null) : null,
    guestLookupKey: isGuest ? guestLookupKey : null,
    guestUid: isGuest ? (guestUid || null) : null,
    guestPwLast4: isGuest ? (normalizedContact || '').slice(-4) : null,
    guestNameNorm: isGuest ? (ordererName || '').replace(/\s+/g, '').trim() : null,
    ordererName,
    ordererContact: isGuest ? normalizedContact : ordererContact,
    ordererCompany,
    status: '접수완료',
    createdAt,
    hasUnreadAdminMessage: false,
    hasUnreadCustomerMessage: false,
    breakdownHtml,
    breakdownData: JSON.stringify(normalizedBreakdown),
    formData: JSON.stringify(allItemsData),
    productType: 'book',
  };
}

export function buildQuoteUpdatePayload({
  quoteRequestData = {},
  existing = {},
  isAdminEditMode = false,
  adminEditFlag = false,
  updatedAt = null,
  lastEditedAt = null,
} = {}) {
  const payload = { ...quoteRequestData };
  delete payload.createdAt;

  if (isAdminEditMode) {
    QUOTE_IDENTITY_FIELDS.forEach((key) => {
      if (existing[key] !== undefined) payload[key] = existing[key];
    });
  }

  if (isGuestQuote(existing)) {
    QUOTE_IDENTITY_FIELDS.forEach((key) => {
      if (existing[key] !== undefined && existing[key] !== null) payload[key] = existing[key];
    });
  }

  payload.updatedAt = updatedAt;
  payload.status = existing.status || payload.status;

  if (!isAdminEditMode) {
    if (existing.userId !== undefined) payload.userId = existing.userId;
    if (existing.isGuest !== undefined) payload.isGuest = existing.isGuest;
    if (existing.productType !== undefined) payload.productType = existing.productType;
  }

  payload.lastEditedBy = adminEditFlag ? 'admin' : 'customer';
  payload.lastEditedAt = lastEditedAt;
  payload.hasUnreadAdminMessage = adminEditFlag ? false : true;
  payload.hasUnreadCustomerMessage = adminEditFlag ? true : false;

  return payload;
}
