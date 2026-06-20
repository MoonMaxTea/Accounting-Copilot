import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { DialogProvider } from "./components/DialogProvider";
import { PreferencesProvider } from "./context/PreferencesContext";
import { applyThemeClass, loadTheme } from "./lib/preferences";
import "./index.css";

applyThemeClass(loadTheme());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <PreferencesProvider>
        <DialogProvider>
          <App />
        </DialogProvider>
      </PreferencesProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
