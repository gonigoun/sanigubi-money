# 청라 산이구비 재정 공개

산악회 월별 산행 정산과 영수증·증빙 사진을 링크 하나로 보여 주는 사이트예요.

- 회원: 로그인 없이 보기만
- 재정총무: Google 로그인 → 정산 입력, 엑셀 불러오기, 영수증 사진 여러 장 올리기
- 호스팅: GitHub Pages(main / root), 저장: Firebase Firestore (무료 요금제)

자세한 사용법과 처음 설정은 [docs/안내서.md](docs/안내서.md)를 보세요.

## 파일
- `index.html`, `css/style.css` — 화면
- `js/app.js` — 공개 화면 + 관리 화면
- `js/store-firebase.js` / `js/store-mock.js` — 실제 저장소 / 시험 모드(`?mock`)
- `js/xlsx-lite.js` — 정산 엑셀 읽기 (외부 라이브러리 없음)
- `js/image.js` — 사진 자동 축소(JPG, 약 600KB 이하)
- `firebase-config.js` — Firebase 설정값, 관리자 계정
- `firestore.rules` — 보안 규칙(누구나 읽기, 관리자만 쓰기)
- `seed/` — 처음 넣을 2026년 1~10월 자료와 10월 영수증
- `tests/e2e.py` — 시험 모드 자동 검사
