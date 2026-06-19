import { useMemo, useState } from "react";
import type { ProjectFileEntry, ProjectTreeNode } from "../types";
import { treeFileToEntry } from "../types";

interface ProjectFolderTreeProps {
  nodes: ProjectTreeNode[];
  searchResults?: ProjectFileEntry[] | null;
  selectedPath: string | null;
  selectedFolderRelative: string | null;
  loading: boolean;
  onSelectFile: (entry: ProjectFileEntry) => void;
  onSelectFolder: (relativePath: string | null) => void;
  onCreateFolder: (parentRelative: string | null, name: string) => Promise<void>;
  onRenameFolder: (folderRelative: string, newName: string) => Promise<string>;
  onMoveFile: (filePath: string, targetFolderRelative: string | null) => Promise<void>;
  emptyMessage?: string;
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

export function ProjectFolderTree({
  nodes,
  searchResults = null,
  selectedPath,
  selectedFolderRelative,
  loading,
  onSelectFile,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onMoveFile,
  emptyMessage = "暂无项目笔记。可新建文件夹，或将 AI 生成的笔记保存到这里。",
}: ProjectFolderTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dragOverFolder, setDragOverFolder] = useState<string | "__root__" | null>(null);
  const [busy, setBusy] = useState(false);

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

  const handleDropOnFolder = async (
    targetFolderRelative: string | null,
    event: React.DragEvent,
  ) => {
    event.preventDefault();
    setDragOverFolder(null);
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

  const renderFile = (node: Extract<ProjectTreeNode, { kind: "file" }>, depth: number) => {
    const active = node.path === selectedPath;
    const entry = treeFileToEntry(node);
    return (
      <li key={node.path} style={{ marginLeft: depth * 12 }}>
        <button
          type="button"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("text/project-file", node.path);
            event.dataTransfer.effectAllowed = "move";
          }}
          onClick={() => onSelectFile(entry)}
          className={[
            "w-full rounded-lg px-2 py-2 text-left transition",
            active ? "bg-slate-900 text-white" : "hover:bg-slate-100",
          ].join(" ")}
        >
          <p className="truncate text-sm font-medium">📄 {node.title}</p>
          <p className={["truncate text-xs", active ? "text-slate-300" : "text-slate-500"].join(" ")}>
            {formatModified(node.modified_secs)}
          </p>
        </button>
      </li>
    );
  };

  const renderFolder = (
    node: Extract<ProjectTreeNode, { kind: "folder" }>,
    depth: number,
  ) => {
    const isOpen = expanded[node.relative_path] ?? true;
    const isSelected = selectedFolderRelative === node.relative_path;
    const isDragOver = dragOverFolder === node.relative_path;

    return (
      <li key={node.path} style={{ marginLeft: depth * 12 }}>
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragOverFolder(node.relative_path);
          }}
          onDragLeave={() => setDragOverFolder(null)}
          onDrop={(event) => void handleDropOnFolder(node.relative_path, event)}
          className={[
            "rounded-lg",
            isDragOver ? "bg-blue-50 ring-2 ring-blue-300" : "",
          ].join(" ")}
        >
          <button
            type="button"
            onClick={() => {
              onSelectFolder(node.relative_path);
              toggleExpanded(node.relative_path);
            }}
            className={[
              "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition",
              isSelected ? "bg-slate-200 font-medium text-slate-900" : "hover:bg-slate-100",
            ].join(" ")}
          >
            <span className="text-xs text-slate-500">{isOpen ? "▾" : "▸"}</span>
            <span className="truncate">📁 {node.name}</span>
          </button>
        </div>
        {isOpen && node.children.length > 0 && (
          <ul className="mt-1 space-y-1">{renderNodes(node.children, depth + 1)}</ul>
        )}
      </li>
    );
  };

  const renderNodes = (items: ProjectTreeNode[], depth = 0) =>
    items.map((node) =>
      node.kind === "folder" ? renderFolder(node, depth) : renderFile(node, depth),
    );

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
              {showingSearch ? "搜索结果" : "文件夹 · 拖拽归类"}
            </p>
          </div>
          {!showingSearch && (
            <div className="flex gap-1">
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
        ) : nodes.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">{emptyMessage}</p>
        ) : (
          <ul className="space-y-1">{renderNodes(nodes)}</ul>
        )}
      </div>
    </section>
  );
}
