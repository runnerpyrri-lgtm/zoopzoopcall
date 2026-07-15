// 공식 공고 HTML·PDF 텍스트에서 검증 가능한 의사결정 필드만 결정론적으로 추출한다.

export type PdfTextItemLike = {
  str?: string;
  transform?: number[];
  hasEOL?: boolean;
};

export type OfficialDocumentMetadata = {
  contentType?: string | null;
  contentDisposition?: string | null;
  url?: string;
  bytes?: Uint8Array;
};

type PaymentRow = { label: string; ratio?: string; amountManwon?: number; timing?: string };

const LABELS = [
  "청약통장 가입여부", "청약통장", "당첨자 선정방법", "당첨자 선정 방식", "선정방법",
  "청약신청 자격", "신청자격", "전매 제한", "전매제한", "실거주 의무", "거주의무",
  "재당첨 제한", "재당첨제한", "시공업체", "시공사", "사업주체", "시행사",
  "문의전화", "분양문의", "문의처", "입주예정월", "입주 예정", "계약금", "중도금", "잔금",
];

const GENERIC_CELL_VALUES = new Set([
  "시행사", "시공사", "시공업체", "사업주체", "문의처", "문의전화", "분양문의",
  "청약통장", "선정방법", "신청자격", "해당사항", "구분", "내용",
]);

function cleanLine(value: string): string {
  return value.normalize("NFKC").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/[ \t]+/g, " ").trim();
}

/** 첨부 API가 octet-stream으로 내려주는 PDF까지 헤더와 파일 시그니처로 판별한다. */
export function isPdfDocument(metadata: OfficialDocumentMetadata): boolean {
  if (/application\/pdf/i.test(metadata.contentType ?? "")) return true;
  if (/filename\*?\s*=.*\.pdf(?:["';]|$)/i.test(metadata.contentDisposition ?? "")) return true;
  if (/\.pdf(?:$|[?#])/i.test(metadata.url ?? "")) return true;
  const bytes = metadata.bytes;
  return Boolean(bytes && bytes.length >= 5
    && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d);
}

/** PDF.js 텍스트 조각을 좌표 기준 행으로 복원한다. */
export function pdfItemsToText(items: PdfTextItemLike[]): string {
  const positioned = items.map((item, index) => {
    const transform = Array.isArray(item.transform) ? item.transform : [];
    return {
      text: cleanLine(item.str ?? ""),
      x: Number.isFinite(transform[4]) ? Number(transform[4]) : index,
      y: Number.isFinite(transform[5]) ? Number(transform[5]) : -index * 10,
      hasEOL: item.hasEOL === true,
      index,
    };
  }).filter((item) => item.text.length > 0);

  const rows: Array<{ y: number; items: typeof positioned }> = [];
  for (const item of positioned.sort((a, b) => b.y - a.y || a.x - b.x || a.index - b.index)) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 2.5);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }

  return rows.sort((a, b) => b.y - a.y).map((row) => row.items
    .sort((a, b) => a.x - b.x || a.index - b.index)
    .map((item) => item.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim())
    .filter(Boolean)
    .join("\n");
}

function isLabelStart(value: string): boolean {
  return LABELS.some((label) => value === label || value.startsWith(`${label} `) || value.startsWith(`${label}:`) || value.startsWith(`${label}：`));
}

function trimFollowingLabel(value: string): string {
  let end = value.length;
  for (const label of LABELS) {
    const index = value.search(new RegExp(`\\s${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:：]?\\s*`, "u"));
    if (index >= 0) end = Math.min(end, index);
  }
  return value.slice(0, end).trim();
}

function firstLabeledValue(source: string, labels: string[], maxLength = 240): string | undefined {
  const lines = source.split(/\r?\n/).map(cleanLine).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const label of labels) {
      if (!(line === label || line.startsWith(`${label} `) || line.startsWith(`${label}:`) || line.startsWith(`${label}：`))) continue;
      let value = line.slice(label.length).replace(/^\s*[:：|]\s*/u, "").trim();
      if (!value && lines[index + 1] && !isLabelStart(lines[index + 1])) value = lines[index + 1];
      value = trimFollowingLabel(value).slice(0, maxLength).replace(/\s{2,}/g, " ").trim();
      if (!value || value === "-" || GENERIC_CELL_VALUES.has(value) || isLabelStart(value) || /(?:확인|참조)$/u.test(value)) continue;
      return value;
    }
  }
  return undefined;
}

function constrainedDecisionValue(
  value: string | undefined,
  required: RegExp,
  rejected: RegExp,
  maxLength = 220,
): string | undefined {
  if (!value || value.length > maxLength || !required.test(value) || rejected.test(value) || isLabelStart(value)) return undefined;
  return value;
}

function extractPhone(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/(?:\+82[- ]?)?(?:0\d{1,2})[- )]?\d{3,4}[- ]?\d{4}/u);
  return match?.[0]?.replace(/^\+82[- ]?/, "0").trim();
}

function extractOrganization(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/^(?:상호|명칭)\s*[:：]?\s*/u, "").trim();
  if (GENERIC_CELL_VALUES.has(cleaned) || cleaned.length < 2 || cleaned.length > 120) return undefined;
  if (/(?:문의|확인|참조|홈페이지|분양사무실|전화|또는|견본주택|부담액|분양대금|금융기관|책임하|납부|알선)/u.test(cleaned)) return undefined;
  if (!/(?:\(주\)|㈜|주식회사|유한회사|공사|공단|신탁|건설|개발|산업|컨소시엄|에이엠씨|AMC)/u.test(cleaned)) return undefined;
  return cleaned;
}

