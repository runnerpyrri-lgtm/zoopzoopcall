// 서비스워커 캐시 쓰기 실패가 정상 네트워크 응답을 가리지 않는지 실행 환경으로 검증한다.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../apps/web/public/sw.js", import.meta.url), "utf8");

test("신규 패밀리 계약을 포함한 공개 자산을 오프라인 셸에 둔다", () => {
  for (const asset of [
    "./robom-family/feature-flags.json",
    "./robom-family/auth-config.json",
  ]) {
    assert.match(source, new RegExp(asset.replaceAll(".", "\\.")));
  }
});

test("cache.put 실패에도 유효한 network response를 반환한다", async () => {
  const listeners = new Map();
  let putCalls = 0;
  let matchCalls = 0;
  const networkResponse = new Response("network-ok", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
  const cache = {
    add: async () => undefined,
    put: async () => {
      putCalls += 1;
      throw new Error("quota exceeded");
    },
    match: async () => {
      matchCalls += 1;
      return undefined;
    },
  };
  const self = {
    location: { origin: "https://robom-labs.github.io" },
    registration: { scope: "https://robom-labs.github.io/homebom/" },
    clients: {
      claim: async () => undefined,
      matchAll: async () => [],
      openWindow: async () => undefined,
    },
    skipWaiting: async () => undefined,
    addEventListener: (type, listener) => listeners.set(type, listener),
  };

  vm.runInNewContext(source, {
    URL,
    Promise,
    console,
    self,
    caches: {
      open: async () => cache,
      keys: async () => [],
      delete: async () => true,
    },
    fetch: async () => networkResponse,
  });

  const handler = listeners.get("fetch");
  assert.equal(typeof handler, "function");
  let responsePromise;
  handler({
    request: new Request("https://robom-labs.github.io/homebom/assets/app.js"),
    respondWith: (value) => { responsePromise = Promise.resolve(value); },
  });

  assert.ok(responsePromise);
  const response = await responsePromise;
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "network-ok");
  assert.equal(putCalls, 1);
  assert.equal(matchCalls, 0);
});
