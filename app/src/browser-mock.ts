import type {
  AiConversationTurn,
  AppConfigResponse,
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
} from "./types";

const MOCK_NOW_SECS = Math.floor(Date.now() / 1000);

const MOCK_PROJECTS_DIR = "C:\\Users\\Documents\\Accounting Projects";

const MOCK_UI_STATE: ProjectsUiState = {
  pinned: [],
  order: {},
  last_evidence_file: "sample-project/revenue-memo.md",
  last_selected_folder: "sample-project",
  ai_threads: {},
  evidence_panel_collapsed: false,
};

export const MOCK_PACK_INFO: PackInfo = {
  loaded: true,
  content_version: "2026.06.01-preview",
  vault_commit: "browser-preview",
  counts: {
    current: { "accounting-standards": { IFRS: 18, IAS: 32, ASC: 90 } },
    legacy: { "accounting-standards": { IFRS: 2, IAS: 4, ASC: 8 } },
  },
  category_meta: [
    { id: "accounting-standards", frameworks: ["IFRS", "IAS", "ASC"] },
    { id: "listing-rules", frameworks: ["HK", "SEC"] },
  ],
  content_dir: null,
};

const MOCK_CONFIG: AppConfigResponse = {
  projects_dir: MOCK_PROJECTS_DIR,
  ai: {
    provider: "openai",
    api_key: null,
    base_url: "https://api.openai.com/v1",
    model: "gpt-4o",
    allow_legacy_citations: false,
  },
  projects_ui: MOCK_UI_STATE,
  update: {
    manifest_url:
      "https://raw.githubusercontent.com/MoonMaxTea/Accounting-Copilot/main/updates/manifest.json",
    check_on_startup: false,
    auto_download_content: false,
    last_content_version: MOCK_PACK_INFO.content_version,
    last_update_check_secs: MOCK_NOW_SECS,
    access_token: null,
  },
};

const MOCK_STANDARDS: StandardSummary[] = [
  {
    id: "IFRS-15",
    title: "Revenue from Contracts with Customers",
    title_zh: "客户合同收入",
    category: "accounting-standards",
    framework: "IFRS",
    status: "current",
    legacy_label: null,
    superseded_by: null,
    official_url: "https://www.ifrs.org/issued-standards/list-of-standards/ifrs-15-revenue-from-contracts-with-customers/",
  },
  {
    id: "IAS-1",
    title: "Presentation of Financial Statements",
    title_zh: "财务报表列报",
    category: "accounting-standards",
    framework: "IAS",
    status: "current",
    legacy_label: null,
    superseded_by: null,
    official_url: "https://www.ifrs.org/issued-standards/list-of-standards/ias-1-presentation-of-financial-statements/",
  },
  {
    id: "IAS-8",
    title: "Accounting Policies, Changes in Accounting Estimates and Errors",
    title_zh: "会计政策、会计估计变更和差错",
    category: "accounting-standards",
    framework: "IAS",
    status: "current",
    legacy_label: null,
    superseded_by: null,
    official_url: "https://www.ifrs.org/issued-standards/list-of-standards/ias-8-accounting-policies-changes-in-accounting-estimates-and-errors/",
  },
  {
    id: "ASC-606",
    title: "Revenue from Contracts with Customers",
    title_zh: null,
    category: "accounting-standards",
    framework: "ASC",
    status: "current",
    legacy_label: null,
    superseded_by: null,
    official_url: "https://asc.fasb.org/606/showall",
  },
  {
    id: "ASC-842",
    title: "Leases",
    title_zh: null,
    category: "accounting-standards",
    framework: "ASC",
    status: "current",
    legacy_label: null,
    superseded_by: null,
    official_url: "https://asc.fasb.org/842/showall",
  },
];

