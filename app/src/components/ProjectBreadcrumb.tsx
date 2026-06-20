import { usePreferences } from "../context/PreferencesContext";

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
  const { tr } = usePreferences();
  const segments = splitFolderPath(selectedFolderRelative);
  const fileName = selectedFileRelative
    ? selectedFileRelative.split("/").pop() ?? selectedFileRelative
    : null;

  return (
    <nav
      aria-label={tr("projectPath")}
      className="flex flex-wrap items-center gap-1 rounded-xl bg-brand-paper px-3 py-2 text-xs text-brand-muted ring-1 ring-brand-border"
    >
      <button
        type="button"
        onClick={() => onNavigateFolder(null)}
        className="rounded px-1.5 py-0.5 hover:bg-brand-surface hover:text-brand-ink"
      >
        {tr("root")}
      </button>
      {segments.map((segment, index) => {
        const folderRelative = segments.slice(0, index + 1).join("/");
        return (
          <span key={folderRelative} className="flex items-center gap-1">
            <span className="text-brand-muted">/</span>
            <button
              type="button"
              onClick={() => onNavigateFolder(folderRelative)}
              className="rounded px-1.5 py-0.5 hover:bg-brand-surface hover:text-brand-ink"
            >
              {segment}
            </button>
          </span>
        );
      })}
      {fileName && (
        <>
          <span className="text-brand-muted">/</span>
          <span className="truncate px-1.5 py-0.5 font-medium text-brand-ink">{fileName}</span>
        </>
      )}
    </nav>
  );
}
