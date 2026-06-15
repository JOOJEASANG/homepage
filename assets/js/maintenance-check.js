// 사이트 점검 모드 체크
// settings/site 문서의 maintenance 플래그가 true이면 관리자가 아닌 사용자를 maintenance.html로 리다이렉트.
import { db, doc, getDoc } from "./firebase.js";

(async () => {
    try {
        if (localStorage.getItem('userRole') === 'admin') return;

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
