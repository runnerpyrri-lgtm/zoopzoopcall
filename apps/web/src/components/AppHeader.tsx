// 청약봄의 공통 앱바와 서비스 상태를 표시한다.
import type { ReactNode } from "react";
import type { NoticeSource } from "../hooks/useNotices";
import familyWordmarkUrl from "../generated/robom-family/wordmark.svg";

type Props = {
  title?: string;
  source?: NoticeSource;
  action?: ReactNode;
  compact?: boolean;
};

export function AppHeader({ title = "청약봄", source, action, compact = false }: Props) {
  const iconUrl = `${import.meta.env.BASE_URL}icons/icon-v2.svg`;

  return (
    <header className={`appbar${compact ? " appbar--compact" : ""}`}>
      <div className="appbar__mark" aria-hidden="true">
        <img className="appbar__icon" src={iconUrl} alt="" />
      </div>
      <div className="appbar__copy">
        <h1 className="appbar__title">
          {title === "청약봄" ? (
            <span className="appbar__wordmark">
              <span className="sr-only">청약봄</span>
              <span className="appbar__prefix" aria-hidden="true">청약</span>
              <img className="appbar__bom" src={familyWordmarkUrl} alt="" aria-hidden="true" />
            </span>
          ) : (
            title
          )}
        </h1>
        {!compact && <p className="appbar__tagline">청약 일정, 한눈에</p>}
      </div>
      {(action || source) && (
        <div className="appbar__action">
          {action ??
            (source && (
            <span className={`source source--${source}`}>
              {source === "live" ? "청약홈 데이터" : source === "stale" ? "확인 지연" : "연결 필요"}
            </span>
            ))}
        </div>
      )}
    </header>
  );
}
