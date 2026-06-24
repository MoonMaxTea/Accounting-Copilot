import { useEffect, useState } from "react";
import {
  checkContentUpdates,
  downloadAndApplyContentUpdate,
  downloadAppUpdate,
  getAppVersion,
  getConfig,
  pickProjectsDir,
  saveAiConfig,
  saveUpdateConfig,
} from "../api";
import { ContentDownloadProgressBar } from "../components/ContentDownloadProgressBar";
import { useToast } from "../components/Toast";
import { UI_BREAKPOINTS, useMediaQuery } from "../hooks/useMediaQuery";
import { usePreferences } from "../context/PreferencesContext";
import type {
  AiConfig,
  ContentDownloadProgress,
  PackInfo,
  UpdateCheckResult,
  UpdateConfig,
} from "../types";

type SettingsSection = "updates" | "projects" | "ai";

interface SettingsPageProps {
  packInfo: PackInfo;
  onPackUpdated: (packInfo: PackInfo) => void;
  onBackToWorkbench?: () => void;
}

export function SettingsPage({ packInfo, onPackUpdated, onBackToWorkbench }: SettingsPageProps) {
  const { tr, trf } = usePreferences();
  const { showToast } = useToast();
  const narrow = useMediaQuery(UI_BREAKPOINTS.narrow);
  const [section, setSection] = useState<SettingsSection>("updates");
  const [appVersion, setAppVersion] = useState("0.1.0");
  const [projectsDir, setProjectsDir] = useState<string | null>(null);
  const [updateConfig, setUpdateConfig] = useState<UpdateConfig>({
    manifest_url:
      "https://raw.githubusercontent.com/MoonMaxTea/Accounting-Copilot/main/updates/manifest.json",
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
  const [applyingAppUpdate, setApplyingAppUpdate] = useState(false);
  const [savingUpdateConfig, setSavingUpdateConfig] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<ContentDownloadProgress | null>(null);

  const sections: { id: SettingsSection; label: string }[] = [
    { id: "updates", label: tr("standardsLibraryUpdates") },
    { id: "projects", label: tr("projectsFolder") },
    { id: "ai", label: tr("aiWriting") },
  ];

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

  const formatCheckedAt = (secs: number | null): string => {
    if (!secs) {
      return tr("notCheckedYet");
    }
    return new Date(secs * 1000).toLocaleString(undefined);
  };

  const updateStatusLabel = (result: UpdateCheckResult | null): string | null => {
    if (!result) {
      return null;
    }
    if (result.message) {
      return result.message;
    }
    switch (result.status) {
      case "up_to_date":
        return tr("updateUpToDate");
      case "content_available":
        return tr("updateAvailable");
      case "app_update_required":
        return tr("updateAppRequired");
      case "app_available":
        return tr("updateAppAvailable");
      case "error":
        return tr("updateCheckFailed");
      default:
        return null;
    }
  };

  const updateStatusClass = (status: string): string => {
    switch (status) {
      case "content_available":
      case "app_available":
        return "ui-alert-success";
      case "error":
      case "app_update_required":
        return "ui-alert-warning";
      default:
        return "ui-panel px-4 py-3 text-sm text-brand-muted";
    }
  };

  const handlePickProjectsDir = async () => {
    setPickingProjectsDir(true);
    setNotice(null);
    try {
      const config = await pickProjectsDir();
      setProjectsDir(config.projects_dir);
      setNotice(tr("projectsFolderUpdated"));
    } catch (caught: unknown) {
      const text = caught instanceof Error ? caught.message : String(caught);
      if (text !== "\u9009\u62e9\u5df2\u53d6\u6d88") {
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
      setNotice(tr("aiSettingsSaved"));
      showToast(tr("aiSettingsSaved"), "success");
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
    setDownloadProgress(null);
    setNotice(null);
    try {
      const updated = await downloadAndApplyContentUpdate((progress) => {
        if (progress.phase === "idle") {
          setDownloadProgress(null);
          return;
        }
        setDownloadProgress(progress);
      });
      onPackUpdated(updated);
      setUpdateStatus(null);
      setUpdateConfig((current) => ({
        ...current,
        last_content_version: updated.content_version,
      }));
      setNotice(
        trf("standardsUpdated", {
          version: updated.content_version ?? tr("latestVersion"),
        }),
      );
    } catch (caught: unknown) {
      setNotice(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setApplyingUpdate(false);
      setDownloadProgress(null);
    }
  };

  const handleApplyAppUpdate = async () => {
    setApplyingAppUpdate(true);
    setNotice(null);
    try {
      const filePath = await downloadAppUpdate();
      setNotice(trf("appUpdateDownloaded", { path: filePath }));
    } catch (caught: unknown) {
      setNotice(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setApplyingAppUpdate(false);
    }
  };

  const handleSaveUpdateConfig = async () => {
    setSavingUpdateConfig(true);
    setNotice(null);
    try {
      const config = await saveUpdateConfig(updateConfig);
      setUpdateConfig(config.update);
      setNotice(tr("updateSettingsSaved"));
      showToast(tr("updateSettingsSaved"), "success");
    } catch (caught: unknown) {
      setNotice(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSavingUpdateConfig(false);
    }
  };

  const availableUpdate = updateStatus?.available_content ?? null;
  const availableAppUpdate = updateStatus?.available_app ?? null;
  const statusText = updateStatusLabel(updateStatus);

  const updatesPanel = (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-brand-muted">{tr("standardsLibraryUpdatesBody")}</p>
      <dl className="grid gap-3 text-sm text-brand-ink">
        <div className="flex justify-between gap-4 border-b border-brand-border pb-3">
          <dt>{tr("lastChecked")}</dt>
          <dd className="font-medium">
            {formatCheckedAt(
              updateStatus?.checked_at_secs ?? updateConfig.last_update_check_secs,
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-brand-border pb-3">
          <dt>{tr("currentVersion")}</dt>
          <dd className="font-medium">
            {updateStatus?.current_content_version ?? packInfo.content_version ?? tr("notImported")}
          </dd>
        </div>
      </dl>

      {updateStatus && statusText && availableUpdate && (
        <div className={`rounded-lg text-sm ${updateStatusClass(updateStatus.status)}`}>
          <p className="font-medium">{statusText}</p>
        </div>
      )}

      {availableUpdate && (
        <div className="ui-alert-success rounded-lg p-4 text-sm">
          <p className="font-medium">
            {trf("updateAvailableDetail", {
              version: availableUpdate.latest_version,
              vault: availableUpdate.vault_commit
                ? ` (Vault ${availableUpdate.vault_commit})`
                : "",
            })}
          </p>
          {availableUpdate.release_notes && (
            <pre className="mt-2 whitespace-pre-wrap font-sans opacity-90">
              {availableUpdate.release_notes}
            </pre>
          )}
        </div>
      )}

      {availableAppUpdate && (
        <div className="ui-alert-success rounded-lg p-4 text-sm">
          <p className="font-medium">
            {trf("appUpdateAvailable", {
              current: appVersion,
              latest: availableAppUpdate.latest_version,
            })}
          </p>
          {availableAppUpdate.release_notes && (
            <pre className="mt-2 whitespace-pre-wrap font-sans opacity-90">
              {availableAppUpdate.release_notes}
            </pre>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={checkingUpdates || applyingUpdate || applyingAppUpdate}
          onClick={() => void handleCheckUpdates()}
          className="ui-btn-primary ui-focus-ring rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed"
        >
          {checkingUpdates ? tr("checking") : tr("checkForUpdates")}
        </button>
        {availableUpdate && (
          <button
            type="button"
            disabled={applyingUpdate || checkingUpdates}
            onClick={() => void handleApplyUpdate()}
            className="ui-btn-primary ui-focus-ring rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed"
          >
            {applyingUpdate ? tr("downloading") : tr("downloadStandardsPack")}
          </button>
        )}
        {availableAppUpdate && (
          <button
            type="button"
            disabled={applyingAppUpdate || checkingUpdates}
            onClick={() => void handleApplyAppUpdate()}
            className="ui-btn-secondary ui-focus-ring rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50"
          >
            {applyingAppUpdate ? tr("downloading") : tr("downloadAppUpdate")}
          </button>
        )}
      </div>

      {applyingUpdate && (
        <ContentDownloadProgressBar progress={downloadProgress} pending={!downloadProgress} />
      )}

      <div className="space-y-4 border-t border-brand-border pt-5">
        <label className="flex items-center gap-2 text-sm text-brand-ink">
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
          {tr("checkOnStartup")}
        </label>
        <label className="flex items-center gap-2 text-sm text-brand-ink">
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
          {tr("autoDownloadContent")}
        </label>
        <label className="block space-y-2 text-sm">
          <span className="font-medium text-brand-ink">{tr("updateManifestUrl")}</span>
          <input
            type="url"
            value={updateConfig.manifest_url}
            onChange={(event) =>
              setUpdateConfig((current) => ({
                ...current,
                manifest_url: event.target.value,
              }))
            }
            className="ui-input ui-focus-ring w-full rounded-lg px-4 py-2"
          />
          <span className="block text-xs leading-5 text-brand-muted">{tr("updateManifestHint")}</span>
        </label>
        <label className="block space-y-2 text-sm">
          <span className="font-medium text-brand-ink">{tr("githubTokenOptional")}</span>
          <input
            type="password"
            value={updateConfig.access_token ?? ""}
            onChange={(event) =>
              setUpdateConfig((current) => ({
                ...current,
                access_token: event.target.value || null,
              }))
            }
            placeholder={tr("githubTokenOptionalPlaceholder")}
            className="ui-input ui-focus-ring w-full rounded-lg px-4 py-2"
          />
          <span className="block text-xs leading-5 text-brand-muted">
            {tr("githubTokenOptionalHint")}
          </span>
        </label>
        <button
          type="button"
          disabled={savingUpdateConfig}
          onClick={() => void handleSaveUpdateConfig()}
          className="ui-btn-secondary ui-focus-ring rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {savingUpdateConfig ? tr("saving") : tr("saveUpdateSettings")}
        </button>
      </div>
    </div>
  );

  const projectsPanel = (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-brand-muted">{tr("projectsFolderBody")}</p>
      <dl className="grid gap-3 text-sm text-brand-ink">
        <div className="flex justify-between gap-4 border-b border-brand-border pb-3">
          <dt>{tr("currentFolder")}</dt>
          <dd className="max-w-md truncate font-medium">{projectsDir ?? tr("notSet")}</dd>
        </div>
      </dl>
      <button
        type="button"
        disabled={pickingProjectsDir}
        onClick={() => void handlePickProjectsDir()}
        className="ui-btn-primary ui-focus-ring rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed"
      >
        {pickingProjectsDir ? tr("selecting") : tr("chooseProjectsFolder")}
      </button>
    </div>
  );

  const aiPanel = (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-brand-muted">{tr("aiWritingBody")}</p>
      <label className="block space-y-2 text-sm">
        <span className="font-medium text-brand-ink">{tr("provider")}</span>
        <input
          type="text"
          value={aiConfig.provider ?? "openai"}
          onChange={(event) =>
            setAiConfig((current) => ({
              ...current,
              provider: event.target.value || "openai",
            }))
          }
          placeholder="openai / deepseek / ollama"
          className="ui-input ui-focus-ring w-full rounded-lg px-4 py-2"
        />
      </label>
      <label className="block space-y-2 text-sm">
        <span className="font-medium text-brand-ink">{tr("baseUrl")}</span>
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
          className="ui-input ui-focus-ring w-full rounded-lg px-4 py-2"
        />
        <span className="block text-xs text-brand-muted">{tr("baseUrlHint")}</span>
      </label>
      <label className="block space-y-2 text-sm">
        <span className="font-medium text-brand-ink">{tr("apiKey")}</span>
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
          className="ui-input ui-focus-ring w-full rounded-lg px-4 py-2"
        />
      </label>
      <label className="block space-y-2 text-sm">
        <span className="font-medium text-brand-ink">{tr("model")}</span>
        <input
          type="text"
          value={aiConfig.model ?? "gpt-4o"}
          onChange={(event) =>
            setAiConfig((current) => ({
              ...current,
              model: event.target.value || "gpt-4o",
            }))
          }
          className="ui-input ui-focus-ring w-full rounded-lg px-4 py-2"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-brand-ink">
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
        {tr("allowLegacyCitations")}
      </label>
      <button
        type="button"
        disabled={savingAi}
        onClick={() => void handleSaveAiConfig()}
        className="ui-btn-primary ui-focus-ring rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed"
      >
        {savingAi ? tr("saving") : tr("saveAiSettings")}
      </button>
    </div>
  );

  const activeSection = sections.find((item) => item.id === section) ?? sections[0];

  return (
    <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-5xl flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title text-brand-ink">{tr("settings")}</h1>
        {onBackToWorkbench && (
          <button
            type="button"
            onClick={onBackToWorkbench}
            className="ui-btn-secondary ui-focus-ring rounded-lg px-3 py-1.5 text-sm font-medium"
          >
            {tr("workbench")}
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {narrow ? (
          <label className="block text-sm lg:hidden">
            <span className="mb-2 block font-medium text-brand-ink">{tr("settings")}</span>
            <select
              value={section}
              onChange={(event) => setSection(event.target.value as SettingsSection)}
              className="ui-input ui-focus-ring w-full rounded-lg px-3 py-2"
            >
              {sections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <nav
            aria-label={tr("settings")}
            className="hidden w-52 shrink-0 flex-col gap-1 lg:flex"
          >
            {sections.map((item) => {
              const active = item.id === section;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => setSection(item.id)}
                  className={[
                    "ui-focus-ring rounded-lg px-3 py-2 text-left text-sm font-medium transition",
                    active ? "ui-selected-item" : "text-brand-muted hover:bg-brand-hover hover:text-brand-ink",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        )}

        <section className="ui-panel min-h-0 flex-1 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-brand-ink">{activeSection.label}</h2>
          <div className="mt-4">
            {section === "updates" && updatesPanel}
            {section === "projects" && projectsPanel}
            {section === "ai" && aiPanel}
          </div>
        </section>
      </div>

      <footer className="mt-6 border-t border-brand-border pt-4 text-xs text-brand-muted">
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          <div className="flex gap-2">
            <dt>{tr("appVersion")}</dt>
            <dd className="font-medium text-brand-ink">{appVersion}</dd>
          </div>
          <div className="flex gap-2">
            <dt>{tr("standardsLibraryVersion")}</dt>
            <dd className="font-medium text-brand-ink">
              {packInfo.content_version ?? tr("notImported")}
            </dd>
          </div>
          <div className="flex min-w-0 gap-2">
            <dt>{tr("localDirectory")}</dt>
            <dd className="max-w-xs truncate font-medium text-brand-ink">
              {packInfo.content_dir ?? "\u2014"}
            </dd>
          </div>
        </dl>
      </footer>

      {notice && (
        <p className="ui-panel mt-4 rounded-lg px-4 py-3 text-sm text-brand-ink shadow-sm">
          {notice}
        </p>
      )}
    </div>
  );
}
