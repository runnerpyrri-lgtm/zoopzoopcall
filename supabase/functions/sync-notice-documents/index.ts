// 공식 청약 공고 HTML·PDF를 동기화해 검증 가능한 필드만 서버 전용 캐시에 저장한다.

import { getDocument } from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";

type PublicNotice = {
  id: string;
  noticeUrl?: string;
  officialHomepageUrl?: string;
  receiptStart: string;
  receiptEnd: string;
};

type Link = { url: string; label: string };
type DocumentState = {
  notice_key: string;
  status: "verified" | "single-official-source" | "conflict" | "not-provided" | "retrying";
  fetched_at: string;
  retry_after?: string | null;
};

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const MAX_NOTICES_PER_RUN = 1;
const VERIFIED_DOCUMENT_TTL_MS = 24 * 60 * 60 * 1000;

function credentials() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) throw new Error("Supabase 서비스 자격 증명이 없습니다.");
  return { url, serviceRole };
}

async function authorized(req: Request): Promise<boolean> {
  const provided = req.headers.get("x-sync-token");
  if (!provided) return false;
  const { url, serviceRole } = credentials();
  const res = await fetch(`${url}/rest/v1/notice_sync_auth?singleton=eq.true&select=token_hash&limit=1`, {
    headers: { apikey: serviceRole, authorization: `Bearer ${serviceRole}` },
  });
  if (!res.ok) return false;
  const rows = await res.json() as Array<{ token_hash?: string }>;
  const expected = rows[0]?.token_hash;
  if (!expected) return false;
  const actual = await sha256(new TextEncoder().encode(provided));
  return actual === expected;
}

function allowedInitialUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const hostname = url.hostname.toLowerCase();
    const officialHost = hostname === "applyhome.co.kr"
      || hostname.endsWith(".applyhome.co.kr")
      || hostname.endsWith(".go.kr")
      || hostname.endsWith(".or.kr");
    if (!officialHost || /(?:blog|cafe|news|naver|daum|tistory)/i.test(hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlText(html: string): string {
  return decodeEntities(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/tr>|<\/div>|<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function discoverLinks(html: string, base: URL): Link[] {
  const links: Link[] = [];
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const url = new URL(decodeEntities(match[1]), base);
      const label = htmlText(match[2]);
      const looksLikeDocument = /\.pdf(?:$|\?)/i.test(url.href) || /모집공고|공고문|정정공고|첨부/i.test(label);
      const sameOrigin = url.origin === base.origin;
      const officialHost = /(?:\.go\.kr|\.or\.kr|applyhome\.co\.kr)$/i.test(url.hostname);
      if (looksLikeDocument && (sameOrigin || officialHost) && ["http:", "https:"].includes(url.protocol)) {
        links.push({ url: url.href, label });
      }
    } catch {
      // 깨진 첨부 링크는 후보에서 제외한다.
    }
  }
  return [...new Map(links.map((item) => [item.url, item])).values()];
}

async function sha256(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function pdfText(data: Uint8Array): Promise<string> {
  const document = await getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
  const pages: string[] = [];
  for (let pageNo = 1; pageNo <= document.numPages; pageNo += 1) {
    const page = await document.getPage(pageNo);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: { str?: string }) => item.str ?? "").join(" "));
  }
  return pages.join("\n").replace(/[ \t]+/g, " ").trim();
}

