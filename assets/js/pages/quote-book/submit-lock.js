// 책자 자동접수/중복접수 방지 잠금
// sessionStorage 사용 불가 환경에서는 기존처럼 메모리 잠금만 사용합니다.

let bookSubmitLocked = false;
const STORAGE_KEY = '__BOOK_SUBMIT_LOCK';

export function acquireBookSubmitLock() {
    try {
        if (bookSubmitLocked) return false;
        if (sessionStorage.getItem(STORAGE_KEY) === '1') return false;
        bookSubmitLocked = true;
        sessionStorage.setItem(STORAGE_KEY, '1');
        return true;
    } catch (_) {
        if (bookSubmitLocked) return false;
        bookSubmitLocked = true;
        return true;
    }
}

export function releaseBookSubmitLock() {
    bookSubmitLocked = false;
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
}

// 테스트와 페이지 재초기화 안전성을 위한 상태 조회. 운영 흐름에서는 읽기만 사용합니다.
export function isBookSubmitLocked() {
    return bookSubmitLocked;
}
