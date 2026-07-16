// 관심 저장, 로컬 알림 재설정, 관심 해제, 청약홈 이동 버튼을 제공한다.
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

type Props = {
  interested: boolean;
  busy: boolean;
  ready: boolean;
  feedback: string | null;
  onSchedule: () => void;
  onRemove: () => void;
  onOpenOfficial: () => void;
};

export function InterestControls({
  interested,
  busy,
  ready,
  feedback,
  onSchedule,
  onRemove,
  onOpenOfficial,
}: Props) {
  const disabled = busy || !ready;

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>관심 공고 알림</Text>
      <Text style={styles.helper}>알림 권한은 아래 버튼을 누른 뒤에만 요청합니다. 거부해도 공고 일정과 청약홈 링크는 계속 사용할 수 있습니다.</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={busy ? "관심 공고 알림 설정 중" : interested ? "관심 공고 알림 다시 설정" : "관심 공고 저장하고 알림 받기"}
        accessibilityHint="알림 권한을 확인하고 남은 접수, 발표, 계약 일정을 기기에 예약합니다"
        disabled={disabled}
        onPress={onSchedule}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, disabled && styles.disabled]}
      >
        {busy ? <ActivityIndicator color="#FFFFFF" /> : (
          <Text style={styles.primaryLabel}>{interested ? "알림 다시 설정" : "관심 공고 저장 · 알림 받기"}</Text>
        )}
      </Pressable>

      {interested && (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onRemove}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, busy && styles.disabled]}
        >
          <Text style={styles.secondaryLabel}>관심 해제와 예약 취소</Text>
        </Pressable>
      )}

      <Pressable
        accessibilityRole="link"
        accessibilityHint="기기 기본 브라우저에서 청약홈 공식 페이지를 엽니다"
        disabled={busy}
        onPress={onOpenOfficial}
        style={({ pressed }) => [styles.linkButton, pressed && styles.pressed, busy && styles.disabled]}
      >
        <Text style={styles.linkLabel}>청약홈 공식 페이지 열기 ↗</Text>
      </Pressable>

      {feedback && (
        <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 28,
    paddingBottom: 18,
  },
  heading: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  helper: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  primaryButton: {
    minHeight: 54,
    marginTop: 14,
    paddingHorizontal: 18,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentDeep,
  },
  primaryLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 52,
    marginTop: 10,
    paddingHorizontal: 18,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  secondaryLabel: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "800",
  },
  linkButton: {
    minHeight: 52,
    marginTop: 10,
    paddingHorizontal: 18,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.heroStrong,
  },
  linkLabel: {
    color: colors.accentDeep,
    fontSize: 15,
    fontWeight: "800",
  },
  feedback: {
    marginTop: 12,
    padding: 13,
    borderRadius: 14,
    overflow: "hidden",
    color: colors.ink,
    backgroundColor: colors.warningSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.5,
  },
});
