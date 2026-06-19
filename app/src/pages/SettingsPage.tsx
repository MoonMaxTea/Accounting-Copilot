import { useEffect, useState } from "react";
import { getAppVersion, getConfig, pickAndImportContentPack, pickProjectsDir } from "../api";
import type { PackInfo } from "../types";

interface SettingsPageProps {
  packInfo: PackInfo;
  onPackUpdated: (packInfo: PackInfo) => void;
}

export function SettingsPage({ packInfo, onPackUpdated }: SettingsPageProps) {
  const [appVersion, setAppVersion] = useState("0.1.0");
  const [projectsDir, setProjectsDir] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [pickingProjectsDir, setPickingProjectsDir] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getAppVersion().then(setAppVersion).catch(() => undefined);
    getConfig()
      .then((config) => setProjectsDir(config.projects_dir))
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
