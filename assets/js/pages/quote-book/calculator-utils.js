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

/** 기존 정책대로 금액을 100원 단위로 절삭합니다. */
export function floorToHundred(value) {
  return Math.floor(value / 100) * 100;
}

/** A4 이상만 표지/제본에 규격 배율을 적용하고 A5/B5는 1배를 사용합니다. */
export function getLargeSizeMultiplier(itemSizeMultiplier = 1) {
  const multiplier = positiveNumber(itemSizeMultiplier, 1);
  return multiplier >= 1 ? multiplier : 1;
}
