import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { WidgetWindow } from "./WidgetWindow";
import { WidgetTipWindow } from "./WidgetTipWindow";
import "./styles.css";
import { useRuntimeStore } from "./core/store";
import { mockViews } from "./fixtures";

if (import.meta.env.VITE_MOCK === "1") {
  useRuntimeStore.getState().patchConfig({ trackers: mockViews.map(view => ({
    id: view.trackerId, providerId: view.providerId, name: view.displayName, enabled: true,
  })) });
}

const isWidgetWindow = window.location.hash === "#widget";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isWidgetWindow ? <WidgetWindow /> : window.location.hash === "#widget-tip" ? <WidgetTipWindow /> : <App />}</React.StrictMode>,
);
