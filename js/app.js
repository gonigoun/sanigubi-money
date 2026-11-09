// 청라 산이구비 재정 공개 — 공개 화면 + 관리 화면
import { firebaseConfig, ADMIN_EMAILS } from '../firebase-config.js';
import { compressImage } from './image.js';
import { readWorkbook, parseSettlementSheet } from './xlsx-lite.js';

const MOCK = new URLSearchParams(location.search).has('mock');
const $ = s => document.querySelector(s);
const app = $('#app');
const won = n => (Number(n) || 0).toLocaleString('ko-KR') + '원';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const idOf = (y, m) => `${y}-${pad(m)}`;
const toNum = v => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- 계산 ----------
function totals(m) {
  const items = m.items || [];
  const tin = items.filter(i => i.type === 'in').reduce((a, i) => a + toNum(i.amount), 0);
  const tout = items.filter(i => i.type === 'out').reduce((a, i) => a + toNum(i.amount), 0);
  const start = toNum(m.start);
  return { tin, tout, start, end: start + tin - tout };
}
const sortMonths = list => list.slice().sort((a, b) => a.id.localeCompare(b.id));
function prevOf(list, id) { const s = sortMonths(list).filter(m => m.id < id); return s[s.length - 1] || null; }

// ---------- 상태 ----------
let store = null;
let user = null;
let months = [];
const photoCache = new Map(); // monthId -> photos[]

async function loadMonths() { months = sortMonths(await store.listMonths()); }
async function photosOf(monthId, fresh = false) {
  if (!fresh && photoCache.has(monthId)) return photoCache.get(monthId);
  const p = (await store.listPhotos(monthId)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0));
  photoCache.set(monthId, p); return p;
}
const isAdmin = () => !!(user && ADMIN_EMAILS.includes(user.email) && user.verified !== false);

// ---------- 라우팅 ----------
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h === 'admin' || h.startsWith('admin/')) return renderAdmin(h.split('/')[1] || null);
  return renderPublic(/^\d{4}-\d{2}$/.test(h) ? h : null);
}
window.addEventListener('hashchange', route);

// =====================================================================
// 공개 화면
// =====================================================================
let lbPhotos = [], lbIdx = 0, renderSeq = 0;

