interface SetupPageProps {
  onDownloadInitial: () => Promise<void>;
  downloading: boolean;
  error: string | null;
}

export function SetupPage({ onDownloadInitial, downloading, error }: SetupPageProps) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          首次使用
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">下载官方准则库</h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          本应用只使用官方打包的 IFRS / IAS / ASC 准则库，不支持手动导入 zip。
          首次使用请从更新服务器下载并安装准则库；若准则库在私有 GitHub 仓库，请先在设置中填写访问令牌。
        </p>
        <button
          type="button"
          disabled={downloading}
          onClick={() => void onDownloadInitial()}
          className="mt-8 rounded-2xl bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {downloading ? "正在检查并下载…" : "检查并下载准则库"}
        </button>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
