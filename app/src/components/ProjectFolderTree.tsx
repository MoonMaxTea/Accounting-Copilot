import { useMemo, useState } from "react";
import type { ProjectFileEntry, ProjectTreeNode } from "../types";
import { treeFileToEntry } from "../types";

interface ProjectFolderTreeProps {
  nodes: ProjectTreeNode[];
  searchResults?: ProjectFileEntry[] | null;
  selectedPath: string | null;
  selectedFolderRelative: string | null;
  pinnedPaths?: string[];
  loading: boolean;
  onSelectFile: (entry: ProjectFileEntry) => void;
  onSelectFolder: (relativePath: string | null) => void;
  onCreateFolder: (parentRelative: string | null, name: string) => Promise<void>;
  onRenameFolder: (folderRelative: string, newName: string) => Promise<string>;
  onMoveFile: (filePath: string, targetFolderRelative: string | null) => Promise<void>;
  onDeleteFolder?: (folderRelative: string) => Promise<void>;
  onMoveFileToTrash?: (filePath: string) => Promise<void>;
  onTogglePin?: (relativePath: string) => Promise<void>;
  onReorder?: (parentRelative: string | null, orderedRelativePaths: string[]) => Promise<void>;
  emptyMessage?: string;
}

interface ReorderPayload {
  relativePath: string;
  parentRelative: string | null;
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

function promptText(label: string, defaultValue = ""): string | null {
  const value = window.prompt(label, defaultValue);
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nodeRelativePath(node: ProjectTreeNode): string {
  return node.relative_path;
}

function parentRelativeFromPath(relativePath: string): string | null {
  const index = relativePath.lastIndexOf("/");
  if (index <= 0) {
    return null;
  }
  return relativePath.slice(0, index);
}

function collectPinnedNodes(nodes: ProjectTreeNode[], pinned: Set<string>): ProjectTreeNode[] {
  const found: ProjectTreeNode[] = [];
  const walk = (items: ProjectTreeNode[]) => {
    for (const item of items) {
      if (pinned.has(nodeRelativePath(item))) {
        found.push(item);
      }
      if (item.kind === "folder") {
        walk(item.children);
      }
    }
  };
  walk(nodes);
  return found;
}

function siblingRelativePaths(nodes: ProjectTreeNode[]): string[] {
  return nodes.map((node) => nodeRelativePath(node));
}

function reorderRelativePaths(
  current: string[],
  draggedRelative: string,
  targetRelative: string,
): string[] {
  if (draggedRelative === targetRelative) {
    return current;
  }
  const next = current.filter((item) => item !== draggedRelative);
  const targetIndex = next.indexOf(targetRelative);
  if (targetIndex < 0) {
    next.push(draggedRelative);
  } else {
    next.splice(targetIndex, 0, draggedRelative);
  }
  return next;
}

export function ProjectFolderTree({
  nodes,
  searchResults = null,
  selectedPath,
  selectedFolderRelative,
  pinnedPaths = [],
  loading,
  onSelectFile,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onMoveFile,
  onDeleteFolder,
  onMoveFileToTrash,
  onTogglePin,
  onReorder,
  emptyMessage = "暂无项目笔记。可新建文件夹，或将 AI 生成的笔记保存到这里。",
}: ProjectFolderTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dragOverFolder, setDragOverFolder] = useState<string | "__root__" | null>(null);
  const [dragOverReorder, setDragOverReorder] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pinnedSet = useMemo(() => new Set(pinnedPaths), [pinnedPaths]);
  const pinnedNodes = useMemo(
    () => collectPinnedNodes(nodes, pinnedSet),
    [nodes, pinnedSet],
  );

  const allFolderPaths = useMemo(() => {
    const paths: string[] = [];
    const walk = (items: ProjectTreeNode[]) => {
      for (const item of items) {
        if (item.kind === "folder") {
          paths.push(item.relative_path);
          walk(item.children);
        }
      }
    };
    walk(nodes);
    return paths;
  }, [nodes]);

  const toggleExpanded = (relativePath: string) => {
    setExpanded((current) => ({
      ...current,
      [relativePath]: !(current[relativePath] ?? true),
    }));
  };

  const handleCreateFolder = async () => {
    const name = promptText("新建文件夹名称");
    if (!name) {
      return;
    }
    setBusy(true);
    try {
      await onCreateFolder(selectedFolderRelative, name);
      if (selectedFolderRelative) {
        setExpanded((current) => ({
          ...current,
          [selectedFolderRelative]: true,
        }));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRenameFolder = async () => {
    if (!selectedFolderRelative) {
      window.alert("请先选择一个文件夹。");
      return;
    }
    const currentName =
      allFolderPaths.includes(selectedFolderRelative)
        ? selectedFolderRelative.split("/").pop() ?? selectedFolderRelative
        : selectedFolderRelative;
    const name = promptText("重命名文件夹", currentName);
    if (!name) {
      return;
    }
    setBusy(true);
    try {
      const updated = await onRenameFolder(selectedFolderRelative, name);
      onSelectFolder(updated);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteFolder = async () => {
    if (!selectedFolderRelative || !onDeleteFolder) {
      return;
    }
    setBusy(true);
    try {
      await onDeleteFolder(selectedFolderRelative);
      onSelectFolder(null);
    } finally {
      setBusy(false);
    }
  };

  const handleDropOnFolder = async (
    targetFolderRelative: string | null,
    event: React.DragEvent,
  ) => {
    event.preventDefault();
    setDragOverFolder(null);

    const reorderRaw = event.dataTransfer.getData("text/project-reorder");
    if (reorderRaw) {
      return;
    }

    const filePath = event.dataTransfer.getData("text/project-file");
    if (!filePath) {
      return;
    }
    setBusy(true);
    try {
      await onMoveFile(filePath, targetFolderRelative);
    } finally {
      setBusy(false);
    }
  };

  const handleReorderDrop = async (
    parentRelative: string | null,
    siblings: ProjectTreeNode[],
    targetRelative: string,
    event: React.DragEvent,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOverReorder(null);

    const reorderRaw = event.dataTransfer.getData("text/project-reorder");
    if (!reorderRaw || !onReorder) {
      return;
    }

    let payload: ReorderPayload;
    try {
      payload = JSON.parse(reorderRaw) as ReorderPayload;
    } catch {
      return;
    }

    if (payload.parentRelative !== parentRelative) {
      return;
    }

    const current = siblingRelativePaths(siblings);
    const next = reorderRelativePaths(current, payload.relativePath, targetRelative);
    setBusy(true);
    try {
      await onReorder(parentRelative, next);
    } finally {
      setBusy(false);
    }
  };

  const renderPinButton = (relativePath: string) => {
    if (!onTogglePin) {
      return null;
    }
    const pinned = pinnedSet.has(relativePath);
    return (
      <button
        type="button"
        title={pinned ? "取消置顶" : "置顶"}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setBusy(true);
          void onTogglePin(relativePath).finally(() => setBusy(false));
        }}
        className={[
          "rounded px-1 text-xs",
          pinned ? "text-amber-500" : "text-slate-400 hover:text-amber-500",
        ].join(" ")}
      >
        {pinned ? "★" : "☆"}
      </button>
    );
  };

  const renderReorderHandle = (relativePath: string, parentRelative: string | null) => {
    if (!onReorder) {
      return null;
    }
    const payload: ReorderPayload = { relativePath, parentRelative };
    return (
      <span
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData("text/project-reorder", JSON.stringify(payload));
          event.dataTransfer.effectAllowed = "move";
        }}
        className="cursor-grab select-none px-1 text-xs text-slate-400"
        title="拖拽排序"
      >
        ⋮⋮
      </span>
    );
  };

  const renderFile = (
    node: Extract<ProjectTreeNode, { kind: "file" }>,
    depth: number,
    parentRelative: string | null,
    siblings: ProjectTreeNode[],
  ) => {
    const active = node.path === selectedPath;
    const entry = treeFileToEntry(node);
    const reorderActive = dragOverReorder === node.relative_path;

    return (
      <li
        key={node.path}
        style={{ marginLeft: depth * 12 }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("text/project-reorder")) {
            return;
          }
          event.preventDefault();
          setDragOverReorder(node.relative_path);
        }}
        onDragLeave={() => setDragOverReorder(null)}
        onDrop={(event) => void handleReorderDrop(parentRelative, siblings, node.relative_path, event)}
        className={reorderActive ? "rounded-lg ring-2 ring-blue-300" : ""}
      >
        <div className="flex items-start gap-1">
          {renderReorderHandle(node.relative_path, parentRelative)}
          <button
            type="button"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("text/project-file", node.path);
              event.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => onSelectFile(entry)}
            className={[
              "min-w-0 flex-1 rounded-lg px-2 py-2 text-left transition",
              active ? "bg-slate-900 text-white" : "hover:bg-slate-100",
            ].join(" ")}
          >
            <p className="truncate text-sm font-medium">📄 {node.title}</p>
            <p
              className={["truncate text-xs", active ? "text-slate-300" : "text-slate-500"].join(
                " ",
              )}
            >
              {formatModified(node.modified_secs)}
            </p>
          </button>
          {renderPinButton(node.relative_path)}
          {onMoveFileToTrash && (
            <button
              type="button"
              title="移入废纸篓"
              onClick={(event) => {
                event.stopPropagation();
                if (window.confirm(`将「${node.title}」移入废纸篓？`)) {
                  setBusy(true);
                  void onMoveFileToTrash(node.path).finally(() => setBusy(false));
                }
              }}
              className="rounded px-1 text-xs text-slate-400 hover:text-red-600"
            >
              🗑
            </button>
          )}
        </div>
      </li>
    );
  };

  const renderFolder = (
    node: Extract<ProjectTreeNode, { kind: "folder" }>,
    depth: number,
    parentRelative: string | null,
    siblings: ProjectTreeNode[],
  ) => {
    const isOpen = expanded[node.relative_path] ?? true;
    const isSelected = selectedFolderRelative === node.relative_path;
    const isDragOver = dragOverFolder === node.relative_path;
    const reorderActive = dragOverReorder === node.relative_path;

    return (
      <li
        key={node.path}
        style={{ marginLeft: depth * 12 }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("text/project-reorder")) {
            event.preventDefault();
            setDragOverReorder(node.relative_path);
            return;
          }
          event.preventDefault();
          setDragOverFolder(node.relative_path);
        }}
        onDragLeave={() => {
          setDragOverFolder(null);
          setDragOverReorder(null);
        }}
        onDrop={(event) => {
          if (event.dataTransfer.types.includes("text/project-reorder")) {
            void handleReorderDrop(parentRelative, siblings, node.relative_path, event);
            return;
          }
          void handleDropOnFolder(node.relative_path, event);
        }}
        className={reorderActive ? "rounded-lg ring-2 ring-blue-300" : ""}
      >
        <div
          className={[
            "flex items-start gap-1 rounded-lg",
            isDragOver ? "bg-blue-50 ring-2 ring-blue-300" : "",
          ].join(" ")}
        >
          {renderReorderHandle(node.relative_path, parentRelative)}
          <button
            type="button"
            onClick={() => {
              onSelectFolder(node.relative_path);
              toggleExpanded(node.relative_path);
            }}
            className={[
              "min-w-0 flex-1 flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition",
              isSelected ? "bg-slate-200 font-medium text-slate-900" : "hover:bg-slate-100",
            ].join(" ")}
          >
            <span className="text-xs text-slate-500">{isOpen ? "▾" : "▸"}</span>
            <span className="truncate">📁 {node.name}</span>
          </button>
          {renderPinButton(node.relative_path)}
        </div>
        {isOpen && node.children.length > 0 && (
          <ul className="mt-1 space-y-1">
            {renderNodes(node.children, depth + 1, node.relative_path)}
          </ul>
        )}
      </li>
    );
  };

  const renderNodes = (items: ProjectTreeNode[], depth = 0, parentRelative: string | null = null) =>
    items.map((node) =>
      node.kind === "folder"
        ? renderFolder(node, depth, parentRelative, items)
        : renderFile(node, depth, parentRelative, items),
    );

  const renderPinnedNode = (node: ProjectTreeNode) => {
    if (node.kind === "file") {
      const entry = treeFileToEntry(node);
      return (
        <li key={`pin-${node.path}`}>
          <button
            type="button"
            onClick={() => onSelectFile(entry)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-100"
          >
            <span className="text-amber-500">★</span>
            <span className="truncate text-sm">{node.title}</span>
          </button>
        </li>
      );
    }

    return (
      <li key={`pin-${node.path}`}>
        <button
          type="button"
          onClick={() => onSelectFolder(node.relative_path)}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-100"
        >
          <span className="text-amber-500">★</span>
          <span className="truncate text-sm">📁 {node.name}</span>
        </button>
      </li>
    );
  };

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        正在加载项目笔记…
      </section>
    );
  }

  const showingSearch = searchResults !== null;

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">项目笔记</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {showingSearch ? "搜索结果" : "文件夹 · 拖拽归类 · ⋮⋮ 排序"}
            </p>
          </div>
          {!showingSearch && (
            <div className="flex flex-wrap justify-end gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCreateFolder()}
                className="rounded-lg bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-700 disabled:opacity-50"
                title={selectedFolderRelative ? "在所选文件夹下新建" : "在根目录新建"}
              >
                + 文件夹
              </button>
              <button
                type="button"
                disabled={busy || !selectedFolderRelative}
                onClick={() => void handleRenameFolder()}
                className="rounded-lg px-2 py-1 text-xs ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40"
              >
                重命名
              </button>
              {onDeleteFolder && (
                <button
                  type="button"
                  disabled={busy || !selectedFolderRelative}
                  onClick={() => void handleDeleteFolder()}
                  className="rounded-lg px-2 py-1 text-xs text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-40"
                >
                  删除
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <div
        className={[
          "min-h-0 flex-1 overflow-auto p-2",
          dragOverFolder === "__root__" ? "bg-blue-50" : "",
        ].join(" ")}
        onDragOver={(event) => {
          if (showingSearch) {
            return;
          }
          if (event.dataTransfer.types.includes("text/project-reorder")) {
            return;
          }
          event.preventDefault();
          setDragOverFolder("__root__");
        }}
        onDragLeave={() => setDragOverFolder(null)}
        onDrop={(event) => {
          if (showingSearch) {
            return;
          }
          void handleDropOnFolder(null, event);
        }}
      >
        {showingSearch ? (
          searchResults.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">没有匹配的项目笔记。</p>
          ) : (
            <ul className="space-y-1">
              {searchResults.map((entry) => {
                const active = entry.path === selectedPath;
                return (
                  <li key={entry.path}>
                    <button
                      type="button"
                      onClick={() => onSelectFile(entry)}
                      className={[
                        "w-full rounded-lg px-2 py-2 text-left transition",
                        active ? "bg-slate-900 text-white" : "hover:bg-slate-100",
                      ].join(" ")}
                    >
                      <p className="truncate text-sm font-medium">{entry.title}</p>
                      <p
                        className={[
                          "truncate text-xs",
                          active ? "text-slate-300" : "text-slate-500",
                        ].join(" ")}
                      >
                        {entry.relative_path}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <>
            {pinnedNodes.length > 0 && (
              <div className="mb-3 rounded-xl bg-amber-50 px-2 py-2 ring-1 ring-amber-100">
                <p className="px-2 pb-1 text-xs font-medium text-amber-900">置顶</p>
                <ul className="space-y-1">{pinnedNodes.map(renderPinnedNode)}</ul>
              </div>
            )}
            {nodes.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">{emptyMessage}</p>
            ) : (
              <ul className="space-y-1">{renderNodes(nodes)}</ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export function folderRelativeForSelection(
  selectedPath: string | null,
  selectedFolderRelative: string | null,
): string | null {
  if (selectedFolderRelative) {
    return selectedFolderRelative;
  }
  if (!selectedPath) {
    return null;
  }
  return parentRelativeFromPath(selectedPath);
}