function extractMoveInMonth(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, "");
  const yyyymm = compact.match(/^(20\d{2})(0[1-9]|1[0-2])$/u);
  if (yyyymm) return `${yyyymm[1]}${yyyymm[2]}`;
  const labeled = compact.match(/(20\d{2})년(0?[1-9]|1[0-2])월/u);
  return labeled ? `${labeled[1]}${labeled[2].padStart(2, "0")}` : undefined;
}

function parsePaymentSchedule(source: string): PaymentRow[] | undefined {
  const rows: PaymentRow[] = [];
  for (const label of ["계약금", "중도금", "잔금"] as const) {
    const line = firstLabeledValue(source, [label], 180);
    if (!line) continue;
    const ratio = line.match(/\b\d+(?:\.\d+)?\s*%/)?.[0]?.replace(/\s/g, "");
    const amountText = line.match(/([\d,]+)\s*만원/u)?.[1];
    const amountManwon = amountText ? Number(amountText.replace(/,/g, "")) : undefined;
    const normalizedAmount = Number.isFinite(amountManwon) ? amountManwon : undefined;
    const hasOfficialTiming = /(?:계약\s*시|입주\s*시|납부|20\d{2}|\d{1,2}월|\d{1,2}일)/u.test(line);
    const looksLikeAccountText = /(?:은행|계좌|가상계좌|입금|영수증)/u.test(line);
    const numericTokens = line.match(/[\d,]+/g)?.length ?? 0;
    if ((!ratio && normalizedAmount === undefined) || !hasOfficialTiming || looksLikeAccountText || line.length > 120 || numericTokens > 4) continue;
    rows.push({ label, ratio, amountManwon: normalizedAmount, timing: line });
  }
  return rows.length > 0 ? rows : undefined;
}

/** 정규화된 공식 문서 텍스트에서 안전하게 확인 가능한 필드만 반환한다. */
export function extractOfficialFields(source: string): Record<string, unknown> {
  const normalized = source.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const receiptWindow = normalized.match(/(?:청약신청|인터넷\s*청약|접수)\s*(?:가능|접수)?\s*(?:시간|시각)\s*[:：]?\s*([01]?\d|2[0-3]):([0-5]\d)\s*(?:~|∼|부터)\s*([01]?\d|2[0-3]):([0-5]\d)/u);
  const decisionSupport = {
    subscriptionAccount: constrainedDecisionValue(
      firstLabeledValue(normalized, ["청약통장", "청약통장 가입여부"]),
      /(?:가입|예치금|필요|불필요)/u,
      /(?:자격요건|1\s*순위|2\s*순위|기관추천|다자녀|신혼부부|노부모|생애최초)/u,
      160,
    ),
    selectionMethod: constrainedDecisionValue(
      firstLabeledValue(normalized, ["당첨자 선정방법", "당첨자 선정 방식", "선정방법"]),
      /(?:추첨|가점|무작위|전산|선정)/u,
      /(?:신청|접수|안내|발표|제외|계약\s*불가|않습니다)/u,
      160,
    ),
    applicantQualification: constrainedDecisionValue(
      firstLabeledValue(normalized, ["신청자격", "청약신청 자격"], 500),
      /(?:거주하는|거주자|무주택|세대구성원|성년|만\s*\d+세|신청자격|주택\s*소유)/u,
      /(?:기관추천\s+다자녀|신혼부부\s+노부모|생애최초\s+신생아|1\s*순위\s+2\s*순위)/u,
      360,
    ),
    transferRestriction: constrainedDecisionValue(
      firstLabeledValue(normalized, ["전매제한", "전매 제한"]),
      /(?:년|개월|없음|해당\s*없음|소유권\s*이전)/u,
      /(?:재당첨|거주의무|실거주)/u,
      120,
    ),
    residenceRequirement: constrainedDecisionValue(
      firstLabeledValue(normalized, ["거주의무", "실거주 의무"]),
      /(?:년|개월|없음|해당\s*없음)/u,
      /(?:전매|재당첨)/u,
      120,
    ),
    rewinningRestriction: constrainedDecisionValue(
      firstLabeledValue(normalized, ["재당첨 제한", "재당첨제한"]),
      /(?:년|개월|없음|해당\s*없음|적용)/u,
      /(?:전매|거주의무|실거주)/u,
      180,
    ),
    constructionCompanyName: extractOrganization(firstLabeledValue(normalized, ["시공사", "시공업체"])),
    paymentSchedule: parsePaymentSchedule(normalized),
  };
  const compactDecision = Object.fromEntries(Object.entries(decisionSupport).filter(([, value]) => value !== undefined));
  return Object.fromEntries(Object.entries({
    businessOwnerName: extractOrganization(firstLabeledValue(normalized, ["시행사", "사업주체"])),
    contactPhone: extractPhone(firstLabeledValue(normalized, ["문의처", "문의전화", "분양문의"])),
    moveInMonth: extractMoveInMonth(firstLabeledValue(normalized, ["입주예정월", "입주 예정"])),
    receiptStartTime: receiptWindow ? `${receiptWindow[1].padStart(2, "0")}:${receiptWindow[2]}` : undefined,
    receiptEndTime: receiptWindow ? `${receiptWindow[3].padStart(2, "0")}:${receiptWindow[4]}` : undefined,
    decisionSupport: Object.keys(compactDecision).length > 0 ? compactDecision : undefined,
  }).filter(([, value]) => value !== undefined));
}
