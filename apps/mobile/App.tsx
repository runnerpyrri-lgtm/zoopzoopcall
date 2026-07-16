// 청약봄 네이티브 공고, 다음 행동, 관심 알림, 공식 링크 흐름을 조합한다.
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from "react-native-safe-area-context";
import { BrandHeader } from "./src/components/BrandHeader";
import { InterestControls } from "./src/components/InterestControls";
import { NoticeOverview } from "./src/components/NoticeOverview";
import { NoticeTimeline } from "./src/components/NoticeTimeline";
import { SAMPLE_NOTICE } from "./src/data/sampleNotice";
import { openOfficialApplyHome } from "./src/domain/officialLink";
import {
  cancelNoticeNotifications,
  scheduleNoticeNotifications,
  type NotificationScheduleResult,
} from "./src/notifications/noticeNotifications";
import { loadInterest, removeInterest, saveInterest } from "./src/storage/interests";
import { colors } from "./src/theme";

function scheduleFeedback(result: NotificationScheduleResult): string {
  switch (result.kind) {
    case "scheduled":
      return `관심 공고로 저장하고 남은 일정 ${result.notificationIds.length}개를 기기에 예약했습니다.`;
    case "partial":
      return `관심 공고는 저장했습니다. 알림 ${result.notificationIds.length}개를 예약했고 ${result.failedCount}개는 기기에서 예약하지 못했습니다.`;
    case "permission-denied":
      return "관심 공고로 저장했습니다. 알림 권한이 허용되지 않아 예약은 건너뛰었지만 나머지 기능은 그대로 사용할 수 있습니다.";
    case "no-upcoming":
      return "관심 공고로 저장했습니다. 앞으로 남은 샘플 알림 일정은 없습니다.";
    case "unavailable":
      return "관심 공고로 저장했습니다. 이 기기에서는 알림을 준비하지 못했지만 나머지 기능은 그대로 사용할 수 있습니다.";
  }
}

export function App() {
  const [interested, setInterested] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadInterest(SAMPLE_NOTICE.id).then((record) => {
      if (!active) return;
      setInterested(Boolean(record));
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleSchedule(): Promise<void> {
    setBusy(true);
    setFeedback(null);

    const previous = await loadInterest(SAMPLE_NOTICE.id);
    await cancelNoticeNotifications(previous?.notificationIds ?? []);
    const result = await scheduleNoticeNotifications(SAMPLE_NOTICE);
    const notificationsStored = await saveInterest(SAMPLE_NOTICE.id, result.notificationIds);
    setInterested(true);

    if (!notificationsStored) {
      await cancelNoticeNotifications(result.notificationIds);
    }
    const storageSuffix = notificationsStored
      ? ""
      : " 기기 관심 목록 저장을 완료하지 못해 새 예약은 정리했지만 앱은 계속 사용할 수 있습니다.";

    setFeedback(`${scheduleFeedback(result)}${storageSuffix}`);
    setBusy(false);
  }

  async function handleRemove(): Promise<void> {
    setBusy(true);
    const current = await loadInterest(SAMPLE_NOTICE.id);
    await cancelNoticeNotifications(current?.notificationIds ?? []);
    const removed = await removeInterest(SAMPLE_NOTICE.id);
    setInterested(false);
    setFeedback(removed
      ? "관심 공고와 예약된 로컬 알림을 해제했습니다."
      : "화면에서는 관심을 해제했습니다. 기기 저장소 정리는 완료하지 못했습니다.");
    setBusy(false);
  }

  async function handleOpenOfficial(): Promise<void> {
    setFeedback("청약홈 공식 페이지를 엽니다.");
    const opened = await openOfficialApplyHome(SAMPLE_NOTICE.officialUrl);
    if (!opened) {
      setFeedback("청약홈을 열지 못했습니다. 네트워크와 기본 브라우저 설정을 확인해 주세요.");
    }
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <SafeAreaView style={styles.safeArea} edges={["top", "right", "bottom", "left"]}>
        <StatusBar style="dark" />
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
        >
          <BrandHeader />
          <NoticeOverview notice={SAMPLE_NOTICE} />
          <NoticeTimeline notice={SAMPLE_NOTICE} now={new Date()} />
          <InterestControls
            interested={interested}
            busy={busy}
            ready={ready}
            feedback={feedback}
            onSchedule={() => void handleSchedule()}
            onRemove={() => void handleRemove()}
            onOpenOfficial={() => void handleOpenOfficial()}
          />
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.page,
  },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
});
