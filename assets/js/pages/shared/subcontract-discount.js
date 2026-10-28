// Administrator-only subcontract quotation comparison. Never used for customer submissions.
export const DEFAULT_SUBCONTRACT_PERCENT = 25;
export const SUBCONTRACT_PERCENT_OPTIONS = Object.freeze([25, 20]);

export function calculateSubcontractDiscount(originalAmount, selectedPercent = DEFAULT_SUBCONTRACT_PERCENT) {
  const original = Math.max(0, Number(originalAmount) || 0);
  const percent = Number(selectedPercent);
  const rate = SUBCONTRACT_PERCENT_OPTIONS.includes(percent) ? percent : DEFAULT_SUBCONTRACT_PERCENT;
  const discounted = Math.floor((original * (100 - rate) / 100) / 100) * 100;
  return {
    original,
    percent: rate,
    total: discounted,
    discountAmount: Math.max(0, original - discounted),
  };
}
