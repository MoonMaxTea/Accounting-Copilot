import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  continueProjectDocument,
  countProjectFolderEntries,
  createProjectFolder,
  deleteProjectFolder,
  generateProjectDocument,
  getConfig,
  getStandard,
  listProjectFiles,
  listProjectTree,
  listTrashItems,
  moveProjectFile,
  moveProjectFileToTrash,
  purgeTrashItem,
  readProjectFile,
  renameProjectFolder,
  renameProjectFile,
  restoreTrashItem,
  saveEvidencePanelCollapsed,
  saveProjectsChildOrder,
  saveProjectsUiState,
  resolveCitation,
  scanNoteCitations,
  searchProjectFiles,
  toggleProjectPin,
} from "../api";
import { EvidenceSidePanel } from "../components/EvidenceSidePanel";
import { NotePanel } from "../components/NotePanel";
import { ProjectBreadcrumb } from "../components/ProjectBreadcrumb";
import {
  folderRelativeForSelection,
  ProjectFolderTree,
} from "../components/ProjectFolderTree";
import { TrashPanel } from "../components/TrashPanel";
import { useToast } from "../components/Toast";
import type {
  CitationHighlight,
  CitationScanResult,
  CitationTarget,
  GenerateProjectResult,
  ProjectFileEntry,
  ProjectsUiState,
  ProjectTreeNode,
  TrashEntry,
} from "../types";

const defaultUiState: ProjectsUiState = {
  pinned: [],
  order: {},
  last_evidence_file: null,
  last_selected_folder: null,
  ai_threads: {},
  evidence_panel_collapsed: false,
};

const DRAFT_THREAD_KEY = "__draft__";