function firstLabeledValue(source: string, labels: string[], maxLength = 240): string | undefined {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = source.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*[:：]?\\s*([^\\n]{1,${maxLength}})`, "iu"));
    const value = match?.[1]?.replace(/\s{2,}/g, " ").trim();
    if (value && value !== "-" && !/확인|참조$/u.test(value)) return value;
  }
  return undefined;
}

function parsePaymentSchedule(source: string) {
  const rows: Array<{ label: string; ratio?: string; amountManwon?: number; timing?: string }> = [];
  for (const label of ["계약금", "중도금", "잔금"] as const) {
    const line = firstLabeledValue(source, [label], 180);
    if (!line) continue;
    const ratio = line.match(/\b\d+(?:\.\d+)?\s*%/)?.[0]?.replace(/\s/g, "");
    const amountText = line.match(/([\d,]+)\s*만원/u)?.[1];
    const amountManwon = amountText ? Number(amountText.replace(/,/g, "")) : undefined;
    rows.push({ label, ratio, amountManwon: Number.isFinite(amountManwon) ? amountManwon : undefined, timing: line });
  }
  return rows.length > 0 ? rows : undefined;
}

function extractFields(source: string) {
  const receiptWindow = source.match(/(?:청약신청|인터넷\s*접수|접수)\s*(?:가능\s*)?(?:시간|시각)\s*[:：]?\s*([01]?\d|2[0-3]):([0-5]\d)\s*(?:~|∼|부터)\s*([01]?\d|2[0-3]):([0-5]\d)/u);
  const decisionSupport = {
    subscriptionAccount: firstLabeledValue(source, ["청약통장", "청약통장 가입여부"]),
    selectionMethod: firstLabeledValue(source, ["당첨자 선정방법", "당첨자 선정 방식", "선정방법"]),
    applicantQualification: firstLabeledValue(source, ["신청자격", "청약신청 자격"], 500),
    transferRestriction: firstLabeledValue(source, ["전매제한", "전매 제한"]),
    residenceRequirement: firstLabeledValue(source, ["거주의무", "실거주 의무"]),
    rewinningRestriction: firstLabeledValue(source, ["재당첨 제한", "재당첨제한"]),
    constructionCompanyName: firstLabeledValue(source, ["시공사", "시공업체"]),
    paymentSchedule: parsePaymentSchedule(source),
  };
  const compactDecision = Object.fromEntries(Object.entries(decisionSupport).filter(([, value]) => value !== undefined));
  return {
    businessOwnerName: firstLabeledValue(source, ["시행사", "사업주체"]),
    contactPhone: firstLabeledValue(source, ["문의처", "문의전화", "분양문의"]),
    moveInMonth: firstLabeledValue(source, ["입주예정월", "입주 예정"]),
    receiptStartTime: receiptWindow ? `${receiptWindow[1].padStart(2, "0")}:${receiptWindow[2]}` : undefined,
    receiptEndTime: receiptWindow ? `${receiptWindow[3].padStart(2, "0")}:${receiptWindow[4]}` : undefined,
    decisionSupport: Object.keys(compactDecision).length > 0 ? compactDecision : undefined,
  };
}

function compactFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

async function fetchLimited(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { "user-agent": "HomeBomOfficialNoticeSync/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_DOCUMENT_BYTES) throw new Error("공식 문서 용량 제한 초과");
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new Error("공식 문서 용량 제한 초과");
    return { res, bytes };
  } finally {
    clearTimeout(timeout);
  }
}

async function upsertCache(row: Record<string, unknown>): Promise<void> {
  const { url, serviceRole } = credentials();
  const res = await fetch(`${url}/rest/v1/notice_document_cache?on_conflict=notice_key`, {
    method: "POST",
    headers: {
      apikey: serviceRole,
      authorization: `Bearer ${serviceRole}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`문서 캐시 저장 실패 ${res.status}`);
}

async function readDocumentStates(): Promise<Map<string, DocumentState>> {
  const { url, serviceRole } = credentials();
  const res = await fetch(`${url}/rest/v1/notice_document_cache?select=notice_key,status,fetched_at,retry_after&limit=1000`, {
    headers: { apikey: serviceRole, authorization: `Bearer ${serviceRole}` },
  });
  if (!res.ok) throw new Error(`문서 캐시 상태 조회 실패 ${res.status}`);
  const rows = await res.json() as DocumentState[];
  return new Map(rows.map((row) => [row.notice_key, row]));
}

function documentDue(state: DocumentState | undefined, now = Date.now()): boolean {
  if (!state) return true;
  if (state.retry_after && Date.parse(state.retry_after) > now) return false;
  if (["verified", "single-official-source"].includes(state.status)) {
    return now - Date.parse(state.fetched_at) >= VERIFIED_DOCUMENT_TTL_MS;
  }
  return true;
}

