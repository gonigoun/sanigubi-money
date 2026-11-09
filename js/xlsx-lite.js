// 아주 작은 엑셀(.xlsx) 읽기 도구 — 외부 라이브러리 없이 브라우저 기본 기능(압축 풀기)만 사용합니다.
// 셀의 "보이는 값"(수식이면 엑셀이 저장해 둔 계산 결과)을 읽습니다.

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// zip 파일 안의 파일 목록을 읽어 { 이름: 내용(문자열) } 을 돌려줍니다.
async function unzip(buf, wanted) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('엑셀 파일(.xlsx)이 아니에요.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder('utf-8');
  const out = {};
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!wanted(name)) continue;
    const lnlen = dv.getUint16(local + 26, true), lxlen = dv.getUint16(local + 28, true);
    const start = local + 30 + lnlen + lxlen;
    const data = u8.subarray(start, start + csize);
    const raw = method === 0 ? data : await inflateRaw(data);
    out[name] = dec.decode(raw);
  }
  return out;
}

const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');
const textOf = xml => { let t = ''; xml.replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, (_, s) => { t += s; }); return unxml(t).replace(/\r\n?/g, '\n'); };

// 결과: [{ name: '9월N', cells: { 'B2': '...', 'C6': 2460000, ... } }, ...] (엑셀 탭 순서)
export async function readWorkbook(arrayBuffer) {
  const files = await unzip(arrayBuffer, n => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' ||
    n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const shared = [];
  (files['xl/sharedStrings.xml'] || '').replace(/<si>([\s\S]*?)<\/si>/g, (_, si) => { shared.push(textOf(si.replace(/<rPh[\s\S]*?<\/rPh>/g, ''))); });
  const rels = {};
  (files['xl/_rels/workbook.xml.rels'] || '').replace(/<Relationship\b([^>]*)\/?>/g, (_, a) => {
    const id = (a.match(/\bId="([^"]+)"/) || [])[1], t = (a.match(/\bTarget="([^"]+)"/) || [])[1];
    if (id && t) rels[id] = 'xl/' + t.replace(/^\/?xl\//, '').replace(/^\//, '');
  });
  const sheets = [];
  (files['xl/workbook.xml'] || '').replace(/<sheet\b([^>]*)\/?>/g, (_, a) => {
    const name = unxml((a.match(/\bname="([^"]*)"/) || [])[1] || '');
    const rid = (a.match(/\br:id="([^"]+)"/) || [])[1];
    const xml = files[rels[rid]];
    if (!xml) return;
    const cells = {};
    xml.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (_, attrs, inner) => {
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
      if (!ref || !inner) return;
      const t = (attrs.match(/\bt="([^"]+)"/) || [])[1];
      const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val;
      if (t === 's') val = v != null ? shared[+v] : undefined;
      else if (t === 'inlineStr') val = textOf(inner);
      else if (t === 'str') val = v != null ? unxml(v) : undefined;
      else if (t === 'b') val = v === '1';
      else if (t === 'e') val = undefined;
      else val = v != null && v !== '' ? Number(v) : undefined;
      if (val !== undefined && val !== '') cells[ref] = val;
    });
    sheets.push({ name, cells });
  });
  return sheets;
}

// 산이구비 정산 시트 모양(B: 항목, C: 수입, D: 지출, E5: 이월, F: 비고, '구분' 줄 전까지)을 한 달 자료로 바꿉니다.
export function parseSettlementSheet(sheet) {
  const c = sheet.cells;
  const title = String(c.B2 || '').trim();
  const tm = title.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(.*?)\s*정산/);
  let year = tm ? +tm[1] : null, month = tm ? +tm[2] : null;
  const mountain = tm ? tm[3].trim() : '';
  if (!month) { const nm = sheet.name.match(/(\d{1,2})\s*월/); if (nm) month = +nm[1]; }
  let date = c.F3;
  if (typeof date === 'number') { const d = new Date(Math.round((date - 25569) * 86400000)); date = `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}`; }
  date = String(date || '').trim().replace(/\.$/, '');
  const items = [];
  let r = 6;
  for (; r < 80; r++) {
    const b = c['B' + r];
    if (typeof b === 'string' && b.trim() === '구분') break;
    const inn = c['C' + r], out = c['D' + r], note = c['F' + r];
    if (b == null && inn == null && out == null) continue;
    const name = b == null ? '' : String(b).trim();
    const noteS = note == null ? '' : String(note).trim();
    if (typeof inn === 'number' && inn !== 0) items.push({ type: 'in', name, amount: inn, note: noteS });
    if (typeof out === 'number' && out !== 0) items.push({ type: 'out', name, amount: out, note: noteS });
    if (typeof inn === 'string' && inn.trim()) items.push({ type: 'gift', name, gift: inn.trim(), note: noteS });
    if (inn == null && out == null && name) items.push({ type: 'gift', name, gift: /찬조/.test(name) ? '현물' : '', note: noteS });
  }
  const start = typeof c.E5 === 'number' ? c.E5 : null;
  if (!year) { const ym = date.match(/^(\d{4})/); year = ym ? +ym[1] : new Date().getFullYear(); }
  return { year, month, mountain, date, start, items };
}