async function renderPublic(selId) {
  const seq = ++renderSeq;
  $('#adminLink').hidden = false;
  if (!months.length) { app.innerHTML = '<p class="empty">아직 올라온 정산 내역이 없어요.</p>'; return; }
  const latest = months[months.length - 1];
  const sel = months.find(m => m.id === selId) || latest;
  const lt = totals(latest), st = totals(sel);
  const yearMonths = months.filter(m => m.year === sel.year);
  const multiYear = new Set(months.map(m => m.year)).size > 1;
  $('#pageTitle').textContent = `${sel.year}년 재정 공개`;
  const upd = Math.max(...months.map(m => m.updatedAt || 0));
  $('#updated').textContent = upd ? `최종 업데이트 ${new Date(upd).toLocaleDateString('ko-KR')}` : '';

  const ins = (sel.items || []).filter(i => i.type === 'in');
  const outs = (sel.items || []).filter(i => i.type === 'out');
  const gifts = (sel.items || []).filter(i => i.type === 'gift');
  const rows = (list, kind) => list.map(it => `<li><span class="n">${esc(it.name)}</span>${kind === 'gift'
    ? `<span class="gifttag">${esc(it.gift || '현물')}</span>` : `<span class="a num">${won(it.amount)}</span>`}${it.note ? `<span class="note">${esc(it.note)}</span>` : ''}</li>`).join('');
  const diff = st.tin - st.tout;

  app.innerHTML = `<div class="view">
    <div class="balance"><span class="lbl">현재 잔액 (${latest.month}월 ${esc(latest.mountain)} 정산 후)</span>
      <span class="amt num">${won(lt.end)}</span><span class="sub">${esc(latest.date)} 정산 기준</span></div>
    <section class="trend" aria-label="월별 정산 후 잔액"><h2>${sel.year}년 월별 정산 후 잔액 (만원)</h2><svg id="chart" viewBox="0 0 600 170" role="img"></svg></section>
    <nav class="months" aria-label="정산 월 선택">${months.slice().reverse().map(m =>
      `<button type="button" class="chip" data-id="${m.id}" aria-pressed="${m.id === sel.id}">${multiYear ? m.year + '년 ' : ''}${m.month}월 ${esc(m.mountain)}</button>`).join('')}</nav>
    <article class="month">
      <div class="mhead"><h2>${sel.month}월 ${esc(sel.mountain)} 정산</h2><span class="date num">${esc(sel.date)}</span></div>
      <div class="sum">
        <div><div class="k">전월 이월</div><div class="v num">${won(st.start)}</div></div>
        <div><div class="k">이번 달 결과</div><div class="v num">${(diff >= 0 ? '+' : '') + won(diff)}</div></div>
        <div><div class="k">수입 합계</div><div class="v in num">${won(st.tin)}</div></div>
        <div><div class="k">지출 합계</div><div class="v out num">${won(st.tout)}</div></div>
        <div class="end"><div class="k">정산 후 잔액</div><div class="v num">${won(st.end)}</div></div>
      </div>
      ${ins.length ? `<section class="card"><h3 class="in"><span>수입</span><span class="t">${won(st.tin)}</span></h3><ul class="rows">${rows(ins, 'in')}</ul></section>` : ''}
      ${outs.length ? `<section class="card"><h3 class="out"><span>지출</span><span class="t">${won(st.tout)}</span></h3><ul class="rows">${rows(outs, 'out')}</ul></section>` : ''}
      ${gifts.length ? `<section class="card"><h3 class="gift"><span>현물 찬조, 감사합니다</span></h3><ul class="rows">${rows(gifts, 'gift')}</ul></section>` : ''}
      <details class="card receipts" id="receipts"><summary><span>영수증 · 증빙 사진 <span class="t" id="pcount"></span></span><span class="tog" aria-hidden="true"></span></summary><div id="rbody"><p class="empty">사진을 불러오는 중이에요…</p></div></details>
    </article></div>`;

  drawChart(yearMonths, sel.id);
  app.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.id; }));
  const chip = app.querySelector(`.chip[data-id="${sel.id}"]`); if (chip && chip.scrollIntoView) chip.scrollIntoView({ block: 'nearest', inline: 'center' });

  // 영수증은 눌러서 펼칠 때 불러와요 (데이터 절약)
  const det = $('#receipts');
  let loaded = false;
  det.addEventListener('toggle', async () => {
    if (!det.open || loaded) return;
    loaded = true;
    const photos = await photosOf(sel.id);
    if (seq !== renderSeq) return; // 그새 다른 화면으로 이동함
    const box = $('#rbody'); if (!box) return;
    lbPhotos = photos;
    $('#pcount').textContent = photos.length ? photos.length + '장' : '';
    box.innerHTML = (photos.length
      ? `<div class="grid">${photos.map((p, i) => `<button type="button" class="thumb" data-i="${i}" aria-label="${esc(p.caption || '증빙 사진 ' + (i + 1))} 크게 보기"><img src="${p.data}" alt="${esc(p.caption || '')}" loading="lazy">${p.caption ? `<span class="cap">${esc(p.caption)}</span>` : ''}</button>`).join('')}</div>`
      : '<p class="empty">이 달의 증빙 사진은 준비 중이에요.</p>') +
      (sel.receiptNote ? `<div class="rnote">${esc(sel.receiptNote)}</div>` : '');
    box.querySelectorAll('.thumb').forEach(t => t.addEventListener('click', () => openLb(+t.dataset.i)));
  });
}

