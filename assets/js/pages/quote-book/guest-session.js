import { formatPhoneHyphen } from './contact-utils.js';

// 비회원 세션/로컬 저장소 접근을 한곳에 모읍니다.
// 각 호출 경로에서 사용하던 저장소 우선순위는 그대로 유지합니다.

export function readGuestSubmitSession() {
    const lookupKey = (sessionStorage.getItem('guestLookupKey') || localStorage.getItem('guestLookupKey') || '').trim();
    const name = (sessionStorage.getItem('guestName') || localStorage.getItem('guestName') || '').trim();
    const contactRaw = (sessionStorage.getItem('guestContactRaw') || localStorage.getItem('guestContactRaw') || '').trim();
    const contact = ((sessionStorage.getItem('guestContact') || localStorage.getItem('guestContact') || ''))
        .trim()
        .replace(/[^0-9]/g, '');

    return {
        lookupKey,
        name,
        contactRaw,
        contact,
        contactForSubmission: (contactRaw || contact || '').trim(),
    };
}

/** 상단 사용자 메뉴에서 사용하던 기존 판별 규칙을 그대로 유지합니다. */
export function readGuestMenuSession() {
    const guestName = sessionStorage.getItem('guestName');
    const hasGuestSession = !!guestName
        || !!localStorage.getItem('guestLookupKey')
        || !!localStorage.getItem('guestPwLast4');
    return { guestName, hasGuestSession };
}

/** 마이페이지 이동 시 사용하던 기존 lookup key 우선순위를 유지합니다. */
export function getGuestMyPageLookupKey() {
    return localStorage.getItem('guestLookupKey')
        || sessionStorage.getItem('guestLookupKey')
        || localStorage.getItem('guestLookupKeyLegacy')
        || '';
}

/** quoteToReload의 비회원 수정 정보를 session/local 저장소에 복구합니다. */
export function restoreGuestSessionFromReload(parsed) {
    if (!parsed || !parsed.isGuest || !parsed.guestLookupKey) return false;

    const gContact = (parsed.guestContact || '').toString().replace(/[^0-9]/g, '');
    const pw4 = (parsed.guestPwLast4 || gContact.slice(-4) || '').toString();

    try {
        const prevKey = (sessionStorage.getItem('guestLookupKey') || localStorage.getItem('guestLookupKey') || '').trim();
        if (prevKey && prevKey !== parsed.guestLookupKey) {
            sessionStorage.setItem('guestLookupKeyLegacy', prevKey);
            try { localStorage.setItem('guestLookupKeyLegacy', prevKey); } catch (_) {}
        }
    } catch (_) {}

    sessionStorage.setItem('guestLookupKey', parsed.guestLookupKey);
    try { localStorage.setItem('guestLookupKey', parsed.guestLookupKey); } catch (_) {}

    if (parsed.guestLookupKeyLegacy) {
        sessionStorage.setItem('guestLookupKeyLegacy', parsed.guestLookupKeyLegacy);
        try { localStorage.setItem('guestLookupKeyLegacy', parsed.guestLookupKeyLegacy); } catch (_) {}
    }

    if (parsed.guestName) {
        sessionStorage.setItem('guestName', parsed.guestName);
        try { localStorage.setItem('guestName', parsed.guestName); } catch (_) {}
    }

    if (gContact) {
        sessionStorage.setItem('guestContact', gContact);
        try { localStorage.setItem('guestContact', gContact); } catch (_) {}
        sessionStorage.setItem('guestContactHyphen', formatPhoneHyphen(gContact));
    }

    if (parsed.guestContactRaw) {
        sessionStorage.setItem('guestContactRaw', parsed.guestContactRaw);
        try { localStorage.setItem('guestContactRaw', parsed.guestContactRaw); } catch (_) {}
    }

    if (pw4) {
        sessionStorage.setItem('guestPwLast4', pw4);
        try { localStorage.setItem('guestPwLast4', pw4); } catch (_) {}
    }

    return true;
}

/** 접수 성공 후 저장하던 비회원 조회 세션을 그대로 기록합니다. */
export function persistGuestSessionAfterSubmit({
    guestLookupKey,
    legacyKey = null,
    ordererName = '',
    normalizedContact = '',
    contactRaw = '',
    pwLast4 = '',
} = {}) {
    if (!guestLookupKey) return false;

    sessionStorage.setItem('guestLookupKey', guestLookupKey);
    if (legacyKey) sessionStorage.setItem('guestLookupKeyLegacy', legacyKey);
    sessionStorage.setItem('guestName', ordererName);
    sessionStorage.setItem('guestContact', normalizedContact);
    sessionStorage.setItem('guestContactRaw', contactRaw);
    sessionStorage.setItem('guestPwLast4', pwLast4);
    sessionStorage.setItem('guestContactHyphen', formatPhoneHyphen(normalizedContact));

    try {
        localStorage.setItem('guestLookupKey', guestLookupKey);
        if (legacyKey) localStorage.setItem('guestLookupKeyLegacy', legacyKey);
        localStorage.setItem('guestName', ordererName);
        localStorage.setItem('guestContact', normalizedContact);
        localStorage.setItem('guestContactRaw', contactRaw);
        localStorage.setItem('guestPwLast4', pwLast4);
    } catch (_) {}

    return true;
}
