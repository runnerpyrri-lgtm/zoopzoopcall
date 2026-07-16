// 청약봄의 설치 프롬프트를 앱 시작부터 보관하고 설치·업데이트 상태를 설정 화면에 제공한다.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallOutcome = "accepted" | "dismissed" | "manual";
type UpdateOutcome = "checked" | "ready" | "unsupported" | "failed";

type PwaInstallContextValue = {
  canPrompt: boolean;
  isIosSafari: boolean;
  isStandalone: boolean;
  promptInstall: () => Promise<InstallOutcome>;
  checkForUpdate: () => Promise<UpdateOutcome>;
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

function standaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || standaloneNavigator.standalone === true;
}

function iosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const iosDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /Safari/i.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent);
  return iosDevice && safari;
}

export function PwaInstallProvider({ children }: PropsWithChildren) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(standaloneMode);
  const isIosSafari = iosSafari();

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const syncStandalone = () => setIsStandalone(standaloneMode());
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    displayMode.addEventListener("change", syncStandalone);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      displayMode.removeEventListener("change", syncStandalone);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (!deferredPrompt) return "manual";
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return choice.outcome;
  }, [deferredPrompt]);

  const checkForUpdate = useCallback(async (): Promise<UpdateOutcome> => {
    if (!("serviceWorker" in navigator)) return "unsupported";
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return "unsupported";
      await registration.update();
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        return "ready";
      }
      return "checked";
    } catch {
      return "failed";
    }
  }, []);

  const value = useMemo<PwaInstallContextValue>(() => ({
    canPrompt: deferredPrompt !== null,
    isIosSafari,
    isStandalone,
    promptInstall,
    checkForUpdate,
  }), [checkForUpdate, deferredPrompt, isIosSafari, isStandalone, promptInstall]);

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
}

export function usePwaInstall(): PwaInstallContextValue {
  const value = useContext(PwaInstallContext);
  if (!value) throw new Error("usePwaInstall은 PwaInstallProvider 안에서 사용해야 합니다.");
  return value;
}
