import { useCallback, useEffect, useState } from "react";
import {
  checkContentUpdates,
  downloadAndApplyContentUpdate,
  getConfig,
  getPackInfo,
} from "./api";
import { IconSettings } from "./components/icons";
import { ToastProvider, useToast } from "./components/Toast";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupPage } from "./pages/SetupPage";
import { StandardsPage } from "./pages/StandardsPage";
import { EvidencePage } from "./pages/EvidencePage";
import type { AppTab, PackInfo, UpdateCheckResult } from "./types";

const EMPTY_PACK_INFO: PackInfo = {
  loaded: false,
  content_version: null,
  vault_commit: null,
  counts: null,
  content_dir: null,
};

const MAIN_TABS: AppTab[] = ["evidence", "standards"];

function tabLabel(tab: AppTab): string {
  switch (tab) {
    case "standards":
      return "Standards";
    case "settings":
      return "Settings";
    default:
      return "Workbench";
  }
}

function AppShell() {
  const { showToast } = useToast();
  const [packInfo, setPackInfo] = useState<PackInfo | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("evidence");
  const [loading, setLoading] = useState(true);
  const [downloadingInitial, setDownloadingInitial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startupUpdate, setStartupUpdate] = useState<UpdateCheckResult | null>(null);

  const refreshPackInfo = useCallback(async () => {
    const info = await getPackInfo();
    setPackInfo(info);
    return info;
  }, []);

  const applyContentUpdate = useCallback(async () => {
    const updated = await downloadAndApplyContentUpdate();
    setPackInfo(updated);
    setStartupUpdate(null);
    return updated;
  }, []);

  useEffect(() => {
    refreshPackInfo()
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => setLoading(false));
  }, [refreshPackInfo]);

  useEffect(() => {
    if (loading) {
      return;
    }

    getConfig()
      .then(async (config) => {
        if (!config.update.check_on_startup) {
          return;
        }
        const result = await checkContentUpdates();
        if (result.status !== "content_available") {
          return;
        }
        if (config.update.auto_download_content) {
          try {
            const updated = await applyContentUpdate();
            showToast(
              packInfo?.loaded
                ? `Standards updated to ${updated.content_version ?? "latest"}`
                : `Standards installed ${updated.content_version ?? ""}`,
              "success",
            );
          } catch {
            setStartupUpdate(result);
          }
        } else {
          setStartupUpdate(result);
        }
      })
      .catch(() => undefined);
  }, [applyContentUpdate, loading, packInfo?.loaded, showToast]);

  const handleDownloadInitial = async () => {
    setDownloadingInitial(true);
    setError(null);
    try {
      const result = await checkContentUpdates();
      if (result.status === "content_available") {
        const updated = await downloadAndApplyContentUpdate();
        setPackInfo(updated);
        setActiveTab("standards");
        showToast(`Standards installed ${updated.content_version ?? ""}`, "success");
        return;
      }
      if (result.status === "up_to_date" && result.current_content_version) {
        setError(
          "The server has no newer content pack. Contact your administrator if nothing is installed locally.",
        );
        return;
      }
      setError(result.message ?? "Unable to download standards. Check your network or access token.");
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setDownloadingInitial(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600">
        Starting Accounting Copilot…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-[min(1920px,calc(100%-1rem))] items-center justify-between gap-4 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-6">
            <h1 className="shrink-0 text-title text-slate-900">Accounting Copilot</h1>
            {packInfo?.loaded && (
              <nav className="flex items-center gap-1">
                {MAIN_TABS.map((tab) => {
                  const active = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={[
                        "ui-focus-ring relative px-3 py-2 text-sm font-medium transition",
                        active ? "text-slate-900" : "text-slate-500 hover:text-slate-800",
                      ].join(" ")}
                    >
                      {tabLabel(tab)}
                      {active && (
                        <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-slate-900" />
                      )}
                    </button>
                  );
                })}
              </nav>
            )}
          </div>

          <button
            type="button"
            title="Settings"
            aria-label="Settings"
            onClick={() => setActiveTab("settings")}
            className={[
              "ui-focus-ring rounded-lg p-2 transition",
              activeTab === "settings"
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
            ].join(" ")}
          >
            <IconSettings className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[min(1920px,calc(100%-1rem))] px-3 py-4 sm:px-4">
        {startupUpdate?.available_content && packInfo?.loaded && activeTab !== "settings" && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            <p>
              New standards version{" "}
              <strong>{startupUpdate.available_content.latest_version}</strong> is available in
              Settings.
            </p>
            <button
              type="button"
              onClick={() => setActiveTab("settings")}
              className="ui-focus-ring rounded-lg bg-emerald-900 px-3 py-1.5 text-white hover:bg-emerald-800"
            >
              Open Settings
            </button>
          </div>
        )}
        {activeTab === "settings" ? (
          <SettingsPage
            packInfo={packInfo ?? EMPTY_PACK_INFO}
            onPackUpdated={setPackInfo}
          />
        ) : !packInfo?.loaded ? (
          <SetupPage
            onDownloadInitial={handleDownloadInitial}
            downloading={downloadingInitial}
            error={error}
            onOpenSettings={() => setActiveTab("settings")}
          />
        ) : (
          <>
            {activeTab === "standards" && (
              <div className="h-[calc(100vh-4.5rem)]">
                <StandardsPage />
              </div>
            )}
            {activeTab === "evidence" && (
              <div className="h-[calc(100vh-4.5rem)]">
                <EvidencePage onOpenSettings={() => setActiveTab("settings")} />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}

export default App;
