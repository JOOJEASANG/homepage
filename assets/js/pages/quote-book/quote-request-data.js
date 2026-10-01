const QUOTE_IDENTITY_FIELDS = [
  'userId','isGuest',
  'guestUid','guestLookupKey','guestPwLast4',
  'guestName','guestContact','guestContactRaw','guestContactHyphen','guestNameNorm',
  'ordererName','ordererContact','ordererCompany'
];

function isGuestQuote(existing = {}) {
  return existing.isGuest === true || existing.userId === 'guest' || existing.userId === 'GUEST';
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
  return {
    ...calculatedQuote,
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
    breakdownData: JSON.stringify(calculatedQuote.breakdown || []),
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