const MOCK_STANDARD_DETAILS: Record<string, StandardDetail> = {
  "IFRS-15": {
    ...MOCK_STANDARDS[0],
    effective_until: null,
    official_url_note: null,
    pack_path: "ifrs/ifrs-15.md",
    body: `# IFRS 15 — Revenue from Contracts with Customers

## Browser preview

This is sample content shown when the UI runs in a browser without the Tauri backend.

Use the desktop app for live standards data from the installed content pack.`,
  },
  "IAS-1": {
    ...MOCK_STANDARDS[1],
    effective_until: null,
    official_url_note: null,
    pack_path: "ias/ias-1.md",
    body: `# IAS 1 — Presentation of Financial Statements

Sample preview body for layout and styling work in the browser.`,
  },
  "IAS-8": {
    ...MOCK_STANDARDS[2],
    effective_until: null,
    official_url_note: null,
    pack_path: "ias/ias-8.md",
    body: `# IAS 8 — Accounting Policies, Changes in Accounting Estimates and Errors`,
  },
  "ASC-606": {
    ...MOCK_STANDARDS[3],
    effective_until: null,
    official_url_note: null,
    pack_path: "asc/asc-606.md",
    body: `# ASC 606 — Revenue from Contracts with Customers`,
  },
  "ASC-842": {
    ...MOCK_STANDARDS[4],
    effective_until: null,
    official_url_note: null,
    pack_path: "asc/asc-842.md",
    body: `# ASC 842 — Leases`,
  },
};

const MOCK_TREE: ProjectTreeNode[] = [
  {
    kind: "folder",
    name: "sample-project",
    path: `${MOCK_PROJECTS_DIR}\\sample-project`,
    relative_path: "sample-project",
    children: [
      {
        kind: "file",
        name: "revenue-memo.md",
        path: `${MOCK_PROJECTS_DIR}\\sample-project\\revenue-memo.md`,
        relative_path: "sample-project/revenue-memo.md",
        title: "Revenue recognition memo",
        modified_secs: MOCK_NOW_SECS - 86_400,
      },
      {
        kind: "file",
        name: "lease-review.md",
        path: `${MOCK_PROJECTS_DIR}\\sample-project\\lease-review.md`,
        relative_path: "sample-project/lease-review.md",
        title: "Lease classification review",
        modified_secs: MOCK_NOW_SECS - 172_800,
      },
    ],
  },
];

const MOCK_NOTE = `# Revenue recognition memo

Browser preview note for Workbench layout checks.

- Customer contract includes a software licence and post-contract support.
- Performance obligations should be identified separately per **IFRS 15**.
`;

function listMockFiles(): ProjectFileEntry[] {
  const files: ProjectFileEntry[] = [];
  for (const node of MOCK_TREE) {
    if (node.kind !== "folder") {
      continue;
    }
    for (const child of node.children) {
      if (child.kind === "file") {
        files.push({
          path: child.path,
          relative_path: child.relative_path,
          title: child.title,
          modified_secs: child.modified_secs,
        });
      }
    }
  }
  return files;
}

function filterStandards(
  framework: string | null,
  includeLegacy: boolean,
): StandardSummary[] {
  return MOCK_STANDARDS.filter((standard) => {
    if (!includeLegacy && standard.legacy_label) {
      return false;
    }
    if (!framework) {
      return true;
    }
    return standard.framework === framework;
  });
}

function searchMockStandards(query: string, limit: number): SearchHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }

  return MOCK_STANDARDS.filter(
    (standard) =>
      standard.id.toLowerCase().includes(needle) ||
      standard.title.toLowerCase().includes(needle) ||
      (standard.title_zh?.toLowerCase().includes(needle) ?? false),
  )
    .slice(0, limit)
    .map((standard) => ({
      standard_id: standard.id,
      pack_path: MOCK_STANDARD_DETAILS[standard.id]?.pack_path ?? `${standard.id}.md`,
      title: standard.title,
      snippet: `Preview match for ${standard.id}`,
    }));
}

