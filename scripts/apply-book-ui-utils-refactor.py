from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
QUOTE = ROOT / 'assets/js/pages/quote-book.js'
MODULE_DIR = ROOT / 'assets/js/pages/quote-book'
PACKAGE = ROOT / 'package.json'
WORKFLOW = ROOT / '.github/workflows/firebase-hosting-pr-preview.yml'
README = MODULE_DIR / 'README.md'

source = QUOTE.read_text(encoding='utf-8')
original = source


def require_once(text, label):
    count = source.count(text)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 occurrence, found {count}')


def take(start, end, label):
    a = source.find(start)
    if a < 0:
        raise RuntimeError(f'{label}: start marker missing')
    b = source.find(end, a + len(start))
    if b < 0:
        raise RuntimeError(f'{label}: end marker missing')
    return a, b, source[a:b]

# Idempotency guard.
if './quote-book/contact-utils.js' in source:
    print('book UI/util refactor already applied; nothing to do')
    raise SystemExit(0)

# 1) Imports
import_anchor = 'import { findPriceTier, findBindingPriceTier, floorToHundred, getLargeSizeMultiplier } from "./quote-book/calculator-utils.js";\n'
require_once(import_anchor, 'calculator import anchor')
new_imports = (
    'import { generateBookReceiptNo } from "./quote-book/quote-id.js";\n'
    'import { normalizeContactDigits, formatPhoneHyphen, formatContact, pickContactFromUserData, sha256Hex } from "./quote-book/contact-utils.js";\n'
    'import { getPreviewUrl, inferInnerGroup } from "./quote-book/preview-utils.js";\n'
    'import { openImagePreview, openPreviewLayer, closeImagePreview } from "./quote-book/preview-ui.js";\n'
    'import { getBookTempStorageKey, readLastQuoteCache, writeLastQuoteCache, clearLastQuoteCache } from "./quote-book/quote-storage.js";\n'
    'import { renderQuoteItemTemplate, renderInnerSectionTemplate } from "./quote-book/quote-item-template.js";\n'
)
source = source.replace(import_anchor, import_anchor + new_imports, 1)

# 2) Receipt number generator -> module alias
start = source.find('// ── 접수번호(영수증 번호) 자동 생성')
end = source.find('// =========================', start)
if start < 0 or end < 0:
    raise RuntimeError('receipt block markers missing')
source = source[:start] + '// 접수번호 생성은 quote-id.js에서 관리합니다.\nconst generateReceiptNo = generateBookReceiptNo;\n' + source[end:]

# 3) Preview URL normalizer -> preview-utils.js
start_marker = '    // 이미지 미리보기 값 정규화 (string URL 또는 {url, path} 객체 모두 지원)\n    function getPreviewUrl(val) {'
end_marker = '\n\n    let currentUser = null;'
a = source.find(start_marker)
b = source.find(end_marker, a)
if a < 0 or b < 0:
    raise RuntimeError('getPreviewUrl block missing')
get_preview_block = source[a + start_marker.find('    function getPreviewUrl'):b].strip('\n')
source = source[:a] + source[b:]

# 4) inferInnerGroup -> preview-utils.js
start_marker = '    function inferInnerGroup(key) {'
end_marker = '\n\n    function applyPaperMetaFromImagePreviews()'
a = source.find(start_marker)
b = source.find(end_marker, a)
if a < 0 or b < 0:
    raise RuntimeError('inferInnerGroup block missing')
infer_group_block = source[a:b].strip('\n')
source = source[:a] + source[b:]

# 5) Preview modal core -> preview-ui.js
start_marker = '    function openImagePreview(title, url) {'
end_marker = '\n\n    function openCategoryPreview('
a = source.find(start_marker)
b = source.find(end_marker, a)
if a < 0 or b < 0:
    raise RuntimeError('preview UI block missing')
preview_ui_main = source[a:b].strip('\n')
source = source[:a] + source[b:]

start_marker = '    function closeImagePreview() {'
end_marker = '\n\n    function sha256HexSync(str) {'
a = source.find(start_marker)
b = source.find(end_marker, a)
if a < 0 or b < 0:
    raise RuntimeError('closeImagePreview block missing')
preview_ui_close = source[a:b].strip('\n')
source = source[:a] + source[b:]

# 6) Contact/hash pure helpers -> contact-utils.js
# sync SHA block
start_marker = '    function sha256HexSync(str) {'
end_marker = '\n\n    \n    const normalizeContactDigits'
a = source.find(start_marker)
b = source.find(end_marker, a)
if a < 0 or b < 0:
    raise RuntimeError('sha256HexSync block missing')