function drawChart(list, selId) {
  const svg = $('#chart'); if (!svg) return;
  const W = 600, H = 170, top = 22, bot = 24, left = 6, right = 6;
  const vals = list.map(m => totals(m).end), max = Math.max(1, ...vals);
  const n = Math.max(list.length, 6), slot = (W - left - right) / n, bw = Math.min(40, slot * 0.62);
  let s = `<line x1="${left}" x2="${W - right}" y1="${H - bot}" y2="${H - bot}" stroke="var(--line)"/>`;
  list.forEach((m, i) => {
    const h = Math.max(0, vals[i]) / max * (H - top - bot), x = left + slot * i + (slot - bw) / 2, y = H - bot - h;
    s += `<g data-id="${m.id}"><rect x="${left + slot * i}" y="0" width="${slot}" height="${H}" fill="transparent"/>
      <rect class="bar${m.id === selId ? ' on' : ''}" x="${x}" y="${y}" width="${bw}" height="${h}" rx="4"/>
      <text class="val num" x="${x + bw / 2}" y="${y - 6}" text-anchor="middle">${Math.round(vals[i] / 10000)}</text>
      <text x="${x + bw / 2}" y="${H - 7}" text-anchor="middle">${m.month}월</text></g>`;
  });
  svg.innerHTML = s;
  svg.setAttribute('aria-label', '월별 정산 후 잔액: ' + list.map((m, i) => `${m.month}월 ${won(vals[i])}`).join(', '));
  svg.querySelectorAll('g[data-id]').forEach(g => g.addEventListener('click', () => { location.hash = g.dataset.id; }));
}

// 사진 크게 보기
const lb = $('#lb'), lbimg = $('#lbimg');
function showLb() { const p = lbPhotos[lbIdx]; lbimg.src = p.data; lbimg.alt = p.caption || ''; $('#lbcap').textContent = p.caption || ''; $('#lbcount').textContent = `${lbIdx + 1} / ${lbPhotos.length}`; }
function openLb(i) { lbIdx = i; showLb(); lb.classList.add('open'); $('#lbclose').focus(); }
function closeLb() { lb.classList.remove('open'); }
function stepLb(d) { lbIdx = (lbIdx + d + lbPhotos.length) % lbPhotos.length; showLb(); }
$('#lbclose').onclick = closeLb; $('#lbprev').onclick = () => stepLb(-1); $('#lbnext').onclick = () => stepLb(1);
lb.addEventListener('click', e => { if (e.target === lb || e.target.classList.contains('stage')) closeLb(); });
document.addEventListener('keydown', e => { if (!lb.classList.contains('open')) return; if (e.key === 'Escape') closeLb(); if (e.key === 'ArrowLeft') stepLb(-1); if (e.key === 'ArrowRight') stepLb(1); });
let sx = null;
lb.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
lb.addEventListener('touchend', e => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) stepLb(dx < 0 ? 1 : -1); sx = null; });

// =====================================================================
// 관리 화면
// =====================================================================
let draft = null;      // 편집 중인 달
let draftOrigId = null;
let dirty = false;

function adminBar() {
  return `<div class="adminbar"><span class="who">관리자 · ${esc(user.email)}${MOCK ? ' (시험 모드)' : ''}</span>
    <span class="acts"><a class="btn small" href="#">공개 화면 보기</a><button type="button" class="btn small" id="logout">로그아웃</button></span></div>`;
}
function bindBar() { $('#logout').onclick = () => store.signOut(); }

