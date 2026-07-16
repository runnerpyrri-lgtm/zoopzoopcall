// 청약봄의 동의 기반 개인정보 최소 분석을 공급자 없이 안전하게 연결한다.
import appMeta from "../generated/robom-family/app-meta.json";
import { familyEventNames, type FamilyEventName } from "../generated/robom-family/analytics-events";
import packageInfo from "../../package.json";

const CONSENT_KEY = "robom-family:analytics-consent";
const ANONYMOUS_ID_KEY = "homebom:analytics-id:v1";
const EVENT_NAMES = new Set<string>(familyEventNames);

export type FamilyAnalyticsSurface = "notice-list" | "notice-detail" | "alerts" | "settings";

function safeStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeStorageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // 저장소 접근 실패는 앱 기능에 영향을 주지 않는다.
  }
}

function analyticsEndpoint(): string | null {
  const value = import.meta.env.VITE_ANALYTICS_ENDPOINT?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function anonymousId(): string | null {
  const existing = safeStorageGet(ANONYMOUS_ID_KEY);
  if (existing) return existing;
  const value = globalThis.crypto?.randomUUID?.();
  if (!value || !safeStorageSet(ANONYMOUS_ID_KEY, value)) return null;
  return value;
}

function coarsePlatform(): "android" | "ios" | "web" {
  if (/android/i.test(navigator.userAgent)) return "android";
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return "ios";
  return "web";
}

export function analyticsConsentGranted(): boolean {
  return safeStorageGet(CONSENT_KEY) === "granted";
}

export function analyticsEndpointConfigured(): boolean {
  return analyticsEndpoint() !== null;
}

export function setAnalyticsConsent(granted: boolean): boolean {
  const saved = safeStorageSet(CONSENT_KEY, granted ? "granted" : "denied");
  if (!granted) safeStorageRemove(ANONYMOUS_ID_KEY);
  return saved;
}

export async function trackFamilyEvent(eventName: FamilyEventName, surface: FamilyAnalyticsSurface): Promise<void> {
  const endpoint = analyticsEndpoint();
  if (!analyticsConsentGranted() || !endpoint || !EVENT_NAMES.has(eventName)) return;
  const id = anonymousId();
  if (!id) return;

  const payload = {
    event_name: eventName,
    app_id: appMeta.id,
    app_version: packageInfo.version,
    platform: coarsePlatform(),
    surface,
    session_kind: "guest",
    anonymous_id: id,
    timestamp: new Date().toISOString(),
    campaign: "",
    family_spec_version: appMeta.familySpecVersion,
  };

  try {
    await fetch(endpoint, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // 분석 공급자 장애는 공고 탐색·알림·신청 링크에 영향을 주지 않는다.
  }
}