sha_sync_block = source[a:b].strip('\n')
source = source[:a] + source[b:]

# normalize + phone formatter
start_marker = '    const normalizeContactDigits'
end_marker = '\n\n        function pickContactFromUserData'
a = source.find(start_marker)
b = source.find(end_marker, a)
if a < 0 or b < 0:
    raise RuntimeError('contact normalize block missing')
contact_format_block = source[a:b].strip('\n')
source = source[:a] + source[b:]

# user contact picker
start_marker = '        function pickContactFromUserData(userData)'
end_marker = '\n        async function resolveMemberContact(uid)'
a = source.find(start_marker)
b = source.find(end_marker, a)
if a < 0 or b < 0:
    raise RuntimeError('pickContact block missing')
pick_contact_block = source[a:b].strip('\n')
source = source[:a] + source[b:]

# async SHA block, keep window alias in quote-book
start_marker = '\n\nasync function sha256Hex(text) {'
end_marker = '\n\nwindow.sha256 = sha256Hex;'
a = source.find(start_marker)
b = source.find(end_marker, a)
if a < 0 or b < 0:
    raise RuntimeError('async sha256 block missing')
sha_async_block = source[a + 2:b].strip('\n')
source = source[:a] + '\n\nwindow.sha256 = sha256Hex;' + source[b + len(end_marker):]

# legacy formatContact helper near submit section
start_marker = '    function formatContact(contact) {'
end_marker = '\n\n    function renderAttachmentsList()'
a = source.find(start_marker)
b = source.find(end_marker, a)
if a < 0 or b < 0:
    raise RuntimeError('formatContact block missing')
legacy_format_contact_block = source[a:b].strip('\n')
source = source[:a] + source[b:]

# 7) Storage cache helpers
old_cache = """    let lastCalculatedQuote = {};
    // ✅ 로그인/새로고침 시 견적 계산값 유지(회원 로그인 후 '견적정보가 계산되지 않았습니다' 방지)
    const __LAST_QUOTE_CACHE_KEY_BOOK = 'lastCalculatedQuote_book_v1';
    try {
        const __saved = sessionStorage.getItem(__LAST_QUOTE_CACHE_KEY_BOOK) || localStorage.getItem(__LAST_QUOTE_CACHE_KEY_BOOK);
        if (__saved) {
            const __parsed = JSON.parse(__saved);
            if (__parsed && typeof __parsed === 'object') lastCalculatedQuote = __parsed;
        }
    } catch(e) { /* ignore */ }
"""
if source.count(old_cache) != 1:
    raise RuntimeError(f'last quote cache block expected once, found {source.count(old_cache)}')
new_cache = """    // ✅ 로그인/새로고침 시 견적 계산값 유지(회원 로그인 후 '견적정보가 계산되지 않았습니다' 방지)
    const __LAST_QUOTE_CACHE_KEY_BOOK = 'lastCalculatedQuote_book_v1';
    let lastCalculatedQuote = readLastQuoteCache(__LAST_QUOTE_CACHE_KEY_BOOK);
"""
source = source.replace(old_cache, new_cache, 1)

old_temp = """    function getTempStorageKey() {
        const uid = currentUser ? currentUser.uid : 'anonymous';
        return `${TEMP_STORAGE_KEY_PREFIX}${uid}`;
    }
"""
if source.count(old_temp) != 1:
    raise RuntimeError('getTempStorageKey block mismatch')
source = source.replace(old_temp, """    function getTempStorageKey() {
        return getBookTempStorageKey(currentUser, TEMP_STORAGE_KEY_PREFIX);
    }
""", 1)

cache_save_re = re.compile(
    r"\s*try \{\n\s*const __payload = JSON\.stringify\(lastCalculatedQuote \|\| \{\}\);\n\s*sessionStorage\.setItem\(__LAST_QUOTE_CACHE_KEY_BOOK, __payload\);\n\s*localStorage\.setItem\(__LAST_QUOTE_CACHE_KEY_BOOK, __payload\);\n\s*\} catch\(e\) \{ /\* ignore \*/ \}"
)
source, save_count = cache_save_re.subn('\n        writeLastQuoteCache(lastCalculatedQuote, __LAST_QUOTE_CACHE_KEY_BOOK);', source)
if save_count < 1:
    raise RuntimeError('no last quote cache save blocks replaced')

