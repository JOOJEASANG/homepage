// 와이어제본 전용 계산 모듈
// 와이어제본에만 필요한 규칙만 유지하고 공통 계산은 calculator-utils.js를 사용합니다.

import { getBindingPageCount, getLargeSizeMultiplier, positiveNumber } from './calculator-utils.js';

export const WIRE_A5_INNER_MULTIPLIER = 0.70;
export const WIRE_MAX_INNER_PAGES = 450;

/**
 * 와이어 표지 출력은 펼침 표지 1부 단면 가격의 1/2을 1면 가격으로 계산합니다.
 * 앞면/뒷면을 각각 선택하면 선택한 면 수만큼 누적합니다.
 * 관리자 단가표의 별도 '컬러 양면' 값이 더 낮아도 2면이 1면보다 싸지 않습니다.
 */
export function getWireCoverCost(rawSingleSidedCoverCost, printedSides = 1) {
  const cost = Number(rawSingleSidedCoverCost);
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  const sides = Math.min(2, Math.max(0, Math.floor(Number(printedSides) || 0)));
  return cost * sides / 2;
}

/**
 * 실제 화면의 와이어 표지 체크박스 상태를 우선 읽습니다.
 * input 이벤트가 change 이벤트보다 먼저 실행되어 숨긴 select 값이 늦게
 * 변경되는 경우에도 앞·뒷면 선택 수량을 정확하게 계산합니다.
 */
export function getWireCoverPrintedSides({ frontChecked, backChecked, coverPrintType = 'none' } = {}) {
  if (typeof frontChecked === 'boolean' && typeof backChecked === 'boolean') {
    return Number(frontChecked) + Number(backChecked);
  }
  if (coverPrintType === 'color_duplex') return 2;
  if (coverPrintType === 'color_simplex') return 1;
  return 0;
}

/**
 * 와이어제본 내지의 규격별 인쇄비 배율을 반환합니다.
 * - A5: A4 내지 단가의 70%
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
