import { useCallback, useEffect, useState } from "react";
import { getPackInfo, pickAndImportContentPack } from "./api";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupPage } from "./pages/SetupPage";
import { StandardsPage } from "./pages/StandardsPage";
import { EvidencePage } from "./pages/EvidencePage";
import { ProjectsPage } from "./pages/ProjectsPage";
import type { AppTab, PackInfo } from "./types";

function App() {
  const [packInfo, setPackInfo] = useState<PackInfo | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("standards");
  const [evidenceFilePath, setEvidenceFilePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPackInfo = useCallback(async () => {
    const info = await getPackInfo();
    setPackInfo(info);
    return info;
  }, []);

  useEffect(() => {
    refreshPackInfo()
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => setLoading(false));
  }, [refreshPackInfo]);

  const handlePickImport = async () => {
    setImporting(true);
    setError(null);
    try {
      const updated = await pickAndImportContentPack();
      setPackInfo(updated);
      setActiveTab("standards");
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : String(caught);
      if (message !== "Import cancelled") {
        setError(message);
      }
    } finally {
      setImporting(false);
    }
  };

  const openInEvidence = (filePath: string) => {
    setEvidenceFilePath(filePath);
    setActiveTab("evidence");
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
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              AccoutingStandards Desktop
            </p>
            <h1 className="text-lg font-semibold text-slate-900">双准则证据工作台</h1>
          </div>
          {packInfo?.loaded && (
            <nav className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("standards")}
                className={[
                  "rounded-full px-4 py-2 text-sm font-medium",
                  activeTab === "standards"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                ].join(" ")}
              >
                准则库
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("evidence")}
                className={[
                  "rounded-full px-4 py-2 text-sm font-medium",
                  activeTab === "evidence"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                ].join(" ")}
              >
                Evidence
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("projects")}
                className={[
                  "rounded-full px-4 py-2 text-sm font-medium",
                  activeTab === "projects"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                ].join(" ")}
              >
                项目
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("settings")}
                className={[
                  "rounded-full px-4 py-2 text-sm font-medium",
                  activeTab === "settings"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                ].join(" ")}
              >
                设置
              </button>
            </nav>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {!packInfo?.loaded ? (
          <SetupPage
            onPickImport={handlePickImport}
            importing={importing}
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
              <EvidencePage
                initialFilePath={evidenceFilePath}
                onInitialFilePathConsumed={() => setEvidenceFilePath(null)}
              />
            </div>
            <div className={activeTab === "projects" ? "h-[calc(100vh-8.5rem)]" : "hidden"}>
              <ProjectsPage onOpenInEvidence={openInEvidence} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
