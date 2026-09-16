from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUOTE = ROOT / 'assets/js/pages/quote-book.js'
source = QUOTE.read_text(encoding='utf-8')

if './quote-book/page-state.js' in source:
    print('book page state refactor already applied')
    raise SystemExit(0)

# Imports.
anchor = 'import { serializeQuoteItems } from "./quote-book/quote-form-data.js";\n'
if source.count(anchor) != 1:
    raise RuntimeError('quote-form-data import anchor mismatch')
imports = (
    'import { isAdminEditSearch, parseQuoteReloadPayload } from "./quote-book/page-state.js";\n'
    'import { readGuestSubmitSession, readGuestMenuSession, getGuestMyPageLookupKey, restoreGuestSessionFromReload, persistGuestSessionAfterSubmit } from "./quote-book/guest-session.js";\n'
    'import { acquireBookSubmitLock, releaseBookSubmitLock } from "./quote-book/submit-lock.js";\n'
)
source = source.replace(anchor, anchor + imports, 1)

# Admin edit query parsing.
old_admin = '''const editState = { enabled: false, quoteId: null, adminEdit: false };
    // adminEdit 플래그(관리자에서 고객 견적 수정으로 진입한 경우)
    try{
        const p = new URLSearchParams(location.search || '');
        editState.adminEdit = (p.get('adminEdit') === '1' || p.get('admin_edit') === '1');

        // 관리자 수정 모드에서는 버튼 문구를 '관리자 수정'으로 표시
        try { if (editState.adminEdit) { document.getElementById('submitQuoteBtn')?.querySelector('.btn-text') && (document.getElementById('submitQuoteBtn').querySelector('.btn-text').textContent = '관리자 수정'); } } catch(e) {}
    }catch(e){}
'''
new_admin = '''const editState = { enabled: false, quoteId: null, adminEdit: isAdminEditSearch(location.search || '') };
    // 관리자 수정 모드에서는 버튼 문구를 '관리자 수정'으로 표시
    try { if (editState.adminEdit) { document.getElementById('submitQuoteBtn')?.querySelector('.btn-text') && (document.getElementById('submitQuoteBtn').querySelector('.btn-text').textContent = '관리자 수정'); } } catch(e) {}
'''
if source.count(old_admin) != 1:
    raise RuntimeError('admin edit state block mismatch')
source = source.replace(old_admin, new_admin, 1)

# Guest submit session reader.
old_guest_submit = '''        try {
            const k = (sessionStorage.getItem('guestLookupKey') || localStorage.getItem('guestLookupKey') || '').trim();
            const n = (sessionStorage.getItem('guestName') || localStorage.getItem('guestName') || '').trim();
            const cRaw = (sessionStorage.getItem('guestContactRaw') || localStorage.getItem('guestContactRaw') || '').trim();
            const c = ((sessionStorage.getItem('guestContact') || localStorage.getItem('guestContact') || '')).trim().replace(/[^0-9]/g, '');
            const cr = (cRaw || c || '').trim();

            // 비회원(익명) 로그인 상태이고, 필수 정보가 있으면 바로 진행
            if ((!currentUser || currentUser.isAnonymous) && k && n && c) {
                await ensureGuestAuth();
                await submitQuoteRequest(null, n, c, '', { isGuest: true, guestLookupKey: k, guestContactRaw: cr });
                return;
            }
        } catch(e) {}
'''
new_guest_submit = '''        try {
            const guestSession = readGuestSubmitSession();
            // 비회원(익명) 로그인 상태이고, 필수 정보가 있으면 바로 진행
            if ((!currentUser || currentUser.isAnonymous) && guestSession.lookupKey && guestSession.name && guestSession.contact) {
                await ensureGuestAuth();
                await submitQuoteRequest(null, guestSession.name, guestSession.contact, '', {
                    isGuest: true,
                    guestLookupKey: guestSession.lookupKey,
                    guestContactRaw: guestSession.contactForSubmission,
                });
                return;
            }
        } catch(e) {}
'''
if source.count(old_guest_submit) != 1:
    raise RuntimeError('guest submit session block mismatch')