async function renderAdmin(editId) {
  renderSeq++;
  $('#adminLink').hidden = true;
  $('#pageTitle').textContent = '재정 관리';
  if (!user) {
    app.innerHTML = `<div class="panel"><h2>관리자 로그인</h2><p class="help">재정총무 Google 계정으로 로그인하면 정산을 입력하고 영수증을 올릴 수 있어요. 회원분들은 로그인 없이 보기만 할 수 있어요.</p>
      <div><button type="button" class="btn primary" id="login">Google로 로그인</button></div><p><a href="#">← 공개 화면으로</a></p></div>`;
    $('#login').onclick = async () => { try { await store.signIn(); } catch (e) { toast('로그인하지 못했어요: ' + (e.message || e)); } };
    return;
  }
  if (!isAdmin()) {
    app.innerHTML = `<div class="panel"><h2>관리 권한이 없는 계정이에요</h2><p class="help">${esc(user.email)} 계정은 관리자로 등록되어 있지 않아요. 재정총무 계정으로 다시 로그인해 주세요.</p>
      <div><button type="button" class="btn" id="logout">로그아웃</button></div></div>`;
    bindBar(); return;
  }
  if (editId) return renderEditor(editId);
  draft = null;

  app.innerHTML = `<div class="view">${adminBar()}
    <section class="panel"><h2>엑셀로 한 번에 불러오기</h2>
      <p class="help">정산 엑셀 파일(.xlsx)을 고르면 'OO년 O월 OO산 정산 내역' 모양의 시트를 찾아 줘요. 불러올 달을 고르고 저장하면 수입·지출·현물 찬조가 한꺼번에 들어가요.</p>
      <div><input type="file" id="xlsx" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div>
      <div id="sheets"></div></section>
    <section class="panel"><h2>월별 정산</h2>
      <p class="help">달을 눌러 내용을 고치거나 영수증 사진을 올려요.</p>
      <ul class="mlist">${months.slice().reverse().map(m => { const t = totals(m); return `<li><span><b>${m.year}년 ${m.month}월 ${esc(m.mountain)}</b><span class="meta"> · ${esc(m.date)} · 잔액 <span class="num">${won(t.end)}</span></span></span>
        <a class="btn small" href="#admin/${m.id}">편집</a></li>`; }).join('') || '<li class="help">아직 등록된 달이 없어요.</li>'}</ul>
      <div class="row-actions"><a class="btn primary" href="#admin/new">+ 새 달 직접 입력</a>
        ${months.length ? '' : '<button type="button" class="btn" id="seed">처음 자료(2026년 1~10월) 넣기</button>'}</div>
    </section></div>`;
  bindBar();
  $('#xlsx').addEventListener('change', onExcel);
  const sb = $('#seed'); if (sb) sb.onclick = () => seed(sb);
}

// ----- 엑셀 불러오기 -----
let parsedSheets = [];
async function onExcel(e) {
  const f = e.target.files[0]; if (!f) return;
  const box = $('#sheets'); box.innerHTML = '<p class="prog">엑셀을 읽는 중이에요…</p>';
  try {
    const wb = await readWorkbook(await f.arrayBuffer());
    parsedSheets = wb.filter(s => /정산\s*내역/.test(String(s.cells.B2 || '')))
      .map(s => ({ sheet: s.name, m: parseSettlementSheet(s) })).filter(x => x.m.month);
    if (!parsedSheets.length) { box.innerHTML = '<p class="warn">정산 시트를 찾지 못했어요. B2 칸에 "2026년 10월 내장산 정산 내역"처럼 제목이 있어야 해요.</p>'; return; }
    const maxYear = Math.max(...parsedSheets.map(x => x.m.year));
    box.innerHTML = `<ul class="sheetlist">${parsedSheets.map((x, i) => {
      const id = idOf(x.m.year, x.m.month), exists = months.some(m => m.id === id);
      const t = totals(x.m);
      return `<li><label><input type="checkbox" data-i="${i}" ${x.m.year === maxYear && !exists ? 'checked' : ''}>
        <span>${x.m.year}년 ${x.m.month}월 ${esc(x.m.mountain)} <span class="meta">시트 '${esc(x.sheet)}' · 수입 ${won(t.tin)} · 지출 ${won(t.tout)} · 정산 후 ${won(t.end)} · ${exists ? '<b>이미 있음 → 덮어쓰기</b>' : '새로 추가'}</span></span></label></li>`;
    }).join('')}</ul>
    <p class="help">사진과 영수증 설명은 그대로 두고, 정산 표만 바뀌어요.</p>
    <div><button type="button" class="btn primary" id="importBtn">선택한 달 저장하기</button></div>`;
    $('#importBtn').onclick = doImport;
  } catch (err) { box.innerHTML = `<p class="warn">엑셀을 읽지 못했어요: ${esc(err.message || err)}</p>`; }
}
async function doImport() {
  const picks = [...document.querySelectorAll('#sheets input[type=checkbox]:checked')].map(c => parsedSheets[+c.dataset.i]);
  if (!picks.length) { toast('불러올 달을 하나 이상 골라 주세요.'); return; }
  const btn = $('#importBtn'); btn.disabled = true;
  try {
    for (const { m } of picks) {
      const id = idOf(m.year, m.month), old = months.find(x => x.id === id);
      await store.saveMonth(id, { year: m.year, month: m.month, mountain: m.mountain, date: m.date, start: m.start ?? 0, items: m.items, receiptNote: old?.receiptNote || '' });
    }
    await loadMonths(); toast(`${picks.length}개 달을 저장했어요.`); renderAdmin(null);
  } catch (e) { btn.disabled = false; toast('저장하지 못했어요: ' + (e.message || e)); }
}

