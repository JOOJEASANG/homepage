import assert from 'node:assert/strict';
import { ADMIN_NOTIFICATION_KEY, readAdminNotificationPreference, notificationToggleText } from '../assets/js/pages/admin/notification-preference.js';

const store = new Map();
const storage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,String(v)) };
assert.equal(readAdminNotificationPreference(storage), true, 'new admin browsers default to notification enabled');
storage.setItem(ADMIN_NOTIFICATION_KEY, '0');
assert.equal(readAdminNotificationPreference(storage), false, 'saved off preference must be restored');
storage.setItem(ADMIN_NOTIFICATION_KEY, '1');
assert.equal(readAdminNotificationPreference(storage), true, 'saved on preference must be restored');
storage.setItem(ADMIN_NOTIFICATION_KEY, 'invalid');
assert.equal(readAdminNotificationPreference(storage, false), false, 'invalid value does not force notifications on');
assert.equal(readAdminNotificationPreference({ getItem() { throw new Error('blocked'); } }, false), false);
assert.deepEqual(notificationToggleText(true), {state:'알림 켜짐', action:'알림 끄기'});
assert.deepEqual(notificationToggleText(false), {state:'알림 꺼짐', action:'알림 켜기'});
console.log('Admin notification preference restore and status text: OK');
