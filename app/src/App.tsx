import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  checkContentUpdates,
  downloadAndApplyContentUpdate,
  getConfig,
  getPackInfo,
} from "./api";
import { TitleBar } from "./components/TitleBar";
import { Wordmark } from "./components/Wordmark";
import { ToastProvider, useToast } from "./components/Toast";
import { usePreferences } from "./context/PreferencesContext";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupPage } from "./pages/SetupPage";
import { StandardsPage } from "./pages/StandardsPage";
import { EvidencePage } from "./pages/EvidencePage";
import type {
  AiGenerationProgress,
  AppTab,
  ContentDownloadProgress,
  PackInfo,
  UpdateCheckResult,
} from "./types";

const EMPTY_PACK_INFO: PackInfo = {
  loaded: false,
  content_version: null,
  vault_commit: null,
  counts: null,
  content_dir: null,
};

const MAIN_TABS: AppTab[] = ["evidence", "standards"];

function AppShell() {
  const { showToast } = useToast();
  const { tr, trf } = usePreferences();
  const [packInfo, setPackInfo] = useState<PackInfo | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("evidence");
  const [loading, setLoading] = useState(true);
  const [downloadingInitial, setDownloadingInitial] = useState(false);
  const [downloadingStartup, setDownloadingStartup] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<ContentDownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startupUpdate, setStartupUpdate] = useState<UpdateCheckResult | null>(null);
  const [genProgress, setGenProgress] = useState<AiGenerationProgress | null>(null);
  const [genResultPath, setGenResultPath] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [genCounter, setGenCounter] = useState(0);

  useEffect(() => {
    const unlisten = listen<AiGenerationProgress>("ai-generation-progress", (event) => {
      const p = event.payload;
      setGenProgress(p);
      if (p.phase === "complete") {
        setGenResultPath(p.message);
        setGenError(null);
        setGenCounter((prev) => prev + 1);
      } else if (p.phase === "error") {
        setGenError(p.message);
        setGenProgress(null);
        setGenCounter((prev) => prev + 1);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const tabLabel = useCallback(
    (tab: AppTab): string => {
      switch (tab) {
        case "standards":
          return tr("standards");
        case "settings":
          return tr("settings");
        default:
          return tr("workbench");
      }
    },
    [tr],
  );

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
      <div className="flex h-screen flex-col bg-brand-paper text-brand-muted">
        <TitleBar
          settingsActive={false}
          onOpenSettings={() => setActiveTab("settings")}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <Wordmark variant="hero" />
          <p className="text-sm">{tr("starting")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-brand-paper text-brand-ink">
      <TitleBar
        settingsActive={activeTab === "settings"}
        onOpenSettings={() => setActiveTab("settings")}
      />

      <header className="shrink-0 border-b border-brand-border bg-brand-surface">
        <div className="mx-auto flex w-full max-w-[min(1920px,calc(100%-1rem))] items-center gap-8 px-3 py-2.5 sm:px-4">
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
                      <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-accent" />
                    )}
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </header>

      <main className="mx-auto min-h-0 w-full max-w-[min(1920px,calc(100%-1rem))] flex-1 overflow-auto px-3 py-4 sm:px-4">
        {startupUpdate?.available_content && packInfo?.loaded && activeTab !== "settings" && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            <p>
              {trf("newStandardsAvailable", {
                version: startupUpdate.available_content.latest_version,
              })}
            </p>
            <button
              type="button"
              onClick={() => setActiveTab("settings")}
              className="ui-focus-ring rounded-lg bg-emerald-900 px-3 py-1.5 text-white hover:bg-emerald-800"
            >
              {tr("openSettings")}
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
              <div className="h-full min-h-[calc(100vh-6.5rem)]">
                <StandardsPage />
              </div>
            )}
            {activeTab === "evidence" && (
              <div className="h-full min-h-[calc(100vh-6.5rem)]">
                <EvidencePage
                  onOpenSettings={() => setActiveTab("settings")}
                  genProgress={genProgress}
                  genError={genError}
                  genResultPath={genResultPath}
                  genCounter={genCounter}
                  onGenConsumed={() => {
                    setGenProgress(null);
                    setGenError(null);
                    setGenResultPath(null);
                  }}
                />
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
