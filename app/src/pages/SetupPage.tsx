interface SetupPageProps {
  onPickImport: () => Promise<void>;
  importing: boolean;
  error: string | null;
}

export function SetupPage({ onPickImport, importing, error }: SetupPageProps) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
          首次使用
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">导入准则库包</h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          请先导入一个 <code className="rounded bg-slate-100 px-1.5 py-0.5">standards-pack-*.zip</code>
          文件。导入后，App 就可以离线浏览 IFRS / IAS / ASC 准则全文，并进行搜索。
        </p>
        <button
          type="button"
          disabled={importing}
          onClick={() => void onPickImport()}
          className="mt-8 rounded-2xl bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {importing ? "正在导入…" : "选择 zip 文件并导入"}
        </button>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
