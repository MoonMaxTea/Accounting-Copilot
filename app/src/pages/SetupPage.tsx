import { useEffect, useState } from "react";
import { getConfig, saveUpdateConfig } from "../api";
import { ContentDownloadProgressBar } from "../components/ContentDownloadProgressBar";
import { Wordmark } from "../components/Wordmark";
import { usePreferences } from "../context/PreferencesContext";
import type { ContentDownloadProgress, UpdateConfig } from "../types";

interface SetupPageProps {
  onDownloadInitial: () => Promise<void>;
  downloading: boolean;
  downloadProgress: ContentDownloadProgress | null;
  error: string | null;
  onOpenSettings?: () => void;
}

const defaultUpdateConfig: UpdateConfig = {
  manifest_url:
    "https://raw.githubusercontent.com/MoonMaxTea/Accounting-Copilot/main/updates/manifest.json",
  check_on_startup: true,
  auto_download_content: true,
  last_content_version: null,
  last_update_check_secs: null,
  access_token: null,
};

export function SetupPage({
  onDownloadInitial,
  downloading,
  downloadProgress,
  error,
  onOpenSettings,
}: SetupPageProps) {
  const { tr, trf } = usePreferences();
  const [updateConfig, setUpdateConfig] = useState<UpdateConfig>(defaultUpdateConfig);
  const [savingToken, setSavingToken] = useState(false);
  const [tokenNotice, setTokenNotice] = useState<string | null>(null);

  const steps = [
    { id: 1, title: tr("step1Title") },
    { id: 2, title: tr("step2Short") },
    { id: 3, title: tr("step3Short") },
  ];

  useEffect(() => {
    getConfig()
      .then((config) => setUpdateConfig(config.update))
      .catch(() => undefined);
  }, []);

  const handleSaveToken = async () => {
    setSavingToken(true);
    setTokenNotice(null);
    try {
      const config = await saveUpdateConfig(updateConfig);
      setUpdateConfig(config.update);
      setTokenNotice(tr("tokenSaved"));
    } catch (caught: unknown) {
      setTokenNotice(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSavingToken(false);
    }
  };

  const handleDownload = async () => {
    setTokenNotice(null);
    try {
      await saveUpdateConfig(updateConfig);
      await onDownloadInitial();
    } catch (caught: unknown) {
      setTokenNotice(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center px-6">
      <div className="mb-8">
        <Wordmark variant="hero" />
        <h1 className="mt-6 text-xl font-semibold text-brand-ink">{tr("getStartedTitle")}</h1>
      </div>

      <ol className="mb-8 grid gap-3 sm:grid-cols-3">
        {steps.map((step) => (
          <li
            key={step.id}
            className={[
              "rounded-lg border px-4 py-3",
              step.id === 1
                ? "border-brand-accent bg-brand-accent text-white"
                : "border-brand-border bg-brand-surface text-brand-muted",
            ].join(" ")}
          >
            <p className="text-caption font-medium">{trf("stepLabel", { n: step.id })}</p>
            <p className="mt-1 text-sm font-medium">{step.title}</p>
          </li>
        ))}
      </ol>

      <div className="ui-panel rounded-lg p-8 shadow-sm">
        <h2 className="text-title text-brand-ink">{tr("setupStep1Heading")}</h2>
        <p className="mt-3 text-body text-brand-muted">{tr("setupStep1Body")}</p>

        <label className="mt-6 block space-y-2">
          <span className="text-sm font-medium text-brand-ink">{tr("githubTokenLabel")}</span>
          <input
            type="password"
            value={updateConfig.access_token ?? ""}
            onChange={(event) =>
              setUpdateConfig((current) => ({
                ...current,
                access_token: event.target.value || null,
              }))
            }
            placeholder="ghp_� or github_pat_�"
            className="ui-input ui-focus-ring w-full rounded-lg px-4 py-2 text-sm"
          />
          <span className="block text-caption text-brand-muted">{tr("githubTokenHint")}</span>
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={savingToken}
            onClick={() => void handleSaveToken()}
            className="ui-btn-secondary ui-focus-ring rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {savingToken ? tr("saving") : tr("saveToken")}
          </button>
        </div>

        {(tokenNotice || error) && (
          <p className={`mt-3 text-sm ${error ? "text-red-600 dark:text-red-400" : "text-brand-muted"}`}>
            {error ?? tokenNotice}
          </p>
        )}

        <div className="mt-8 border-t border-brand-border pt-6">
          <button
            type="button"
            disabled={downloading}
            onClick={() => void handleDownload()}
            className="btn-primary ui-focus-ring rounded-lg px-6 py-3 text-sm font-medium disabled:cursor-not-allowed"
          >
            {downloading ? tr("downloading") : tr("downloadStandardsPack")}
          </button>
          {downloading && (
            <ContentDownloadProgressBar progress={downloadProgress} pending={!downloadProgress} />
          )}
        </div>

        <div className="mt-8 rounded-lg bg-brand-paper p-4 text-caption text-brand-muted">
          <p className="font-medium text-brand-ink">{tr("afterInstallation")}</p>
          <p className="mt-1">{tr("afterInstallationBody")}</p>
          <p className="mt-1">{tr("afterInstallationStep2")}</p>
          <p className="mt-1">{tr("afterInstallationStep3")}</p>
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="ui-focus-ring mt-3 text-sm font-medium text-brand-ink underline"
            >
              {tr("openSettings")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