source = source.replace(old_guest_submit, new_guest_submit, 1)

# User menu guest state.
old_menu = '''            const guestName = sessionStorage.getItem('guestName');
            const hasGuestSession = !!guestName || !!localStorage.getItem('guestLookupKey') || !!localStorage.getItem('guestPwLast4');
'''
new_menu = '''            const { guestName, hasGuestSession } = readGuestMenuSession();
'''
if source.count(old_menu) != 1:
    raise RuntimeError('guest menu state block mismatch')
source = source.replace(old_menu, new_menu, 1)

old_mypage = "        userMenuGoMyPageBtn?.addEventListener('click', () => { const _k = localStorage.getItem('guestLookupKey') || sessionStorage.getItem('guestLookupKey') || localStorage.getItem('guestLookupKeyLegacy') || ''; location.href = _k ? 'mypage.html?guest=1' : 'mypage.html'; });"
new_mypage = "        userMenuGoMyPageBtn?.addEventListener('click', () => { const _k = getGuestMyPageLookupKey(); location.href = _k ? 'mypage.html?guest=1' : 'mypage.html'; });"
if source.count(old_mypage) != 1:
    raise RuntimeError('guest mypage key block mismatch')
source = source.replace(old_mypage, new_mypage, 1)

# Guest session persistence after a successful submit; legacy key calculation stays here.
old_persist = '''                // sessionStorage (same-tab)
                sessionStorage.setItem('guestLookupKey', guestLookupKey);
                if (legacyKey) sessionStorage.setItem('guestLookupKeyLegacy', legacyKey);
                sessionStorage.setItem('guestName', ordererName);
                sessionStorage.setItem('guestContact', normalizedContact);
                sessionStorage.setItem('guestContactRaw', contactRaw);
                sessionStorage.setItem('guestPwLast4', pwLast4);
                sessionStorage.setItem('guestContactHyphen', formatPhoneHyphen(normalizedContact));

                // localStorage (refresh/new tab safe)
                try {
                    localStorage.setItem('guestLookupKey', guestLookupKey);
                    if (legacyKey) localStorage.setItem('guestLookupKeyLegacy', legacyKey);
                    localStorage.setItem('guestName', ordererName);
                    localStorage.setItem('guestContact', normalizedContact);
                    localStorage.setItem('guestContactRaw', contactRaw);
                    localStorage.setItem('guestPwLast4', pwLast4);
                } catch(e) {}
'''
new_persist = '''                persistGuestSessionAfterSubmit({
                    guestLookupKey,
                    legacyKey,
                    ordererName,
                    normalizedContact,
                    contactRaw,
                    pwLast4,
                });
'''
if source.count(old_persist) != 1:
    raise RuntimeError('guest persistence block mismatch')
source = source.replace(old_persist, new_persist, 1)

# Inline submit lock -> module.
lock_start = source.find('    // ===============================\n    // 중복 접수 방지')
lock_end = source.find('    // ── 페이지 초기화', lock_start)
if lock_start < 0 or lock_end < 0:
    raise RuntimeError('submit lock block markers missing')
lock_block = source[lock_start:lock_end]
for required in ['let __BOOK_SUBMIT_LOCK = false;', 'function __acquireBookSubmitLock()', 'function __releaseBookSubmitLock()']:
    if required not in lock_block:
        raise RuntimeError(f'submit lock block missing {required}')
source = source[:lock_start] + '    // 중복 접수 잠금은 submit-lock.js에서 관리합니다.\n\n' + source[lock_end:]
source = source.replace('__acquireBookSubmitLock()', 'acquireBookSubmitLock()')
source = source.replace('__releaseBookSubmitLock()', 'releaseBookSubmitLock()')

# quoteToReload parser/guest session restore.
reload_start = source.find('            const quoteToReload = localStorage.getItem(\'quoteToReload\');')
reload_end = source.find('            } else {\n                createNewQuoteItem();\n                checkForTempData();', reload_start)
if reload_start < 0 or reload_end < 0:
    raise RuntimeError('quoteToReload block markers missing')
