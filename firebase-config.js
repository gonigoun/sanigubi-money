// Firebase 설정값 — docs/안내서.md 3단계에서 Firebase 콘솔이 보여 주는 값을 그대로 붙여 넣으세요.
// (이 값은 공개되어도 괜찮아요. 실제 보안은 firestore.rules 가 지킵니다.)
export const firebaseConfig = {
  apiKey: "AIzaSyBmbEnPAxRTBbLvICJg607hqvzCWprBScM",
  authDomain: "sanigubi-money.firebaseapp.com",
  projectId: "sanigubi-money",
  storageBucket: "sanigubi-money.firebasestorage.app",
  messagingSenderId: "714199654182",
  appId: "1:714199654182:web:64bb0b00d4f53b7903abe7"
};
// 예시)
// export const firebaseConfig = {
//   apiKey: "...",
//   authDomain: "sanigubi-money.firebaseapp.com",
//   projectId: "sanigubi-money",
//   appId: "..."
// };

// 관리 화면을 쓸 수 있는 Google 계정 — firestore.rules 의 목록과 꼭 같게 맞춰 주세요.
export const ADMIN_EMAILS = ['gonigoun@gmail.com'];
