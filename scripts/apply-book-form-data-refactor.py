from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUOTE = ROOT / 'assets/js/pages/quote-book.js'
source = QUOTE.read_text(encoding='utf-8')

if './quote-book/quote-form-data.js' in source:
    print('form data refactor already applied')
    raise SystemExit(0)

old_import = 'import { getBookTempStorageKey, readLastQuoteCache, writeLastQuoteCache, clearLastQuoteCache } from "./quote-book/quote-storage.js";\n'
new_import = (
    'import { getBookTempStorageKey, writeBookDraft, readBookDraft, hasBookDraft, clearBookDraft, readLastQuoteCache, writeLastQuoteCache, clearLastQuoteCache } from "./quote-book/quote-storage.js";\n'
    'import { serializeQuoteItems } from "./quote-book/quote-form-data.js";\n'
)
if source.count(old_import) != 1:
    raise RuntimeError('quote-storage import anchor mismatch')
source = source.replace(old_import, new_import, 1)

# Draft save block: replace DOM traversal with shared serializer.
start = source.find('    function saveFormData() {')
end = source.find('\n\n    async function restoreFormData()', start)
if start < 0 or end < 0:
    raise RuntimeError('saveFormData block markers missing')
old_save = source[start:end]
if "document.querySelectorAll('.quote-item').forEach" not in old_save:
    raise RuntimeError('saveFormData no longer has expected inline serializer')
new_save = '''    function saveFormData() {
        const tempStorageKey = getTempStorageKey();
        if (!tempStorageKey) return;
        const allItemsData = serializeQuoteItems(document.querySelectorAll('.quote-item'), 'draft');
        writeBookDraft(tempStorageKey, allItemsData);
    }'''
source = source[:start] + new_save + source[end:]

old_restore = "const savedData = JSON.parse(localStorage.getItem(tempStorageKey) || '[]');"
if source.count(old_restore) != 1:
    raise RuntimeError('restore draft read anchor mismatch')
source = source.replace(old_restore, 'const savedData = readBookDraft(tempStorageKey);', 1)

old_check = '''    function checkForTempData() {
        const tempStorageKey = getTempStorageKey();
        if(tempStorageKey && localStorage.getItem(tempStorageKey)) {
            showToast('이전에 작성하던 견적이 있습니다.', 'restore');
        }
    }'''
if source.count(old_check) != 1:
    raise RuntimeError('checkForTempData anchor mismatch')
new_check = '''    function checkForTempData() {
        const tempStorageKey = getTempStorageKey();
        if (hasBookDraft(tempStorageKey)) {
            showToast('이전에 작성하던 견적이 있습니다.', 'restore');
        }
    }'''
source = source.replace(old_check, new_check, 1)

# Reset uses the same storage adapter.
if source.count('localStorage.removeItem(tempStorageKey)') != 1:
    raise RuntimeError('draft clear anchor mismatch')
source = source.replace('localStorage.removeItem(tempStorageKey)', 'clearBookDraft(tempStorageKey)', 1)

# Submission serializer block. The draft inline serializer has already been removed,
# so the remaining allItemsData block must be the Firestore submission path.
start = source.find('        const allItemsData = [];')
end = source.find('        \n        const quoteRequestData = {', start)
if start < 0 or end < 0:
    raise RuntimeError('submission serializer block markers missing')
old_submit = source[start:end]
if "itemData.interleafSheets = interleafSection.classList.contains('hidden')" not in old_submit:
    raise RuntimeError('submission serializer did not match legacy shape')
new_submit = "        const allItemsData = serializeQuoteItems(document.querySelectorAll('.quote-item'), 'submission');\n"
source = source[:start] + new_submit + source[end:]

# Safety: no inline duplicate serializers should remain.
if "document.querySelectorAll('.quote-item').forEach(itemEl => {\n            const itemData = {};" in source:
    raise RuntimeError('inline quote-item serializer still remains')
for required in [
    'function calculateQuote()',
    'async function submitQuoteRequest(',
    'async function initializePage(',
    "serializeQuoteItems(document.querySelectorAll('.quote-item'), 'draft')",
    "serializeQuoteItems(document.querySelectorAll('.quote-item'), 'submission')",
]:
    if required not in source:
        raise RuntimeError(f'critical integration missing: {required}')

QUOTE.write_text(source, encoding='utf-8')
print('book form data refactor applied')