// ----- 처음 자료 넣기 (1회) -----
async function seed(btn) {
  btn.disabled = true; btn.textContent = '넣는 중…';
  try {
    const d = await (await fetch('seed/data.json')).json();
    for (const m of d.months) {
      const items = [];
      for (const it of m.items) {
        if (typeof it.in === 'number') items.push({ type: 'in', name: it.name, amount: it.in, note: it.note || '' });
        if (typeof it.out === 'number') items.push({ type: 'out', name: it.name, amount: it.out, note: it.note || '' });
        if (it.gift) items.push({ type: 'gift', name: it.name, gift: it.gift, note: it.note || '' });
      }
      const id = idOf(d.year, m.month);
      await store.saveMonth(id, { year: d.year, month: m.month, mountain: m.mountain, date: m.date, start: m.start, items, receiptNote: m.receiptNote || '' });
      let order = 0;
      for (const r of m.receipts || []) {
        const blob = await (await fetch('seed/' + r.src)).blob();
        const c = await compressImage(blob);
        await store.addPhoto({ monthId: id, data: c.data, caption: r.caption || '', order: order++ });
      }
    }
    await loadMonths(); toast('1~10월 자료를 넣었어요.'); renderAdmin(null);
  } catch (e) { btn.disabled = false; btn.textContent = '처음 자료(2026년 1~10월) 넣기'; toast('넣지 못했어요: ' + (e.message || e)); }
}

// ----- 한 달 편집 -----
async function renderEditor(editId) {
  if (!draft || draftOrigId !== editId) {
    if (editId === 'new') {
      const last = months[months.length - 1];
      let y = last ? last.year : new Date().getFullYear(), mo = last ? last.month + 1 : new Date().getMonth() + 1;
      if (mo > 12) { mo = 1; y++; }
      draft = { year: y, month: mo, mountain: '', date: '', start: last ? totals(last).end : 0, receiptNote: '',
        items: [{ type: 'in', name: '산행회비', amount: '', note: '' }, { type: 'out', name: '차량비', amount: '', note: '' }, { type: 'out', name: '주류+물+얼음', amount: '', note: '' }, { type: 'out', name: '하산식', amount: '', note: '' }, { type: 'out', name: '임원회의 지원', amount: '', note: '' }] };
    } else {
      const m = months.find(x => x.id === editId);
      if (!m) { app.innerHTML = '<p class="empty">그 달을 찾지 못했어요. <a href="#admin">목록으로</a></p>'; return; }
      draft = JSON.parse(JSON.stringify({ year: m.year, month: m.month, mountain: m.mountain, date: m.date, start: m.start, receiptNote: m.receiptNote || '', items: m.items || [] }));
    }
    draftOrigId = editId; dirty = false;
  }
  const saved = editId !== 'new';
  app.innerHTML = `<div class="view">${adminBar()}
    <p><a href="#admin" id="back">← 월 목록</a></p>
    <section class="panel"><h2>${saved ? `${draft.year}년 ${draft.month}월 편집` : '새 달 입력'}</h2>
      <div class="fields">
        <label class="f">연도<input id="fYear" type="number" inputmode="numeric" value="${draft.year}"></label>
        <label class="f">월<input id="fMonth" type="number" inputmode="numeric" min="1" max="12" value="${draft.month}"></label>
        <label class="f">산 이름<input id="fMt" type="text" value="${esc(draft.mountain)}" placeholder="예: 내장산"></label>
        <label class="f">정산일<input id="fDate" type="text" value="${esc(draft.date)}" placeholder="예: 2026.10.13"></label>
      </div>
      <label class="f">전월 이월 (원)<input id="fStart" class="num" type="text" inputmode="numeric" value="${toNum(draft.start).toLocaleString('ko-KR')}"></label>
      <div id="startWarn"></div>
      ${group('in', '수입')}${group('out', '지출')}${group('gift', '현물 찬조')}
      <div class="totals" id="totals"></div>
      <label class="f">영수증 설명 (선택 — 사진 아래에 보여요)<textarea id="fNote" placeholder="예: 하산식 979,000원 = 식당 952,000원 + 치킨 27,000원">${esc(draft.receiptNote)}</textarea></label>
      <div class="row-actions"><button type="button" class="btn primary" id="saveBtn">저장하기</button>
        ${saved ? '<button type="button" class="btn danger" id="delBtn">이 달 삭제</button>' : ''}</div>
    </section>
    <section class="panel"><h2>영수증 · 증빙 사진</h2>
      ${saved ? `<div class="drop" id="drop"><span>사진을 여러 장 한꺼번에 골라도 돼요. 크기는 자동으로 줄여서 저장해요.</span>
          <label class="btn primary" for="pfile">사진 고르기</label><input type="file" id="pfile" accept="image/*" multiple hidden>
          <span class="prog" id="prog"></span></div>
        <div class="pgrid" id="pgrid"><p class="help">불러오는 중…</p></div>`
      : '<p class="help">먼저 위 내용을 저장하면 사진을 올릴 수 있어요.</p>'}
    </section></div>`;
  bindBar();
  bindEditor(editId);
  if (saved) renderPhotos(editId);
}