old_reload = source[reload_start:reload_end]
for required in [
    'const parsed = JSON.parse(quoteToReload);',
    "if ((parsed.mode === 'edit' || parsed.mode === 'admin_edit') && parsed.quoteId)",
    'if (parsed.isGuest && parsed.guestLookupKey)',
    "if (Array.isArray(parsed.formData))",
]:
    if required not in old_reload:
        raise RuntimeError(f'quoteToReload legacy block missing {required}')
new_reload = '''            const quoteToReload = localStorage.getItem('quoteToReload');
            if (quoteToReload) {
                localStorage.removeItem('quoteToReload');
                try {
                    const reloadState = parseQuoteReloadPayload(quoteToReload);
                    const items = reloadState.items || [];

                    if (reloadState.editEnabled && reloadState.quoteId) {
                        editState.enabled = true;
                        editState.quoteId = reloadState.quoteId;
                        if (DOMElements.submitQuoteBtn) {
                            DOMElements.submitQuoteBtn.innerHTML = editState.adminEdit ? '<i class="fas fa-pen-to-square mr-2"></i>관리자 수정 저장' : '<i class="fas fa-pen-to-square mr-2"></i>견적 수정';
                        }
                        try {
                            if (reloadState.guestRestore) restoreGuestSessionFromReload(reloadState.guestRestore);
                        } catch(err) {}
                    }

                    DOMElements.quoteItemsContainer.innerHTML = '';
                    quoteItemCounter = 0;
                    (items || []).forEach(itemData => createNewQuoteItem(itemData));
                    applyImagePreviewsToUI();
                    showToast(editState.enabled ? '수정할 견적 내역을 불러왔습니다.' : '견적 내역을 불러왔습니다.', 'success');
                } catch (e) {
                    createNewQuoteItem();
                }
'''
source = source[:reload_start] + new_reload + source[reload_end:]

# Use the existing last quote cache helper during auto-submit instead of duplicating storage writes.
old_auto_cache = '''                // 계산 캐시도 즉시 저장(혹시 모를 리로드 대비)
                try {
                    const __payload = JSON.stringify(lastCalculatedQuote || {});
                    sessionStorage.setItem(__LAST_QUOTE_CACHE_KEY_BOOK, __payload);
                    localStorage.setItem(__LAST_QUOTE_CACHE_KEY_BOOK, __payload);
                } catch(e) {}
'''
new_auto_cache = '''                // 계산 캐시도 즉시 저장(혹시 모를 리로드 대비)
                writeLastQuoteCache(lastCalculatedQuote, __LAST_QUOTE_CACHE_KEY_BOOK);
'''
if source.count(old_auto_cache) != 1:
    raise RuntimeError('auto submit last quote cache block mismatch')
source = source.replace(old_auto_cache, new_auto_cache, 1)

# Safety assertions.
for removed in [
    'let __BOOK_SUBMIT_LOCK = false;',
    'function __acquireBookSubmitLock()',
    "const p = new URLSearchParams(location.search || '')",
    "const k = (sessionStorage.getItem('guestLookupKey')",
    'const parsed = JSON.parse(quoteToReload);',
]:
    if removed in source:
        raise RuntimeError(f'expected inline state code still present: {removed}')

for required in [
    "isAdminEditSearch(location.search || '')",
    'readGuestSubmitSession()',
    'readGuestMenuSession()',
    'getGuestMyPageLookupKey()',
    'persistGuestSessionAfterSubmit({',
    'acquireBookSubmitLock()',
    'releaseBookSubmitLock()',
    'parseQuoteReloadPayload(quoteToReload)',
    'restoreGuestSessionFromReload(reloadState.guestRestore)',
    'async function submitQuoteRequest(',
    'function calculateQuote()',
]:
    if required not in source:
        raise RuntimeError(f'critical integration missing: {required}')

QUOTE.write_text(source, encoding='utf-8')
print('book page state refactor applied')
