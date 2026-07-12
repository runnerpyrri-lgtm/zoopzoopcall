// 공고 목록 화면. 유형·지역 필터 + 접수중/예정/마감·취소 상태를 골라 본다.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Notice } from "@zoopzoopcall/core";
import { ddayKst, formatKstDateTime, formatRemaining, getNoticeStatus } from "@zoopzoopcall/core";
import { AppHeader } from "../components/AppHeader";
import { FilterBar, type StatusView, type TypeFilter } from "../components/FilterBar";
import { NoticeCard } from "../components/NoticeCard";
import { PermissionBanner } from "../components/PermissionBanner";
import { useNow } from "../hooks/useNow";
import type { NoticeSource } from "../hooks/useNotices";
import type { SubMap } from "../store/subscriptions";

type Props = {
  notices: Notice[];
  source: NoticeSource;
  error: string | null;
  loading: boolean;
  subs: SubMap;
};

const STATUS_ORDER: StatusView[] = ["접수중", "접수예정", "마감·취소"];
const HEADING: Record<StatusView, string> = {
  접수중: "지금 접수중",
  접수예정: "접수 예정",
  "마감·취소": "마감·취소",
};

function shortDateTime(iso: string): string {
  return formatKstDateTime(iso).replace(/^\d{4}-/, "");
}

function urgencyLabel(notice: Notice, now: number): string {
  const status = getNoticeStatus(notice, now);
  if (status === "마감" || status === "취소") return status;
  const target = status === "접수중" ? notice.receiptEnd : notice.receiptStart;
  const dday = ddayKst(target, now);
  const prefix = status === "접수중" ? "마감" : "접수";
  return dday === 0 ? `${prefix} 오늘` : `${prefix} D-${dday}`;
}

