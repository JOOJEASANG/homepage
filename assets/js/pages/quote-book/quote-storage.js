// 책자 견적 페이지의 브라우저 저장소 공통 처리

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
