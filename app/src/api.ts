import { invoke } from "@tauri-apps/api/core";
import type { PackInfo, SearchHit, StandardDetail, StandardSummary } from "./types";

export function getPackInfo(): Promise<PackInfo> {
  return invoke<PackInfo>("get_pack_info");
}

export function pickAndImportContentPack(): Promise<PackInfo> {
  return invoke<PackInfo>("pick_and_import_content_pack");
}

export function importContentPack(zipPath: string): Promise<PackInfo> {
  return invoke<PackInfo>("import_content_pack", { zipPath });
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
