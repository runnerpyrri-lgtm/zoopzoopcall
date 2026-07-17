// 청약봄 첫 화면이 외부 CDN 없이 패밀리 로컬 자산만 사용하는지 검증한다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const html = readFileSync(resolve("apps/web/index.html"), "utf8");
const styles = readFileSync(resolve("apps/web/src/styles.css"), "utf8");
const forbidden = /cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com/;

if (forbidden.test(`${html}\n${styles}`)) {
  throw new Error("첫 화면에 외부 CDN 글꼴 또는 설치 자산 의존이 남아 있습니다.");
}

if (!styles.includes("--font: var(--family-font);")) {
  throw new Error("청약봄 글꼴이 중앙 패밀리 토큰과 연결되지 않았습니다.");
}

if (!html.includes('name="robom-build-sha"') || !html.includes('content="%VITE_BUILD_SHA%"')) {
  throw new Error("운영 관제가 읽을 빌드 SHA 메타 태그가 없습니다.");
}

console.log("웹 셸 검증 통과: 외부 CDN 0, 패밀리 글꼴 토큰 연결, 빌드 SHA 노출");
