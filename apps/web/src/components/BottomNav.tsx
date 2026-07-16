// 하단 고정 내비게이션 (공고 / 내 알림 / 설정).
import { NavLink } from "react-router-dom";
import familyIconsMarkup from "../generated/robom-family/icons.svg?raw";

const FAMILY_ICON_SPRITE = { __html: familyIconsMarkup };

function FamilyIcon({ name }: { name: "calendar" | "bell" | "settings" }) {
  return (
    <svg className="nav__icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <use href={"#family-icon-" + name} />
    </svg>
  );
}

const TABS = [
  { to: "/", label: "공고", icon: "calendar", end: true },
  { to: "/alerts", label: "내 알림", icon: "bell", end: false },
  { to: "/settings", label: "설정", icon: "settings", end: false },
] as const;

export function BottomNav() {
  return (
    <nav className="nav" aria-label="주 메뉴">
      <span className="nav__sprite" aria-hidden="true" dangerouslySetInnerHTML={FAMILY_ICON_SPRITE} />
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => `nav__tab${isActive ? " nav__tab--active" : ""}`}
        >
          <FamilyIcon name={tab.icon} />
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
