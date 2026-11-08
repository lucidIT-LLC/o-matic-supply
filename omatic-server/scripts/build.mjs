#!/usr/bin/env node
/**
 * Reproducible build for the o-MATIC Server MCP Connector zip.
 *
 * Shape (Microsoft connector-only / Registry upload) — dynamic discovery:
 *   manifest.json, color.png, outline.png
 * (no mcp-tools.json — omit mcpToolDescription so the host calls tools/list)
 *
 * Docs: docs/STRUCTURE.md, docs/CUSTOM-MCP.md, Learn dynamic tool discovery.
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

// 1. Apply config (+ env) → dynamic-discovery manifests
run(process.execPath, [join(root, "scripts/apply-config.mjs")]);

// 2. Render icons from SVG sources
run(process.execPath, [join(root, "scripts/render-icons.mjs")]);

// 3. Validate
run(process.execPath, [join(root, "scripts/validate.mjs")]);

// 4. Assemble staging dir
const manifest = JSON.parse(readFileSync(join(pkg, "manifest.json"), "utf8"));
const version = manifest.version;
const zipName = `omatic-server-${version}-mcp.zip`;
const stage = mkdtempSync(join(tmpdir(), "omatic-server-mcp-"));
const remote = manifest.agentConnectors?.[0]?.toolSource?.remoteMcpServer || {};
const mcpServerUrl = remote.mcpServerUrl || "https://factory.o-matic.ai/mcp";

if (remote.mcpToolDescription) {
  console.error(
    "refusing to build: mcpToolDescription present — dynamic discovery requires it omitted",
  );
  process.exit(1);
}

const files = [
  ["manifest.json", join(pkg, "manifest.json")],
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

for (const bad of [
  "declarativeAgent.json",
  "instructions.txt",
  "source.svg",
  "outline-source.svg",
  "ai-plugin.json",
  "mcp-tools.json",
]) {
  if (existsSync(join(stage, bad))) {
    console.error(`refusing to package ${bad}`);
    process.exit(1);
  }
}

mkdirSync(dist, { recursive: true });
const zipPath = join(dist, zipName);
if (existsSync(zipPath)) rmSync(zipPath);

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
  discoveryMode: "dynamic",
  run_for_functions: ["*"],
  functions: [],
  mcpToolDescription: "omitted — live tools/list",
  customMcp:
    "Build-time via OMATIC_MCP_URL + OMATIC_OAUTH_REFERENCE_ID (docs/CUSTOM-MCP.md). Schema 1.30 has no runtime URL field.",
  builtAt: new Date().toISOString(),
  uploadPath:
    "Microsoft 365 admin center → Agents → Tools → Registry → Upload (or Update on an installed package)",
  uploadDoc:
    "https://learn.microsoft.com/en-us/microsoft-365/admin/manage/manage-plugins-skills-mcp-servers",
  dynamicDiscoveryDoc:
    "https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-dynamic-tool-discovery",
  icons: {
    color: {
      file: "color.png",
      sha256: createHash("sha256")
        .update(readFileSync(join(icons, "color.png")))
        .digest("hex"),
    },
    outline: {
      file: "outline.png",
      sha256: createHash("sha256")
        .update(readFileSync(join(icons, "outline.png")))
        .digest("hex"),
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

const listed = run("unzip", ["-l", zipPath]).stdout;
if (/\.svg/i.test(listed) || /mcp-tools\.json/i.test(listed)) {
  console.error("zip unexpectedly contains .svg or mcp-tools.json");
  process.exit(1);
}

console.log(`\nbuilt ${zipPath}`);
console.log(`sha256 ${sha256}`);
console.log(`bytes  ${buf.length}`);
console.log(listed);
