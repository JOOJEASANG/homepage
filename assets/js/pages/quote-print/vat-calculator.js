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
  // A numerical value within 0.00001 won of a 10-won boundary is the same
  // currency amount, not a discount. Keep the normal floor rule elsewhere.
  const total = Math.floor((normalized + 0.00001) / 10) * 10;
  // The customer total remains authoritative; rounding only changes the split.
  const supply = Math.round(total / 1.1);
  const vat = total - supply;
  return { supply, vat, total };
}
