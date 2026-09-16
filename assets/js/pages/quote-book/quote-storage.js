// 책자 견적 페이지의 브라우저 저장소 공통 처리

export function getBookTempStorageKey(currentUser, prefix = 'multiQuoteFormData_') {
    const uid = currentUser?.uid || 'anonymous';
    return `${prefix}${uid}`;
}

// Draft 저장/복원은 기존 localStorage 동작을 그대로 유지합니다.
// JSON 파싱 오류도 기존 호출부와 동일하게 상위로 전달합니다.
export function writeBookDraft(key, items) {
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(items));
}

export function readBookDraft(key) {
    if (!key) return [];
    return JSON.parse(localStorage.getItem(key) || '[]');
}

export function hasBookDraft(key) {
    return !!(key && localStorage.getItem(key));
}

export function clearBookDraft(key) {
    if (!key) return;
    localStorage.removeItem(key);
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
