import { useDialog } from "./DialogProvider";
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
  return new Date(secs * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
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
  const { confirm } = useDialog();

  if (!open) {
    return null;
  }

  const handlePurge = async (item: TrashEntry) => {
    const confirmed = await confirm({
      title: "Delete permanently?",
      message: `"${item.title}" will be deleted permanently. This cannot be undone.`,
      confirmLabel: "Delete permanently",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (confirmed) {
      await onPurge(item.id);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Trash</h3>
          <p className="text-xs text-slate-500">Restore deleted notes or remove them permanently</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ui-focus-ring rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
        >
          Close
        </button>
      </header>
      <div className="max-h-56 overflow-auto p-2">
        {loading && <p className="p-3 text-sm text-slate-500">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="p-3 text-sm text-slate-500">Trash is empty.</p>
        )}
        {!loading &&
          items.map((item) => (
            <div
              key={item.id}
              className="mb-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 last:mb-0"
            >
              <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
              <p className="truncate text-xs text-slate-500">{item.original_relative_path}</p>
              <p className="mt-1 text-xs text-slate-400">Deleted {formatDeleted(item.deleted_at_secs)}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void onRestore(item.id)}
                  className="ui-focus-ring rounded-lg bg-slate-900 px-2.5 py-1 text-xs text-white hover:bg-slate-700"
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => void handlePurge(item)}
                  className="ui-focus-ring rounded-lg px-2.5 py-1 text-xs text-red-700 ring-1 ring-red-200 hover:bg-red-50"
                >
                  Delete permanently
                </button>
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}