export function ListScreen({ notices, source, error, loading, subs }: Props) {
  const now = useNow(15_000);
  const [type, setType] = useState<TypeFilter>("전체");
  const [region, setRegion] = useState("전체");
  const [statusView, setStatusView] = useState<StatusView>("접수중");
  const [touched, setTouched] = useState(false);

  const regions = useMemo(
    () => [...new Set(notices.map((n) => n.region))].sort((a, b) => a.localeCompare(b, "ko")),
    [notices],
  );

  const filtered = useMemo(
    () =>
      notices.filter((n) => {
        if (type !== "전체" && n.type !== type) return false;
        if (region !== "전체" && n.region !== region) return false;
        return true;
      }),
    [notices, type, region],
  );

  const groups = useMemo(() => {
    const 접수중 = filtered
      .filter((n) => getNoticeStatus(n, now) === "접수중")
      .sort((a, b) => Date.parse(a.receiptEnd) - Date.parse(b.receiptEnd));
    const 접수예정 = filtered
      .filter((n) => ["예정", "정정"].includes(getNoticeStatus(n, now)))
      .sort((a, b) => Date.parse(a.receiptStart) - Date.parse(b.receiptStart));
    const 마감취소 = filtered
      .filter((n) => ["마감", "취소"].includes(getNoticeStatus(n, now)))
      .sort((a, b) => Date.parse(b.receiptEnd) - Date.parse(a.receiptEnd));
    return { 접수중, 접수예정, "마감·취소": 마감취소 } as Record<StatusView, Notice[]>;
  }, [filtered, now]);

  const counts = useMemo(
    () => ({
      접수중: groups["접수중"].length,
      접수예정: groups["접수예정"].length,
      "마감·취소": groups["마감·취소"].length,
    }),
    [groups],
  );

  // 사용자가 아직 상태를 고르지 않았으면, 공고가 있는 첫 상태를 자동 선택한다.
  useEffect(() => {
    if (touched) return;
    const firstNonEmpty = STATUS_ORDER.find((s) => counts[s] > 0);
    if (firstNonEmpty && firstNonEmpty !== statusView) setStatusView(firstNonEmpty);
  }, [counts, touched, statusView]);

  const onStatusView = (s: StatusView) => {
    setTouched(true);
    setStatusView(s);
  };

  const active = groups[statusView];
  const hero = active[0];
  const opportunities = active.slice(1);
  const heroStatus = hero ? getNoticeStatus(hero, now) : null;
  const heroClosed = heroStatus === "마감" || heroStatus === "취소";
  const heroTarget = heroStatus === "접수중" ? hero?.receiptEnd : hero?.receiptStart;

  return (
    <div className="screen">
      <AppHeader source={source} />

      {error && <div className="notice-bar">{error}</div>}

      <PermissionBanner compact hidePrompt />

      {notices.length > 0 && (
        <FilterBar
          activeType={type}
          onType={setType}
          regions={regions}
          region={region}
          onRegion={setRegion}
          statusView={statusView}
          onStatusView={onStatusView}
          counts={counts}
        />
      )}

      {loading && <p className="empty">공고를 불러오는 중입니다…</p>}

      {!loading && filtered.length === 0 && source === "not-connected" && (
        <div className="empty">
          <p className="empty__title">실공고 연결 대기 중입니다</p>
          <p className="empty__body">
            청약 공고는 9시에만 보이는 방식이 아닙니다. 데이터 연결이 완료되기 전까지 임의 단지나 추정
            공고는 보여주지 않습니다.
          </p>
        </div>
      )}

      {!loading && filtered.length === 0 && source === "live" && (
        <div className="empty">
          <p className="empty__title">조건에 맞는 공고가 없어요</p>
          <p className="empty__body">
            새 청약 공고가 확인되면 여기에 표시됩니다. 이미 켜둔 알림은 저장된 공고 기준으로 유지됩니다.
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <>
          {hero ? (
            <section className="hero-card" aria-labelledby="hero-title">
              <div className="hero-card__rule" aria-hidden="true" />
              <div className="hero-card__top">
                <span className="hero-card__status">{urgencyLabel(hero, now)}</span>
                <span className="hero-card__symbol" aria-hidden="true">⌂</span>
              </div>
              <h2 id="hero-title" className="hero-card__title">{hero.houseName}</h2>
              <p className="hero-card__meta">
                {[hero.region, hero.type, hero.supplyCount ? `${hero.supplyCount}세대` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <dl className="hero-card__metrics">
                <div>
                  <dt>{heroClosed ? "접수 시작" : heroStatus === "접수중" ? "접수 시작" : "시작 예정"}</dt>
                  <dd>{shortDateTime(hero.receiptStart)}</dd>
                </div>
                <div>
                  <dt>{heroClosed ? "접수 마감" : heroStatus === "접수중" ? "마감까지" : "시작까지"}</dt>
                  <dd>{heroClosed ? shortDateTime(hero.receiptEnd) : heroTarget ? formatRemaining(Date.parse(heroTarget) - now) : "일정 확인"}</dd>
                </div>
                <div>
                  <dt>공급 규모</dt>
                  <dd>{hero.supplyCount ? `${hero.supplyCount}세대` : "공고 확인"}</dd>
                </div>
              </dl>
              <div className="hero-card__foot">
                <p>{heroClosed ? "종료된 일정과 공고 원문을 확인할 수 있어요." : hero.id in subs ? "이 공고의 알림이 켜져 있어요." : "놓치기 전에 알림 시간을 골라보세요."}</p>
                <Link className="btn btn--primary hero-card__cta" to={`/notice/${hero.id}`}>
                  {heroClosed ? "공고 확인" : hero.id in subs ? "알림 확인" : "알림 켜기"}
                </Link>
              </div>
            </section>
          ) : (
            <p className="empty empty__body">이 상태의 공고가 지금은 없어요.</p>
          )}

          {hero && (
            <section className="opportunities">
              <div className="section-heading">
                <h2>{statusView === "접수예정" ? "곧 열리는 기회" : HEADING[statusView]}</h2>
                <span>{active.length}</span>
              </div>
              {opportunities.length > 0 ? (
                opportunities.map((n) => (
                  <NoticeCard key={n.id} notice={n} now={now} subscribed={n.id in subs} />
                ))
              ) : (
                <p className="section-empty">이어서 보여드릴 공고는 아직 없어요.</p>
              )}
            </section>
          )}

          <aside className="ad-slot" aria-label="비활성 광고 영역">
            <span>광고</span>
            <p>추천 금융·주거 정보</p>
            <strong>준비 중</strong>
          </aside>
        </>
      )}
    </div>
  );
}
