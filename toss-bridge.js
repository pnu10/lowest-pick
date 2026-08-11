// 앱인토스 SDK 브리지
//
// index.html의 메인 스크립트는 인라인 onclick 핸들러를 쓰기 때문에 클래식 <script>여야 한다
// (type="module"로 바꾸면 함수가 전역에 노출되지 않아 onclick이 전부 깨진다).
// 그래서 SDK import는 이 모듈 파일로 분리하고, 결과만 window에 실어 전달한다.
//
// - 토스 앱(앱인토스): Vite 번들에 SDK가 포함돼 openURL이 window에 붙는다
// - 일반 브라우저(GitHub Pages): 이 파일이 번들되지 않은 원본이라 import가 실패하고,
//   catch로 삼켜져서 index.html이 window.open 폴백을 쓴다
import("@apps-in-toss/web-framework")
  .then((m) => {
    if (typeof m.openURL === "function") window.__tossOpenURL = m.openURL;
  })
  .catch(() => {
    /* 토스 밖에서는 SDK가 없다 — index.html이 window.open으로 폴백 */
  });
