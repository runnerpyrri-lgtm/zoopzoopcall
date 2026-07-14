// 공개 응답과 LKG가 한 행의 오류 때문에 전체 목록을 깨지 않는지 검증한다.
import { describe, expect, it } from "vitest";
import { parseNoticeList, safeParseNotice } from "../notice/schema";

const valid = {
  id: "2026000001-2026000001",
  type: "무순위",
  houseName: "검증 단지",
  region: "서울",
  receiptStart: "2026-07-14T00:00:00.000Z",
  receiptEnd: "2026-07-15T14:59:00.000Z",
  applyHomeUrl: "https://www.applyhome.co.kr/",
  lastVerifiedAt: "2026-07-14T00:00:00.000Z",
};

describe("Notice runtime schema", () => {
  it("유효 공고를 통과시킨다", () => {
    expect(safeParseNotice(valid).success).toBe(true);
  });

  it("깨진 행만 거부하고 나머지 공고는 유지한다", () => {
    const result = parseNoticeList([valid, { ...valid, id: "", receiptEnd: "invalid" }]);
    expect(result.notices).toEqual([valid]);
    expect(result.rejected.length).toBeGreaterThan(0);
    expect(result.rejected.every((issue) => issue.index === 1)).toBe(true);
  });

  it("배열이 아닌 응답을 안전하게 거부한다", () => {
    const result = parseNoticeList({ data: [valid] });
    expect(result.notices).toEqual([]);
    expect(result.rejected[0].path).toBe("$");
  });
});
