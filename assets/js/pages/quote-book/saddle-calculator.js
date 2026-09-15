// 중철(소책자) 전용 계산 모듈
// 기존 quote-book.js와 분리하여 중철 계산 규칙을 독립적으로 관리합니다.

export const SADDLE_OUTPUT_SIZE_MAP = Object.freeze({
  a5: { outputSize: 'A4', outputMultiplier: 1 },
  '0.9': { outputSize: 'B4', outputMultiplier: 1.8 },
  '1': { outputSize: 'A3', outputMultiplier: 2 },
});

/**
 * 중철은 한 장의 상위 규격 용지 양면에 완성 페이지 4p가 배치됩니다.
 * @param {number} pages 완성 페이지 수
 * @returns {number} 권당 실제 출력 종이 장수
 */
export function getSaddleSheetsPerCopy(pages) {
  const safePages = Math.max(0, Number.parseInt(pages, 10) || 0);
  return Math.ceil(safePages / 4);
}

/** 중철 작업에 필요한 총 출력 종이 장수 */
export function getSaddleTotalSheets(pages, quantity) {
  const safeQuantity = Math.max(0, Number.parseInt(quantity, 10) || 0);
  return getSaddleSheetsPerCopy(pages) * safeQuantity;
}

/** 중철 페이지가 4p 단위인지 확인 */
export function isValidSaddlePageCount(pages) {
  const safePages = Number.parseInt(pages, 10) || 0;
  return safePages > 0 && safePages % 4 === 0;
}

/**
 * 완성 규격을 실제 중철 출력 규격으로 변환합니다.
 * A5 -> A4, B5 -> B4, A4 -> A3.
 * 알 수 없는 규격은 기존 배율을 보존합니다.
 */
export function getSaddleOutputSpec(sectionSizeValue, fallbackMultiplier = 1) {
  const key = String(sectionSizeValue ?? '');
  const mapped = SADDLE_OUTPUT_SIZE_MAP[key];
  if (mapped) return { ...mapped };

  const multiplier = Number(fallbackMultiplier);
  return {
    outputSize: '기존 규격',
    outputMultiplier: Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1,
  };
}

/**
 * 중철 내지 계산에 필요한 핵심 값만 반환합니다.
 * 실제 단가표 조회(findPriceTier)는 호출부에서 수행합니다.
 */
export function getSaddleSectionMetrics({ pages, quantity, sectionSizeValue, fallbackMultiplier = 1 }) {
  const sheetsPerCopy = getSaddleSheetsPerCopy(pages);
  const totalSheets = getSaddleTotalSheets(pages, quantity);
  const outputSpec = getSaddleOutputSpec(sectionSizeValue, fallbackMultiplier);

  return {
    pages: Math.max(0, Number.parseInt(pages, 10) || 0),
    sheetsPerCopy,
    totalSheets,
    outputSize: outputSpec.outputSize,
    outputMultiplier: outputSpec.outputMultiplier,
    validPageMultiple: isValidSaddlePageCount(pages),
  };
}
