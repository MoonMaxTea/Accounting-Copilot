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
export type AppTab = "standards" | "settings";
