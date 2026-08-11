import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  // ⚠️ 앱인토스 콘솔에 등록한 앱 식별자와 같아야 배포(ait deploy)가 됩니다.
  //    콘솔 앱 이름·아이콘은 SDK 3.x부터 설정 파일이 아니라 콘솔에서 관리해요.
  appName: "lowest-pick",

  brand: {
    primaryColor: "#FF4D2E",
  },

  // 이 앱은 카메라·위치·연락처 등 기기 권한을 쓰지 않아요.
  permissions: [],

  webBundleDir: "dist",
});
