import type { ProjectFileEntry } from "../types";

interface ProjectFileTreeProps {
  files: ProjectFileEntry[];
  selectedPath: string | null;
  loading: boolean;
  onSelect: (entry: ProjectFileEntry) => void;
}

function formatModified(secs: number): string {
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

export function ProjectFileTree({
  files,
  selectedPath,
  loading,
  onSelect,
}: ProjectFileTreeProps) {
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        正在加载项目笔记…
      </section>
    );
  }

  if (files.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        当前目录下没有项目笔记。请在 Obsidian 的「02 - 项目」文件夹中创建 .md 文件。
      </section>
    );
  }

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">项目笔记</h2>
        <p className="mt-1 text-xs text-slate-500">按最近修改排序 · 点击在 Evidence 中打开</p>
      </header>
      <ul className="min-h-0 flex-1 overflow-auto p-2">
        {files.map((entry) => {
          const active = entry.path === selectedPath;
          return (
            <li key={entry.path}>
              <button
                type="button"
                onClick={() => onSelect(entry)}
                className={[
                  "w-full rounded-xl px-3 py-3 text-left transition",
                  active ? "bg-slate-900 text-white" : "hover:bg-slate-100",
                ].join(" ")}
              >
                <p className="truncate text-sm font-medium">{entry.title}</p>
                <p
                  className={[
                    "mt-1 truncate text-xs",
                    active ? "text-slate-300" : "text-slate-500",
                  ].join(" ")}
                >
                  {entry.relative_path}
                </p>
                <p
                  className={[
                    "mt-1 text-xs",
                    active ? "text-slate-400" : "text-slate-400",
                  ].join(" ")}
                >
                  {formatModified(entry.modified_secs)}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
