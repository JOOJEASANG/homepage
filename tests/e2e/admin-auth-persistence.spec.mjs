import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Use the real Auth SDK with a synthetic stored session and intercepted REST reads.
// Firestore and Storage are isolated so these tests cannot access application data.
for (const persistence of ['localStorage', 'indexedDB']) {
  test(`embedded editors keep the parent login and migrate ${persistence} sessions`, async ({ page }) => {
    const source = await readFile(new URL('../../assets/js/firebase.js', import.meta.url), 'utf8');
    const apiKey = source.match(/apiKey:\s*"([^"]+)"/)[1];
    const key = `firebase:authUser:${apiKey}:[DEFAULT]`;
    const payload = Buffer.from(JSON.stringify({ sub: 'fixture-admin', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    const user = {
      uid: 'fixture-admin', email: 'fixture@example.invalid', emailVerified: true,
      isAnonymous: false, providerData: [], apiKey, appName: '[DEFAULT]',
      stsTokenManager: { refreshToken: 'fixture-refresh', accessToken: `eyJhbGciOiJub25lIn0.${payload}.fixture`, expirationTime: Date.now() + 3600_000 },
    };
    await page.addInitScript(({ key, user, persistence }) => {
      window.fixtureReady = Promise.resolve();
      if (parent !== window) return;
      if (persistence === 'localStorage') localStorage.setItem(key, JSON.stringify(user));
      else window.fixtureReady = new Promise((resolve, reject) => {
        const request = indexedDB.open('firebaseLocalStorageDb', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('firebaseLocalStorage', 'readwrite');
          transaction.objectStore('firebaseLocalStorage').put({ fbase_key: key, value: user });
          transaction.oncomplete = () => { database.close(); resolve(); };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    }, { key, user, persistence });
    const js = body => ({ contentType: 'application/javascript', body });
    if (process.env.FIREBASE_SDK_FIXTURE_DIR) {
      for (const name of ['app', 'auth']) {
        const body = await readFile(`${process.env.FIREBASE_SDK_FIXTURE_DIR}/firebase-${name}.js`, 'utf8');
        await page.route(`https://www.gstatic.com/firebasejs/10.12.2/firebase-${name}.js`, route => route.fulfill(js(body)));
      }
    }
    await page.route('**/firebase-firestore.js', route => route.fulfill(js(`
      export const getFirestore = () => ({});
      export const collection = () => {}, onSnapshot = collection, query = collection, orderBy = collection;
      export const doc = collection, updateDoc = collection, addDoc = collection, serverTimestamp = collection;
      export const deleteDoc = collection, getDoc = collection, setDoc = collection, getDocs = collection;
      export const writeBatch = collection, deleteField = collection, limit = collection, where = collection;
      export const Timestamp = {}, runTransaction = collection;
    `)));
    await page.route('**/firebase-storage.js', route => route.fulfill(js(`
      export const getStorage = () => ({});
      export const ref = () => {}, uploadBytesResumable = ref, getDownloadURL = ref;
      export const deleteObject = ref, uploadBytes = ref, listAll = ref;
    `)));
    await page.route('**/accounts:lookup*', route => route.fulfill({ json: {
      users: [{ localId: user.uid, email: user.email, emailVerified: true, providerUserInfo: [], lastLoginAt: String(Date.now()), createdAt: String(Date.now()) }],
    } }));
    await page.route('**/auth-persistence-fixture.html', route => route.fulfill({ contentType: 'text/html', body: `
      <!doctype html><html><body><script type="module">
        await window.fixtureReady;
        const { auth, onAuthStateChanged, signOut } = await import('/assets/js/firebase.js');
        window.fixtureAuth = auth;
        window.fixtureSignOut = () => signOut(auth);
        window.fixtureAuthEvents = [];
        onAuthStateChanged(auth, user => {
          window.fixtureUid = user?.uid || null;
          window.fixtureAuthEvents.push(window.fixtureUid);
        });
      </script></body></html>
    ` }));
    await page.goto('/auth-persistence-fixture.html');
    await expect.poll(() => page.evaluate(() => window.fixtureUid)).toBe(user.uid);
    expect(await page.evaluate(key => localStorage.getItem(key) !== null, key)).toBe(true);
    await page.evaluate(() => {
      const frame = document.createElement('iframe');
      frame.id = 'editor'; frame.src = '/auth-persistence-fixture.html'; document.body.append(frame);
    });
    const child = page.frameLocator('#editor');
    await expect.poll(() => child.locator('body').evaluate(() => window.fixtureUid)).toBe(user.uid);
    // A default getAuth() in the child would move the stored user to IndexedDB,
    // erase localStorage and sign the parent out through the storage event.
    expect(await page.evaluate(key => localStorage.getItem(key) !== null, key)).toBe(true);
    expect(await page.evaluate(() => window.fixtureAuthEvents)).toEqual([user.uid]);
    await child.locator('body').evaluate(() => window.fixtureSignOut());
    await expect.poll(() => page.evaluate(() => window.fixtureUid)).toBe(null);
  });
}
