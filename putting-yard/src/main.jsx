import { createRoot } from "react-dom/client";
import "./app.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);

// register the offline service worker, and notice when a new version deploys
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js");

      // check for a new build every time the app is opened or refocused
      const check = () => reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });

      reg.addEventListener("updatefound", () => {
        const fresh = reg.installing;
        if (!fresh) return;
        fresh.addEventListener("statechange", () => {
          // a new version is ready and an old one is currently in control
          if (fresh.state === "installed" && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent("app-update-ready"));
          }
        });
      });

      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });

      window.addEventListener("app-apply-update", () => {
        reg.waiting?.postMessage("skip-waiting");
        if (!reg.waiting) window.location.reload();
      });
    } catch { /* offline still works from cache */ }
  });
}
