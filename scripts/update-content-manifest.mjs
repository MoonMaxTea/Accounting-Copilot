#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(repoRoot, "updates/manifest.json");

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return process.argv[index + 1];
}

const version = readArg("--version");
const sha256 = readArg("--sha256");
const size = Number(readArg("--size"));
const tag = readArg("--tag");
const repo = process.argv.includes("--repo")
  ? readArg("--repo")
  : "MoonMaxTea/Accounting-standards-Desktop";

if (!Number.isFinite(size) || size <= 0) {
  throw new Error(`Invalid size: ${readArg("--size")}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.generated_at = new Date().toISOString();
manifest.content = {
  latest_version: version,
  release_tag: tag,
  pack_url: `https://github.com/${repo}/releases/download/${tag}/standards-pack-${version}.zip`,
  pack_sha256: sha256,
  pack_size_bytes: size,
  min_app_version: "0.1.0",
  release_notes: `- Content pack ${version}\n- Built by CI`,
  vault_commit: null,
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Updated ${manifestPath} for content ${version}`);
