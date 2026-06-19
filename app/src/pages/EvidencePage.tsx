import { useCallback, useEffect, useState } from "react";
import {
  createProjectFolder,
  getConfig,
  getStandard,
  listProjectFiles,
  listProjectTree,
  moveProjectFile,
  readProjectFile,
  renameProjectFolder,
  resolveCitation,
  scanNoteCitations,
  searchProjectFiles,
} from "../api";
import { EvidenceStandardPanel } from "../components/EvidenceStandardPanel";
import { NotePanel } from "../components/NotePanel";
import { ProjectFolderTree } from "../components/ProjectFolderTree";
import type {
  CitationHighlight,
  CitationScanResult,
  CitationTarget,
  ProjectFileEntry,
  ProjectTreeNode,
} from "../types";

interface EvidencePageProps {
  initialFilePath?: string | null;
  onInitialFilePathConsumed?: () => void;
}

export function EvidencePage({
  initialFilePath = null,
  onInitialFilePathConsumed,
}: EvidencePageProps) {
  const [projectsDir, setProjectsDir] = useState<string | null>(null);
  const [tree, setTree] = useState<ProjectTreeNode[]>([]);
  const [searchResults, setSearchResults] = useState<ProjectFileEntry[] | null>(null);
  const [selected, setSelected] = useState<ProjectFileEntry | null>(null);
  const [selectedFolderRelative, setSelectedFolderRelative] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [scanResults, setScanResults] = useState<CitationScanResult[]>([]);
  const [citationTarget, setCitationTarget] = useState<CitationTarget | null>(null);
  const [highlight, setHighlight] = useState<CitationHighlight | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingNote, setLoadingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSidebar = useCallback(async (query: string) => {
    setLoadingFiles(true);
    setError(null);
    try {
      if (query.trim()) {
        const results = await searchProjectFiles(query.trim());
        setSearchResults(results);
        setTree([]);
        setSelected((current) => {
          if (current && results.some((item) => item.path === current.path)) {
            return current;
          }
          return results[0] ?? null;
        });
      } else {
        const nodes = await listProjectTree();
        setTree(nodes);
        setSearchResults(null);
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setTree([]);
      setSearchResults([]);
      setSelected(null);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    getConfig()
      .then((config) => setProjectsDir(config.projects_dir))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void refreshSidebar(searchQuery);
  }, [refreshSidebar, searchQuery]);

  useEffect(() => {
    if (!initialFilePath) {
      return;
    }
    listProjectFiles()
      .then((entries) => {
        const match = entries.find((entry) => entry.path === initialFilePath);
        if (match) {
          setSelected(match);
          onInitialFilePathConsumed?.();
        }
      })
      .catch(() => undefined);
  }, [initialFilePath, onInitialFilePathConsumed]);

  useEffect(() => {
    if (!selected) {
      setNoteContent("");
      setScanResults([]);
      return;
    }

    let cancelled = false;
    setLoadingNote(true);
    setError(null);

    readProjectFile(selected.path)
      .then(async (content) => {
        if (cancelled) {
          return;
        }
        setNoteContent(content);
        const scanned = await scanNoteCitations(content);
        if (!cancelled) {
          setScanResults(scanned);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
          setNoteContent("");
          setScanResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingNote(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  const handleCitationClick = async (citation: string) => {
    setError(null);
    try {
      const target = await resolveCitation(citation);
      if (!target) {
        setCitationTarget(null);
        setHighlight(null);
        setError(`未在本地 pack 找到引用：${citation}`);
        return;
      }
      setCitationTarget(target);
      setHighlight({
        char_start: target.char_start,
        char_end: target.char_end,
        snippet_en: target.snippet_en,
        paragraph: target.paragraph,
      });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const handleOpenSuperseded = async (standardId: string) => {
    setError(null);
    try {
      const detail = await getStandard(standardId);
      setCitationTarget({
        citation: standardId,
        standard_id: detail.id,
        paragraph: "",
        pack_path: detail.pack_path,
        char_start: 0,
        char_end: 0,
        snippet_en: "",
        status: detail.status,
        resolved: true,
      });
      setHighlight(null);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  if (!projectsDir) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-amber-950">
        <h2 className="text-lg font-semibold">尚未设置项目目录</h2>
        <p className="mt-2 text-sm leading-6">
          请先在「设置」中选择 Obsidian Vault 中的 <strong>02 - 项目</strong> 文件夹，
          然后回到 Evidence 分屏查看项目笔记。
        </p>
      </section>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-full bg-white px-4 py-2 ring-1 ring-slate-200">
          <span className="text-sm text-slate-500">🔍</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索项目笔记…"
            className="w-full bg-transparent text-sm text-slate-800 outline-none"
          />
        </label>
        <p className="truncate text-xs text-slate-500">项目目录：{projectsDir}</p>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(220px,240px)_minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <ProjectFolderTree
          nodes={tree}
          searchResults={searchResults}
          selectedPath={selected?.path ?? null}
          selectedFolderRelative={selectedFolderRelative}
          loading={loadingFiles}
          onSelectFile={setSelected}
          onSelectFolder={setSelectedFolderRelative}
          onCreateFolder={async (parentRelative, name) => {
            await createProjectFolder(name, parentRelative);
            await refreshSidebar(searchQuery);
          }}
          onRenameFolder={async (folderRelative, newName) => {
            const updated = await renameProjectFolder(folderRelative, newName);
            await refreshSidebar(searchQuery);
            return updated;
          }}
          onMoveFile={async (filePath, targetFolderRelative) => {
            const moved = await moveProjectFile(filePath, targetFolderRelative);
            await refreshSidebar(searchQuery);
            setSelected(moved);
          }}
        />
        <NotePanel
          title={selected?.title ?? "项目笔记"}
          content={noteContent}
          scanResults={scanResults}
          loading={loadingNote}
          onCitationClick={(citation) => void handleCitationClick(citation)}
        />
        <EvidenceStandardPanel
          target={citationTarget}
          highlight={highlight}
          onOpenSuperseded={(standardId) => void handleOpenSuperseded(standardId)}
        />
      </div>
    </div>
  );
}