async function syncNotice(notice: PublicNotice): Promise<"verified" | "not-provided" | "retrying"> {
  const initialCandidates = [allowedInitialUrl(notice.noticeUrl), allowedInitialUrl(notice.officialHomepageUrl)]
    .filter((value): value is URL => value !== null);
  let selectedUrl: URL | null = null;
  let selectedLabel = "";
  let bytes: Uint8Array | null = null;
  let response: Response | null = null;

  try {
    for (const candidate of initialCandidates) {
      try {
        const fetched = await fetchLimited(candidate);
        const contentType = fetched.res.headers.get("content-type") ?? "";
        if (/pdf/i.test(contentType) || /\.pdf(?:$|\?)/i.test(candidate.href)) {
          selectedUrl = candidate;
          bytes = fetched.bytes;
          response = fetched.res;
          break;
        }
        const html = new TextDecoder().decode(fetched.bytes);
        if (/requested url was not found|페이지를 찾을 수 없/i.test(html)) continue;
        const links = discoverLinks(html, new URL(fetched.res.url || candidate.href))
          .sort((a, b) => Number(/정정/u.test(b.label)) - Number(/정정/u.test(a.label)));
        const first = links[0];
        if (first) {
          const document = await fetchLimited(new URL(first.url));
          selectedUrl = new URL(first.url);
          selectedLabel = first.label;
          bytes = document.bytes;
          response = document.res;
          break;
        }
        const fields = compactFields(extractFields(htmlText(html)));
        if (Object.keys(fields).length > 0) {
          const hash = await sha256(fetched.bytes);
          const fetchedAt = new Date().toISOString();
          const provenance = Object.fromEntries(Object.keys(fields).map((field) => [field, {
            sourceType: "notice-html",
            sourceUrl: fetched.res.url || candidate.href,
            fetchedAt,
            documentHash: hash,
            status: "single-official-source",
          }]));
          await upsertCache({
            notice_key: notice.id,
            notice_url: notice.noticeUrl,
            document_url: fetched.res.url || candidate.href,
            source_type: "notice-html",
            document_hash: hash,
            parsed_fields: fields,
            provenance,
            conflicts: [],
            status: "single-official-source",
            fetched_at: fetchedAt,
            retry_after: null,
            last_error: null,
            updated_at: fetchedAt,
          });
          return "verified";
        }
      } catch {
        // 다음 공식 후보를 시도한다.
      }
    }

    if (!selectedUrl || !bytes || !response) {
      const fetchedAt = new Date().toISOString();
      await upsertCache({
        notice_key: notice.id,
        notice_url: notice.noticeUrl,
        source_type: "notice-html",
        parsed_fields: {},
        provenance: {},
        conflicts: [],
        status: "not-provided",
        fetched_at: fetchedAt,
        retry_after: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        last_error: "공식 HTML에서 구조화 가능한 공고문이나 첨부 PDF를 찾지 못함",
        updated_at: fetchedAt,
      });
      return "not-provided";
    }

    const source = await pdfText(bytes);
    const fields = compactFields(extractFields(source));
    const hash = await sha256(bytes);
    const fetchedAt = new Date().toISOString();
    const provenance = Object.fromEntries(Object.keys(fields).map((field) => [field, {
      sourceType: "notice-pdf",
      sourceUrl: selectedUrl.href,
      fetchedAt,
      documentHash: hash,
      revision: /정정/u.test(selectedLabel) ? selectedLabel : undefined,
      status: "single-official-source",
    }]));
    await upsertCache({
      notice_key: notice.id,
      notice_url: notice.noticeUrl,
      document_url: selectedUrl.href,
      source_type: "notice-pdf",
      etag: response.headers.get("etag"),
      last_modified: response.headers.get("last-modified"),
      document_hash: hash,
      revision: /정정/u.test(selectedLabel) ? selectedLabel : null,
      parsed_fields: fields,
      provenance,
      conflicts: [],
      status: Object.keys(fields).length > 0 ? "single-official-source" : "not-provided",
      fetched_at: fetchedAt,
      retry_after: Object.keys(fields).length > 0 ? null : new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      last_error: Object.keys(fields).length > 0 ? null : "공식 PDF에서 안전하게 추출할 수 있는 필드가 없음",
      updated_at: fetchedAt,
    });
    return Object.keys(fields).length > 0 ? "verified" : "not-provided";
  } catch (error) {
    const fetchedAt = new Date().toISOString();
    await upsertCache({
      notice_key: notice.id,
      notice_url: notice.noticeUrl,
      source_type: "notice-html",
      parsed_fields: {},
      provenance: {},
      conflicts: [],
      status: "retrying",
      fetched_at: fetchedAt,
      retry_after: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      last_error: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      updated_at: fetchedAt,
    });
    return "retrying";
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST" || !(await authorized(req))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  }
  const { url, serviceRole } = credentials();
  const publicRes = await fetch(`${url}/functions/v1/notices`, {
    headers: { apikey: serviceRole, authorization: `Bearer ${serviceRole}` },
  });
  if (!publicRes.ok) return new Response(JSON.stringify({ error: `notices ${publicRes.status}` }), { status: 502 });
  const raw = await publicRes.json() as unknown;
  if (!Array.isArray(raw)) return new Response(JSON.stringify({ error: "invalid notices response" }), { status: 502 });
  const documentStates = await readDocumentStates();
  const notices = raw.filter((item): item is PublicNotice => (
    typeof item === "object" && item !== null
    && typeof (item as PublicNotice).id === "string"
    && typeof (item as PublicNotice).receiptEnd === "string"
  )).filter((notice) => documentDue(documentStates.get(notice.id))).slice(0, MAX_NOTICES_PER_RUN);
  const results = { verified: 0, "not-provided": 0, retrying: 0 };
  for (const notice of notices) results[await syncNotice(notice)] += 1;
  return new Response(JSON.stringify({ scanned: notices.length, ...results }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
});
