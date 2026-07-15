// 공식 청약 공고 HTML·PDF를 동기화해 검증 가능한 필드만 서버 전용 캐시에 저장한다.

import { getDocument } from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";
import { extractOfficialFields, isPdfDocument, pdfItemsToText, type PdfTextItemLike } from "../_shared/noticeDocument.ts";

type PublicNotice = {
  id: string;
  noticeUrl?: string;
  officialHomepageUrl?: string;
  receiptStart: string;
  receiptEnd: string;
  fieldProvenance?: Record<string, { sourceUrl?: string }>;
};

type Link = { url: string; label: string };
type DocumentState = {
  notice_key: string;
  status: "verified" | "single-official-source" | "conflict" | "not-provided" | "retrying";
  fetched_at: string;
  retry_after?: string | null;
};

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const MAX_DOCUMENT_PAGES = 150;
const MAX_NOTICES_PER_RUN = 2;
const MAX_REDIRECTS = 3;
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
  if (document.numPages > MAX_DOCUMENT_PAGES) throw new Error(`공식 PDF 페이지 제한 초과 (${document.numPages})`);
  const pages: string[] = [];
  for (let pageNo = 1; pageNo <= document.numPages; pageNo += 1) {
    const page = await document.getPage(pageNo);
    const content = await page.getTextContent();
    pages.push(pdfItemsToText(content.items as PdfTextItemLike[]));
  }
  return pages.join("\n\f\n").trim();
}

function compactFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

async function fetchLimited(initialUrl: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    let current = initialUrl;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      if (!allowedInitialUrl(current.href)) throw new Error("허용되지 않은 공식 문서 주소");
      const res = await fetch(current, { redirect: "manual", signal: controller.signal, headers: { "user-agent": "HomeBomOfficialNoticeSync/1.1" } });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location || redirects === MAX_REDIRECTS) throw new Error("공식 문서 리디렉션 제한 초과");
        const redirected = new URL(location, current);
        if (!allowedInitialUrl(redirected.href)) throw new Error("공식 문서가 허용되지 않은 주소로 이동함");
        current = redirected;
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > MAX_DOCUMENT_BYTES) throw new Error("공식 문서 용량 제한 초과");
      const chunks: Uint8Array[] = [];
      let total = 0;
      if (res.body) {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > MAX_DOCUMENT_BYTES) {
            await reader.cancel();
            throw new Error("공식 문서 용량 제한 초과");
          }
          chunks.push(value);
        }
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { res, bytes, finalUrl: current };
    }
    throw new Error("공식 문서 리디렉션 처리 실패");
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