export function browserMockInvoke<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  switch (command) {
    case "get_pack_info":
      return Promise.resolve(MOCK_PACK_INFO as T);
    case "get_config":
      return Promise.resolve(MOCK_CONFIG as T);
    case "get_app_version":
      return Promise.resolve("0.1.8-browser-preview" as T);
    case "check_content_updates":
      return Promise.resolve({
        status: "up_to_date",
        current_content_version: MOCK_PACK_INFO.content_version,
        available_content: null,
        message: null,
        checked_at_secs: MOCK_NOW_SECS,
      } satisfies UpdateCheckResult as T);
    case "list_standards":
      return Promise.resolve(
        filterStandards(
          (args.framework as string | null | undefined) ?? null,
          Boolean(args.includeLegacy),
        ) as T,
      );
    case "get_standard": {
      const standardId = String(args.standardId ?? "");
      const detail = MOCK_STANDARD_DETAILS[standardId];
      if (!detail) {
        return Promise.reject(new Error(`Standard not found: ${standardId}`));
      }
      return Promise.resolve(detail as T);
    }
    case "search_standards":
      return Promise.resolve(
        searchMockStandards(String(args.query ?? ""), Number(args.limit ?? 20)) as T,
      );
    case "open_official_url":
      window.open(String(args.url ?? ""), "_blank", "noopener,noreferrer");
      return Promise.resolve(undefined as T);
    case "list_project_tree":
      return Promise.resolve(MOCK_TREE as T);
    case "list_project_files":
      return Promise.resolve(listMockFiles() as T);
    case "search_project_files": {
      const query = String(args.query ?? "").trim().toLowerCase();
      const files = listMockFiles().filter(
        (file) =>
          file.title.toLowerCase().includes(query) ||
          file.relative_path.toLowerCase().includes(query),
      );
      return Promise.resolve(files as T);
    }
    case "read_project_file":
      return Promise.resolve(MOCK_NOTE as T);
    case "list_trash_items":
      return Promise.resolve([] as TrashEntry[] as T);
    case "get_project_conversation":
      return Promise.resolve([] as AiConversationTurn[] as T);
    case "list_ai_conversation_index":
      return Promise.resolve(
        [
          {
            relative_path: "sample-project/revenue-memo.md",
            latest_timestamp_secs: MOCK_NOW_SECS,
          },
        ] as AiConversationIndexEntry[] as T,
      );
    case "save_projects_ui_state":
      return Promise.resolve(MOCK_UI_STATE as T);
    case "save_evidence_panel_collapsed":
      return Promise.resolve({
        ...MOCK_UI_STATE,
        evidence_panel_collapsed: Boolean(args.collapsed),
      } as T);
    case "save_projects_child_order":
    case "toggle_project_pin":
    case "append_ai_conversation_turn":
      return Promise.resolve(MOCK_UI_STATE as T);
    case "save_projects_dir":
    case "save_ai_config":
    case "save_update_config":
    case "pick_projects_dir":
      return Promise.resolve(MOCK_CONFIG as T);
    case "count_project_folder_entries":
      return Promise.resolve(0 as T);
    case "scan_note_citations":
      return Promise.resolve([] as CitationScanResult[] as T);
    case "resolve_citation":
      return Promise.resolve(null as CitationTarget | null as T);
    case "paragraphs_index_loaded":
      return Promise.resolve(0 as T);
    case "find_similar_projects":
      return Promise.resolve([] as SimilarProjectMatch[] as T);
    case "generate_project_document":
    case "continue_project_document":
      return Promise.resolve({
        project_name: "sample-project",
        file_path: `${MOCK_PROJECTS_DIR}\\sample-project\\draft.md`,
        relative_path: "sample-project/draft.md",
        title: "Draft",
        content: "Browser preview: AI generation is only available in the desktop app.",
        validation: { citations: [], warnings: [] },
        similar_projects: [],
      } satisfies GenerateProjectResult as T);
    case "create_project_folder":
      return Promise.resolve("sample-project/new-folder" as T);
    case "rename_project_folder":
    case "rename_project_file":
    case "move_project_file":
    case "move_project_file_to_trash":
    case "restore_trash_item":
      return Promise.reject(new Error("Browser preview: file changes are not persisted."));
    case "delete_project_folder":
      return Promise.resolve({
        folder_relative: String(args.folderRelative ?? ""),
        trashed_files: 0,
      } satisfies DeleteFolderResult as T);
    case "purge_trash_item":
    case "reveal_project_file":
    case "reveal_projects_dir":
      return Promise.resolve(undefined as T);
    default:
      return Promise.reject(new Error(`Browser preview: "${command}" is not available.`));
  }
}

export function browserMockDownload(
  onProgress: (progress: ContentDownloadProgress) => void,
): Promise<PackInfo> {
  onProgress({
    phase: "idle",
    downloaded_bytes: 0,
    total_bytes: 0,
    message: null,
  });
  return Promise.resolve(MOCK_PACK_INFO);
}
