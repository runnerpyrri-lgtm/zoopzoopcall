// 공고 분양가 범위를 고객용 문자열로 포맷하는 순수함수.
import type { Notice } from "./types";
import { formatManwon } from "../time/kst";

/**
 * 분양가 범위를 "A ~ B"로 포맷한다. 하한·상한이 같으면 단일 금액,
 * 한쪽만 있으면 그 값, 둘 다 없으면 null을 반환해 호출부가 가격 영역을 숨긴다.
 */
export function formatPriceRange(notice: Notice): string | null {
  const { priceMin, priceMax } = notice;
  if (priceMin && priceMax) {
    return priceMin === priceMax
      ? formatManwon(priceMin)
      : `${formatManwon(priceMin)} ~ ${formatManwon(priceMax)}`;
  }
  if (priceMin) return formatManwon(priceMin);
  if (priceMax) return formatManwon(priceMax);
  return null;
}
