// 공식 공고 PDF 행 복원과 보수적 필드 추출 규칙의 회귀를 검증한다.
import { describe, expect, it } from "vitest";
import {
  extractOfficialFields,
  isPdfDocument,
  pdfItemsToText,
} from "../../../../supabase/functions/_shared/noticeDocument";

describe("공식 공고 문서 파서", () => {
  it("청약홈 첨부 API의 octet-stream PDF를 파일명과 시그니처로 판별한다", () => {
    expect(isPdfDocument({
      contentType: "application/octet-stream;charset=UTF-8",
      contentDisposition: 'attachment; filename="official-notice.pdf"',
      url: "https://static.applyhome.co.kr/ai/aia/getAtchmnfl.do?id=1",
    })).toBe(true);
    expect(isPdfDocument({ bytes: new TextEncoder().encode("%PDF-1.7") })).toBe(true);
    expect(isPdfDocument({ contentType: "text/html", bytes: new TextEncoder().encode("<html>") })).toBe(false);
  });

  it("PDF.js 조각을 좌표 순서의 행으로 복원한다", () => {
    const text = pdfItemsToText([
      { str: "(주)로봄주택", transform: [1, 0, 0, 1, 120, 700] },
      { str: "사업주체", transform: [1, 0, 0, 1, 20, 700] },
      { str: "02-1234-5678", transform: [1, 0, 0, 1, 120, 680] },
      { str: "문의전화", transform: [1, 0, 0, 1, 20, 680] },
    ]);

    expect(text).toBe("사업주체 (주)로봄주택\n문의전화 02-1234-5678");
  });

  it("일반 표 머리글은 값으로 오인하지 않고 공식 형식만 추출한다", () => {
    const fields = extractOfficialFields([
      "사업주체 시공사",
      "문의전화 02-1234-5678",
      "청약신청 시간 09:00 ~ 17:30",
      "청약통장 불필요",
      "당첨자 선정방법 무작위 추첨",
      "계약금 10% 3,500만원 계약 시",
    ].join("\n"));

    expect(fields.businessOwnerName).toBeUndefined();
    expect(fields.contactPhone).toBe("02-1234-5678");
    expect(fields.receiptStartTime).toBe("09:00");
    expect(fields.receiptEndTime).toBe("17:30");
    expect(fields.decisionSupport).toMatchObject({
      subscriptionAccount: "불필요",
      selectionMethod: "무작위 추첨",
      paymentSchedule: [{ label: "계약금", ratio: "10%", amountManwon: 3500, timing: "10% 3,500만원 계약 시" }],
    });
  });

  it("공식 페이지 안내 문장을 시행사 이름으로 게시하지 않는다", () => {
    expect(extractOfficialFields("사업주체 또는 분양사무실로 문의").businessOwnerName).toBeUndefined();
    expect(extractOfficialFields("사업주체 부담액 1만원 2만원 3만 5천원").businessOwnerName).toBeUndefined();
    expect(extractOfficialFields("사업주체 견본주택").businessOwnerName).toBeUndefined();
    expect(extractOfficialFields("사업주체 (주)로봄주택개발").businessOwnerName).toBe("(주)로봄주택개발");
  });

  it("라벨 다음 행의 값을 읽되 다음 라벨까지 섞지 않는다", () => {
    const fields = extractOfficialFields([
      "신청자격",
      "국내에 거주하는 무주택세대구성원",
      "전매제한 3년",
      "시공사 (주)안전건설",
    ].join("\n"));

    expect(fields.decisionSupport).toMatchObject({
      applicantQualification: "국내에 거주하는 무주택세대구성원",
      transferRestriction: "3년",
      constructionCompanyName: "(주)안전건설",
    });
  });

  it("입주 예정은 공식 연월 형식일 때만 정규화한다", () => {
    expect(extractOfficialFields("입주 예정 2029년 9월 예정").moveInMonth).toBe("202909");
    expect(extractOfficialFields("입주 예정 및 부대복리시설 안내").moveInMonth).toBeUndefined();
  });

  it("표의 인접 문장과 계좌 안내를 의사결정 값으로 오인하지 않는다", () => {
    const fields = extractOfficialFields([
      "당첨자 선정방법 반드시 청약접수일에 신청 완료해야 합니다.",
      "신청자격 기관추천 다자녀가구 신혼부부 노부모부양 생애최초 신생아 1순위 2순위",
      "재당첨 제한 전매제한",
      "계약금 10% 우리은행 123-456 입금 영수증",
    ].join("\n"));
    expect(fields.decisionSupport).toBeUndefined();
    expect(extractOfficialFields("신청자격 철거주택").decisionSupport).toBeUndefined();
    expect(extractOfficialFields("계약금 10% 계약 시 1,100,000 1,200,000 1,300,000 1,400,000 1,500,000").decisionSupport).toBeUndefined();
  });
});
