import type { StandardSummary } from "../types";

interface StandardListProps {
  standards: StandardSummary[];
  selectedId: string | null;
  onSelect: (standard: StandardSummary) => void;
}

export function StandardList({ standards, selectedId, onSelect }: StandardListProps) {
  if (standards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        当前筛选条件下没有准则。可尝试切换框架或勾选「显示旧准则」。
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
              "w-full rounded-2xl border px-4 py-3 text-left transition",
              active
                ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-800 hover:border-slate-400",
            ].join(" ")}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{standard.id}</span>
              <span
                className={[
                  "rounded-full px-2 py-0.5 text-xs",
                  active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600",
                ].join(" ")}
              >
                {standard.framework}
              </span>
            </div>
            <p className={["mt-1 text-sm", active ? "text-slate-100" : "text-slate-600"].join(" ")}>
              {standard.title_zh ?? standard.title}
            </p>
            {standard.status === "legacy" && (
              <span
                className={[
                  "mt-2 inline-block rounded-full px-2 py-0.5 text-xs",
                  active ? "bg-amber-300 text-amber-950" : "bg-amber-100 text-amber-800",
                ].join(" ")}
              >
                {standard.legacy_label ?? "旧准则"}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