export function EvidencePage() {
  const { showToast } = useToast();
  const [projectsDir, setProjectsDir] = useState<string | null>(null);
  const [projectsUi, setProjectsUi] = useState<ProjectsUiState>(defaultUiState);
  const [tree, setTree] = useState<ProjectTreeNode[]>([]);
  const [searchResults, setSearchResults] = useState<ProjectFileEntry[] | null>(null);
  const [selected, setSelected] = useState<ProjectFileEntry | null>(null);
  const [selectedFolderRelative, setSelectedFolderRelative] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [scanResults, setScanResults] = useState<CitationScanResult[]>([]);
  const [citationTarget, setCitationTarget] = useState<CitationTarget | null>(null);
  const [highlight, setHighlight] = useState<CitationHighlight | null>(null);
  const [citationMiss, setCitationMiss] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingNote, setLoadingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashItems, setTrashItems] = useState<TrashEntry[]>([]);
  const [loadingTrash, setLoadingTrash] = useState(false);
  const [question, setQuestion] = useState("");
  const [facts, setFacts] = useState("");
  const [generating, setGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<GenerateProjectResult | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const restoredRef = useRef(false);

  const threadKey = selected?.relative_path ?? DRAFT_THREAD_KEY;
  const conversationTurns = useMemo(
    () => projectsUi.ai_threads?.[threadKey] ?? [],
    [projectsUi.ai_threads, threadKey],
  );

  const refreshProjectsUi = useCallback(async () => {
    const config = await getConfig();
    setProjectsUi(config.projects_ui ?? defaultUiState);
  }, []);

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

  const refreshTrash = useCallback(async () => {
    setLoadingTrash(true);
    try {
      const items = await listTrashItems();
      setTrashItems(items);
    } catch {
      setTrashItems([]);
    } finally {
      setLoadingTrash(false);
    }
  }, []);

  useEffect(() => {
    void refreshTrash();
  }, [refreshTrash]);

  useEffect(() => {
    getConfig()
      .then((config) => {
        setProjectsDir(config.projects_dir);
        const ui = config.projects_ui ?? defaultUiState;
        setProjectsUi(ui);
        setPanelCollapsed(ui.evidence_panel_collapsed ?? false);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void refreshSidebar(searchQuery);
  }, [refreshSidebar, searchQuery]);

  useEffect(() => {
    if (restoredRef.current || !projectsUi.last_evidence_file) {
      return;
    }

    restoredRef.current = true;
    listProjectFiles()
      .then((entries) => {
        const match = entries.find((entry) => entry.path === projectsUi.last_evidence_file);
        if (match) {
          setSelected(match);
        }
        if (projectsUi.last_selected_folder) {
          setSelectedFolderRelative(projectsUi.last_selected_folder);
        }
      })
      .catch(() => undefined);
  }, [projectsUi.last_evidence_file, projectsUi.last_selected_folder]);

  useEffect(() => {
    if (!selected && !selectedFolderRelative) {
      return;
    }
    void saveProjectsUiState(selected?.path ?? null, selectedFolderRelative).then(setProjectsUi).catch(() => undefined);
  }, [selected, selectedFolderRelative]);

  useEffect(() => {
    if (!selected) {
      setNoteContent("");
      setScanResults([]);
      setLastResult(null);
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
    setCitationMiss(null);
    try {
      const target = await resolveCitation(citation);
      if (!target) {
        setCitationMiss(`未在本地 pack 找到引用：${citation}`);
        setCitationTarget({
          citation,
          standard_id: "",
          paragraph: "",
          pack_path: "",
          char_start: 0,
          char_end: 0,
          snippet_en: "",
          status: "current",
          resolved: false,
          paragraph_resolved: false,
        });
        setHighlight(null);
        showToast(`未找到引用：${citation}`, "info");
        return;
      }

      setCitationTarget(target);
      if (target.paragraph_resolved === false) {
        setHighlight(null);
        showToast(`未找到 ${citation} 对应段落，已打开 ${target.standard_id} 全文`, "info");
        return;
      }

      setHighlight({
        char_start: target.char_start,
        char_end: target.char_end,
        snippet_en: target.snippet_en,
        paragraph: target.paragraph,
      });
      showToast(`已打开 ${target.standard_id} §${target.paragraph}`, "info");
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      showToast(message, "error");
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

  const handleGenerate = async () => {
    const trimmed = question.trim();
    if (!trimmed) {
      setError("请先输入要分析的问题。");
      return;
    }

    setGenerating(true);
    setError(null);
    setLastResult(null);
    try {
      const generated = await generateProjectDocument(
        trimmed,
        facts.trim() || null,
        selectedFolderRelative,
      );
      setLastResult(generated);
      setQuestion("");
      setFacts("");
      await refreshProjectsUi();

      const entries = await listProjectFiles();
      const match = entries.find((entry) => entry.path === generated.file_path);
      if (match) {
        setSelected(match);
        setSelectedFolderRelative(folderRelativeForSelection(match.relative_path, null));
      }
      showToast(`已保存「${generated.project_name}」`);
      await refreshSidebar(searchQuery);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setGenerating(false);
    }
  };

  const handleContinue = async () => {
    if (!selected) {
      return;
    }
    const trimmed = question.trim();
    if (!trimmed) {
      setError("请先输入追问内容。");
      return;
    }

    setGenerating(true);
    setError(null);
    setLastResult(null);
    try {
      const updated = await continueProjectDocument(
        selected.path,
        trimmed,
        facts.trim() || null,
      );
      setLastResult(updated);
      setNoteContent(updated.content);
      const scanned = await scanNoteCitations(updated.content);
      setScanResults(scanned);
      setQuestion("");
      setFacts("");
      await refreshProjectsUi();
      showToast("已更新项目笔记");
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setGenerating(false);
    }
  };

  const handleTogglePanel = (collapsed: boolean) => {
    setPanelCollapsed(collapsed);
    void saveEvidencePanelCollapsed(collapsed).then(setProjectsUi).catch(() => undefined);
  };

  const handleDeleteFolder = async (folderRelative: string) => {
    const count = await countProjectFolderEntries(folderRelative);
    const message =
      count > 0
        ? `文件夹内有 ${count} 篇笔记，删除后笔记会移入废纸篓。确定删除「${folderRelative}」？`
        : `确定删除空文件夹「${folderRelative}」？`;
    if (!window.confirm(message)) {
      return;
    }
    const result = await deleteProjectFolder(folderRelative);
    showToast(
      result.trashed_files > 0
        ? `已删除文件夹，${result.trashed_files} 篇笔记已移入废纸篓`
        : "已删除空文件夹",
    );
    await refreshSidebar(searchQuery);
    await refreshTrash();
  };

  const breadcrumbFolder = folderRelativeForSelection(
    selected?.relative_path ?? null,
    selectedFolderRelative,
  );

  if (!projectsDir) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-amber-950">
        <h2 className="text-lg font-semibold">尚未设置项目目录</h2>
        <p className="mt-2 text-sm leading-6">
          请先在「设置」中选择 Obsidian Vault 的 <strong>02 - 项目</strong> 文件夹，
          然后回到 Evidence 工作台。
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
        <button
          type="button"
          onClick={() => {
            setTrashOpen((current) => !current);
            if (!trashOpen) {
              void refreshTrash();
            }
          }}
          className="rounded-full bg-white px-4 py-2 text-sm text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
        >
          废纸篓{trashItems.length > 0 ? ` (${trashItems.length})` : ""}
        </button>
        <p className="truncate text-xs text-slate-500">项目目录：{projectsDir}</p>
      </div>

      {!searchQuery.trim() && (
        <ProjectBreadcrumb
          selectedFolderRelative={breadcrumbFolder}
          selectedFileRelative={selected?.relative_path ?? null}
          onNavigateFolder={(folderRelative) => {
            setSelectedFolderRelative(folderRelative);
            if (folderRelative) {
              setSelected(null);
            }
          }}
        />
      )}

      {trashOpen && (
        <TrashPanel
          open={trashOpen}
          items={trashItems}
          loading={loadingTrash}
          onClose={() => setTrashOpen(false)}
          onRestore={async (id) => {
            const restored = await restoreTrashItem(id);
            showToast(`已恢复「${restored.title}」`);
            await refreshSidebar(searchQuery);
            await refreshTrash();
          }}
          onPurge={async (id) => {
            await purgeTrashItem(id);
            showToast("已永久删除", "info");
            await refreshTrash();
          }}
        />
      )}

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div
        className={[
          "grid min-h-0 flex-1 gap-3",
          panelCollapsed
            ? "grid-cols-[minmax(220px,240px)_minmax(0,1fr)]"
            : "grid-cols-[minmax(220px,240px)_minmax(0,1fr)_minmax(280px,360px)]",
        ].join(" ")}
      >
        <ProjectFolderTree
          nodes={tree}
          searchResults={searchResults}
          selectedPath={selected?.path ?? null}
          selectedFolderRelative={selectedFolderRelative}
          pinnedPaths={projectsUi.pinned}
          loading={loadingFiles}
          onSelectFile={(entry) => {
            setSelected(entry);
            setSelectedFolderRelative(folderRelativeForSelection(entry.relative_path, null));
          }}
          onSelectFolder={setSelectedFolderRelative}
          onCreateFolder={async (parentRelative, name) => {
            await createProjectFolder(name, parentRelative);
            showToast(`已创建文件夹「${name}」`);
            await refreshSidebar(searchQuery);
          }}
          onRenameFolder={async (folderRelative, newName) => {
            const updated = await renameProjectFolder(folderRelative, newName);
            showToast(`已重命名为「${newName}」`);
            await refreshSidebar(searchQuery);
            return updated;
          }}
          onRenameFile={async (filePath, newName) => {
            const renamed = await renameProjectFile(filePath, newName);
            showToast(`已重命名为「${newName}」`);
            await refreshSidebar(searchQuery);
            if (selected?.path === filePath) {
              setSelected(renamed);
            }
            return renamed;
          }}
          onMoveFile={async (filePath, targetFolderRelative) => {
            const moved = await moveProjectFile(filePath, targetFolderRelative);
            showToast(`已移动到 ${targetFolderRelative ?? "根目录"}`);
            await refreshSidebar(searchQuery);
            setSelected(moved);
          }}
          onDeleteFolder={handleDeleteFolder}
          onMoveFileToTrash={async (filePath) => {
            await moveProjectFileToTrash(filePath);
            showToast("已移入废纸篓", "info");
            if (selected?.path === filePath) {
              setSelected(null);
            }
            await refreshSidebar(searchQuery);
            await refreshTrash();
          }}
          onTogglePin={async (relativePath) => {
            const ui = await toggleProjectPin(relativePath);
            setProjectsUi(ui);
            showToast(
              ui.pinned.includes(relativePath) ? "已置顶" : "已取消置顶",
              "info",
            );
          }}
          onReorder={async (parentRelative, orderedRelativePaths) => {
            const ui = await saveProjectsChildOrder(parentRelative, orderedRelativePaths);
            setProjectsUi(ui);
            await refreshSidebar(searchQuery);
          }}
        />

        <NotePanel
          title={selected?.title ?? "项目笔记"}
          content={noteContent}
          scanResults={scanResults}
          loading={loadingNote}
          onCitationClick={(citation) => void handleCitationClick(citation)}
        />

        <EvidenceSidePanel
          collapsed={panelCollapsed}
          onToggleCollapsed={handleTogglePanel}
          selected={selected}
          selectedFolderRelative={selectedFolderRelative}
          conversationTurns={conversationTurns}
          question={question}
          facts={facts}
          onQuestionChange={setQuestion}
          onFactsChange={setFacts}
          generating={generating}
          onGenerate={() => void handleGenerate()}
          onContinue={() => void handleContinue()}
          lastResult={lastResult}
          citationTarget={citationTarget}
          highlight={highlight}
          missMessage={citationMiss}
          onOpenSuperseded={(standardId) => void handleOpenSuperseded(standardId)}
        />
      </div>
    </div>
  );
}
