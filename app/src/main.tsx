import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { DialogProvider } from "./components/DialogProvider";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <DialogProvider>
        <App />
      </DialogProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
