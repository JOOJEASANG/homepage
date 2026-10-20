/**
 * Resolve the destination only after a quote is successfully saved.
 * A real admin edit returns to reception management; customer edits and
 * new submissions continue to the customer's mypage.
 */
export function resolveQuoteSaveDestination({ adminEdit = false, editingExisting = false, isGuest = false } = {}) {
  if (adminEdit && editingExisting) return 'admin.html';
  return isGuest ? 'mypage.html?guest=1' : 'mypage.html';
}
