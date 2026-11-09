// 실제 저장소: Firebase (Google 로그인 + Firestore)
const V = '10.12.2';
const base = `https://www.gstatic.com/firebasejs/${V}/`;

export async function createStore(config) {
  const { initializeApp } = await import(base + 'firebase-app.js');
  const A = await import(base + 'firebase-auth.js');
  const F = await import(base + 'firebase-firestore.js');
  const app = initializeApp(config);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);

  const months = F.collection(db, 'months');
  const photos = F.collection(db, 'photos');
  const snapList = s => s.docs.map(d => ({ id: d.id, ...d.data() }));

  return {
    mode: 'firebase',
    onUser(cb) { A.getRedirectResult(auth).catch(() => {}); return A.onAuthStateChanged(auth, u => cb(u ? { email: u.email, verified: u.emailVerified } : null)); },
    async signIn() {
      const p = new A.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      try { await A.signInWithPopup(auth, p); }
      catch (e) {
        if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) return A.signInWithRedirect(auth, p);
        if (e && e.code === 'auth/popup-closed-by-user') return;
        throw e;
      }
    },
    signOut() { return A.signOut(auth); },

    async listMonths() { return snapList(await F.getDocs(months)); },
    async saveMonth(id, data) { await F.setDoc(F.doc(months, id), { ...data, updatedAt: Date.now() }); },
    async deleteMonth(id) { await F.deleteDoc(F.doc(months, id)); },

    async listPhotos(monthId) { return snapList(await F.getDocs(F.query(photos, F.where('monthId', '==', monthId)))); },
    async addPhoto(p) { const r = await F.addDoc(photos, { ...p, createdAt: Date.now() }); return r.id; },
    async updatePhoto(id, patch) { await F.updateDoc(F.doc(photos, id), patch); },
    async deletePhoto(id) { await F.deleteDoc(F.doc(photos, id)); },
  };
}
