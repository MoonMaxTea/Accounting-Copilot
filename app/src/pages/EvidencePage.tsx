import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  continueProjectDocument,
  countProjectFolderEntries,
  createProjectFolder,
  deleteProjectFolder,
  generateProjectDocument,
  getConfig,
  getProjectConversation,
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
import { useDialog } from "../components/DialogProvider";
import { IconGrip, IconSearch, IconTrash } from "../components/icons";
import { NotePanel } from "../components/NotePanel";
import { ProjectBreadcrumb } from "../components/ProjectBreadcrumb";
import {
  folderRelativeForSelection,
  ProjectFolderTree,
} from "../components/ProjectFolderTree";
import { TrashPanel } from "../components/TrashPanel";
import { useToast } from "../components/Toast";
import { useHorizontalResize } from "../hooks/useHorizontalResize";
import { usePreferences } from "../context/PreferencesContext";
import type {
  AiConversationTurn,
  CitationHighlight,
  CitationScanResult,
  CitationTarget,
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

function findLatestConversationFolder(
  aiThreads: Record<string, AiConversationTurn[]> | undefined,
  lastEvidenceFile: string | null,
  selectedRelativePath: string | null,
): string | null {
  if (selectedRelativePath) {
    return folderRelativeForSelection(selectedRelativePath, null);
  }

  let latestRelative: string | null = null;
  let latestTimestamp = 0;

  if (aiThreads) {
    for (const [relativePath, turns] of Object.entries(aiThreads)) {
      if (relativePath === DRAFT_THREAD_KEY || turns.length === 0) {
        continue;
      }
      const maxTimestamp = Math.max(...turns.map((turn) => turn.timestamp_secs));
      if (maxTimestamp > latestTimestamp) {
        latestTimestamp = maxTimestamp;
        latestRelative = relativePath;
      }
    }
  }

  if (latestRelative) {
    return folderRelativeForSelection(latestRelative, null);
  }

  if (lastEvidenceFile) {
    return folderRelativeForSelection(lastEvidenceFile, null);
  }

  return null;
}

interface EvidencePageProps {
  onOpenSettings?: () => void;
  genProgress: import("../types").AiGenerationProgress | null;
  genError: string | null;
  genResultPath: string | null;
  genCounter: number;
  onGenConsumed: () => void;
  onGenerationStart: () => void;
}

export function EvidencePage({
  onOpenSettings,
  genProgress,
  genError,
  genResultPath,
  genCounter,
  onGenConsumed,
  onGenerationStart,
}: EvidencePageProps) {
  const { showToast } = useToast();
  const { tr, trf } = usePreferences();
  const { confirm } = useDialog();
  const sidebar = useHorizontalResize(240, 200, 360);
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
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [conversationTurns, setConversationTurns] = useState<AiConversationTurn[]>([]);
  const restoredRef = useRef(false);

  const refreshConversation = useCallback(async (relativePath: string | null) => {
    try {
      const turns = await getProjectConversation(relativePath ?? DRAFT_THREAD_KEY);
      setConversationTurns(turns);
    } catch {
      setConversationTurns([]);
    }
  }, []);

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
    void refreshConversation(selected?.relative_path ?? null);
  }, [selected?.relative_path, refreshConversation]);

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

  // React to AI generation results from global events (survives page switches)
  const genResultConsumedRef = useRef<number>(0);
  useEffect(() => {
    if (genCounter <= genResultConsumedRef.current) {
      return;
    }
    genResultConsumedRef.current = genCounter;

    if (genError) {
      showToast(genError, "error");
      onGenConsumed();
      return;
    }

    if (genResultPath) {
      // Refresh to get the new file in tree, then select it
      (async () => {
        const files = await listProjectFiles();
        const match = files.find((f) => f.relative_path === genResultPath);
        if (match) {
          setSelected(match);
          setSelectedFolderRelative(
            folderRelativeForSelection(match.relative_path, null),
          );
        }
        await refreshSidebar(searchQuery);
        await refreshTrash();
        await refreshProjectsUi();
        if (match) {
          await refreshConversation(match.relative_path);
        }
        onGenConsumed();
      })().catch(() => {
        onGenConsumed();
      });
    }
  }, [genCounter, genError, genResultPath]);

  const handleCitationClick = async (citation: string) => {
    setError(null);
    setCitationMiss(null);
    try {
      const target = await resolveCitation(citation);
      if (!target) {
        setCitationMiss(trf("citationNotFoundInPack", { citation }));
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
        showToast(trf("toastCitationNotFound", { citation }), "info");
        return;
      }

      setCitationTarget(target);
      if (target.paragraph_resolved === false) {
        setHighlight(null);
        showToast(
          trf("toastParagraphFallback", {
            citation,
            standard: target.standard_id,
          }),
          "info",
        );
        return;
      }

      setHighlight({
        char_start: target.char_start,
        char_end: target.char_end,
        snippet_en: target.snippet_en,
        paragraph: target.paragraph,
      });
      showToast(
        trf("toastOpenedStandard", {
          standard: target.standard_id,
          paragraph: target.paragraph,
        }),
        "info",
      );
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
      setError(tr("enterQuestionBeforeGenerate"));
      return;
    }

    onGenerationStart();
    setGenerating(true);
    setError(null);
    try {
      const generated = await generateProjectDocument(
        trimmed,
        facts.trim() || null,
        selectedFolderRelative,
      );
      setQuestion("");
      setFacts("");
      await refreshProjectsUi();

      const entries = await listProjectFiles();
      const match = entries.find((entry) => entry.path === generated.file_path);
      if (match) {
        setSelected(match);
        setSelectedFolderRelative(folderRelativeForSelection(match.relative_path, null));
      }
      showToast(trf("savedProjectNote", { name: generated.project_name }));
      await refreshSidebar(searchQuery);
      await refreshConversation(generated.relative_path);
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
      setError(tr("enterFollowUpBeforeContinue"));
      return;
    }

    onGenerationStart();
    setGenerating(true);
    setError(null);
    try {
      const updated = await continueProjectDocument(
        selected.path,
        trimmed,
        facts.trim() || null,
      );
      setNoteContent(updated.content);
      const scanned = await scanNoteCitations(updated.content);
      setScanResults(scanned);
      setQuestion("");
      setFacts("");
      await refreshProjectsUi();
      showToast(tr("projectNoteUpdated"));
      await refreshConversation(selected.relative_path);
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
        ? trf("deleteFolderWithNotes", { count, folder: folderRelative })
        : trf("deleteEmptyFolder", { folder: folderRelative });
    const approved = await confirm({
      title: tr("deleteFolder"),
      message,
      confirmLabel: tr("delete"),
      tone: "danger",
    });
    if (!approved) {
      return;
    }
    const result = await deleteProjectFolder(folderRelative);
    showToast(
      result.trashed_files > 0
        ? trf("folderDeletedWithTrash", { count: result.trashed_files })
        : tr("emptyFolderDeleted"),
    );
    await refreshSidebar(searchQuery);
    await refreshTrash();
  };

  const breadcrumbFolder = folderRelativeForSelection(
    selected?.relative_path ?? null,
    selectedFolderRelative,
  );

  const activeConversationFolder = useMemo(
    () =>
      findLatestConversationFolder(
        projectsUi.ai_threads,
        projectsUi.last_evidence_file,
        selected?.relative_path ?? null,
      ),
    [projectsUi.ai_threads, projectsUi.last_evidence_file, selected?.relative_path],
  );

  if (!projectsDir) {
    return (
      <section className="ui-alert-warning rounded-lg p-8">
        <p className="text-caption font-medium">{tr("step2Title")}</p>
        <h2 className="mt-2 text-title">{tr("projectFolderNotConfigured")}</h2>
        <p className="mt-2 text-body">{tr("projectFolderHint")}</p>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="ui-focus-ring mt-4 rounded-lg bg-amber-900 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800"
          >
            {tr("openSettings")}
          </button>
        )}
      </section>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {genProgress && genProgress.phase !== "complete" && genProgress.phase !== "error" && (
        <div className="rounded-lg border border-brand-border bg-brand-surface px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-accent border-t-transparent" />
            <span className="text-sm text-brand-ink">
              {genProgress.phase === "searching"
                ? genProgress.message
                : genProgress.message || tr("generating")}
            </span>
          </div>
          {genProgress.phase === "searching" && (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-brand-hover">
              <div className="h-full animate-pulse rounded-full bg-brand-accent" style={{ width: "60%" }} />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-brand-border bg-brand-surface px-3 py-2">
          <IconSearch className="h-4 w-4 text-brand-muted" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={tr("searchProjectNotes")}
            className="ui-focus-ring w-full bg-transparent text-sm text-brand-ink outline-none"
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
          className="ui-focus-ring inline-flex items-center gap-2 rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-ink hover:bg-brand-hover"
        >
          <IconTrash className="h-4 w-4" />
          {tr("trash")}{trashItems.length > 0 ? ` (${trashItems.length})` : ""}
        </button>
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
            showToast(trf("restoredItem", { title: restored.title }));
            await refreshSidebar(searchQuery);
            await refreshTrash();
          }}
          onPurge={async (id) => {
            await purgeTrashItem(id);
            showToast(tr("permanentlyDeleted"), "info");
            await refreshTrash();
          }}
        />
      )}

      {error && <p className="ui-alert-error rounded-lg px-4 py-3 text-sm">{error}</p>}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="h-full shrink-0" style={{ width: sidebar.width }}>
        <ProjectFolderTree
          nodes={tree}
          searchResults={searchResults}
          selectedPath={selected?.path ?? null}
          selectedFolderRelative={selectedFolderRelative}
          pinnedPaths={projectsUi.pinned}
          loading={loadingFiles}
          activeFolderRelative={activeConversationFolder}
          onSelectFile={(entry) => {
            setSelected(entry);
            setSelectedFolderRelative(folderRelativeForSelection(entry.relative_path, null));
          }}
          onSelectFolder={setSelectedFolderRelative}
          onCreateFolder={async (parentRelative, name) => {
            await createProjectFolder(name, parentRelative);
            showToast(trf("createdFolder", { name }));
            await refreshSidebar(searchQuery);
          }}
          onRenameFolder={async (folderRelative, newName) => {
            const updated = await renameProjectFolder(folderRelative, newName);
            showToast(trf("renamedTo", { name: newName }));
            await refreshSidebar(searchQuery);
            return updated;
          }}
          onRenameFile={async (filePath, newName) => {
            const renamed = await renameProjectFile(filePath, newName);
            showToast(trf("renamedTo", { name: newName }));
            await refreshSidebar(searchQuery);
            if (selected?.path === filePath) {
              setSelected(renamed);
            }
            return renamed;
          }}
          onMoveFile={async (filePath, targetFolderRelative) => {
            const moved = await moveProjectFile(filePath, targetFolderRelative);
            showToast(
              trf("movedToFolder", {
                folder: targetFolderRelative ?? tr("root"),
              }),
            );
            await refreshSidebar(searchQuery);
            setSelected(moved);
          }}
          onDeleteFolder={handleDeleteFolder}
          onMoveFileToTrash={async (filePath) => {
            await moveProjectFileToTrash(filePath);
            showToast(tr("movedToTrashToast"), "info");
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
              ui.pinned.includes(relativePath) ? tr("pinned") : tr("unpinned"),
              "info",
            );
          }}
          onReorder={async (parentRelative, orderedRelativePaths) => {
            const ui = await saveProjectsChildOrder(parentRelative, orderedRelativePaths);
            setProjectsUi(ui);
            await refreshSidebar(searchQuery);
          }}
          onClearSelection={() => {
            setSelected(null);
            setSelectedFolderRelative(null);
          }}
        />
        </div>

        <button
          type="button"
          aria-label={tr("resizeSidebar")}
          onMouseDown={sidebar.onMouseDown}
          className={[
            "flex w-1.5 shrink-0 items-center justify-center border-x border-brand-border bg-brand-paper hover:bg-brand-hover",
            sidebar.dragging ? "bg-brand-border" : "",
          ].join(" ")}
        >
          <IconGrip className="h-4 w-4 text-brand-muted" />
        </button>

        <div className="min-h-0 min-w-0 flex-1 border border-brand-border bg-brand-surface">
        <NotePanel
          title={selected?.title ?? tr("projectNote")}
          content={noteContent}
          scanResults={scanResults}
          loading={loadingNote}
          onCitationClick={(citation) => void handleCitationClick(citation)}
        />
        </div>

        <div className={panelCollapsed ? "h-full shrink-0" : "min-h-0 min-w-0 flex-1"}>
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
          onExampleQuestion={setQuestion}
          citationTarget={citationTarget}
          highlight={highlight}
          missMessage={citationMiss}
          onOpenSuperseded={(standardId) => void handleOpenSuperseded(standardId)}
        />
        </div>
      </div>
    </div>
  );
}
