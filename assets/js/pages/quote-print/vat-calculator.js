/**
 * Digital print prices are VAT-inclusive.
 * Fix the customer-facing total first, then split that total into supply and VAT.
 * Floor to the existing 10-won denomination, protecting against binary floating
 * point artefacts (e.g. 30000 becoming 29999.999999999996).
 */
export function calculateVatIncludedPrintTotal(rawVatIncludedPrice) {
  const gross = Number(rawVatIncludedPrice);
  if (!Number.isFinite(gross) || gross <= 0) {
    return { supply: 0, vat: 0, total: 0 };
  }
  // Six-decimal normalization prevents round-off just below exact won boundaries.
  const normalized = Math.round(gross * 1000000) / 1000000;
  const total = Math.floor(normalized / 10) * 10;
  // The customer total remains authoritative; rounding only changes the split.
  const supply = Math.round(total / 1.1);
  const vat = total - supply;
  return { supply, vat, total };
}
