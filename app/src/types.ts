export interface FrameworkCounts {
  ifrs: number;
  ias: number;
  asc: number;
}

export interface RegistryCounts {
  current: FrameworkCounts;
  legacy: FrameworkCounts;
}

export interface PackInfo {
  loaded: boolean;
  content_version: string | null;
  vault_commit: string | null;
  counts: RegistryCounts | null;
  content_dir: string | null;
}

export interface StandardSummary {
  id: string;
  title: string;
  title_zh: string | null;
  framework: string;
  status: string;
  legacy_label: string | null;
  superseded_by: string | null;
  official_url: string;
}

export interface StandardDetail extends StandardSummary {
  effective_until: string | null;
  official_url_note: string | null;
  pack_path: string;
  body: string;
}

export interface SearchHit {
  standard_id: string;
  pack_path: string;
  title: string;
  snippet: string;
}

export type FrameworkFilter = "ALL" | "IFRS" | "IAS" | "ASC";
export type AppTab = "standards" | "evidence" | "projects" | "settings";

export interface AiConfig {
  provider: string | null;
  api_key: string | null;
  model: string | null;
  allow_legacy_citations: boolean;
}

export interface AppConfigResponse {
  projects_dir: string | null;
  ai: AiConfig;
}

export interface ProjectFileEntry {
  path: string;
  relative_path: string;
  title: string;
  modified_secs: number;
}

export type ProjectTreeFolder = {
  kind: "folder";
  name: string;
  path: string;
  relative_path: string;
  children: ProjectTreeNode[];
};

export type ProjectTreeFile = {
  kind: "file";
  name: string;
  path: string;
  relative_path: string;
  title: string;
  modified_secs: number;
};

export type ProjectTreeNode = ProjectTreeFolder | ProjectTreeFile;

export function treeFileToEntry(node: ProjectTreeFile): ProjectFileEntry {
  return {
    path: node.path,
    relative_path: node.relative_path,
    title: node.title,
    modified_secs: node.modified_secs,
  };
}

export interface CitationRef {
  standardId: string;
  paragraph: string;
}

export interface ParagraphIndexEntry {
  standard_id: string;
  paragraph: string;
  paragraph_normalized: string;
  pack_path: string;
  char_start: number;
  char_end: number;
  snippet_en: string;
  status: string;
}

export interface CitationTarget {
  citation: string;
  standard_id: string;
  paragraph: string;
  pack_path: string;
  char_start: number;
  char_end: number;
  snippet_en: string;
  status: string;
  resolved: boolean;
}

export interface CitationScanResult {
  citation: string;
  resolved: boolean;
  target: CitationTarget | null;
}

export interface CitationHighlight {
  char_start: number;
  char_end: number;
  snippet_en: string;
  paragraph: string;
}

export interface ProjectValidationReport {
  citations: CitationScanResult[];
  warnings: string[];
}

export interface GenerateProjectResult {
  project_name: string;
  file_path: string;
  relative_path: string;
  title: string;
  content: string;
  validation: ProjectValidationReport;
}
