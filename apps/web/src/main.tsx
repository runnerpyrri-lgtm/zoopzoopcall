// 엔트리포인트: 루트 렌더와 서비스워커 등록.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { PwaInstallProvider } from "./pwa/PwaInstallProvider";
import "./generated/robom-family/tokens.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PwaInstallProvider>
      <App />
    </PwaInstallProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((registration) => {
      if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
      registration.addEventListener("updatefound", () => {
        registration.installing?.addEventListener("statechange", () => {
          if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
        });
      });
    });
  });
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}
