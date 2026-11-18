// Single source of truth for the administrator's notification toggle.
// Preference is local to the current browser; browser notification permission is separate.
export const ADMIN_NOTIFICATION_KEY = 'adminNotifsEnabled';

export function readAdminNotificationPreference(storage, fallback = true) {
    try {
        const saved = storage?.getItem(ADMIN_NOTIFICATION_KEY);
        if (saved === '1') return true;
        if (saved === '0') return false;
    } catch (_) { /* private mode and blocked storage use in-memory value */ }
    return !!fallback;
}

export function notificationToggleText(enabled) {
    return {
        state: enabled ? '알림 켜짐' : '알림 꺼짐',
        action: enabled ? '알림 끄기' : '알림 켜기'
    };
}
