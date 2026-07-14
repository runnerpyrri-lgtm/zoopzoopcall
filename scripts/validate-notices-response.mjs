// 운영 공고 API의 공개 계약과 활성 공고 필터를 CI에서 검증한다.
const url = process.env.VITE_NOTICES_URL || process.argv[2];
if (!url) throw new Error("VITE_NOTICES_URL이 필요합니다.");

const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
if (!response.ok) throw new Error(`공개 API HTTP ${response.status}`);
const data = await response.json();
if (!Array.isArray(data)) throw new Error("공개 API 응답이 배열이 아닙니다.");

const now = Date.now();
const rejected = data.filter((notice) => (
  !notice || typeof notice !== "object"
  || typeof notice.id !== "string" || !notice.id
  || typeof notice.houseName !== "string" || !notice.houseName
  || !Number.isFinite(Date.parse(notice.receiptStart))
  || !Number.isFinite(Date.parse(notice.receiptEnd))
  || notice.cancelled === true
  || Date.parse(notice.receiptEnd) < now
));
if (rejected.length > 0) throw new Error(`공개 API 계약 또는 활성 필터 위반 ${rejected.length}건`);
console.log(JSON.stringify({ status: "ok", notices: data.length, verifiedAt: response.headers.get("x-verified-at"), stale: response.headers.get("x-data-stale") === "1" }));
