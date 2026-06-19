import type { TrashEntry } from "../types";

interface TrashPanelProps {
  open: boolean;
  items: TrashEntry[];
  loading: boolean;
  onRestore: (id: string) => Promise<void>;
  onPurge: (id: string) => Promise<void>;
  onClose: () => void;
}

function formatDeleted(secs: number): string {
  if (!secs) {
    return "—";
  }
  return new Date(secs * 1000).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TrashPanel({
  open,
  items,
  loading,
  onRestore,
  onPurge,
  onClose,
}: TrashPanelProps) {
  if (!open) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">废纸篓</h3>
          <p className="text-xs text-slate-500">已删除笔记可恢复，永久删除后无法找回</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
        >
          关闭
        </button>
      </header>
      <div className="max-h-56 overflow-auto p-2">
        {loading && <p className="p-3 text-sm text-slate-500">正在加载…</p>}
        {!loading && items.length === 0 && (
          <p className="p-3 text-sm text-slate-500">废纸篓为空。</p>
        )}
        {!loading &&
          items.map((item) => (
            <div
              key={item.id}
              className="mb-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 last:mb-0"
            >
              <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
              <p className="truncate text-xs text-slate-500">{item.original_relative_path}</p>
              <p className="mt-1 text-xs text-slate-400">删除于 {formatDeleted(item.deleted_at_secs)}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void onRestore(item.id)}
                  className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs text-white hover:bg-slate-700"
                >
                  恢复
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`永久删除「${item.title}」？此操作不可撤销。`)) {
                      void onPurge(item.id);
                    }
                  }}
                  className="rounded-lg px-2.5 py-1 text-xs text-red-700 ring-1 ring-red-200 hover:bg-red-50"
                >
                  永久删除
                </button>
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}
