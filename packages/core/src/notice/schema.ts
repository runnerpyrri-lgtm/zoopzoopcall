// 공개 Notice와 로컬 저장본을 동일한 규칙으로 검증하는 런타임 데이터 계약.

import type { ApplicationEvent, Notice, NoticeType } from "./types";

export type NoticeParseIssue = {
  index?: number;
  noticeId?: string;
  path: string;
  message: string;
};

export type NoticeListParseResult = {
  notices: Notice[];
  rejected: NoticeParseIssue[];
};

const NOTICE_TYPES = new Set<NoticeType>([
  "일반공급",
  "무순위",
  "잔여세대",
  "임의공급",
  "불법행위 재공급",
  "취소후재공급",
]);

const EVENT_KINDS = new Set<ApplicationEvent["kind"]>([
  "announce",
  "receipt",
  "special",
  "rank1",
  "rank2",
  "no-priority",
  "winner",
  "contract",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function optionalFiniteNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function validateEvents(value: unknown, issues: NoticeParseIssue[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.push({ path: "events", message: "배열이 아닙니다." });
    return;
  }
  value.forEach((event, index) => {
    if (!isRecord(event)) {
      issues.push({ path: `events.${index}`, message: "객체가 아닙니다." });
      return;
    }
    if (!EVENT_KINDS.has(event.kind as ApplicationEvent["kind"])) {
      issues.push({ path: `events.${index}.kind`, message: "알 수 없는 일정 종류입니다." });
    }
    if (typeof event.label !== "string" || !event.label.trim()) {
      issues.push({ path: `events.${index}.label`, message: "일정 라벨이 없습니다." });
    }
    if (!isIso(event.start)) {
      issues.push({ path: `events.${index}.start`, message: "유효한 ISO 시각이 아닙니다." });
    }
    if (event.end !== undefined && !isIso(event.end)) {
      issues.push({ path: `events.${index}.end`, message: "유효한 ISO 시각이 아닙니다." });
    }
  });
}

export function safeParseNotice(value: unknown): { success: true; data: Notice } | { success: false; issues: NoticeParseIssue[] } {
  if (!isRecord(value)) {
    return { success: false, issues: [{ path: "$", message: "공고가 객체가 아닙니다." }] };
  }

  const issues: NoticeParseIssue[] = [];
  const noticeId = typeof value.id === "string" ? value.id : undefined;
  const requiredText: Array<keyof Pick<Notice, "id" | "houseName" | "region">> = ["id", "houseName", "region"];
  requiredText.forEach((key) => {
    if (typeof value[key] !== "string" || !(value[key] as string).trim()) {
      issues.push({ noticeId, path: key, message: "필수 문자열이 없습니다." });
    }
  });
  if (!NOTICE_TYPES.has(value.type as NoticeType)) {
    issues.push({ noticeId, path: "type", message: "알 수 없는 공고 유형입니다." });
  }
  if (!isIso(value.receiptStart)) {
    issues.push({ noticeId, path: "receiptStart", message: "유효한 접수 시작 시각이 아닙니다." });
  }
  if (!isIso(value.receiptEnd)) {
    issues.push({ noticeId, path: "receiptEnd", message: "유효한 접수 종료 시각이 아닙니다." });
  }
  if (!isIso(value.lastVerifiedAt)) {
    issues.push({ noticeId, path: "lastVerifiedAt", message: "유효한 검증 시각이 아닙니다." });
  }
  if (!isHttpUrl(value.applyHomeUrl)) {
    issues.push({ noticeId, path: "applyHomeUrl", message: "공식 청약홈 URL이 아닙니다." });
  }
  for (const key of ["noticeUrl", "officialHomepageUrl", "totalHouseholdSourceUrl"] as const) {
    if (value[key] !== undefined && !isHttpUrl(value[key])) {
      issues.push({ noticeId, path: key, message: "허용되지 않는 URL입니다." });
    }
  }
  for (const key of ["supplyCount", "totalHouseholdCount", "priceMin", "priceMax", "latitude", "longitude"] as const) {
    if (!optionalFiniteNumber(value[key])) {
      issues.push({ noticeId, path: key, message: "유한한 숫자가 아닙니다." });
    }
  }
  for (const key of ["manageNo", "pblancNo", "address", "officialTypeName", "housingCategory"] as const) {
    if (!optionalString(value[key])) {
      issues.push({ noticeId, path: key, message: "문자열이 아닙니다." });
    }
  }
  validateEvents(value.events, issues);

  if (issues.length > 0) return { success: false, issues };
  return { success: true, data: value as Notice };
}

export function parseNoticeList(value: unknown): NoticeListParseResult {
  if (!Array.isArray(value)) {
    return { notices: [], rejected: [{ path: "$", message: "공개 공고 응답이 배열이 아닙니다." }] };
  }
  const notices: Notice[] = [];
  const rejected: NoticeParseIssue[] = [];
  value.forEach((item, index) => {
    const parsed = safeParseNotice(item);
    if (parsed.success) notices.push(parsed.data);
    else rejected.push(...parsed.issues.map((issue) => ({ ...issue, index })));
  });
  return { notices, rejected };
}
