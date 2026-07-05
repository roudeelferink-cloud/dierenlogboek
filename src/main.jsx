import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service worker alleen in productie registreren; in dev zit Vite ertussen.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + "sw.js")
      .catch((e) => console.error("SW-registratie mislukt:", e));

    // Nieuwe SW (skipWaiting) neemt de controle over → één keer herladen
    // zodat de nieuwe versie direct zichtbaar is en nooit blijft hangen.
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}
