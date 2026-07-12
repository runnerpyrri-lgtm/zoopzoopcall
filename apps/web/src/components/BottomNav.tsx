// 하단 고정 내비게이션 (공고 / 내 알림 / 설정).
import { NavLink } from "react-router-dom";

const ICONS = {
  list: (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path
        d="M4 5.5h16M4 12h16M4 18.5h10"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path
        d="M12 3a6 6 0 0 0-6 6v3.6l-1.6 3.2a.7.7 0 0 0 .63 1.02h13.94a.7.7 0 0 0 .63-1.02L18 12.6V9a6 6 0 0 0-6-6Zm-2.3 15.5a2.4 2.4 0 0 0 4.6 0"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path d="M9.8 3.9 10.5 2h3l.7 1.9 1.8.8 1.9-.8 2.1 2.1-.8 1.9.8 1.8 2 .7v3l-2 .7-.8 1.8.8 1.9-2.1 2.1-1.9-.8-1.8.8-.7 2h-3l-.7-2-1.8-.8-1.9.8L4 17.8l.8-1.9-.8-1.8-2-.7v-3l2-.7.8-1.8L4 6l2.1-2.1 1.9.8 1.8-.8Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="11.9" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ),
};

const TABS = [
  { to: "/", label: "공고", icon: ICONS.list, end: true },
  { to: "/alerts", label: "내 알림", icon: ICONS.bell, end: false },
  { to: "/settings", label: "설정", icon: ICONS.settings, end: false },
];

export function BottomNav() {
  return (
    <nav className="nav" aria-label="주 메뉴">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => `nav__tab${isActive ? " nav__tab--active" : ""}`}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
