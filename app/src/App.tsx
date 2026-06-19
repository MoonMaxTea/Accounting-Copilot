import { useCallback, useEffect, useState } from "react";
import {
  checkContentUpdates,
  downloadAndApplyContentUpdate,
  getConfig,
  getPackInfo,
} from "./api";
import { ToastProvider, useToast } from "./components/Toast";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupPage } from "./pages/SetupPage";
import { StandardsPage } from "./pages/StandardsPage";
import { EvidencePage } from "./pages/EvidencePage";
import type { AppTab, PackInfo, UpdateCheckResult } from "./types";

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
                ? `准则库已更新至 ${updated.content_version ?? "最新版本"}`
                : `准则库已安装 ${updated.content_version ?? ""}`,
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
        showToast(`准则库已安装 ${updated.content_version ?? ""}`, "success");
        return;
      }
      if (result.status === "up_to_date" && result.current_content_version) {
        setError("服务器未提供比当前更高的版本；若本地尚未安装，请联系管理员发布 content pack。");
        return;
      }
      setError(result.message ?? "暂时无法下载准则库，请检查网络或访问令牌。");
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setDownloadingInitial(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600">
        正在启动 AccoutingStandards Desktop…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-[min(1920px,calc(100%-1rem))] items-center justify-between px-3 py-3 sm:px-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              AccoutingStandards Desktop
            </p>
            <h1 className="text-lg font-semibold text-slate-900">双准则证据工作台</h1>
          </div>
          {packInfo?.loaded && (
            <nav className="flex items-center gap-2">
              {(["standards", "evidence", "settings"] as AppTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={[
                    "rounded-full px-4 py-2 text-sm font-medium capitalize",
                    activeTab === tab
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100",
                  ].join(" ")}
                >
                  {tab === "standards" ? "准则库" : tab === "settings" ? "设置" : "Evidence"}
                </button>
              ))}
            </nav>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[min(1920px,calc(100%-1rem))] px-3 py-4 sm:px-4">
        {startupUpdate?.available_content && packInfo?.loaded && activeTab !== "settings" && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            <p>
              发现新的准则库版本{" "}
              <strong>{startupUpdate.available_content.latest_version}</strong>
              ，可在设置页下载安装。
            </p>
            <button
              type="button"
              onClick={() => setActiveTab("settings")}
              className="rounded-lg bg-emerald-900 px-3 py-1.5 text-white hover:bg-emerald-800"
            >
              前往设置
            </button>
          </div>
        )}
        {!packInfo?.loaded ? (
          <SetupPage
            onDownloadInitial={handleDownloadInitial}
            downloading={downloadingInitial}
            error={error}
          />
        ) : activeTab === "settings" ? (
          <SettingsPage packInfo={packInfo} onPackUpdated={setPackInfo} />
        ) : (
          <>
            <div className={activeTab === "standards" ? "h-[calc(100vh-8.5rem)]" : "hidden"}>
              <StandardsPage />
            </div>
            <div className={activeTab === "evidence" ? "h-[calc(100vh-8.5rem)]" : "hidden"}>
              <EvidencePage />
            </div>
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
