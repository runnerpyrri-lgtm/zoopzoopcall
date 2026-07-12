// 유형·접수상태·지역 필터 바. 모바일은 고급 필터를 접어 공고 도달을 우선한다.
import { useEffect, useState } from "react";
import type { NoticeType } from "@zoopzoopcall/core";

export type TypeFilter = NoticeType | "전체";
export type StatusView = "접수중" | "접수예정" | "마감·취소";

type Props = {
  activeType: TypeFilter;
  onType: (t: TypeFilter) => void;
  regions: string[];
  region: string;
  onRegion: (r: string) => void;
  statusView: StatusView;
  onStatusView: (s: StatusView) => void;
  counts: Record<StatusView, number>;
};

const TYPES: TypeFilter[] = ["전체", "무순위", "잔여세대", "취소후재공급"];
const STATUS_VIEWS: StatusView[] = ["접수중", "접수예정", "마감·취소"];
const STATUS_LABEL: Record<StatusView, string> = {
  접수중: "접수 중",
  접수예정: "접수 예정",
  "마감·취소": "마감·취소",
};

export function FilterBar({
  activeType,
  onType,
  regions,
  region,
  onRegion,
  statusView,
  onStatusView,
  counts,
}: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 600,
  );
  const hasAdvancedFilter = activeType !== "전체" || region !== "전체";

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 600px)");
    const openForDesktop = () => {
      if (desktop.matches) setAdvancedOpen(true);
    };
    desktop.addEventListener("change", openForDesktop);
    return () => desktop.removeEventListener("change", openForDesktop);
  }, []);

  return (
    <div className="filters">
      <div className="filters__advanced" id="advanced-filters" hidden={!advancedOpen}>
        <div className="filters__row filters__row--top">
          <div className="filters__chips" role="tablist" aria-label="공고 유형">
            {TYPES.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={activeType === t}
                className={`chip${activeType === t ? " chip--active" : ""}`}
                onClick={() => onType(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <label className="filters__select">
            <span className="sr-only">지역 선택</span>
            <select value={region} onChange={(e) => onRegion(e.target.value)}>
              <option value="전체">전체 지역</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <button
        type="button"
        className="filters__toggle"
        aria-expanded={advancedOpen}
        aria-controls="advanced-filters"
        onClick={() => setAdvancedOpen((value) => !value)}
      >
        <span>유형·지역 필터</span>
        <small>{advancedOpen ? "접기" : hasAdvancedFilter ? "선택됨" : "보기"}</small>
      </button>
      <div className="segmented" role="tablist" aria-label="접수 상태">
        {STATUS_VIEWS.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={statusView === s}
            className={`segmented__item${statusView === s ? " segmented__item--active" : ""}`}
            onClick={() => onStatusView(s)}
          >
            <span className="segmented__label">{STATUS_LABEL[s]}</span>
            <span className="segmented__count">{counts[s]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