async function recordRun(status: "succeeded" | "failed", startedAt: string, result: Record<string, unknown>, error?: string): Promise<void> {
  const { url, serviceRole } = credentials();
  const res = await fetch(`${url}/rest/v1/notice_sync_runs`, {
    method: "POST",
    headers: {
      apikey: serviceRole,
      authorization: `Bearer ${serviceRole}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({ job_name: "sync-notice-documents", status, started_at: startedAt, finished_at: new Date().toISOString(), result, error: error ?? null }),
  });
  if (!res.ok) throw new Error(`동기화 실행 기록 실패 ${res.status}`);
}

async function readDocumentStates(): Promise<Map<string, DocumentState>> {
  const { url, serviceRole } = credentials();
  const rows: DocumentState[] = [];
  const pageSize = 1000;
  for (let from = 0;; from += pageSize) {
    const res = await fetch(`${url}/rest/v1/notice_document_cache?select=notice_key,status,fetched_at,retry_after&order=notice_key.asc`, {
      headers: {
        apikey: serviceRole,
        authorization: `Bearer ${serviceRole}`,
        range: `${from}-${from + pageSize - 1}`,
      },
    });
    if (!res.ok) throw new Error(`문서 캐시 상태 조회 실패 ${res.status}`);
    const page = await res.json() as DocumentState[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
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
  const priorOfficialDocuments = Object.values(notice.fieldProvenance ?? {})
    .map((item) => allowedInitialUrl(item?.sourceUrl))
    .filter((value): value is URL => value !== null)
    .filter((url) => /(?:getAtchmnfl|\.pdf(?:$|\?))/i.test(url.href));
  const initialCandidates = [...priorOfficialDocuments, allowedInitialUrl(notice.noticeUrl), allowedInitialUrl(notice.officialHomepageUrl)]
    .filter((value): value is URL => value !== null);
  const uniqueCandidates = [...new Map(initialCandidates.map((url) => [url.href, url])).values()];
  let selectedUrl: URL | null = null;
  let selectedLabel = "";
  let bytes: Uint8Array | null = null;
  let response: Response | null = null;
  let successfulFetches = 0;
  let lastFetchError = "";

  try {
    for (const candidate of uniqueCandidates) {
      try {
        const fetched = await fetchLimited(candidate);
        successfulFetches += 1;
        if (isPdfDocument({
          contentType: fetched.res.headers.get("content-type"),
          contentDisposition: fetched.res.headers.get("content-disposition"),
          url: fetched.finalUrl.href,
          bytes: fetched.bytes,
        })) {
          selectedUrl = fetched.finalUrl;
          bytes = fetched.bytes;
          response = fetched.res;
          break;
        }
        const html = new TextDecoder().decode(fetched.bytes);
        if (/requested url was not found|페이지를 찾을 수 없/i.test(html)) continue;
        const links = discoverLinks(html, fetched.finalUrl)
          .sort((a, b) => Number(/정정/u.test(b.label)) - Number(/정정/u.test(a.label)));
        for (const link of links) {
          try {
            const document = await fetchLimited(new URL(link.url));
            successfulFetches += 1;
            if (!isPdfDocument({
              contentType: document.res.headers.get("content-type"),
              contentDisposition: document.res.headers.get("content-disposition"),
              url: document.finalUrl.href,
              bytes: document.bytes,
            })) continue;
            selectedUrl = document.finalUrl;
            selectedLabel = link.label;
            bytes = document.bytes;
            response = document.res;
            break;
          } catch (error) {
            lastFetchError = error instanceof Error ? error.message : "공식 첨부 문서 요청 실패";
          }
        }
        if (selectedUrl) break;
        const fields = compactFields(extractOfficialFields(htmlText(html)));
        if (Object.keys(fields).length > 0) {
          const hash = await sha256(fetched.bytes);
          const fetchedAt = new Date().toISOString();
          const provenance = Object.fromEntries(Object.keys(fields).map((field) => [field, {
            sourceType: "notice-html",
            sourceUrl: fetched.finalUrl.href,
            fetchedAt,
            documentHash: hash,
            status: "single-official-source",
          }]));
          await upsertCache({
            notice_key: notice.id,
            notice_url: notice.noticeUrl,
            document_url: fetched.finalUrl.href,
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
      } catch (error) {
        lastFetchError = error instanceof Error ? error.message : "공식 문서 요청 실패";
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
        status: successfulFetches > 0 ? "not-provided" : "retrying",
        fetched_at: fetchedAt,
        retry_after: new Date(Date.now() + (successfulFetches > 0 ? 6 : 1) * 60 * 60 * 1000).toISOString(),
        last_error: successfulFetches > 0
          ? "공식 HTML에서 구조화 가능한 공고문이나 첨부 PDF를 찾지 못함"
          : lastFetchError || "공식 문서 요청에 실패함",
        updated_at: fetchedAt,
      });
      return successfulFetches > 0 ? "not-provided" : "retrying";
    }

    const hash = await sha256(bytes);
    const fetchedAt = new Date().toISOString();
    const parseRetryAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    // PDF.js가 런타임 한도를 초과해 프로세스가 종료돼도 같은 문서가 큐 전체를 계속 막지 않게 선점 상태를 남긴다.
    await upsertCache({
      notice_key: notice.id,
      notice_url: notice.noticeUrl,
      document_url: selectedUrl.href,
      source_type: "notice-pdf",
      etag: response.headers.get("etag"),
      last_modified: response.headers.get("last-modified"),
      document_hash: hash,
      revision: /정정/u.test(selectedLabel) ? selectedLabel : null,
      parsed_fields: {},
      provenance: {},
      conflicts: [],
      status: "retrying",
      fetched_at: fetchedAt,
      retry_after: parseRetryAt,
      last_error: "공식 PDF 안전 파싱 대기",
      updated_at: fetchedAt,
    });

    let source: string;
    try {
      source = await pdfText(bytes);
    } catch (error) {
      await upsertCache({
        notice_key: notice.id,
        notice_url: notice.noticeUrl,
        document_url: selectedUrl.href,
        source_type: "notice-pdf",
        etag: response.headers.get("etag"),
        last_modified: response.headers.get("last-modified"),
        document_hash: hash,
        revision: /정정/u.test(selectedLabel) ? selectedLabel : null,
        parsed_fields: {},
        provenance: {},
        conflicts: [],
        status: "retrying",
        fetched_at: fetchedAt,
        retry_after: parseRetryAt,
        last_error: error instanceof Error ? `공식 PDF 파싱 실패: ${error.message}`.slice(0, 500) : "공식 PDF 파싱 실패",
        updated_at: new Date().toISOString(),
      });
      return "retrying";
    }
    const fields = compactFields(extractOfficialFields(source));
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
  const startedAt = new Date().toISOString();
  try {
    const { url, serviceRole } = credentials();
    const publicRes = await fetch(`${url}/functions/v1/notices`, {
      headers: { apikey: serviceRole, authorization: `Bearer ${serviceRole}` },
    });
    if (!publicRes.ok) throw new Error(`notices ${publicRes.status}`);
    const raw = await publicRes.json() as unknown;
    if (!Array.isArray(raw)) throw new Error("invalid notices response");
    const documentStates = await readDocumentStates();
    const notices = raw.filter((item): item is PublicNotice => (
      typeof item === "object" && item !== null
      && typeof (item as PublicNotice).id === "string"
      && typeof (item as PublicNotice).receiptEnd === "string"
    )).filter((notice) => documentDue(documentStates.get(notice.id))).slice(0, MAX_NOTICES_PER_RUN);
    const results = { verified: 0, "not-provided": 0, retrying: 0 };
    for (const notice of notices) results[await syncNotice(notice)] += 1;
    const body = { scanned: notices.length, ...results };
    await recordRun("succeeded", startedAt, body);
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "unknown";
    await recordRun("failed", startedAt, {}, message).catch(() => {});
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { "content-type": "application/json; charset=utf-8" } });
  }
});
