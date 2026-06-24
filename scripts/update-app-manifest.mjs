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
const tag = readArg("--tag");
const repo = process.argv.includes("--repo")
  ? readArg("--repo")
  : "MoonMaxTea/Accounting-Copilot";

// Parse version string (e.g., "app-v0.1.17" → "0.1.17")
const versionNumber = version.startsWith("app-v") ? version.slice(5) : version;

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const platforms = {};

// Windows x64
platforms["windows-x86_64"] = {
  url: `https://github.com/${repo}/releases/download/${tag}/Accounting.Copilot_${versionNumber}_x64-setup.exe`,
  url_alt: `https://cdn.jsdelivr.net/gh/${repo}@main/updates/installers/windows-x86_64-latest.exe`,
  signature: null,
};

// Linux x64
platforms["linux-x86_64"] = {
  url: `https://github.com/${repo}/releases/download/${tag}/accounting-copilot_${versionNumber}_amd64.deb`,
  url_alt: `https://cdn.jsdelivr.net/gh/${repo}@main/updates/installers/linux-x86_64-latest.deb`,
  signature: null,
};

manifest.app = {
  latest_version: versionNumber,
  release_tag: tag,
  platforms,
  release_notes: `- App ${versionNumber}\n- Built by CI`,
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Updated ${manifestPath} for app ${versionNumber}`);
