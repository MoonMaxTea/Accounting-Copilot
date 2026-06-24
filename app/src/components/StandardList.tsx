import { usePreferences } from "../context/PreferencesContext";
import type { StandardSummary } from "../types";

interface StandardListProps {
  standards: StandardSummary[];
  selectedId: string | null;
  onSelect: (standard: StandardSummary) => void;
  emptyMessage?: string;
}

export function StandardList({
  standards,
  selectedId,
  onSelect,
  emptyMessage,
}: StandardListProps) {
  const { tr } = usePreferences();
  const resolvedEmptyMessage = emptyMessage ?? tr("noStandardsMatch");

  if (standards.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-brand-border bg-brand-surface p-6 text-sm text-brand-muted">
        {resolvedEmptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-2 overflow-auto pr-1">
      {standards.map((standard) => {
        const active = standard.id === selectedId;
        return (
          <button
            key={standard.id}
            type="button"
            onClick={() => onSelect(standard)}
            className={[
              "ui-focus-ring w-full rounded-lg border px-4 py-3 text-left transition",
              active
                ? "ui-selected-item border-brand-border text-brand-ink"
                : "border-brand-border bg-brand-surface text-brand-ink hover:border-brand-muted",
            ].join(" ")}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{standard.id}</span>
              <span
                className={[
                  "rounded-full px-2 py-0.5 text-xs",
                  active ? "bg-brand-accent/15 text-brand-accent" : "bg-brand-paper text-brand-muted",
                ].join(" ")}
              >
                {standard.framework}
              </span>
            </div>
            <p className={["mt-1 text-sm", active ? "text-white/90" : "text-brand-muted"].join(" ")}>
              {standard.title_zh ?? standard.title}
            </p>
            {standard.status === "legacy" && (
              <span
                className={[
                  "mt-2 inline-block rounded-full px-2 py-0.5 text-xs",
                  active ? "bg-amber-300 text-amber-950" : "bg-amber-100 text-amber-800",
                ].join(" ")}
              >
                {standard.legacy_label ?? tr("legacy")}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
