import { useEffect, useState } from "react";
import { getAppVersion, pickAndImportContentPack } from "../api";
import type { PackInfo } from "../types";

interface SettingsPageProps {
  packInfo: PackInfo;
  onPackUpdated: (packInfo: PackInfo) => void;
}

export function SettingsPage({ packInfo, onPackUpdated }: SettingsPageProps) {
  const [appVersion, setAppVersion] = useState("0.1.0");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getAppVersion().then(setAppVersion).catch(() => undefined);
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
