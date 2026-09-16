// 와이어제본 전용 계산 모듈
// 와이어제본에만 필요한 규칙만 유지하고 공통 계산은 calculator-utils.js를 사용합니다.

import { getBindingPageCount, getLargeSizeMultiplier, positiveNumber } from './calculator-utils.js';

export const WIRE_A5_INNER_MULTIPLIER = 0.70;
export const WIRE_MAX_INNER_PAGES = 450;

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

/** 제본비 단가표 조회에 사용할 실제 페이지 수입니다. */
export function getWireBindingPageCount(options = {}) {
  return getBindingPageCount(options);
}

/** A5/B5는 제본비 배율 1, A4 이상은 규격 배율을 사용합니다. */
export function getWireBindingSizeMultiplier(itemSizeMultiplier = 1) {
  return getLargeSizeMultiplier(itemSizeMultiplier);
}

/** 와이어제본 제본비 계산에 필요한 핵심 값입니다. */
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
