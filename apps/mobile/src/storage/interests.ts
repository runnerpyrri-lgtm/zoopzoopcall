// 네이티브 관심 공고와 예약 알림 ID를 웹 저장 키와 분리해 보관한다.
import AsyncStorage from "@react-native-async-storage/async-storage";

export const NATIVE_INTERESTS_KEY = "homebom:native:interests:v1";

export type InterestRecord = {
  noticeId: string;
  notificationIds: string[];
  savedAt: string;
};

type InterestMap = Record<string, InterestRecord>;

async function loadInterestMap(): Promise<InterestMap> {
  try {
    const raw = await AsyncStorage.getItem(NATIVE_INTERESTS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as InterestMap
      : {};
  } catch {
    return {};
  }
}

export async function loadInterest(noticeId: string): Promise<InterestRecord | undefined> {
  const interests = await loadInterestMap();
  const record = interests[noticeId];
  if (!record || record.noticeId !== noticeId || !Array.isArray(record.notificationIds)) return undefined;
  return record;
}

export async function saveInterest(noticeId: string, notificationIds: string[]): Promise<boolean> {
  try {
    const interests = await loadInterestMap();
    interests[noticeId] = {
      noticeId,
      notificationIds,
      savedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(NATIVE_INTERESTS_KEY, JSON.stringify(interests));
    return true;
  } catch {
    return false;
  }
}

export async function removeInterest(noticeId: string): Promise<boolean> {
  try {
    const interests = await loadInterestMap();
    delete interests[noticeId];
    await AsyncStorage.setItem(NATIVE_INTERESTS_KEY, JSON.stringify(interests));
    return true;
  } catch {
    return false;
  }
}