function group(type, title) {
  const rows = draft.items.map((it, i) => ({ it, i })).filter(x => x.it.type === type);
  return `<div class="igroup ${type}"><h3><span>${title}</span><span class="num" data-sum="${type}"></span></h3>
    ${rows.map(({ it, i }) => `<div class="irow" data-i="${i}">
      <input aria-label="${title} 항목" data-k="name" value="${esc(it.name)}" placeholder="항목">
      ${type === 'gift' ? `<input aria-label="찬조 내용" data-k="gift" value="${esc(it.gift || '')}" placeholder="예: 아이스크림">`
        : `<input aria-label="${title} 금액" class="amt" data-k="amount" inputmode="numeric" value="${it.amount === '' || it.amount == null ? '' : toNum(it.amount).toLocaleString('ko-KR')}" placeholder="0">`}
      <input aria-label="비고" class="note" data-k="note" value="${esc(it.note || '')}" placeholder="비고 (선택)">
      <span class="ctl"><button type="button" data-act="up" aria-label="위로">↑</button><button type="button" data-act="down" aria-label="아래로">↓</button><button type="button" data-act="del" aria-label="줄 삭제">삭제</button></span>
    </div>`).join('')}
    <div class="add"><button type="button" class="btn small" data-add="${type}">+ ${title} 줄 추가</button></div></div>`;
}

function readHead() {
  draft.year = toNum($('#fYear').value) || draft.year;
  draft.month = Math.min(12, Math.max(1, toNum($('#fMonth').value) || draft.month));
  draft.mountain = $('#fMt').value.trim();
  draft.date = $('#fDate').value.trim();
  draft.start = toNum($('#fStart').value);
  draft.receiptNote = $('#fNote').value.trim();
}

function updateTotals() {
  const t = totals(draft);
  $('#totals').innerHTML = `<div>전월 이월<b>${won(t.start)}</b></div><div>수입 합계<b>${won(t.tin)}</b></div><div>지출 합계<b>${won(t.tout)}</b></div><div>정산 후 잔액<b>${won(t.end)}</b></div>`;
  app.querySelector('[data-sum="in"]').textContent = won(t.tin);
  app.querySelector('[data-sum="out"]').textContent = won(t.tout);
  const id = idOf(draft.year, draft.month), prev = prevOf(months.filter(m => m.id !== draftOrigId), id);
  const w = $('#startWarn');
  if (prev && totals(prev).end !== t.start) {
    w.innerHTML = `<div class="warn"><span>지난달(${prev.month}월 ${esc(prev.mountain)}) 정산 후 잔액은 ${won(totals(prev).end)}이에요. 전월 이월과 달라요.</span><button type="button" class="btn small" id="fillStart">지난달 잔액으로 채우기</button></div>`;
    $('#fillStart').onclick = () => { $('#fStart').value = totals(prev).end.toLocaleString('ko-KR'); readHead(); dirty = true; updateTotals(); };
  } else w.innerHTML = '';
}

