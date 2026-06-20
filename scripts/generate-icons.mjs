// Generates all Tauri app icons from brand-mark.svg
// Usage: node scripts/generate-icons.mjs
// Requires: npm install --save-dev sharp to-ico

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import toIco from "to-ico";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const iconsDir = join(projectRoot, "app", "src-tauri", "icons");
const svgPath = join(iconsDir, "brand-mark.svg");

const svgBuffer = readFileSync(svgPath);

// Standard Tauri icon sizes
const sizes = {
  "32x32.png": 32,
  "128x128.png": 128,
  "128x128@2x.png": 256,
  "icon.png": 512,
  "Square30x30Logo.png": 30,
  "Square44x44Logo.png": 44,
  "Square71x71Logo.png": 71,
  "Square89x89Logo.png": 89,
  "Square107x107Logo.png": 107,
  "Square142x142Logo.png": 142,
  "Square150x150Logo.png": 150,
  "Square284x284Logo.png": 284,
  "Square310x310Logo.png": 310,
  "StoreLogo.png": 50,
};

async function generatePng(filename, size) {
  const png = await sharp(svgBuffer).resize(size, size).png().toBuffer();
  const outputPath = join(iconsDir, filename);
  writeFileSync(outputPath, png);
  console.log(`  ✅ ${filename} (${size}x${size})`);
  return png;
}

async function generateIco(mainPng) {
  // Generate 256x256 PNG for the ICO
  const png256 = await sharp(svgBuffer).resize(256, 256).png().toBuffer();
  const ico = await toIco([png256, await sharp(svgBuffer).resize(64, 64).png().toBuffer(), await sharp(svgBuffer).resize(48, 48).png().toBuffer(), await sharp(svgBuffer).resize(32, 32).png().toBuffer(), await sharp(svgBuffer).resize(16, 16).png().toBuffer()]);
  writeFileSync(join(iconsDir, "icon.ico"), ico);
  console.log(`  ✅ icon.ico (multi-res)`);
}

async function generateIcns() {
  // macOS icns — generate a high-res PNG as substitute
  // (true .icns generation requires more tooling; Tauri will use icon.png on macOS if .icns is missing)
  const png = await sharp(svgBuffer).resize(1024, 1024).png().toBuffer();
  writeFileSync(join(iconsDir, "icon.icns"), png);
  console.log(`  ✅ icon.icns (1024x1024 PNG placeholder)`);
}

async function main() {
  console.log("Generating icons from brand-mark.svg...\n");

  for (const [filename, size] of Object.entries(sizes)) {
    await generatePng(filename, size);
  }

  await generateIco();
  await generateIcns();

  console.log(`\nDone! All icons generated in:\n  ${iconsDir}`);
}

main().catch((err) => {
  console.error("Icon generation failed:", err);
  process.exit(1);
});
