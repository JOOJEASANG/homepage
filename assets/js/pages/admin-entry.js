import { auth, onAuthStateChanged, setPersistence, browserLocalPersistence } from '../firebase.js';

try { await setPersistence(auth, browserLocalPersistence); } catch (e) {}

await new Promise(resolve => {
  let done = false;
  let unsub = null;
  const finish = () => {
    if (done) return;
    done = true;
    try { if (typeof unsub === 'function') unsub(); } catch (e) {}
    resolve();
  };
  try {
    if (auth.currentUser && !auth.currentUser.isAnonymous) return finish();
    unsub = onAuthStateChanged(auth, user => {
      if (user && !user.isAnonymous) finish();
    }, finish);
  } catch (e) {
    return finish();
  }
  setTimeout(finish, 1800);
});

import('./admin.js');
