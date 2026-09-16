from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUOTE = ROOT / 'assets/js/pages/quote-book.js'
source = QUOTE.read_text(encoding='utf-8')

import_line = 'import { buildQuoteRequestData, buildQuoteUpdatePayload } from "./quote-book/quote-request-data.js";\n'
if import_line not in source:
    anchor = 'import { serializeQuoteItems } from "./quote-book/quote-form-data.js";\n'
    if source.count(anchor) != 1:
        raise SystemExit(f'expected one form-data import, found {source.count(anchor)}')
    source = source.replace(anchor, anchor + import_line, 1)

request_anchor = "        const allItemsData = serializeQuoteItems(document.querySelectorAll('.quote-item'), 'submission');\n"
if source.count(request_anchor) != 1:
    raise SystemExit(f'expected one request anchor, found {source.count(request_anchor)}')
request_start = source.index('        const quoteRequestData = {\n', source.index(request_anchor))
request_end_token = '        };\n\n        try {'
request_end = source.index(request_end_token, request_start) + len('        };\n')
old_request = source[request_start:request_end]
if '...lastCalculatedQuote' not in old_request or "productType: 'book'" not in old_request:
    raise SystemExit('quote request block guard failed')
new_request = '''        const quoteRequestData = buildQuoteRequestData({
            calculatedQuote: lastCalculatedQuote,
            userId: user ? user.uid : null,
            isGuest,
            ordererName,
            ordererContact,
            normalizedContact,
            ordererCompany,
            guestLookupKey,
            guestContactRaw: opts.guestContactRaw || null,
            guestContactHyphen: formatPhoneHyphen(normalizedContact) || null,
            guestUid: auth.currentUser ? auth.currentUser.uid : null,
            createdAt: Timestamp.now(),
            breakdownHtml: DOMElements.priceBreakdownEl.innerHTML,
            allItemsData,
        });
'''
source = source[:request_start] + new_request + source[request_end:]

payload_start_marker = '                    // 진행중 상태를 덮어쓰지 않도록 기존 상태를 우선 유지\n'
if source.count(payload_start_marker) != 1:
    raise SystemExit(f'expected one update payload marker, found {source.count(payload_start_marker)}')
payload_start = source.index(payload_start_marker)
payload_end_marker = 'payload.receiptNo = existing.receiptNo || payload.receiptNo || await generateReceiptNo();'
payload_end = source.index(payload_end_marker, payload_start)
old_payload = source[payload_start:payload_end]
required = [
    'const payload = { ...quoteRequestData };',
    "payload.lastEditedBy = editState.adminEdit ? 'admin' : 'customer';",
    'payload.hasUnreadCustomerMessage = editState.adminEdit ? true : false;',
]
for token in required:
    if token not in old_payload:
        raise SystemExit(f'update payload guard missing: {token}')
new_payload = '''                    // 진행중 상태/소유권/읽음 상태 보존 규칙은 순수 helper에서 생성합니다.
                    const payload = buildQuoteUpdatePayload({
                        quoteRequestData,
                        existing,
                        isAdminEditMode: __isAdminEditMode(),
                        adminEditFlag: editState.adminEdit,
                        updatedAt: Timestamp.now(),
                        lastEditedAt: Timestamp.now(),
                    });
'''
source = source[:payload_start] + new_payload + source[payload_end:]

if source.count('buildQuoteRequestData({') != 1:
    raise SystemExit('buildQuoteRequestData integration count mismatch')
if source.count('buildQuoteUpdatePayload({') != 1:
    raise SystemExit('buildQuoteUpdatePayload integration count mismatch')
if 'const quoteRequestData = {\n            ...lastCalculatedQuote' in source:
    raise SystemExit('old inline request data block still present')
if 'const payload = { ...quoteRequestData };' in source:
    raise SystemExit('old inline update payload still present')

QUOTE.write_text(source, encoding='utf-8')
print('book request data refactor applied')
