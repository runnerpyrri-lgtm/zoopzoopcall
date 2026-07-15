// 청약봄 서비스워커가 같은 오리진의 다른 로봄 앱 캐시를 삭제하지 않는지 정적으로 검증한다.
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../apps/web/public/sw.js", import.meta.url), "utf8");

if (!/const CACHE_PREFIX = ["']zzc-["']/.test(source)) {
  throw new Error("청약봄 전용 CACHE_PREFIX가 없습니다.");
}
if (!/k\.startsWith\(CACHE_PREFIX\)\s*&&\s*k\s*!==\s*CACHE/.test(source)) {
  throw new Error("activate 단계가 청약봄 캐시 범위만 삭제하지 않습니다.");
}
if (/keys\.filter\(\(k\)\s*=>\s*k\s*!==\s*CACHE\)/.test(source)) {
  throw new Error("다른 앱 캐시까지 삭제하는 기존 로직이 남아 있습니다.");
}

console.log("서비스워커 캐시 범위 검증 통과");
