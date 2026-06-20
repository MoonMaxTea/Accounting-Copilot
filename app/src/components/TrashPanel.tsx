import { useDialog } from "./DialogProvider";
import { usePreferences } from "../context/PreferencesContext";
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
  const { tr, trf } = usePreferences();

  if (!open) {
    return null;
  }

  const handlePurge = async (item: TrashEntry) => {
    const confirmed = await confirm({
      title: tr("deletePermanentlyConfirm"),
      message: trf("deletePermanentlyMessage", { title: item.title }),
      confirmLabel: tr("deletePermanently"),
      cancelLabel: tr("cancel"),
      tone: "danger",
    });
    if (confirmed) {
      await onPurge(item.id);
    }
  };

  return (
    <section className="ui-panel rounded-lg shadow-sm">
      <header className="flex items-center justify-between border-b border-brand-border px-3 py-2">
        <div>
          <h3 className="text-sm font-semibold text-brand-ink">{tr("trash")}</h3>
          <p className="text-xs text-brand-muted">{tr("trashHint")}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ui-focus-ring rounded-lg px-2 py-1 text-xs text-brand-muted hover:bg-brand-hover"
        >
          {tr("close")}
        </button>
      </header>
      <div className="max-h-56 overflow-auto p-2">
        {loading && <p className="p-3 text-sm text-brand-muted">{tr("loadingEllipsis")}</p>}
        {!loading && items.length === 0 && (
          <p className="p-3 text-sm text-brand-muted">{tr("trashEmpty")}</p>
        )}
        {!loading &&
          items.map((item) => (
            <div
              key={item.id}
              className="mb-2 rounded-lg border border-brand-border bg-brand-paper px-3 py-2 last:mb-0"
            >
              <p className="truncate text-sm font-medium text-brand-ink">{item.title}</p>
              <p className="truncate text-xs text-brand-muted">{item.original_relative_path}</p>
              <p className="mt-1 text-xs text-brand-muted">
                {trf("deletedAt", { time: formatDeleted(item.deleted_at_secs) })}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void onRestore(item.id)}
                  className="ui-btn-primary ui-focus-ring rounded-lg px-2.5 py-1 text-xs"
                >
                  {tr("restoreItem")}
                </button>
                <button
                  type="button"
                  onClick={() => void handlePurge(item)}
                  className="ui-focus-ring rounded-lg px-2.5 py-1 text-xs text-red-700 ring-1 ring-red-200 hover:bg-red-50 dark:text-red-300 dark:ring-red-900 dark:hover:bg-red-950/40"
                >
                  {tr("deletePermanently")}
                </button>
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}
