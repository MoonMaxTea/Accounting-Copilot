import { useEffect, useState } from "react";
import { getConfig, saveUpdateConfig } from "../api";
import type { UpdateConfig } from "../types";

interface SetupPageProps {
  onDownloadInitial: () => Promise<void>;
  downloading: boolean;
  error: string | null;
}

const defaultUpdateConfig: UpdateConfig = {
  manifest_url:
    "https://raw.githubusercontent.com/MoonMaxTea/Accounting-standards-Desktop/main/updates/manifest.json",
  check_on_startup: true,
  auto_download_content: true,
  last_content_version: null,
  last_update_check_secs: null,
  access_token: null,
};

export function SetupPage({ onDownloadInitial, downloading, error }: SetupPageProps) {
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
      setTokenNotice("访问令牌已保存到本机。");
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
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <div className="rounded-3xl border border-slate-200 bg-white p-10 text-left shadow-sm">
        <p className="text-center text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          首次使用
        </p>
        <h1 className="mt-3 text-center text-3xl font-semibold text-slate-900">下载官方准则库</h1>
        <p className="mt-4 text-center text-base leading-7 text-slate-600">
          本应用只使用官方打包的 IFRS / IAS / ASC 准则库，不支持手动导入 zip。
          首次使用请从更新服务器下载并安装准则库。
        </p>

        <label className="mt-8 block space-y-2 text-sm">
          <span className="font-medium text-slate-800">GitHub 访问令牌（私有仓库必填）</span>
          <input
            type="password"
            value={updateConfig.access_token ?? ""}
            onChange={(event) =>
              setUpdateConfig((current) => ({
                ...current,
                access_token: event.target.value || null,
              }))
            }
            placeholder="ghp_… 或 github_pat_…"
            className="w-full rounded-xl border border-slate-300 px-4 py-2 outline-none ring-slate-900 focus:ring-2"
          />
          <span className="block text-xs leading-5 text-slate-500">
            若准则库 Release 在私有 GitHub 仓库，请填写有 read 权限的 Token。Token 仅保存在本机，
            安装完成后也可在「设置」中修改。
          </span>
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={savingToken}
            onClick={() => void handleSaveToken()}
            className="rounded-xl px-4 py-2 text-sm font-medium ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
          >
            {savingToken ? "正在保存…" : "保存令牌"}
          </button>
        </div>

        {tokenNotice && (
          <p className="mt-3 text-sm text-slate-600">{tokenNotice}</p>
        )}

        <div className="mt-8 text-center">
          <button
            type="button"
            disabled={downloading}
            onClick={() => void handleDownload()}
            className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {downloading ? "正在检查并下载…" : "检查并下载准则库"}
          </button>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
