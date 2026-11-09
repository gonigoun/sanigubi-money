// 사진을 저장하기 좋은 크기(JPG, 긴 변 1600px 이하, 약 600KB 이하)로 줄입니다.
const MAX_SIDE = 1600;
const MAX_CHARS = 650_000; // Firestore 문서 한 개 한도(1MB) 안에 넉넉히 들어가도록

export async function compressImage(blob) {
  let bmp;
  try { bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
  catch {
    bmp = await new Promise((res, rej) => {
      const url = URL.createObjectURL(blob); const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('이 사진 형식은 읽을 수 없어요. JPG나 PNG로 올려 주세요. (아이폰 HEIC 사진은 휴대폰에서 바로 올리면 돼요)')); };
      img.src = url;
    });
  }
  let side = MAX_SIDE, q = 0.82, out = '';
  for (let tries = 0; tries < 8; tries++) {
    const w0 = bmp.width, h0 = bmp.height, k = Math.min(1, side / Math.max(w0, h0));
    const w = Math.round(w0 * k), h = Math.round(h0 * k);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(bmp, 0, 0, w, h);
    out = cv.toDataURL('image/jpeg', q);
    if (out.length <= MAX_CHARS) return { data: out, w, h };
    if (q > 0.62) q -= 0.1; else side = Math.round(side * 0.8);
  }
  return { data: out, w: 0, h: 0 };
}
