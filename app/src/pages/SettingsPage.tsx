import { useEffect, useState } from "react";
import {
  getAppVersion,
  getConfig,
  pickAndImportContentPack,
  pickProjectsDir,
  saveAiConfig,
} from "../api";
import type { AiConfig, PackInfo } from "../types";

interface SettingsPageProps {
  packInfo: PackInfo;
  onPackUpdated: (packInfo: PackInfo) => void;
}

export function SettingsPage({ packInfo, onPackUpdated }: SettingsPageProps) {
  const [appVersion, setAppVersion] = useState("0.1.0");
  const [projectsDir, setProjectsDir] = useState<string | null>(null);
  const [aiConfig, setAiConfig] = useState<AiConfig>({
    provider: "openai",
    api_key: null,
    model: "gpt-4o",
    allow_legacy_citations: false,
  });
  const [importing, setImporting] = useState(false);
  const [pickingProjectsDir, setPickingProjectsDir] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getAppVersion().then(setAppVersion).catch(() => undefined);
    getConfig()
      .then((config) => {
        setProjectsDir(config.projects_dir);
        setAiConfig(config.ai);
      })
      .catch(() => undefined);
  }, []);

  const handleReimport = async () => {
    setImporting(true);
    setMessage(null);
    try {
      const updated = await pickAndImportContentPack();
      onPackUpdated(updated);
      setMessage("准则库已重新导入。");
    } catch (caught: unknown) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setImporting(false);
    }
  };

  const handlePickProjectsDir = async () => {
    setPickingProjectsDir(true);
    setMessage(null);
    try {
      const config = await pickProjectsDir();
      setProjectsDir(config.projects_dir);
      setMessage("项目目录已更新。");
    } catch (caught: unknown) {
      const text = caught instanceof Error ? caught.message : String(caught);
      if (text !== "选择已取消") {
        setMessage(text);
      }
    } finally {
      setPickingProjectsDir(false);
    }
  };

  const handleSaveAiConfig = async () => {
    setSavingAi(true);
    setMessage(null);
    try {
      const config = await saveAiConfig(aiConfig);
      setAiConfig(config.ai);
      setMessage("AI 设置已保存。");
    } catch (caught: unknown) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSavingAi(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">版本信息</h2>
        <dl className="mt-4 grid gap-3 text-sm text-slate-700">
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
            <dt>App 版本</dt>
            <dd className="font-medium">{appVersion}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
            <dt>准则库版本</dt>
            <dd className="font-medium">{packInfo.content_version ?? "未导入"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
            <dt>Vault commit</dt>
            <dd className="font-medium">{packInfo.vault_commit ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>本地目录</dt>
            <dd className="max-w-md truncate font-medium">{packInfo.content_dir ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">项目目录</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          选择 Obsidian Vault 中的 <strong>02 - 项目</strong> 文件夹。Evidence 分屏与「项目」页都会读取这里的 .md 笔记。
        </p>
        <dl className="mt-4 grid gap-3 text-sm text-slate-700">
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
            <dt>当前目录</dt>
            <dd className="max-w-md truncate font-medium">{projectsDir ?? "未设置"}</dd>
          </div>
        </dl>
        <button
          type="button"
          disabled={pickingProjectsDir}
          onClick={() => void handlePickProjectsDir()}
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:bg-slate-400"
        >
          {pickingProjectsDir ? "正在选择…" : "选择项目文件夹"}
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">AI 写作</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          API Key 仅保存在本机 <code className="rounded bg-slate-100 px-1.5 py-0.5">config.json</code> 中，不会上传。
        </p>
        <div className="mt-4 space-y-4">
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-800">OpenAI API Key</span>
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
              className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none ring-slate-900 focus:ring-2"
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-slate-800">模型</span>
            <input
              type="text"
              value={aiConfig.model ?? "gpt-4o"}
              onChange={(event) =>
                setAiConfig((current) => ({
                  ...current,
                  model: event.target.value || "gpt-4o",
                }))
              }
              className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none ring-slate-900 focus:ring-2"
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
            允许引用旧准则（legacy）
          </label>
          <button
            type="button"
            disabled={savingAi}
            onClick={() => void handleSaveAiConfig()}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:bg-slate-400"
          >
            {savingAi ? "正在保存…" : "保存 AI 设置"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">准则库维护</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          如果你拿到了新的 <code className="rounded bg-slate-100 px-1.5 py-0.5">standards-pack-*.zip</code>，
          可以在这里重新导入，替换本地准则库。
        </p>
        <button
          type="button"
          disabled={importing}
          onClick={() => void handleReimport()}
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:bg-slate-400"
        >
          {importing ? "正在导入…" : "重新导入准则库 zip"}
        </button>
        {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}
      </section>
    </div>
  );
}
