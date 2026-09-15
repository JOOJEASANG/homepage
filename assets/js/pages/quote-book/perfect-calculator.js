// 무선제본 전용 계산 모듈
// 기존 quote-book.js의 무선제본 계산 규칙을 결과 변경 없이 분리합니다.

export const PERFECT_A5_INNER_MULTIPLIER = 0.70;

function positiveNumber(value, fallback = 1) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * 무선제본 내지의 규격별 인쇄비 배율을 반환합니다.
 * - A5: 기존 정책 그대로 A4 단가의 70%
 * - B5 컬러: 기존 정책 그대로 A4 단가의 100%
 * - 그 외: 화면에서 계산된 기본 규격 배율 유지
 */
export function getPerfectInnerPricingMultiplier({
  sectionSizeValue,
  normalSizeMultiplier = 1,
  isColorPrint = false,
} = {}) {
  const key = String(sectionSizeValue ?? '').trim().toLowerCase();
  if (key === 'a5') return PERFECT_A5_INNER_MULTIPLIER;
  if (key === '0.9' && isColorPrint) return 1;
  return positiveNumber(normalSizeMultiplier, 1);
}

/**
 * 무선제본 제본비 단가표 조회에 사용할 실제 페이지 수를 반환합니다.
 * 간지가 전체 페이지에 포함된 경우에는 내지 페이지 수를 그대로 쓰고,
 * 추가 간지라면 간지 페이지를 더합니다.
 */
export function getPerfectBindingPageCount({
  totalInnerPagesSpecified = 0,
  interleafSheets = 0,
  includeInterleafInTotal = false,
} = {}) {
  const innerPages = Math.max(0, Number.parseInt(totalInnerPagesSpecified, 10) || 0);
  const extraInterleaf = Math.max(0, Number.parseInt(interleafSheets, 10) || 0);
  return includeInterleafInTotal ? innerPages : innerPages + extraInterleaf;
}

/**
 * 기존 largeSizeMultiplier 규칙을 무선제본 전용으로 캡슐화합니다.
 * A5/B5처럼 1 미만인 규격은 제본비 배율 1, A4 이상은 기존 배율을 사용합니다.
 */
export function getPerfectBindingSizeMultiplier(itemSizeMultiplier = 1) {
  const multiplier = positiveNumber(itemSizeMultiplier, 1);
  return multiplier >= 1 ? multiplier : 1;
}

/** 무선제본 제본비 계산에 필요한 핵심 값을 한 번에 반환합니다. */
export function getPerfectBindingMetrics({
  totalInnerPagesSpecified = 0,
  interleafSheets = 0,
  includeInterleafInTotal = false,
  itemSizeMultiplier = 1,
} = {}) {
  return {
    actualTotalPages: getPerfectBindingPageCount({
      totalInnerPagesSpecified,
      interleafSheets,
      includeInterleafInTotal,
    }),
    sizeMultiplier: getPerfectBindingSizeMultiplier(itemSizeMultiplier),
  };
}
