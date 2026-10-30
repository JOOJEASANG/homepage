// 책자 견적 공통 계산 유틸
// 제본 방식과 무관하게 재사용되는 숫자 보정, 단가 조회, 절삭, 페이지/규격 계산을 관리합니다.

/** 양수 숫자로 정규화합니다. 잘못된 값은 fallback을 반환합니다. */
export function positiveNumber(value, fallback = 1) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 일반 단가표에서 수량/장수 기준 단가를 찾습니다. */
export function findPriceTier(tiers = [], value) {
  if (!Array.isArray(tiers) || tiers.length === 0) return 0;
  const sortedTiers = [...tiers].sort((a, b) => b.threshold - a.threshold);
  for (const tier of sortedTiers) {
    if (value >= tier.threshold) return tier.price;
  }
  // 기존 quote-book.js의 하위호환 동작을 그대로 유지합니다.
  return tiers.length > 0 ? tiers[tiers.length - 1].price : 0;
}

/** 제본 단가표에서 페이지수 + 주문수량 조건에 맞는 단가를 찾습니다. */
export function findBindingPriceTier(tiers = [], quantity, totalPages) {
  if (!Array.isArray(tiers) || tiers.length === 0) return 0;
  const sortedTiers = [...tiers].sort((a, b) =>
    (a.pageThreshold !== b.pageThreshold)
      ? a.pageThreshold - b.pageThreshold
      : b.qtyThreshold - a.qtyThreshold
  );

  for (const tier of sortedTiers) {
    const pageCondition = tier.pageOperator === 'lte'
      ? totalPages <= tier.pageThreshold
      : totalPages >= tier.pageThreshold;
    const qtyCondition = tier.qtyOperator === 'gte'
      ? quantity >= tier.qtyThreshold
      : quantity <= tier.qtyThreshold;
    if (pageCondition && qtyCondition) return tier.price;
  }
  return 0;
}

/** 간지 포함 정책을 반영한 제본 단가표 조회용 실제 페이지 수입니다. */
export function getBindingPageCount({
  totalInnerPagesSpecified = 0,
  interleafSheets = 0,
  includeInterleafInTotal = false,
} = {}) {
  const innerPages = Math.max(0, Number.parseInt(totalInnerPagesSpecified, 10) || 0);
  const extraInterleaf = Math.max(0, Number.parseInt(interleafSheets, 10) || 0);
  return includeInterleafInTotal ? innerPages : innerPages + extraInterleaf;
}

/** 내지 한 구간의 인쇄용지 장수입니다. 단면은 1p/장, 양면은 2p/장입니다. */
export function getInnerSheetsPerCopy(pages, printType) {
  const safePages = Math.max(0, Number.parseInt(pages, 10) || 0);
  return printType === 'bw_duplex' || printType === 'color_duplex'
    ? Math.ceil(safePages / 2)
    : safePages;
}

/** 저장용 키 'a5'는 숫자가 아니므로 별도 해석합니다. 전역 parseFloat 변경은 사용하지 않습니다. */
export const BOOK_A5_INNER_MULTIPLIER = 0.70;

export function getBookSizeMultiplier(sizeValue) {
  if (String(sizeValue ?? '').trim().toLowerCase() === 'a5') return BOOK_A5_INNER_MULTIPLIER;
  return positiveNumber(sizeValue, 1);
}

/**
 * 내지 단가는 관리자에서 페이지/인쇄면당으로 설정합니다.
 * - 중철: 한 장에 완성 4페이지를 배치하지만 양면 2회 인쇄하므로 2클릭/장입니다.
 * - 기타: 단면/양면 관계없이 내용이 있는 완성 페이지 하나가 1인쇄면입니다.
 *
 * 실제 용지 장수는 별도로 기록하여 16p A5 양면은 8장, 16p 중철은 4장이며
 * 과금 인쇄면은 각각 16면, 8면으로 일관성 있게 계산합니다.
 */
export function getBookInnerPrintMetrics({
  pages = 0,
  printType = 'bw_duplex',
  bindingType = 'none',
  quantity = 1,
} = {}) {
  const pageCount = Math.max(0, Number.parseInt(pages, 10) || 0);
  const qty = Math.max(0, Number.parseInt(quantity, 10) || 0);
  const isSaddle = bindingType === 'saddle';
  const sheetsPerCopy = isSaddle ? Math.ceil(pageCount / 4) : getInnerSheetsPerCopy(pageCount, printType);
  const impressionsPerCopy = isSaddle ? sheetsPerCopy * 2 : pageCount;
  return {
    pages: pageCount,
    sheetsPerCopy,
    totalSheets: sheetsPerCopy * qty,
    impressionsPerCopy,
    totalImpressions: impressionsPerCopy * qty,
    pricingUnit: 'impression',
  };
}

/** 기존 정책대로 금액을 100원 단위로 절삭합니다. */
export function floorToHundred(value) {
  return Math.floor(value / 100) * 100;
}

/** A4 이상만 표지/제본에 규격 배율을 적용하고 A5/B5는 1배를 사용합니다. */
export function getLargeSizeMultiplier(itemSizeMultiplier = 1) {
  const multiplier = positiveNumber(itemSizeMultiplier, 1);
  return multiplier >= 1 ? multiplier : 1;
}
