import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = (name) => import(pathToFileURL(path.join(root, 'assets/js/pages/quote-book', name)).href);

function createStore(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    dump: () => Object.fromEntries(values),
  };
}

const pageState = await mod('page-state.js');
assert.equal(pageState.isAdminEditSearch('?adminEdit=1'), true);
assert.equal(pageState.isAdminEditSearch('?admin_edit=1'), true);
assert.equal(pageState.isAdminEditSearch('?adminEdit=0'), false);

const legacyArray = [{ orderName: 'A' }];
assert.deepEqual(pageState.parseQuoteReloadPayload(JSON.stringify(legacyArray)).items, legacyArray);

const editArray = pageState.parseQuoteReloadPayload(JSON.stringify({
  mode: 'edit', quoteId: 'q1', formData: [{ orderName: 'B' }], isGuest: true, guestLookupKey: 'g1'
}));
assert.equal(editArray.editEnabled, true);
assert.equal(editArray.quoteId, 'q1');
assert.equal(editArray.items[0].orderName, 'B');
assert.equal(editArray.guestRestore.guestLookupKey, 'g1');

const adminString = pageState.parseQuoteReloadPayload({
  mode: 'admin_edit', quoteId: 'q2', formData: JSON.stringify([{ orderName: 'C' }])
});
assert.equal(adminString.editEnabled, true);
assert.equal(adminString.items[0].orderName, 'C');

const single = pageState.parseQuoteReloadPayload({ mode: 'view', formData: { orderName: 'D' } });
assert.deepEqual(single.items, [{ orderName: 'D' }]);
assert.equal(single.editEnabled, false);

const badInner = pageState.parseQuoteReloadPayload({ mode: 'edit', quoteId: 'q3', formData: '{broken' });
assert.deepEqual(badInner.items, [], 'invalid inner formData remains empty like legacy inner catch');
assert.throws(() => pageState.parseQuoteReloadPayload('{broken'), 'invalid outer quoteToReload remains outer-catch responsibility');

globalThis.sessionStorage = createStore({
  guestLookupKey: 'session-key',
  guestName: '세션이름',
  guestContact: '010-1234-5678',
});
globalThis.localStorage = createStore({
  guestLookupKey: 'local-key',
  guestLookupKeyLegacy: 'legacy-key',
  guestName: '로컬이름',
  guestContactRaw: '010 9999 8888',
  guestPwLast4: '8888',
});

const guest = await mod('guest-session.js');
const submitSession = guest.readGuestSubmitSession();
assert.equal(submitSession.lookupKey, 'session-key', 'submit path keeps session-first lookup key');
assert.equal(submitSession.name, '세션이름', 'submit path keeps session-first name');
assert.equal(submitSession.contact, '01012345678');
assert.equal(submitSession.contactRaw, '010 9999 8888');
assert.equal(submitSession.contactForSubmission, '010 9999 8888');

assert.equal(guest.getGuestMyPageLookupKey(), 'local-key', 'mypage path keeps local-current first precedence');
const menu = guest.readGuestMenuSession();
assert.equal(menu.guestName, '세션이름');
assert.equal(menu.hasGuestSession, true);

guest.restoreGuestSessionFromReload({
  isGuest: true,
  guestLookupKey: 'restored-key',
  guestName: '복원이름',
  guestContact: '01077776666',
  guestContactRaw: '010-7777-6666',
  guestPwLast4: '6666',
});
assert.equal(sessionStorage.getItem('guestLookupKey'), 'restored-key');
assert.equal(sessionStorage.getItem('guestLookupKeyLegacy'), 'session-key', 'previous current key is retained as legacy');
assert.equal(localStorage.getItem('guestLookupKey'), 'restored-key');
assert.equal(sessionStorage.getItem('guestContactHyphen'), '010-7777-6666');

guest.persistGuestSessionAfterSubmit({
  guestLookupKey: 'new-key',
  legacyKey: 'new-legacy',
  ordererName: '접수이름',
  normalizedContact: '01022223333',
  contactRaw: '010-2222-3333',
  pwLast4: '3333',
});
assert.equal(sessionStorage.getItem('guestLookupKey'), 'new-key');
assert.equal(localStorage.getItem('guestLookupKeyLegacy'), 'new-legacy');
assert.equal(sessionStorage.getItem('guestContactHyphen'), '010-2222-3333');

sessionStorage = createStore();
const submitLock = await mod('submit-lock.js');
assert.equal(submitLock.acquireBookSubmitLock(), true);
assert.equal(sessionStorage.getItem('__BOOK_SUBMIT_LOCK'), '1');
assert.equal(submitLock.acquireBookSubmitLock(), false);
submitLock.releaseBookSubmitLock();
assert.equal(sessionStorage.getItem('__BOOK_SUBMIT_LOCK'), null);
assert.equal(submitLock.acquireBookSubmitLock(), true);
submitLock.releaseBookSubmitLock();

const quoteSource = fs.readFileSync(path.join(root, 'assets/js/pages/quote-book.js'), 'utf8');
for (const moduleName of ['page-state.js', 'guest-session.js', 'submit-lock.js']) {
  assert.ok(quoteSource.includes(moduleName), `quote-book.js must import ${moduleName}`);
}
assert.ok(quoteSource.includes('isAdminEditSearch(location.search || \'\')'), 'admin edit query must use page-state helper');
assert.ok(quoteSource.includes('parseQuoteReloadPayload(quoteToReload)'), 'quote reload must use parser');
assert.ok(quoteSource.includes('restoreGuestSessionFromReload(reloadState.guestRestore)'), 'guest edit restore must use guest session module');
assert.ok(quoteSource.includes('readGuestSubmitSession()'), 'guest submit session must use shared reader');
assert.ok(quoteSource.includes('acquireBookSubmitLock()'), 'submit lock must use module');
assert.ok(!quoteSource.includes('let __BOOK_SUBMIT_LOCK = false;'), 'inline submit lock state must be removed');

console.log('book page state/guest session/submit lock regression tests passed');
