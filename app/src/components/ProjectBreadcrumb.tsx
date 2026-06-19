interface ProjectBreadcrumbProps {
  selectedFolderRelative: string | null;
  selectedFileRelative?: string | null;
  onNavigateFolder: (folderRelative: string | null) => void;
}

function splitFolderPath(folderRelative: string | null): string[] {
  if (!folderRelative) {
    return [];
  }
  return folderRelative.split("/").filter(Boolean);
}

export function ProjectBreadcrumb({
  selectedFolderRelative,
  selectedFileRelative = null,
  onNavigateFolder,
}: ProjectBreadcrumbProps) {
  const segments = splitFolderPath(selectedFolderRelative);
  const fileName = selectedFileRelative
    ? selectedFileRelative.split("/").pop() ?? selectedFileRelative
    : null;

  return (
    <nav
      aria-label="项目路径"
      className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200"
    >
      <button
        type="button"
        onClick={() => onNavigateFolder(null)}
        className="rounded px-1.5 py-0.5 hover:bg-white hover:text-slate-900"
      >
        根目录
      </button>
      {segments.map((segment, index) => {
        const folderRelative = segments.slice(0, index + 1).join("/");
        return (
          <span key={folderRelative} className="flex items-center gap-1">
            <span className="text-slate-400">/</span>
            <button
              type="button"
              onClick={() => onNavigateFolder(folderRelative)}
              className="rounded px-1.5 py-0.5 hover:bg-white hover:text-slate-900"
            >
              {segment}
            </button>
          </span>
        );
      })}
      {fileName && (
        <>
          <span className="text-slate-400">/</span>
          <span className="truncate px-1.5 py-0.5 font-medium text-slate-900">{fileName}</span>
        </>
      )}
    </nav>
  );
}