function bindEditor(editId) {
  const panel = app.querySelector('.panel');
  panel.addEventListener('input', e => {
    const row = e.target.closest('.irow');
    if (row) { const it = draft.items[+row.dataset.i]; const k = e.target.dataset.k; it[k] = k === 'amount' ? (e.target.value.trim() === '' ? '' : toNum(e.target.value)) : e.target.value; }
    else readHead();
    dirty = true; updateTotals();
  });
  panel.addEventListener('blur', e => {
    if (e.target.matches('input.amt, #fStart') && e.target.value.trim() !== '') e.target.value = toNum(e.target.value).toLocaleString('ko-KR');
  }, true);
  panel.addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add) { readHead(); draft.items.push({ type: add.dataset.add, name: '', amount: '', gift: '', note: '' }); dirty = true; renderEditor(editId).then(() => { const r = app.querySelectorAll(`.igroup.${add.dataset.add} .irow`); r[r.length - 1]?.querySelector('input').focus(); }); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    readHead();
    const i = +b.closest('.irow').dataset.i, it = draft.items[i];
    const same = draft.items.map((x, j) => j).filter(j => draft.items[j].type === it.type), pos = same.indexOf(i);
    if (b.dataset.act === 'del') draft.items.splice(i, 1);
    else { const j = same[pos + (b.dataset.act === 'up' ? -1 : 1)]; if (j == null) return; [draft.items[i], draft.items[j]] = [draft.items[j], draft.items[i]]; }
    dirty = true; renderEditor(editId);
  });
  $('#saveBtn').onclick = () => saveDraft(editId);
  const del = $('#delBtn'); if (del) del.onclick = () => deleteMonth(editId);
  $('#back').onclick = e => { if (dirty && !confirm('저장하지 않은 내용이 있어요. 그래도 나갈까요?')) e.preventDefault(); else draft = null; };
  updateTotals();
}

async function saveDraft(editId) {
  readHead();
  if (!draft.mountain) { toast('산 이름을 적어 주세요.'); $('#fMt').focus(); return; }
  const id = idOf(draft.year, draft.month);
  if (id !== editId && months.some(m => m.id === id)) { toast(`${draft.year}년 ${draft.month}월은 이미 있어요. 그 달을 편집해 주세요.`); return; }
  const items = draft.items.filter(it => (it.name || '').trim() || toNum(it.amount) || (it.gift || '').trim())
    .map(it => it.type === 'gift' ? { type: 'gift', name: (it.name || '').trim(), gift: (it.gift || '').trim(), note: (it.note || '').trim() }
      : { type: it.type, name: (it.name || '').trim(), amount: toNum(it.amount), note: (it.note || '').trim() });
  const btn = $('#saveBtn'); btn.disabled = true; btn.textContent = '저장 중…';
  try {
    await store.saveMonth(id, { year: draft.year, month: draft.month, mountain: draft.mountain, date: draft.date, start: draft.start, items, receiptNote: draft.receiptNote });
    if (editId !== 'new' && id !== editId) { // 연도·월을 바꾼 경우: 사진도 옮기기
      for (const p of await photosOf(editId, true)) await store.updatePhoto(p.id, { monthId: id });
      await store.deleteMonth(editId); photoCache.delete(editId);
    }
    await loadMonths(); dirty = false; draft = null; toast('저장했어요.');
    if (location.hash === '#admin/' + id) renderEditor(id); else location.hash = 'admin/' + id;
  } catch (e) { btn.disabled = false; btn.textContent = '저장하기'; toast('저장하지 못했어요: ' + (e.message || e)); }
}

async function deleteMonth(id) {
  const ps = await photosOf(id, true);
  if (!confirm(`${draft.year}년 ${draft.month}월 정산${ps.length ? `과 사진 ${ps.length}장` : ''}을 지울까요? 되돌릴 수 없어요.`)) return;
  try {
    for (const p of ps) await store.deletePhoto(p.id);
    await store.deleteMonth(id); photoCache.delete(id); await loadMonths(); draft = null; dirty = false;
    toast('지웠어요.'); location.hash = 'admin';
  } catch (e) { toast('지우지 못했어요: ' + (e.message || e)); }
}

