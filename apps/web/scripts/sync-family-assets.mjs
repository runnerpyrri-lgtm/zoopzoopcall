// lock으로 검증한 패밀리 런타임 자산을 Vite 배포 폴더에 복제하거나 일치 여부를 확인한다.
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(webRoot, "../..");
const sourceDir = resolve(webRoot, "src/generated/robom-family");
const targetDir = resolve(webRoot, "dist/robom-family");
const lock = JSON.parse(await readFile(resolve(repoRoot, "family.lock.json"), "utf8"));
const checkOnly = process.argv.includes("--check");
const deployedAssets = [
  "app-meta.json",
  "settings-contract.json",
  "feature-flags.json",
  "auth-config.json",
  "wordmark.svg",
  "icons.svg",
];

function sha256(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

if (!checkOnly) await mkdir(targetDir, { recursive: true });

for (const name of deployedAssets) {
  const expected = lock.files?.[name];
  if (!expected) throw new Error(`family.lock.json에 배포 자산이 없습니다: ${name}`);

  const sourcePath = resolve(sourceDir, name);
  const source = await readFile(sourcePath);
  if (sha256(source) !== expected) throw new Error(`패밀리 원본 hash 불일치: ${name}`);

  const targetPath = resolve(targetDir, name);
  if (!checkOnly) await copyFile(sourcePath, targetPath);
  const target = await readFile(targetPath);
  if (!source.equals(target)) throw new Error(`패밀리 배포 자산 불일치: ${name}`);
}

console.log(`패밀리 배포 자산 ${deployedAssets.length}개 ${checkOnly ? "검증" : "동기화"} 완료`);
