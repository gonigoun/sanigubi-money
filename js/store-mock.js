// 시험용 저장소: 주소 끝에 ?mock 을 붙이면 Firebase 대신 이 브라우저 안에만 저장합니다.
const KEY = 'sanigubi-mock-v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { months: {}, photos: {}, user: null }; } catch { return { months: {}, photos: {}, user: null }; } };
const save = s => localStorage.setItem(KEY, JSON.stringify(s));

export async function createStore() {
  const subs = [];
  const emit = () => { const u = load().user; subs.forEach(cb => cb(u)); };
  return {
    mode: 'mock',
    onUser(cb) { subs.push(cb); setTimeout(() => cb(load().user), 0); return () => {}; },
    async signIn(email = 'gonigoun@gmail.com') { const s = load(); s.user = { email, verified: true }; save(s); emit(); },
    async signOut() { const s = load(); s.user = null; save(s); emit(); },
    async listMonths() { return Object.entries(load().months).map(([id, v]) => ({ id, ...v })); },
    async saveMonth(id, data) { const s = load(); s.months[id] = { ...data, updatedAt: Date.now() }; save(s); },
    async deleteMonth(id) { const s = load(); delete s.months[id]; save(s); },
    async listPhotos(monthId) { return Object.entries(load().photos).filter(([, p]) => p.monthId === monthId).map(([id, p]) => ({ id, ...p })); },
    async addPhoto(p) { const s = load(); const id = 'p' + Date.now() + Math.random().toString(36).slice(2, 6); s.photos[id] = { ...p, createdAt: Date.now() }; save(s); return id; },
    async updatePhoto(id, patch) { const s = load(); Object.assign(s.photos[id], patch); save(s); },
    async deletePhoto(id) { const s = load(); delete s.photos[id]; save(s); },
  };
}
