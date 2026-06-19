import { useCallback, useEffect, useState } from "react";
import {
  getConfig,
  getStandard,
  listProjectFiles,
  readProjectFile,
  resolveCitation,
  scanNoteCitations,
  searchProjectFiles,
} from "../api";
import { EvidenceStandardPanel } from "../components/EvidenceStandardPanel";
import { NotePanel } from "../components/NotePanel";
import { ProjectFileTree } from "../components/ProjectFileTree";
import type {
  CitationHighlight,
  CitationScanResult,
  CitationTarget,
  ProjectFileEntry,
} from "../types";

export function EvidencePage() {
  const [projectsDir, setProjectsDir] = useState<string | null>(null);
  const [files, setFiles] = useState<ProjectFileEntry[]>([]);
  const [selected, setSelected] = useState<ProjectFileEntry | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [scanResults, setScanResults] = useState<CitationScanResult[]>([]);
  const [citationTarget, setCitationTarget] = useState<CitationTarget | null>(null);
  const [highlight, setHighlight] = useState<CitationHighlight | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingNote, setLoadingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshFiles = useCallback(async (query: string) => {
    setLoadingFiles(true);
    setError(null);
    try {
      const result = query.trim()
        ? await searchProjectFiles(query.trim())
        : await listProjectFiles();
      setFiles(result);
      setSelected((current) => {
        if (current && result.some((item) => item.path === current.path)) {
          return current;
        }
        return result[0] ?? null;
      });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setFiles([]);
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
    void refreshFiles(searchQuery);
  }, [refreshFiles, searchQuery]);

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

      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_minmax(0,1fr)] gap-4">
        <ProjectFileTree
          files={files}
          selectedPath={selected?.path ?? null}
          loading={loadingFiles}
          onSelect={setSelected}
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
