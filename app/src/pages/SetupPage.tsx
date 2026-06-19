import { useEffect, useState } from "react";
import { getConfig, saveUpdateConfig } from "../api";
import { ContentDownloadProgressBar } from "../components/ContentDownloadProgressBar";
import { Wordmark } from "../components/Wordmark";
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

const STEPS = [
  { id: 1, title: "Install standards pack" },
  { id: 2, title: "Choose project folder" },
  { id: 3, title: "Configure AI (optional)" },
];

export function SetupPage({
  onDownloadInitial,
  downloading,
  downloadProgress,
  error,
  onOpenSettings,
}: SetupPageProps) {
  const [updateConfig, setUpdateConfig] = useState<UpdateConfig>(defaultUpdateConfig);
  const [savingToken, setSavingToken] = useState(false);
  const [tokenNotice, setTokenNotice] = useState<string | null>(null);

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
      setTokenNotice("Access token saved locally.");
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
        <h1 className="mt-6 text-xl font-semibold text-brand-ink">Get started in three steps</h1>
      </div>

      <ol className="mb-8 grid gap-3 sm:grid-cols-3">
        {STEPS.map((step) => (
          <li
            key={step.id}
            className={[
              "rounded-lg border px-4 py-3",
              step.id === 1
                ? "border-brand-navy bg-brand-navy text-white"
                : "border-brand-border bg-brand-surface text-brand-muted",
            ].join(" ")}
          >
            <p className="text-caption font-medium">Step {step.id}</p>
            <p className="mt-1 text-sm font-medium">{step.title}</p>
          </li>
        ))}
      </ol>

      <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-title text-slate-900">Step 1 · Install the official standards pack</h2>
        <p className="mt-3 text-body text-slate-600">
          Accounting Copilot uses the official IFRS / IAS / ASC content pack. Manual zip import is
          not supported.
        </p>

        <label className="mt-6 block space-y-2">
          <span className="text-sm font-medium text-slate-800">
            GitHub access token (required for private repos)
          </span>
          <input
            type="password"
            value={updateConfig.access_token ?? ""}
            onChange={(event) =>
              setUpdateConfig((current) => ({
                ...current,
                access_token: event.target.value || null,
              }))
            }
            placeholder="ghp_… or github_pat_…"
            className="ui-focus-ring w-full rounded-lg border border-slate-300 px-4 py-2 text-sm"
          />
          <span className="block text-caption text-slate-500">
            Use a token with Contents read access. It is stored only on this device. You can change
            it later in Settings.
          </span>
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={savingToken}
            onClick={() => void handleSaveToken()}
            className="ui-focus-ring rounded-lg px-4 py-2 text-sm font-medium ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
          >
            {savingToken ? "Saving…" : "Save token"}
          </button>
        </div>

        {(tokenNotice || error) && (
          <p className={`mt-3 text-sm ${error ? "text-red-600" : "text-slate-600"}`}>
            {error ?? tokenNotice}
          </p>
        )}

        <div className="mt-8 border-t border-slate-100 pt-6">
          <button
            type="button"
            disabled={downloading}
            onClick={() => void handleDownload()}
            className="btn-primary ui-focus-ring rounded-lg px-6 py-3 text-sm font-medium disabled:cursor-not-allowed"
          >
            {downloading ? "Downloading…" : "Download standards pack"}
          </button>
          {downloading && (
            <ContentDownloadProgressBar progress={downloadProgress} pending={!downloadProgress} />
          )}
        </div>

        <div className="mt-8 rounded-lg bg-slate-50 p-4 text-caption text-slate-600">
          <p className="font-medium text-slate-800">After installation</p>
          <p className="mt-1">
            When the download finishes, the app opens the <strong>Standards</strong> tab automatically.
            Use the top navigation for <strong>Workbench</strong> and <strong>Standards</strong>, and the
            gear icon for <strong>Settings</strong>.
          </p>
          <p className="mt-1">
            Step 2: In Settings, choose a folder to use as your project workspace.
          </p>
          <p className="mt-1">Step 3: add your AI provider and API key (optional).</p>
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="ui-focus-ring mt-3 text-sm font-medium text-slate-900 underline"
            >
              Open Settings
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
