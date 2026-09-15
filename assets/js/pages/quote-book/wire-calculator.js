// 와이어제본 전용 계산 모듈
// 기존 quote-book.js의 와이어제본 계산 규칙을 결과 변경 없이 분리합니다.

export const WIRE_A5_INNER_MULTIPLIER = 0.70;
export const WIRE_MAX_INNER_PAGES = 450;

function positiveNumber(value, fallback = 1) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 와이어제본 표지는 기존 정책대로 일반 표지비의 1/2을 적용합니다. */
export function getWireCoverCost(rawCoverCost) {
  const cost = Number(rawCoverCost);
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  return cost / 2;
}

/**
 * 와이어제본 내지의 규격별 인쇄비 배율을 반환합니다.
 * - A5: 기존 정책 그대로 A4 단가의 70%
 * - B5 컬러: 기존 정책 그대로 A4 단가의 100%
 * - 그 외: 화면에서 계산된 기본 규격 배율 유지
 */
export function getWireInnerPricingMultiplier({
  sectionSizeValue,
  normalSizeMultiplier = 1,
  isColorPrint = false,
} = {}) {
  const key = String(sectionSizeValue ?? '').trim().toLowerCase();
  if (key === 'a5') return WIRE_A5_INNER_MULTIPLIER;
  if (key === '0.9' && isColorPrint) return 1;
  return positiveNumber(normalSizeMultiplier, 1);
}

/** 와이어제본 최대 내지 페이지 제한(기존 450p)을 확인합니다. */
export function isWireBindingAllowed(totalInnerPages) {
  const pages = Math.max(0, Number.parseInt(totalInnerPages, 10) || 0);
  return pages <= WIRE_MAX_INNER_PAGES;
}

/** 제본비 단가표 조회에 사용할 실제 페이지 수 */
export function getWireBindingPageCount({
  totalInnerPagesSpecified = 0,
  interleafSheets = 0,
  includeInterleafInTotal = false,
} = {}) {
  const innerPages = Math.max(0, Number.parseInt(totalInnerPagesSpecified, 10) || 0);
  const extraInterleaf = Math.max(0, Number.parseInt(interleafSheets, 10) || 0);
  return includeInterleafInTotal ? innerPages : innerPages + extraInterleaf;
}

/** A5/B5는 제본비 배율 1, A4 이상은 기존 규격 배율을 유지합니다. */
export function getWireBindingSizeMultiplier(itemSizeMultiplier = 1) {
  const multiplier = positiveNumber(itemSizeMultiplier, 1);
  return multiplier >= 1 ? multiplier : 1;
}

/** 와이어제본 제본비 계산에 필요한 핵심 값 */
export function getWireBindingMetrics({
  totalInnerPagesSpecified = 0,
  interleafSheets = 0,
  includeInterleafInTotal = false,
  itemSizeMultiplier = 1,
} = {}) {
  return {
    actualTotalPages: getWireBindingPageCount({
      totalInnerPagesSpecified,
      interleafSheets,
      includeInterleafInTotal,
    }),
    sizeMultiplier: getWireBindingSizeMultiplier(itemSizeMultiplier),
  };
}
