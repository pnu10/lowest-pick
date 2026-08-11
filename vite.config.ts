import { defineConfig } from "vite";

// 최저가픽은 자체 완결형 index.html(인라인 CSS/JS) 한 파일로 동작해요.
// 같은 index.html이 GitHub Pages에서도 그대로 서빙되므로 프레임워크 플러그인을 두지 않습니다.
export default defineConfig({});
