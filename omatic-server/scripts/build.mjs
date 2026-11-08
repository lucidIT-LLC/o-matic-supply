#!/usr/bin/env node
/**
 * Reproducible build for the o-MATIC Server Copilot MCP connector zip.
 *
 * Shape (Microsoft connector-only / Registry upload):
 *   manifest.json, color.png, outline.png, mcp-tools.json
 *
 * Docs cited in docs/STRUCTURE.md.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "package");
const icons = join(root, "icons");
const dist = join(root, "dist");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", cwd: root, ...opts });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || `${cmd} failed`);
    process.exit(r.status ?? 1);
  }
  return r;
}

// 1. Apply config.json (+ OMATIC_MCP_URL / OMATIC_OAUTH_REFERENCE_ID) into manifests
run(process.execPath, [join(root, "scripts/apply-config.mjs")]);

// 2. Render icons from SVG sources
run(process.execPath, [join(root, "scripts/render-icons.mjs")]);

// 3. Validate sources + rendered icons
run(process.execPath, [join(root, "scripts/validate.mjs")]);

// 4. Assemble staging dir (zip root = package files only; no SVGs)
const manifest = JSON.parse(readFileSync(join(pkg, "manifest.json"), "utf8"));
const version = manifest.version;
const zipName = `omatic-server-${version}-mcp.zip`;
const stage = mkdtempSync(join(tmpdir(), "omatic-server-mcp-"));
const mcpServerUrl =
  manifest.agentConnectors?.[0]?.toolSource?.remoteMcpServer?.mcpServerUrl ||
  "https://factory.o-matic.ai/mcp";

const files = [
  ["manifest.json", join(pkg, "manifest.json")],
  ["mcp-tools.json", join(pkg, "mcp-tools.json")],
  ["color.png", join(icons, "color.png")],
  ["outline.png", join(icons, "outline.png")],
];

for (const [name, src] of files) {
  if (!existsSync(src)) {
    console.error(`missing ${src}`);
    process.exit(1);
  }
  copyFileSync(src, join(stage, name));
}

// Guard: never ship SVGs or agent files in the zip
for (const bad of ["declarativeAgent.json", "instructions.txt", "source.svg", "outline-source.svg", "ai-plugin.json"]) {
  if (existsSync(join(stage, bad))) {
    console.error(`refusing to package ${bad}`);
    process.exit(1);
  }
}

mkdirSync(dist, { recursive: true });
const zipPath = join(dist, zipName);
if (existsSync(zipPath)) rmSync(zipPath);

// zip with stored paths at archive root (no nesting)
run("zip", ["-X", "-j", zipPath, ...files.map(([name]) => join(stage, name))]);

const buf = readFileSync(zipPath);
const sha256 = createHash("sha256").update(buf).digest("hex");
const sidecar = {
  file: zipName,
  path: `omatic-server/dist/${zipName}`,
  version,
  sha256,
  bytes: buf.length,
  contents: files.map(([name]) => name),
  appId: manifest.id,
  connectorId: manifest.agentConnectors?.[0]?.id || "omaticserver",
  displayName: manifest.agentConnectors?.[0]?.displayName || manifest.name?.full,
  mcpServerUrl,
  toolCount: JSON.parse(readFileSync(join(pkg, "mcp-tools.json"), "utf8")).tools
    ?.length,
  customMcp:
    "Build-time via OMATIC_MCP_URL + OMATIC_OAUTH_REFERENCE_ID (docs/CUSTOM-MCP.md). Schema 1.30 has no runtime URL field.",
  builtAt: new Date().toISOString(),
  uploadPath:
    "Microsoft 365 admin center → Agents → Tools → Registry → Upload (or Update on an installed package)",
  uploadDoc:
    "https://learn.microsoft.com/en-us/microsoft-365/admin/manage/manage-plugins-skills-mcp-servers",
  icons: {
    color: {
      file: "color.png",
      sha256: createHash("sha256").update(readFileSync(join(icons, "color.png"))).digest("hex"),
    },
    outline: {
      file: "outline.png",
      sha256: createHash("sha256").update(readFileSync(join(icons, "outline.png"))).digest("hex"),
    },
    sources: {
      colorSvg: "icons/source.svg",
      outlineSvg: "icons/outline-source.svg",
      mark: "Backbone",
      approved: "2026-11-06",
      decisionId: 848,
    },
  },
};
writeFileSync(join(dist, `${zipName}.sha256`), `${sha256}  ${zipName}\n`);
writeFileSync(join(dist, `${zipName}.json`), JSON.stringify(sidecar, null, 2) + "\n");

// List zip + confirm no svg
const listed = run("unzip", ["-l", zipPath]).stdout;
if (/\.svg/i.test(listed)) {
  console.error("zip unexpectedly contains .svg");
  process.exit(1);
}

console.log(`\nbuilt ${zipPath}`);
console.log(`sha256 ${sha256}`);
console.log(`bytes  ${buf.length}`);
console.log(listed);
