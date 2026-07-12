import { describe, expect, it } from "vitest";
import type { Notice } from "@zoopzoopcall/core";
import { migrateLegacyNoticeKeys } from "../subscriptions";

function notice(overrides: Partial<Notice> = {}): Notice {
  return {
    id: "manage-100-2026-07-10",
    legacyIds: ["100-"],
    manageNo: "100",
    type: "무순위",
    houseName: "테스트 단지",
    region: "서울",
    receiptStart: "2026-07-10T00:00:00.000Z",
    receiptEnd: "2026-07-10T08:30:00.000Z",
    applyHomeUrl: "https://www.applyhome.co.kr",
    lastVerifiedAt: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("migrateLegacyNoticeKeys", () => {
  it("기존 한쪽 번호 ID의 구독과 snapshot을 안정 ID로 옮긴다", () => {
    const current = notice();
    const legacySnapshot = notice({ id: "100-", legacyIds: undefined });
    const result = migrateLegacyNoticeKeys(
      [current],
      { "100-": { open: [60], close: [60] } },
      { "100-": legacySnapshot },
    );

    expect(result.changed).toBe(true);
    expect(result.subs[current.id]).toEqual({ open: [60], close: [60] });
    expect(result.subs["100-"]).toBeUndefined();
    expect(result.snapshots[current.id]).toEqual(current);
    expect(result.snapshots["100-"]).toBeUndefined();
  });

  it("이전 ID 구독이 없으면 저장값을 바꾸지 않는다", () => {
    const current = notice();
    const result = migrateLegacyNoticeKeys([current], {}, {});
    expect(result.changed).toBe(false);
    expect(result.subs).toEqual({});
  });
});