// ----- 사진 -----
async function renderPhotos(monthId) {
  const grid = $('#pgrid'); if (!grid) return;
  const ps = await photosOf(monthId, true);
  grid.innerHTML = ps.length ? ps.map((p, i) => `<div class="pitem" data-id="${p.id}">
      <img src="${p.data}" alt="${esc(p.caption || '증빙 사진')}">
      <input aria-label="사진 설명" value="${esc(p.caption || '')}" placeholder="설명 (예: 하산식 952,000원)">
      <div class="ctl"><span><button type="button" data-mv="-1" aria-label="앞으로" ${i === 0 ? 'disabled' : ''}>◀</button><button type="button" data-mv="1" aria-label="뒤로" ${i === ps.length - 1 ? 'disabled' : ''}>▶</button></span><button type="button" class="del" data-del>삭제</button></div>
    </div>`).join('') : '<p class="help">아직 올린 사진이 없어요.</p>';
  grid.querySelectorAll('.pitem').forEach(el => {
    const id = el.dataset.id;
    const inp = el.querySelector('input');
    inp.addEventListener('change', async () => { try { await store.updatePhoto(id, { caption: inp.value.trim() }); const p = ps.find(x => x.id === id); if (p) p.caption = inp.value.trim(); toast('설명을 저장했어요.', 1500); } catch (e) { toast('저장하지 못했어요: ' + (e.message || e)); } });
    el.querySelector('[data-del]').onclick = async () => {
      if (!confirm('이 사진을 지울까요?')) return;
      try { await store.deletePhoto(id); renderPhotos(monthId); } catch (e) { toast('지우지 못했어요: ' + (e.message || e)); }
    };
    el.querySelectorAll('[data-mv]').forEach(b => b.onclick = async () => {
      const i = ps.findIndex(x => x.id === id), j = i + +b.dataset.mv; if (j < 0 || j >= ps.length) return;
      [ps[i], ps[j]] = [ps[j], ps[i]];
      try { await Promise.all(ps.map((p, k) => p.order === k ? null : store.updatePhoto(p.id, { order: k }))); renderPhotos(monthId); } catch (e) { toast('순서를 바꾸지 못했어요: ' + (e.message || e)); }
    });
  });
  const pf = $('#pfile'), drop = $('#drop');
  pf.onchange = () => { uploadFiles(monthId, [...pf.files]); pf.value = ''; };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); uploadFiles(monthId, [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'))); };
}

async function uploadFiles(monthId, files) {
  if (!files.length) return;
  const prog = $('#prog'); let ok = 0, fail = [];
  const existing = await photosOf(monthId, true);
  let order = existing.reduce((a, p) => Math.max(a, (p.order ?? 0) + 1), 0);
  for (let i = 0; i < files.length; i++) {
    prog.textContent = `${files.length}장 중 ${i + 1}번째 올리는 중…`;
    try {
      const c = await compressImage(files[i]);
      await store.addPhoto({ monthId, data: c.data, caption: '', order: order++ });
      ok++;
    } catch (e) { fail.push(`${files[i].name}: ${e.message || e}`); }
  }
  prog.textContent = `${ok}장 올렸어요.` + (fail.length ? ` ${fail.length}장은 실패했어요 — ${fail.join(' / ')}` : ' 사진 아래 칸에 설명을 적어 두면 회원분들이 보기 편해요.');
  renderPhotos(monthId);
}

// =====================================================================
// 시작
// =====================================================================
async function start() {
  try {
    if (MOCK) store = await (await import('./store-mock.js')).createStore();
    else if (firebaseConfig) store = await (await import('./store-firebase.js')).createStore(firebaseConfig);
    else { app.innerHTML = '<div class="panel"><h2>아직 설정 전이에요</h2><p class="help">firebase-config.js 에 Firebase 설정값을 넣어 주세요. (docs/안내서.md 참고)</p></div>'; return; }
    await loadMonths();
  } catch (e) {
    app.innerHTML = `<p class="warn">정산 내역을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요. (${esc(e.message || e)})</p>`; return;
  }
  let first = true;
  store.onUser(async u => {
    const was = isAdmin(); user = u;
    if (first) { first = false; route(); return; }
    if (location.hash.startsWith('#admin') && was !== isAdmin()) { draft = null; route(); }
  });
}
start();
