// 과거 비공식 단지 프로필 API를 저장 데이터 호환용 no-op으로 유지한다.

import type { Notice } from "./types";

export type ComplexProfile = {
  houseName: string;
  addressToken: string;
  totalHouseholdCount: number;
  sourceUrl: string;
  verifiedAt: string;
};

export function findComplexProfile(_houseName?: string, _address?: string): ComplexProfile | undefined {
  return undefined;
}

export function enrichNoticeWithComplexProfile(notice: Notice): Notice {
  return notice;
}
