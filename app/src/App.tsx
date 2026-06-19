import { useCallback, useEffect, useState } from "react";
import {
  checkContentUpdates,
  downloadAndApplyContentUpdate,
  getConfig,
  getPackInfo,
} from "./api";
import { IconSettings } from "./components/icons";
import { Wordmark } from "./components/Wordmark";
import { ToastProvider, useToast } from "./components/Toast";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupPage } from "./pages/SetupPage";
import { StandardsPage } from "./pages/StandardsPage";
import { EvidencePage } from "./pages/EvidencePage";
import type { AppTab, ContentDownloadProgress, PackInfo, UpdateCheckResult } from "./types";

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
  const [downloadingStartup, setDownloadingStartup] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<ContentDownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startupUpdate, setStartupUpdate] = useState<UpdateCheckResult | null>(null);

  const refreshPackInfo = useCallback(async () => {
    const info = await getPackInfo();
    setPackInfo(info);
    return info;
  }, []);

  const applyContentUpdate = useCallback(async () => {
    setDownloadProgress(null);
    const updated = await downloadAndApplyContentUpdate((progress) => {
      if (progress.phase === "idle") {
        setDownloadProgress(null);
        return;
      }
      setDownloadProgress(progress);
    });
    setPackInfo(updated);
    setStartupUpdate(null);
    setDownloadProgress(null);
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
          setDownloadingStartup(true);
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
          } finally {
            setDownloadingStartup(false);
          }
        } else {
          setStartupUpdate(result);
        }
      })
      .catch(() => undefined);
  }, [applyContentUpdate, loading, packInfo?.loaded, showToast]);

  const handleDownloadInitial = async () => {
    setDownloadingInitial(true);
    setDownloadProgress(null);
    setError(null);
    try {
      const updated = await downloadAndApplyContentUpdate((progress) => {
        if (progress.phase === "idle") {
          setDownloadProgress(null);
          return;
        }
        setDownloadProgress(progress);
      });
      setPackInfo(updated);
      setActiveTab("standards");
      showToast(`Standards installed ${updated.content_version ?? ""}`, "success");
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setDownloadingInitial(false);
      setDownloadProgress(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-paper text-brand-muted">
        <Wordmark variant="hero" />
        <p className="text-sm">Starting…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-paper">
      <header className="border-b border-brand-border bg-brand-surface">
        <div className="mx-auto flex w-full max-w-[min(1920px,calc(100%-1rem))] items-center justify-between gap-4 px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-8">
            <Wordmark variant="header" />
            {packInfo?.loaded && (
              <nav className="flex items-center gap-1 border-l border-brand-border pl-6">
                {MAIN_TABS.map((tab) => {
                  const active = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={[
                        "ui-focus-ring relative px-3 py-2 text-sm font-medium transition",
                        active ? "text-brand-ink" : "text-brand-muted hover:text-brand-ink",
                      ].join(" ")}
                    >
                      {tabLabel(tab)}
                      {active && (
                        <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-burgundy" />
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
                ? "bg-brand-navy text-white"
                : "text-brand-muted hover:bg-brand-paper hover:text-brand-ink",
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
            downloading={downloadingInitial || downloadingStartup}
            downloadProgress={downloadProgress}
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
