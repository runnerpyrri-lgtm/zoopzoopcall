// 분양가 범위 포맷 함수 테스트.
import { describe, expect, it } from "vitest";
import type { Notice } from "../notice/types";
import { formatPriceRange } from "../notice/price";

const base = { priceMin: undefined, priceMax: undefined } as unknown as Notice;

describe("formatPriceRange", () => {
  it("하한·상한이 다르면 범위로 표기한다", () => {
    expect(formatPriceRange({ ...base, priceMin: 47750, priceMax: 48550 })).toBe(
      "4억 7,750만원 ~ 4억 8,550만원",
    );
  });

  it("하한·상한이 같으면 단일 금액으로 표기한다", () => {
    expect(formatPriceRange({ ...base, priceMin: 48000, priceMax: 48000 })).toBe("4억 8,000만원");
  });

  it("한쪽만 있으면 그 값, 둘 다 없으면 null", () => {
    expect(formatPriceRange({ ...base, priceMin: 30000 })).toBe("3억원");
    expect(formatPriceRange(base)).toBeNull();
  });
});
