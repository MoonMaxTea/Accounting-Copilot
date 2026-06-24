import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { browserMockDownload, browserMockInvoke } from "./browser-mock";
import type {
  AppConfigResponse,
  AiConfig,
  AiConversationTurn,
  AiConversationIndexEntry,
  CitationScanResult,
  CitationTarget,
  ContentDownloadProgress,
  DeleteFolderResult,
  GenerateProjectResult,
  PackInfo,
  ProjectFileEntry,
  ProjectsUiState,
  ProjectTreeNode,
  SearchHit,
  SimilarProjectMatch,
  StandardDetail,
  StandardSummary,
  TrashEntry,
  UpdateCheckResult,
  UpdateConfig,
} from "./types";

function tauriInvoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!isTauri()) {
    return browserMockInvoke<T>(command, args);
  }
  return invoke<T>(command, args);
}

export function getPackInfo(): Promise<PackInfo> {
  return tauriInvoke<PackInfo>("get_pack_info");
}

export function getConfig(): Promise<AppConfigResponse> {
  return tauriInvoke<AppConfigResponse>("get_config");
}

export function saveProjectsDir(projectsDir: string): Promise<AppConfigResponse> {
  return tauriInvoke<AppConfigResponse>("save_projects_dir", { projectsDir });
}

export function saveAiConfig(ai: AiConfig): Promise<AppConfigResponse> {
  return tauriInvoke<AppConfigResponse>("save_ai_config", { ai });
}

export function generateProjectDocument(
  question: string,
  facts: string | null,
  folderRelative: string | null = null,
): Promise<GenerateProjectResult> {
  return tauriInvoke<GenerateProjectResult>("generate_project_document", {
    question,
    facts,
    folderRelative,
  });
}

export function continueProjectDocument(
  filePath: string,
  question: string,
  facts: string | null = null,
): Promise<GenerateProjectResult> {
  return tauriInvoke<GenerateProjectResult>("continue_project_document", {
    filePath,
    question,
    facts,
  });
}

export function listProjectTree(): Promise<ProjectTreeNode[]> {
  return tauriInvoke<ProjectTreeNode[]>("list_project_tree");
}

export function createProjectFolder(
  name: string,
  parentRelative: string | null = null,
): Promise<string> {
  return tauriInvoke<string>("create_project_folder", { name, parentRelative });
}

export function renameProjectFolder(
  folderRelative: string,
  newName: string,
): Promise<string> {
  return tauriInvoke<string>("rename_project_folder", { folderRelative, newName });
}

export function renameProjectFile(
  filePath: string,
  newName: string,
): Promise<ProjectFileEntry> {
  return tauriInvoke<ProjectFileEntry>("rename_project_file", { filePath, newName });
}

export function moveProjectFile(
  filePath: string,
  targetFolderRelative: string | null,
): Promise<ProjectFileEntry> {
  return tauriInvoke<ProjectFileEntry>("move_project_file", {
    filePath,
    targetFolderRelative,
  });
}

export function countProjectFolderEntries(folderRelative: string): Promise<number> {
  return tauriInvoke<number>("count_project_folder_entries", { folderRelative });
}

export function deleteProjectFolder(folderRelative: string): Promise<DeleteFolderResult> {
  return tauriInvoke<DeleteFolderResult>("delete_project_folder", { folderRelative });
}

export function moveProjectFileToTrash(filePath: string): Promise<TrashEntry> {
  return tauriInvoke<TrashEntry>("move_project_file_to_trash", { filePath });
}

export function listTrashItems(): Promise<TrashEntry[]> {
  return tauriInvoke<TrashEntry[]>("list_trash_items");
}

export function restoreTrashItem(id: string): Promise<ProjectFileEntry> {
  return tauriInvoke<ProjectFileEntry>("restore_trash_item", { id });
}

export function purgeTrashItem(id: string): Promise<void> {
  return tauriInvoke<void>("purge_trash_item", { id });
}

export function saveProjectsChildOrder(
  parentRelative: string | null,
  orderedRelativePaths: string[],
): Promise<ProjectsUiState> {
  return tauriInvoke<ProjectsUiState>("save_projects_child_order", {
    parentRelative,
    orderedRelativePaths,
  });
}

export function toggleProjectPin(relativePath: string): Promise<ProjectsUiState> {
  return tauriInvoke<ProjectsUiState>("toggle_project_pin", { relativePath });
}

