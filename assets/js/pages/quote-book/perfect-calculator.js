// 무선제본 전용 계산 모듈
// 무선제본에만 필요한 규칙만 유지하고 공통 계산은 calculator-utils.js를 사용합니다.

import { getBindingPageCount, getLargeSizeMultiplier, positiveNumber } from './calculator-utils.js';

export const PERFECT_A5_INNER_MULTIPLIER = 0.70;

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

/** 무선제본 제본비 단가표 조회에 사용할 실제 페이지 수입니다. */
export function getPerfectBindingPageCount(options = {}) {
  return getBindingPageCount(options);
}

/** A5/B5는 제본비 배율 1, A4 이상은 규격 배율을 사용합니다. */
export function getPerfectBindingSizeMultiplier(itemSizeMultiplier = 1) {
  return getLargeSizeMultiplier(itemSizeMultiplier);
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
