// 책자 견적 페이지의 URL/재로딩 상태 해석
// Firebase/DOM 접근 없이 기존 quote-book.js 분기 규칙만 캡슐화합니다.

export function isAdminEditSearch(search = '') {
    try {
        const params = new URLSearchParams(search || '');
        return params.get('adminEdit') === '1' || params.get('admin_edit') === '1';
    } catch (_) {
        return false;
    }
}

function parseFormData(formData) {
    try {
        if (Array.isArray(formData)) return formData;
        if (typeof formData === 'string') return JSON.parse(formData || '[]');
        if (formData && typeof formData === 'object') return [formData];
        return [];
    } catch (_) {
        return [];
    }
}

/**
 * localStorage.quoteToReload 값을 기존 규칙대로 해석합니다.
 * 바깥 JSON이 잘못된 경우는 기존 initializePage의 outer catch가 처리하도록 예외를 유지합니다.
 */
export function parseQuoteReloadPayload(rawValue) {
    const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;

    if (Array.isArray(parsed)) {
        return {
            items: parsed,
            editEnabled: false,
            quoteId: null,
            source: parsed,
            guestRestore: null,
        };
    }

    if (!parsed || typeof parsed !== 'object') {
        return {
            items: [],
            editEnabled: false,
            quoteId: null,
            source: parsed,
            guestRestore: null,
        };
    }

    const editEnabled = (parsed.mode === 'edit' || parsed.mode === 'admin_edit') && !!parsed.quoteId;
    return {
        items: parseFormData(parsed.formData),
        editEnabled,
        quoteId: editEnabled ? parsed.quoteId : null,
        source: parsed,
        guestRestore: editEnabled && parsed.isGuest && parsed.guestLookupKey ? parsed : null,
    };
}