export function saveProjectsUiState(
  lastEvidenceFile: string | null,
  lastSelectedFolder: string | null,
): Promise<ProjectsUiState> {
  return tauriInvoke<ProjectsUiState>("save_projects_ui_state", {
    lastEvidenceFile,
    lastSelectedFolder,
  });
}

export function saveEvidencePanelCollapsed(collapsed: boolean): Promise<ProjectsUiState> {
  return tauriInvoke<ProjectsUiState>("save_evidence_panel_collapsed", { collapsed });
}

export function getProjectConversation(relativePath: string): Promise<AiConversationTurn[]> {
  return tauriInvoke<AiConversationTurn[]>("get_project_conversation", { relativePath });
}

export function listAiConversationIndex(): Promise<AiConversationIndexEntry[]> {
  return tauriInvoke<AiConversationIndexEntry[]>("list_ai_conversation_index");
}

export function appendAiConversationTurn(
  relativePath: string,
  turn: AiConversationTurn,
): Promise<ProjectsUiState> {
  return tauriInvoke<ProjectsUiState>("append_ai_conversation_turn", {
    relativePath,
    turn,
  });
}

export function findSimilarProjects(projectName: string): Promise<SimilarProjectMatch[]> {
  return tauriInvoke<SimilarProjectMatch[]>("find_similar_projects", { projectName });
}

export function revealProjectFile(path: string): Promise<void> {
  return tauriInvoke<void>("reveal_project_file", { path });
}

export function revealProjectsDir(): Promise<void> {
  return tauriInvoke<void>("reveal_projects_dir");
}

export function pickProjectsDir(): Promise<AppConfigResponse> {
  return tauriInvoke<AppConfigResponse>("pick_projects_dir");
}

export function listProjectFiles(): Promise<ProjectFileEntry[]> {
  return tauriInvoke<ProjectFileEntry[]>("list_project_files");
}

export function searchProjectFiles(query: string): Promise<ProjectFileEntry[]> {
  return tauriInvoke<ProjectFileEntry[]>("search_project_files", { query });
}

export function readProjectFile(path: string): Promise<string> {
  return tauriInvoke<string>("read_project_file", { path });
}

export function resolveCitation(citation: string): Promise<CitationTarget | null> {
  return tauriInvoke<CitationTarget | null>("resolve_citation", { citation });
}

export function scanNoteCitations(content: string): Promise<CitationScanResult[]> {
  return tauriInvoke<CitationScanResult[]>("scan_note_citations", { content });
}

export function paragraphsIndexLoaded(): Promise<number> {
  return tauriInvoke<number>("paragraphs_index_loaded");
}

export function listStandards(
  framework: string | null,
  includeLegacy: boolean,
): Promise<StandardSummary[]> {
  return tauriInvoke<StandardSummary[]>("list_standards", {
    framework,
    includeLegacy,
  });
}

export function getStandard(standardId: string): Promise<StandardDetail> {
  return tauriInvoke<StandardDetail>("get_standard", { standardId });
}

export function searchStandards(query: string, limit = 20): Promise<SearchHit[]> {
  return tauriInvoke<SearchHit[]>("search_standards", { query, limit });
}

export function openOfficialUrl(url: string): Promise<void> {
  return tauriInvoke<void>("open_official_url", { url });
}

export function getAppVersion(): Promise<string> {
  return tauriInvoke<string>("get_app_version");
}

export function checkContentUpdates(): Promise<UpdateCheckResult> {
  return tauriInvoke<UpdateCheckResult>("check_content_updates");
}

export function downloadAndApplyContentUpdate(
  onProgress: (progress: ContentDownloadProgress) => void,
): Promise<PackInfo> {
  if (!isTauri()) {
    return browserMockDownload(onProgress);
  }
  return invoke<PackInfo>("download_and_apply_content_update", {
    onProgress: new Channel<ContentDownloadProgress>((progress) => {
      onProgress(progress);
    }),
  });
}

export function saveUpdateConfig(update: UpdateConfig): Promise<AppConfigResponse> {
  return tauriInvoke<AppConfigResponse>("save_update_config", { update });
}

export function downloadAppUpdate(): Promise<string> {
  return tauriInvoke<string>("download_and_apply_app_update");
}
