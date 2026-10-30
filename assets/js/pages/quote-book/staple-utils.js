export const STAPLE_MAX_SHEETS_PER_COPY = 50;
export const STAPLE_POSITIONS = Object.freeze({
  'portrait-upper-left': '세로좌상',
  'landscape-upper-left': '가로좌상',
});

/**
 * 각 출력 구간은 따로 양면 올림하며, 1부에 실제 들어가는 물리적 용지 매수를 계산합니다.
 * 간지 포함 모드에서는 기존 출력 계산과 동일하게 내지에서 간지 페이지를 먼저 차감합니다.
 */
export function countStapleSheetsPerCopy(sections = [], interleafSheets = 0, includeInterleaf = false) {
  const inserts = Math.max(0, Number.parseInt(interleafSheets, 10) || 0);
  let remaining = includeInterleaf ? inserts : 0;
  let sheets = inserts;
  for (const section of sections || []) {
    const pages = Math.max(0, Number.parseInt(section.pages, 10) || 0);
    const deducted = Math.min(pages, remaining);
    remaining -= deducted;
    const billablePages = pages - deducted;
    const isDuplex = ['bw_duplex', 'color_duplex'].includes(section.printType);
    sheets += isDuplex ? Math.ceil(billablePages / 2) : billablePages;
  }
  return sheets;
}
export function canStapleSheets(sheets) {
  return Number.isFinite(Number(sheets)) && Number(sheets) <= STAPLE_MAX_SHEETS_PER_COPY;
}
export function normalizeStapleSelection({ bindingType, enabled, position, sheets }) {
  const allowed = bindingType === 'none' && canStapleSheets(sheets);
  return {
    allowed,
    enabled: allowed && enabled === true,
    position: allowed && enabled === true && STAPLE_POSITIONS[position] ? position : '',
  };
}
