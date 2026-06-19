import { useEffect, useState } from "react";
import {
  checkContentUpdates,
  downloadAndApplyContentUpdate,
  getAppVersion,
  getConfig,
  pickProjectsDir,
  saveAiConfig,
  saveUpdateConfig,
} from "../api";
import type { AiConfig, PackInfo, UpdateCheckResult, UpdateConfig } from "../types";

interface SettingsPageProps {
  packInfo: PackInfo;
  onPackUpdated: (packInfo: PackInfo) => void;
}

function formatCheckedAt(secs: number | null): string {
  if (!secs) {
    return "Not checked yet";
  }
  return new Date(secs * 1000).toLocaleString(undefined);
}

function updateStatusLabel(result: UpdateCheckResult | null): string | null {
  if (!result) {
    return null;
  }
  if (result.message) {
    return result.message;
  }
  switch (result.status) {
    case "up_to_date":
      return "The standards library is up to date.";
    case "content_available":
      return "A new standards library version is available.";
    case "app_update_required":
      return "Please update the app first.";
    case "error":
      return "Update check failed.";
    default:
      return null;
  }
}

function updateStatusClass(status: string): string {
  switch (status) {
    case "content_available":
      return "border-emerald-200 bg-emerald-50 text-emerald-950";
    case "error":
    case "app_update_required":
      return "border-amber-200 bg-amber-50 text-amber-950";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export function SettingsPage({ packInfo, onPackUpdated }: SettingsPageProps) {
  const [appVersion, setAppVersion] = useState("0.1.0");
  const [projectsDir, setProjectsDir] = useState<string | null>(null);
  const [updateConfig, setUpdateConfig] = useState<UpdateConfig>({
    manifest_url:
      "https://raw.githubusercontent.com/MoonMaxTea/Accounting-standards-Desktop/main/updates/manifest.json",
    check_on_startup: true,
    auto_download_content: true,
    last_content_version: null,
    last_update_check_secs: null,
    access_token: null,
  });
  const [aiConfig, setAiConfig] = useState<AiConfig>({
    provider: "openai",
    api_key: null,
    base_url: "https://api.openai.com/v1",
    model: "gpt-4o",
    allow_legacy_citations: false,
  });
  const [updateStatus, setUpdateStatus] = useState<UpdateCheckResult | null>(null);
  const [pickingProjectsDir, setPickingProjectsDir] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [savingUpdateConfig, setSavingUpdateConfig] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    getAppVersion().then(setAppVersion).catch(() => undefined);
    getConfig()
      .then((config) => {
        setProjectsDir(config.projects_dir);
        setAiConfig(config.ai);
        setUpdateConfig(config.update);
      })
      .catch(() => undefined);
  }, []);

  const handlePickProjectsDir = async () => {
    setPickingProjectsDir(true);
    setNotice(null);
    try {
      const config = await pickProjectsDir();
      setProjectsDir(config.projects_dir);
      setNotice("Projects folder updated.");
    } catch (caught: unknown) {
      const text = caught instanceof Error ? caught.message : String(caught);
      if (text !== "选择已取消") {
        setNotice(text);
      }
    } finally {
      setPickingProjectsDir(false);
    }
  };

  const handleSaveAiConfig = async () => {
    setSavingAi(true);
    setNotice(null);
    try {
      const config = await saveAiConfig(aiConfig);
      setAiConfig(config.ai);
      setNotice("AI settings saved.");
    } catch (caught: unknown) {
      setNotice(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSavingAi(false);
    }
  };

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    setNotice(null);
    try {
      const result = await checkContentUpdates();
      setUpdateStatus(result);
      setUpdateConfig((current) => ({
        ...current,
        last_update_check_secs: result.checked_at_secs,
      }));
    } catch (caught: unknown) {
      setNotice(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleApplyUpdate = async () => {
    setApplyingUpdate(true);
    setNotice(null);
    try {
      const updated = await downloadAndApplyContentUpdate();
      onPackUpdated(updated);
      setUpdateStatus(null);
      setUpdateConfig((current) => ({
        ...current,
        last_content_version: updated.content_version,
      }));
      setNotice(`Standards library updated to ${updated.content_version ?? "the latest version"}.`);
    } catch (caught: unknown) {
      setNotice(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setApplyingUpdate(false);
    }
  };

  const handleSaveUpdateConfig = async () => {
    setSavingUpdateConfig(true);
    setNotice(null);
    try {
      const config = await saveUpdateConfig(updateConfig);
      setUpdateConfig(config.update);
      setNotice("Update settings saved.");
    } catch (caught: unknown) {
      setNotice(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSavingUpdateConfig(false);
    }
  };

  const availableUpdate = updateStatus?.available_content ?? null;
  const statusText = updateStatusLabel(updateStatus);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Version info</h2>
        <dl className="mt-4 grid gap-3 text-sm text-slate-700">
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
            <dt>App version</dt>
            <dd className="font-medium">{appVersion}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
            <dt>Standards library version</dt>
            <dd className="font-medium">{packInfo.content_version ?? "Not imported"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
            <dt>Vault commit</dt>
            <dd className="font-medium">{packInfo.vault_commit ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Local directory</dt>
            <dd className="max-w-md truncate font-medium">{packInfo.content_dir ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Standards library updates</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          The standards library can only be installed through official update channels. The app
          verifies format and integrity automatically. Manual zip imports are not supported.
        </p>
        <dl className="mt-4 grid gap-3 text-sm text-slate-700">
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
            <dt>Last checked</dt>
            <dd className="font-medium">
              {formatCheckedAt(
                updateStatus?.checked_at_secs ?? updateConfig.last_update_check_secs,
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
            <dt>Current version</dt>
            <dd className="font-medium">
              {updateStatus?.current_content_version ?? packInfo.content_version ?? "Not imported"}
            </dd>
          </div>
        </dl>

        {updateStatus && statusText && (
          <div
            className={`mt-4 rounded-lg border px-4 py-3 text-sm ${updateStatusClass(updateStatus.status)}`}
          >
            <p className="font-medium">{statusText}</p>
          </div>
        )}

        {availableUpdate && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            <p className="font-medium">
              Update available to {availableUpdate.latest_version}
              {availableUpdate.vault_commit ? ` (Vault ${availableUpdate.vault_commit})` : ""}
            </p>
            {availableUpdate.release_notes && (
              <pre className="mt-2 whitespace-pre-wrap font-sans text-emerald-900">
                {availableUpdate.release_notes}
              </pre>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={checkingUpdates || applyingUpdate}
            onClick={() => void handleCheckUpdates()}
            className="ui-focus-ring rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:bg-slate-400"
          >
            {checkingUpdates ? "Checking…" : "Check for updates"}
          </button>
          {availableUpdate && (
            <button
              type="button"
              disabled={applyingUpdate || checkingUpdates}
              onClick={() => void handleApplyUpdate()}
              className="ui-focus-ring rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:bg-emerald-400"
            >
              {applyingUpdate ? "Downloading and installing…" : "Download and install"}
            </button>
          )}
        </div>

        <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={updateConfig.check_on_startup}
              onChange={(event) =>
                setUpdateConfig((current) => ({
                  ...current,
                  check_on_startup: event.target.checked,
                }))
              }
            />
            Check for updates on startup
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={updateConfig.auto_download_content}
              onChange={(event) =>
                setUpdateConfig((current) => ({
                  ...current,
                  auto_download_content: event.target.checked,
                }))
              }
            />
            Automatically download and install new standards library versions
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-800">Update manifest URL</span>
            <input
              type="url"
              value={updateConfig.manifest_url}
              onChange={(event) =>
                setUpdateConfig((current) => ({
                  ...current,
                  manifest_url: event.target.value,
                }))
              }
              className="ui-focus-ring w-full rounded-lg border border-slate-300 px-4 py-2"
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-800">GitHub access token (optional)</span>
            <input
              type="password"
              value={updateConfig.access_token ?? ""}
              onChange={(event) =>
                setUpdateConfig((current) => ({
                  ...current,
                  access_token: event.target.value || null,
                }))
              }
              placeholder="Required for private repository releases or raw files"
              className="ui-focus-ring w-full rounded-lg border border-slate-300 px-4 py-2"
            />
            <span className="block text-xs leading-5 text-slate-500">
              The app can be public while the standards library lives in a private repo. Enter a
              GitHub token with read access to download packs from private releases. The token is
              stored locally only.
            </span>
          </label>
          <button
            type="button"
            disabled={savingUpdateConfig}
            onClick={() => void handleSaveUpdateConfig()}
            className="ui-focus-ring rounded-lg px-4 py-2 text-sm font-medium ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
          >
            {savingUpdateConfig ? "Saving…" : "Save update settings"}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Projects folder</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Select the <strong>02 - Projects</strong> folder in your Obsidian Vault. The workbench
          reads .md notes from this location.
        </p>
        <dl className="mt-4 grid gap-3 text-sm text-slate-700">
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
            <dt>Current folder</dt>
            <dd className="max-w-md truncate font-medium">{projectsDir ?? "Not set"}</dd>
          </div>
        </dl>
        <button
          type="button"
          disabled={pickingProjectsDir}
          onClick={() => void handlePickProjectsDir()}
          className="ui-focus-ring mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:bg-slate-400"
        >
          {pickingProjectsDir ? "Selecting…" : "Choose projects folder"}
        </button>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">AI writing</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Supports OpenAI and services compatible with the OpenAI Chat Completions API (e.g.
          DeepSeek, local Ollama). API keys and base URLs are stored locally in{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">config.json</code> only.
        </p>
        <div className="mt-4 space-y-4">
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-800">Provider</span>
            <input
              type="text"
              value={aiConfig.provider ?? "openai"}
              onChange={(event) =>
                setAiConfig((current) => ({
                  ...current,
                  provider: event.target.value || "openai",
                }))
              }
              placeholder="openai / deepseek / ollama …"
              className="ui-focus-ring w-full rounded-lg border border-slate-300 px-4 py-2"
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-800">Base URL</span>
            <input
              type="url"
              value={aiConfig.base_url ?? "https://api.openai.com/v1"}
              onChange={(event) =>
                setAiConfig((current) => ({
                  ...current,
                  base_url: event.target.value || "https://api.openai.com/v1",
                }))
              }
              placeholder="https://api.openai.com/v1"
              className="ui-focus-ring w-full rounded-lg border border-slate-300 px-4 py-2"
            />
            <span className="block text-xs text-slate-500">
              Must be compatible with OpenAI&apos;s <code>/chat/completions</code> endpoint. Ollama
              example: http://127.0.0.1:11434/v1
            </span>
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-800">API key</span>
            <input
              type="password"
              value={aiConfig.api_key ?? ""}
              onChange={(event) =>
                setAiConfig((current) => ({
                  ...current,
                  api_key: event.target.value || null,
                }))
              }
              placeholder="sk-..."
              className="ui-focus-ring w-full rounded-lg border border-slate-300 px-4 py-2"
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-800">Model</span>
            <input
              type="text"
              value={aiConfig.model ?? "gpt-4o"}
              onChange={(event) =>
                setAiConfig((current) => ({
                  ...current,
                  model: event.target.value || "gpt-4o",
                }))
              }
              className="ui-focus-ring w-full rounded-lg border border-slate-300 px-4 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={aiConfig.allow_legacy_citations}
              onChange={(event) =>
                setAiConfig((current) => ({
                  ...current,
                  allow_legacy_citations: event.target.checked,
                }))
              }
            />
            Allow legacy standard citations
          </label>
          <button
            type="button"
            disabled={savingAi}
            onClick={() => void handleSaveAiConfig()}
            className="ui-focus-ring rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:bg-slate-400"
          >
            {savingAi ? "Saving…" : "Save AI settings"}
          </button>
        </div>
      </section>

      {notice && (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
          {notice}
        </p>
      )}
    </div>
  );
}