old_clear = """        try { sessionStorage.removeItem(__LAST_QUOTE_CACHE_KEY_BOOK); } catch(e) {}
        try { localStorage.removeItem(__LAST_QUOTE_CACHE_KEY_BOOK); } catch(e) {}
"""
if old_clear not in source:
    raise RuntimeError('reset cache clear block missing')
source = source.replace(old_clear, '        clearLastQuoteCache(__LAST_QUOTE_CACHE_KEY_BOOK);\n', 1)

# 8) Extract the two largest HTML templates without changing markup.
item_start = '        newItem.innerHTML = `'
item_end = '\n        `;\n\n        DOMElements.quoteItemsContainer.appendChild(newItem);'
a = source.find(item_start)
b = source.find(item_end, a)
if a < 0 or b < 0:
    raise RuntimeError('quote item template markers missing')
item_template = source[a + len(item_start):b]
source = source[:a] + '        newItem.innerHTML = renderQuoteItemTemplate({ quoteItemCounter, designPrice, oshiPrice });' + source[b + len('\n        `;'):]

inner_start = '        newSection.innerHTML = `'
inner_end = '`;\n        const paperSelect = newSection.querySelector(\'.innerPaperType\');'
a = source.find(inner_start)
b = source.find(inner_end, a)
if a < 0 or b < 0:
    raise RuntimeError('inner section template markers missing')
inner_template = source[a + len(inner_start):b]
source = source[:a] + '        newSection.innerHTML = renderInnerSectionTemplate({ sectionCount });\n        const paperSelect = newSection.querySelector(\'.innerPaperType\');' + source[b + len(inner_end):]

# Safety assertions against accidental scope changes.
for forbidden in [
    'function getPreviewUrl(val)',
    'function inferInnerGroup(key)',
    'function sha256HexSync(str)',
    'const normalizeContactDigits =',
    'function pickContactFromUserData(userData)',
    'function formatContact(contact)',
    'newItem.innerHTML = `',
    'newSection.innerHTML = `',
]:
    if forbidden in source:
        raise RuntimeError(f'expected extracted code still present: {forbidden}')

for required in [
    'function calculateQuote()',
    'async function submitQuoteRequest(',
    'async function initializePage(',
    'getSaddleSectionMetrics',
    'getPerfectBindingMetrics',
    'getWireBindingMetrics',
]:
    if required not in source:
        raise RuntimeError(f'critical existing logic missing after patch: {required}')

# Write extracted modules.
MODULE_DIR.mkdir(parents=True, exist_ok=True)

(MODULE_DIR / 'quote-id.js').write_text("""// 책자 견적 접수번호 생성
// 기존 quote-book.js의 Q+날짜+시간+랜덤 형식을 그대로 유지합니다.
export async function generateBookReceiptNo() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    const ymd = `${y}${m}${da}`;
    const t = String(Date.now()).slice(-6);
    const r = String(Math.floor(Math.random() * 900) + 100);
    return `Q${ymd}-${t}${r}`;
}
""", encoding='utf-8')

preview_utils = (
    '// 이미지 미리보기의 순수 데이터 유틸\n\n'
    + get_preview_block.replace('    function getPreviewUrl', 'export function getPreviewUrl', 1)
    + '\n\n'
    + infer_group_block.replace('    function inferInnerGroup', 'export function inferInnerGroup', 1)
    + '\n'
)
(MODULE_DIR / 'preview-utils.js').write_text(preview_utils, encoding='utf-8')

preview_ui = (
    '// 이미지 미리보기 모달의 DOM 렌더링 전용 모듈\n\n'
    + preview_ui_main.replace('    function openImagePreview', 'export function openImagePreview', 1)
        .replace('    function openPreviewLayer', 'export function openPreviewLayer', 1)
    + '\n\n'
    + preview_ui_close.replace('    function closeImagePreview', 'export function closeImagePreview', 1)
    + '\n'
)
(MODULE_DIR / 'preview-ui.js').write_text(preview_ui, encoding='utf-8')

