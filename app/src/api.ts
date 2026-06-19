import { invoke } from "@tauri-apps/api/core";
import type {
  AppConfigResponse,
  AiConfig,
  CitationScanResult,
  CitationTarget,
  GenerateProjectResult,
  PackInfo,
  ProjectFileEntry,
  SearchHit,
  StandardDetail,
  StandardSummary,
} from "./types";

export function getPackInfo(): Promise<PackInfo> {
  return invoke<PackInfo>("get_pack_info");
}

export function pickAndImportContentPack(): Promise<PackInfo> {
  return invoke<PackInfo>("pick_and_import_content_pack");
}

export function importContentPack(zipPath: string): Promise<PackInfo> {
  return invoke<PackInfo>("import_content_pack", { zipPath });
}

export function getConfig(): Promise<AppConfigResponse> {
  return invoke<AppConfigResponse>("get_config");
}

export function saveProjectsDir(projectsDir: string): Promise<AppConfigResponse> {
  return invoke<AppConfigResponse>("save_projects_dir", { projectsDir });
}

export function saveAiConfig(ai: AiConfig): Promise<AppConfigResponse> {
  return invoke<AppConfigResponse>("save_ai_config", { ai });
}

export function generateProjectDocument(
  question: string,
  facts: string | null,
): Promise<GenerateProjectResult> {
  return invoke<GenerateProjectResult>("generate_project_document", {
    question,
    facts,
  });
}

export function revealProjectFile(path: string): Promise<void> {
  return invoke<void>("reveal_project_file", { path });
}

export function revealProjectsDir(): Promise<void> {
  return invoke<void>("reveal_projects_dir");
}

export function pickProjectsDir(): Promise<AppConfigResponse> {
  return invoke<AppConfigResponse>("pick_projects_dir");
}

export function listProjectFiles(): Promise<ProjectFileEntry[]> {
  return invoke<ProjectFileEntry[]>("list_project_files");
}

export function searchProjectFiles(query: string): Promise<ProjectFileEntry[]> {
  return invoke<ProjectFileEntry[]>("search_project_files", { query });
}

export function readProjectFile(path: string): Promise<string> {
  return invoke<string>("read_project_file", { path });
}

export function resolveCitation(citation: string): Promise<CitationTarget | null> {
  return invoke<CitationTarget | null>("resolve_citation", { citation });
}

export function scanNoteCitations(content: string): Promise<CitationScanResult[]> {
  return invoke<CitationScanResult[]>("scan_note_citations", { content });
}

export function paragraphsIndexLoaded(): Promise<number> {
  return invoke<number>("paragraphs_index_loaded");
}

export function listStandards(
  framework: string | null,
  includeLegacy: boolean,
): Promise<StandardSummary[]> {
  return invoke<StandardSummary[]>("list_standards", {
    framework,
    includeLegacy,
  });
}

export function getStandard(standardId: string): Promise<StandardDetail> {
  return invoke<StandardDetail>("get_standard", { standardId });
}

export function searchStandards(query: string, limit = 20): Promise<SearchHit[]> {
  return invoke<SearchHit[]>("search_standards", { query, limit });
}

export function openOfficialUrl(url: string): Promise<void> {
  return invoke<void>("open_official_url", { url });
}

export function getAppVersion(): Promise<string> {
  return invoke<string>("get_app_version");
}
