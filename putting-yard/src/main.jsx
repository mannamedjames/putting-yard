import { createRoot } from "react-dom/client";
import "./app.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);

// register the offline service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => { /* offline still works from cache */ });
  });
}