contact_utils = (
    '// 연락처 정규화/표시와 SHA-256 헬퍼\n'
    '// 기존 비회원 식별/조회 동작을 그대로 유지합니다.\n\n'
    + sha_sync_block.replace('    function sha256HexSync', 'export function sha256HexSync', 1)
    + '\n\n'
    + contact_format_block.replace('    const normalizeContactDigits', 'export const normalizeContactDigits', 1)
        .replace('    const formatPhoneHyphen', 'export const formatPhoneHyphen', 1)
    + '\n\n'
    + pick_contact_block.replace('        function pickContactFromUserData', 'export function pickContactFromUserData', 1)
    + '\n\n'
    + sha_async_block.replace('async function sha256Hex', 'export async function sha256Hex', 1)
    + '\n\n'
    + legacy_format_contact_block.replace('    function formatContact', 'export function formatContact', 1)
    + '\n'
)
(MODULE_DIR / 'contact-utils.js').write_text(contact_utils, encoding='utf-8')

(MODULE_DIR / 'quote-storage.js').write_text("""// 책자 견적 페이지의 브라우저 저장소 공통 처리

export function getBookTempStorageKey(currentUser, prefix = 'multiQuoteFormData_') {
    const uid = currentUser?.uid || 'anonymous';
    return `${prefix}${uid}`;
}

export function readLastQuoteCache(key = 'lastCalculatedQuote_book_v1') {
    try {
        const saved = sessionStorage.getItem(key) || localStorage.getItem(key);
        if (!saved) return {};
        const parsed = JSON.parse(saved);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

export function writeLastQuoteCache(value, key = 'lastCalculatedQuote_book_v1') {
    try {
        const payload = JSON.stringify(value || {});
        sessionStorage.setItem(key, payload);
        localStorage.setItem(key, payload);
    } catch (_) {}
}

export function clearLastQuoteCache(key = 'lastCalculatedQuote_book_v1') {
    try { sessionStorage.removeItem(key); } catch (_) {}
    try { localStorage.removeItem(key); } catch (_) {}
}
""", encoding='utf-8')

(MODULE_DIR / 'quote-item-template.js').write_text(
    '// 견적 항목/내지 섹션 HTML 템플릿 전용 모듈\n'
    '// 마크업은 기존 quote-book.js에서 그대로 이동하며 계산/이벤트 로직은 포함하지 않습니다.\n\n'
    'export function renderQuoteItemTemplate({ quoteItemCounter, designPrice, oshiPrice }) {\n'
    '    return `' + item_template + '`;\n'
    '}\n\n'
    'export function renderInnerSectionTemplate({ sectionCount }) {\n'
    '    return `' + inner_template + '`;\n'
    '}\n',
    encoding='utf-8'
)

QUOTE.write_text(source, encoding='utf-8')

# 9) Regression test covering extracted modules and integration.
test_path = ROOT / 'scripts/test-book-ui-modules.mjs'
test_path.write_text("""import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = (name) => import(pathToFileURL(path.join(root, 'assets/js/pages/quote-book', name)).href);

const contact = await mod('contact-utils.js');
assert.equal(contact.normalizeContactDigits('010-1234-5678'), '01012345678');
assert.equal(contact.formatPhoneHyphen('01012345678'), '010-1234-5678');
assert.equal(contact.formatContact('0212345678'), '02-1234-5678');
assert.equal(contact.pickContactFromUserData({ profile: { mobile: '010-2222-3333' } }), '01022223333');
assert.equal(contact.sha256HexSync('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

const preview = await mod('preview-utils.js');
assert.equal(preview.getPreviewUrl('https://example.com/a.jpg'), 'https://example.com/a.jpg');
assert.equal(preview.getPreviewUrl({ downloadURL: 'https://example.com/b.jpg' }), 'https://example.com/b.jpg');
assert.equal(preview.getPreviewUrl({ meta: { url: 'https://example.com/c.jpg' } }), 'https://example.com/c.jpg');
assert.equal(preview.inferInnerGroup('snow150'), 'premium');
assert.equal(preview.inferInnerGroup('mimoon80'), 'general');

const ids = await mod('quote-id.js');
assert.match(await ids.generateBookReceiptNo(), /^Q\\d{8}-\\d{9}$/);

const templates = await mod('quote-item-template.js');
const itemHtml = templates.renderQuoteItemTemplate({ quoteItemCounter: 2, designPrice: 10000, oshiPrice: 500 });
assert.ok(itemHtml.includes('quote-item-header'));
assert.ok(itemHtml.includes('10,000원'));
assert.ok(itemHtml.includes('500원/부'));
const innerHtml = templates.renderInnerSectionTemplate({ sectionCount: 1 });
assert.ok(innerHtml.includes('remove-inner-section-btn'));
assert.ok(innerHtml.includes('innerPaperType'));

const storageSource = fs.readFileSync(path.join(root, 'assets/js/pages/quote-book/quote-storage.js'), 'utf8');
assert.match(storageSource, /export function getBookTempStorageKey/);
assert.match(storageSource, /export function readLastQuoteCache/);

const quoteSource = fs.readFileSync(path.join(root, 'assets/js/pages/quote-book.js'), 'utf8');
for (const importName of ['contact-utils.js', 'preview-utils.js', 'preview-ui.js', 'quote-storage.js', 'quote-item-template.js', 'quote-id.js']) {
  assert.ok(quoteSource.includes(importName), `missing module import: ${importName}`);
}
for (const removed of ['function getPreviewUrl(val)', 'function sha256HexSync(str)', 'function pickContactFromUserData(userData)', 'newItem.innerHTML = `', 'newSection.innerHTML = `']) {
  assert.ok(!quoteSource.includes(removed), `extracted code still inline: ${removed}`);
}
for (const critical of ['function calculateQuote()', 'async function submitQuoteRequest(', 'async function initializePage(']) {
  assert.ok(quoteSource.includes(critical), `critical orchestration missing: ${critical}`);
}
assert.ok(quoteSource.includes('renderQuoteItemTemplate({ quoteItemCounter, designPrice, oshiPrice })'));
assert.ok(quoteSource.includes('renderInnerSectionTemplate({ sectionCount })'));

console.log('book UI/template/contact/storage module regression tests passed');
""", encoding='utf-8')

