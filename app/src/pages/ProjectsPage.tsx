import { useCallback, useEffect, useState } from "react";
import {
  generateProjectDocument,
  getConfig,
  listProjectFiles,
  revealProjectsDir,
  revealProjectFile,
  searchProjectFiles,
} from "../api";
import { ProjectFileTree } from "../components/ProjectFileTree";
import { MarkdownPreview } from "../components/MarkdownPreview";
import type { GenerateProjectResult, ProjectFileEntry } from "../types";

interface ProjectsPageProps {
  onOpenInEvidence: (filePath: string) => void;
}

export function ProjectsPage({ onOpenInEvidence }: ProjectsPageProps) {
  const [projectsDir, setProjectsDir] = useState<string | null>(null);
  const [files, setFiles] = useState<ProjectFileEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [question, setQuestion] = useState("");
  const [facts, setFacts] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateProjectResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshFiles = useCallback(async (query: string) => {
    setLoadingFiles(true);
    setError(null);
    try {
      const entries = query.trim()
        ? await searchProjectFiles(query.trim())
        : await listProjectFiles();
      setFiles(entries);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setFiles([]);
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

  const handleGenerate = async () => {
    const trimmed = question.trim();
    if (!trimmed) {
      setError("请先输入要分析的问题。");
      return;
    }

    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const generated = await generateProjectDocument(
        trimmed,
        facts.trim() || null,
      );
      setResult(generated);
      await refreshFiles(searchQuery);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setGenerating(false);
    }
  };

  if (!projectsDir) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-amber-950">
        <h2 className="text-lg font-semibold">尚未设置项目目录</h2>
        <p className="mt-2 text-sm leading-6">
          请先在「设置」中选择 Obsidian Vault 的 <strong>02 - 项目</strong> 文件夹。
        </p>
      </section>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(220px,260px)_minmax(0,1fr)] gap-3">
        <div className="flex min-h-0 flex-col gap-3">
          <label className="flex items-center gap-2 rounded-full bg-white px-4 py-2 ring-1 ring-slate-200">
            <span className="text-sm text-slate-500">🔍</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索历史项目…"
              className="w-full bg-transparent text-sm text-slate-800 outline-none"
            />
          </label>
          <div className="min-h-0 flex-1">
            <ProjectFileTree
              files={files}
              selectedPath={null}
              loading={loadingFiles}
              onSelect={(entry) => onOpenInEvidence(entry.path)}
            />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
            点击历史项目可在 Evidence 中打开。
            <button
              type="button"
              onClick={() => void revealProjectsDir()}
              className="mt-2 block text-blue-700 underline"
            >
              打开项目文件夹
            </button>
          </div>
        </div>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-xl font-semibold text-slate-900">新建项目笔记</h2>
            <p className="mt-1 text-sm text-slate-500">
              输入问题后 AI 会自动生成项目名，并直接保存为 <code>{`{项目名}-{日期}.md`}</code>
            </p>
          </header>

          <div className="flex-1 space-y-4 overflow-auto px-6 py-5">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-800">你的问题</span>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={4}
                placeholder="例如：50:50 持股的合营安排应如何判断？"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none ring-slate-900 focus:ring-2"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-800">补充事实（可选）</span>
              <textarea
                value={facts}
                onChange={(event) => setFacts(event.target.value)}
                rows={3}
                placeholder="例如：A 与 B 各持股 50%，重大决策需双方一致同意…"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none ring-slate-900 focus:ring-2"
              />
            </label>

            <button
              type="button"
              disabled={generating}
              onClick={() => void handleGenerate()}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:bg-slate-400"
            >
              {generating ? "正在生成并保存…" : "生成项目笔记"}
            </button>

            {error && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
            )}

            {result && (
              <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950">
                <p className="font-medium">
                  已保存至 {result.relative_path}（项目名：{result.project_name}）
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenInEvidence(result.file_path)}
                    className="rounded-lg bg-emerald-900 px-4 py-2 text-white hover:bg-emerald-800"
                  >
                    在 Evidence 中打开
                  </button>
                  <button
                    type="button"
                    onClick={() => void revealProjectFile(result.file_path)}
                    className="rounded-lg bg-white px-4 py-2 ring-1 ring-emerald-300 hover:bg-emerald-100"
                  >
                    打开所在文件夹
                  </button>
                </div>

                {result.validation.warnings.length > 0 && (
                  <div className="rounded-xl bg-amber-100 px-4 py-3 text-amber-950">
                    <p className="font-medium">校验警告（文件已保存）：</p>
                    <ul className="mt-2 list-disc pl-5">
                      {result.validation.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="max-h-64 overflow-auto rounded-xl bg-white/80 px-4 py-3 ring-1 ring-emerald-100">
                  <p className="mb-2 font-medium text-slate-800">生成预览</p>
                  <MarkdownPreview content={result.content} />
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
