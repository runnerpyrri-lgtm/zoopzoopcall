// 공식 청약홈 필드와 안정 ID 형식을 보여주는 명시적 개발 샘플 공고다.
import { resolveOfficialApplyHomeUrl } from "../domain/officialLink";
import type { NativeNotice } from "../domain/notice";

export const SAMPLE_NOTICE_ID = "2026000001-1";

export const SAMPLE_NOTICE: NativeNotice = {
  id: SAMPLE_NOTICE_ID,
  manageNo: "2026000001",
  pblancNo: "1",
  title: "[샘플] 서울 봄마을 무순위 1세대",
  category: "무순위·잔여세대",
  region: "서울특별시",
  address: "서울특별시 봄구 새봄로 14",
  supplyCount: 1,
  sourceLabel: "한국부동산원 청약홈 공고 형식",
  officialUrl: resolveOfficialApplyHomeUrl(process.env.EXPO_PUBLIC_APPLYHOME_NOTICE_URL),
  milestones: [
    {
      kind: "announcement",
      label: "공고",
      startsAt: "2026-07-15T09:00:00+09:00",
      nextAction: "공급 대상과 신청 자격을 공고문에서 확인하세요.",
    },
    {
      kind: "receipt",
      label: "접수",
      startsAt: "2026-07-20T09:00:00+09:00",
      endsAt: "2026-07-20T17:30:00+09:00",
      nextAction: "청약홈에서 자격을 다시 확인한 뒤 직접 접수하세요.",
      notificationAt: "2026-07-19T09:00:00+09:00",
    },
    {
      kind: "winner",
      label: "발표",
      startsAt: "2026-07-29T10:00:00+09:00",
      nextAction: "청약홈에서 당첨 여부와 후속 서류를 확인하세요.",
      notificationAt: "2026-07-29T09:00:00+09:00",
    },
    {
      kind: "contract",
      label: "계약",
      startsAt: "2026-08-10T10:00:00+09:00",
      endsAt: "2026-08-12T16:00:00+09:00",
      nextAction: "필요 서류와 지정 계약 시간을 공고문에서 확인하세요.",
      notificationAt: "2026-08-09T10:00:00+09:00",
    },
  ],
};