# 10) npm test chain
pkg = json.loads(PACKAGE.read_text(encoding='utf-8'))
scripts = pkg.setdefault('scripts', {})
scripts['test:book-ui'] = 'node scripts/test-book-ui-modules.mjs'
base_test = scripts.get('test:book', '')
if 'test:book-ui' not in base_test:
    scripts['test:book'] = base_test + ' && npm run test:book-ui'
PACKAGE.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# 11) Preview workflow smoke checks for every new browser module.
workflow = WORKFLOW.read_text(encoding='utf-8')
workflow_anchor = """          grep -F 'export function getWireBindingMetrics' /tmp/wire-calculator.js
"""
if workflow_anchor not in workflow:
    raise RuntimeError('preview workflow anchor missing')
workflow_extra = """

          for file in contact-utils.js preview-utils.js preview-ui.js quote-storage.js quote-item-template.js quote-id.js; do
            curl -fsSL "$BASE_URL/assets/js/pages/quote-book/$file" -o "/tmp/$file"
            test -s "/tmp/$file"
          done
          grep -F 'export function sha256HexSync' /tmp/contact-utils.js
          grep -F 'export function getPreviewUrl' /tmp/preview-utils.js
          grep -F 'export function openPreviewLayer' /tmp/preview-ui.js
          grep -F 'export function readLastQuoteCache' /tmp/quote-storage.js
          grep -F 'export function renderQuoteItemTemplate' /tmp/quote-item-template.js
          grep -F 'export async function generateBookReceiptNo' /tmp/quote-id.js
"""
workflow = workflow.replace(workflow_anchor, workflow_anchor + workflow_extra, 1)
WORKFLOW.write_text(workflow, encoding='utf-8')

# 12) README module map.
readme = README.read_text(encoding='utf-8') if README.exists() else '# 책자 견적 계산 모듈\n'
section = """

## UI / 페이지 지원 모듈

- `quote-item-template.js`: 견적 항목과 내지 섹션 HTML 템플릿만 담당합니다.
- `preview-utils.js`: 이미지 URL 정규화와 내지 그룹 판별 같은 순수 유틸입니다.
- `preview-ui.js`: 이미지 미리보기 모달 DOM 렌더링만 담당합니다.
- `contact-utils.js`: 연락처 정규화/표시, 회원 연락처 추출, SHA-256 헬퍼입니다.
- `quote-storage.js`: 마지막 계산 견적 캐시와 임시저장 키 공통 처리를 담당합니다.
- `quote-id.js`: 책자 견적 접수번호 생성을 담당합니다.

위 모듈에는 가격 계산식이나 Firestore 견적 저장 로직을 넣지 않습니다. `quote-book.js`는 페이지 흐름과 각 모듈 연결을 담당합니다.
"""
if '## UI / 페이지 지원 모듈' not in readme:
    readme += section
README.write_text(readme, encoding='utf-8')

if source == original:
    raise RuntimeError('quote-book.js was not changed')

print(f'book UI/util refactor applied; cache-save replacements={save_count}')
