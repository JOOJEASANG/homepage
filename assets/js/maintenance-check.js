// 사이트 점검 모드 체크
// settings/site 문서의 maintenance 플래그가 true이면 관리자가 아닌 사용자를 maintenance.html로 리다이렉트.
import { auth, db, doc, getDoc, onAuthStateChanged } from "./firebase.js";

function getAuthUserOnce(timeoutMs = 1200) {
    return new Promise((resolve) => {
        let done = false;
        let unsub = null;
        const finish = (user) => {
            if (done) return;
            done = true;
            try { if (typeof unsub === 'function') unsub(); } catch (e) {}
            resolve(user || null);
        };

        try {
            if (auth.currentUser) {
                finish(auth.currentUser);
                return;
            }
            unsub = onAuthStateChanged(auth, finish, () => finish(null));
        } catch (e) {
            finish(null);
            return;
        }

        setTimeout(() => finish(auth.currentUser || null), timeoutMs);
    });
}

async function isVerifiedAdmin() {
    try {
        const user = await getAuthUserOnce();
        if (!user || user.isAnonymous || !user.uid) return false;

        const snap = await getDoc(doc(db, "users", user.uid));
        return snap.exists() && snap.data()?.role === "admin";
    } catch (e) {
        console.warn('admin role check failed:', e);
        return false;
    }
}

(async () => {
    try {
        if (await isVerifiedAdmin()) return;

        const snap = await getDoc(doc(db, "settings", "site"));
        if (!snap.exists()) return;

        if (snap.data()?.maintenance === true) {
            try { sessionStorage.setItem('maintenanceReturnUrl', location.pathname + location.search); } catch (e) {}
            location.replace('maintenance.html');
        }
    } catch (e) {
        console.warn('maintenance check skipped:', e);
    }
})();
