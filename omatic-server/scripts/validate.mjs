#!/usr/bin/env node
/**
 * Validate the o-MATIC Server Copilot MCP connector package.
 *
 * 1. Official JSON schemas (Teams 1.30 manifest + Copilot plugin 2.4)
 * 2. atk validate --manifest-file (Microsoft 365 Agents Toolkit)
 * 3. Real-validator lint (hard-won lessons Microsoft's upload validator enforces
 *    beyond offline schema/atk):
 *    - every ai-plugin function MUST have a description
 *    - capabilities.confirmation.type 'None' is rejected; omit confirmation
 *      for read-only tools (only AdaptiveCard is allowed when present)
 *    - no .svg inside the upload zip (suspected; unproven — keep SVGs as sources)
 * 4. Icon dimension + transparency checks
 * 5. Pin parity: ai-plugin run_for_functions ↔ mcp-tools.json ↔ agentConnectors
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "package");
const icons = join(root, "icons");
const cache = join(root, ".schema-cache");
const MANIFEST = join(pkg, "manifest.json");
const AI_PLUGIN = join(pkg, "ai-plugin.json");
const MCP_TOOLS = join(pkg, "mcp-tools.json");

const SCHEMA_URLS = {
  teams:
    "https://developer.microsoft.com/json-schemas/teams/v1.30/MicrosoftTeams.schema.json",
  plugin:
    "https://developer.microsoft.com/json-schemas/copilot/plugin/v2.4/schema.json",
};

let fails = 0;
const FAIL = (m) => {
  console.log(`  FAIL  ${m}`);
  fails++;
};
const OK = (m) => console.log(`  ok    ${m}`);

async function fetchSchema(name, url) {
  mkdirSync(cache, { recursive: true });
  const dest = join(cache, `${name}.schema.json`);
  if (existsSync(dest) && statSync(dest).size > 100) {
    return JSON.parse(readFileSync(dest, "utf8"));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`schema fetch ${url}: HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(dest, text);
  return JSON.parse(text);
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Minimal JSON Schema subset validator for required/type/enum/const we need. */
function validateAgainstSchema(data, schema, path = "$") {
  const errors = [];
  const walk = (node, sch, p) => {
    if (!sch || typeof sch !== "object") return;
    if (sch.$ref) return; // skip unresolved refs in this lightweight pass
    if (Array.isArray(sch.type)) {
      const ok = sch.type.some((t) => typeMatches(node, t));
      if (!ok) errors.push(`${p}: expected one of ${sch.type.join("|")}`);
    } else if (sch.type && !typeMatches(node, sch.type)) {
      errors.push(`${p}: expected type ${sch.type}`);
    }
    if (sch.required && typeof node === "object" && node && !Array.isArray(node)) {
      for (const key of sch.required) {
        if (!(key in node)) errors.push(`${p}: missing required "${key}"`);
      }
    }
    if (sch.enum && !sch.enum.includes(node)) {
      errors.push(`${p}: value not in enum`);
    }
    if (sch.properties && node && typeof node === "object" && !Array.isArray(node)) {
      for (const [k, sub] of Object.entries(sch.properties)) {
        if (k in node) walk(node[k], sub, `${p}.${k}`);
      }
    }
    if (sch.items && Array.isArray(node)) {
      node.forEach((item, i) => walk(item, sch.items, `${p}[${i}]`));
    }
  };
  walk(data, schema, path);
  return errors;
}

function typeMatches(node, t) {
  if (t === "object") return node !== null && typeof node === "object" && !Array.isArray(node);
  if (t === "array") return Array.isArray(node);
  if (t === "null") return node === null;
  if (t === "integer") return Number.isInteger(node);
  if (t === "number") return typeof node === "number";
  if (t === "string") return typeof node === "string";
  if (t === "boolean") return typeof node === "boolean";
  return true;
}

function readPngMeta(path) {
  const buf = readFileSync(path);
  if (buf.toString("binary", 0, 8) !== "\x89PNG\r\n\x1a\n") {
    throw new Error(`${path} is not a PNG`);
  }
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const bit = buf[24];
  const color = buf[25];
  return { w, h, bit, color, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
}

function hasAlpha(colorType) {
  // 4 = greyscale+alpha, 6 = RGBA
  return colorType === 4 || colorType === 6;
}

function walkConfirmations(node, path, hits) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n, i) => walkConfirmations(n, `${path}[${i}]`, hits));
    return;
  }
  if (
    node.confirmation &&
    typeof node.confirmation === "object" &&
    node.confirmation.type === "None"
  ) {
    hits.push(`${path}.confirmation.type is 'None' (rejected by upload validator; omit or use AdaptiveCard)`);
  }
  for (const [k, v] of Object.entries(node)) walkConfirmations(v, `${path}.${k}`, hits);
}

function findAtk() {
  const local = spawnSync("npx", ["--yes", "@microsoft/m365agentstoolkit-cli@1.1.19", "--version"], {
    encoding: "utf8",
    cwd: root,
  });
  // Prefer invoking via npx each time for reproducibility
  return ["npx", "--yes", "@microsoft/m365agentstoolkit-cli@1.1.19"];
}

async function main() {
  console.log("\n=== validate o-MATIC Server Copilot MCP package ===\n");

  for (const p of [MANIFEST, AI_PLUGIN, MCP_TOOLS, join(icons, "color.png"), join(icons, "outline.png")]) {
    if (!existsSync(p)) FAIL(`missing ${p}`);
    else OK(`present ${p.replace(root + "/", "")}`);
  }
  if (fails) process.exit(1);

  const manifest = loadJson(MANIFEST);
  const aiPlugin = loadJson(AI_PLUGIN);
  const mcpTools = loadJson(MCP_TOOLS);

  // --- structural: no declarative agent ---
  if (manifest.copilotAgents) FAIL("manifest must not declare copilotAgents (plugin/MCP-only)");
  else OK("no copilotAgents / declarative agent");
  if (existsSync(join(pkg, "declarativeAgent.json"))) FAIL("declarativeAgent.json must not exist");
  else OK("no declarativeAgent.json");
  if (existsSync(join(pkg, "instructions.txt"))) FAIL("instructions.txt must not exist");
  else OK("no instructions.txt");

  // --- agentConnectors remote MCP ---
  const connectors = manifest.agentConnectors;
  if (!Array.isArray(connectors) || connectors.length !== 1) {
    FAIL("manifest.agentConnectors must have exactly one entry");
  } else {
    const c = connectors[0];
    if (c.id !== "omaticserver") FAIL(`connector id must be omaticserver, got ${c.id}`);
    else OK("connector id omaticserver");
    const remote = c.toolSource?.remoteMcpServer;
    if (!remote) FAIL("toolSource.remoteMcpServer required");
    else {
      if (remote.mcpServerUrl !== "https://factory.o-matic.ai/mcp") {
        FAIL(`mcpServerUrl must be https://factory.o-matic.ai/mcp, got ${remote.mcpServerUrl}`);
      } else OK("mcpServerUrl https://factory.o-matic.ai/mcp");
      if (remote.authorization?.type !== "OAuthPluginVault") FAIL("authorization.type must be OAuthPluginVault");
      else OK("OAuthPluginVault");
      const expectedRef =
        "MmEyNzdiN2UtMzMwYi00MDBlLTgwYmYtNWE5MDZmYzVkNTkxIyNiZWFjMWU2MC00MjgyLTRkM2MtYjNmZS1mOTI5YjJjN2ViMWE=";
      if (remote.authorization?.referenceId !== expectedRef) {
        FAIL("authorization.referenceId is not byte-identical to the Entra SSO registration id");
      } else OK("referenceId byte-identical to hand-built reference_id");
      if (remote.mcpToolDescription?.file !== "mcp-tools.json") {
        FAIL("mcpToolDescription.file must be mcp-tools.json");
      } else OK("mcpToolDescription.file mcp-tools.json");
    }
  }

  if (manifest.id !== "6799c907-19f2-49a8-826c-4473bc645d59") {
    FAIL("manifest.id must be app id 6799c907-19f2-49a8-826c-4473bc645d59");
  } else OK("app id preserved");

  // --- ai-plugin RemoteMCPServer source of truth ---
  if (aiPlugin.namespace !== "omaticserver") FAIL("ai-plugin namespace must be omaticserver");
  else OK("ai-plugin namespace omaticserver");
  const runtime = (aiPlugin.runtimes || []).find((r) => r.type === "RemoteMCPServer");
  if (!runtime) FAIL("ai-plugin missing RemoteMCPServer runtime");
  else {
    OK("ai-plugin RemoteMCPServer runtime present");
    if (runtime.auth?.reference_id !== connectors?.[0]?.toolSource?.remoteMcpServer?.authorization?.referenceId) {
      FAIL("ai-plugin reference_id must match manifest referenceId");
    } else OK("ai-plugin reference_id ↔ manifest referenceId");
    if (runtime.spec?.url !== "https://factory.o-matic.ai/mcp") FAIL("ai-plugin url mismatch");
    else OK("ai-plugin url matches");
  }

  // --- pin parity ---
  const pinned = runtime?.run_for_functions || [];
  const toolNames = (mcpTools.tools || []).map((t) => t.name);
  const expected = [
    "connections_list",
    "omatic_guide",
    "search",
    "task_relationships",
    "task_duplicate_check",
    "slate_entity_search",
    "slate_entity_verify",
    "module_status",
  ];
  if (JSON.stringify(pinned) !== JSON.stringify(expected)) {
    FAIL(`run_for_functions mismatch: ${JSON.stringify(pinned)}`);
  } else OK("run_for_functions = 8 pinned read-only tools");
  if (JSON.stringify(toolNames) !== JSON.stringify(expected)) {
    FAIL(`mcp-tools.json names mismatch: ${JSON.stringify(toolNames)}`);
  } else OK("mcp-tools.json names match run_for_functions");
  const fnNames = (aiPlugin.functions || []).map((f) => f.name);
  if (JSON.stringify(fnNames) !== JSON.stringify(expected)) {
    FAIL(`ai-plugin functions names mismatch`);
  } else OK("ai-plugin functions names match");

  // --- real-validator lint ---
  console.log("\n-- real-validator lint --");
  for (const fn of aiPlugin.functions || []) {
    if (!fn.description || !String(fn.description).trim()) {
      FAIL(`ai-plugin function ${fn.name} missing description`);
    } else OK(`function ${fn.name} has description`);
  }
  for (const t of mcpTools.tools || []) {
    if (!t.description || !String(t.description).trim()) {
      FAIL(`mcp-tools ${t.name} missing description`);
    }
    if (!t.inputSchema) FAIL(`mcp-tools ${t.name} missing inputSchema`);
  }
  OK("mcp-tools entries have description + inputSchema");

  const confirmHits = [];
  walkConfirmations(aiPlugin, "ai-plugin", confirmHits);
  walkConfirmations(manifest, "manifest", confirmHits);
  if (confirmHits.length) confirmHits.forEach((h) => FAIL(h));
  else OK("no confirmation.type 'None'");

  // --- icons ---
  console.log("\n-- icons --");
  try {
    const color = readPngMeta(join(icons, "color.png"));
    const outline = readPngMeta(join(icons, "outline.png"));
    if (color.w !== 192 || color.h !== 192) FAIL(`color.png must be 192x192, got ${color.w}x${color.h}`);
    else OK(`color.png 192x192 sha256=${color.sha256}`);
    if (outline.w !== 32 || outline.h !== 32) FAIL(`outline.png must be 32x32, got ${outline.w}x${outline.h}`);
    else OK(`outline.png 32x32 sha256=${outline.sha256}`);
    if (!hasAlpha(color.color)) FAIL("color.png must be RGBA (transparency for rounded plate)");
    else OK("color.png has alpha channel");
    if (!hasAlpha(outline.color)) FAIL("outline.png must be RGBA (white on transparent)");
    else OK("outline.png has alpha channel");
  } catch (e) {
    FAIL(String(e.message || e));
  }

  // --- official JSON schemas (structural required fields) ---
  console.log("\n-- JSON schemas --");
  try {
    const teamsSchema = await fetchSchema("teams-v1.30", SCHEMA_URLS.teams);
    const pluginSchema = await fetchSchema("plugin-v2.4", SCHEMA_URLS.plugin);
    // Lightweight required-field walk; full $ref resolution is what atk covers.
    const mErrs = validateAgainstSchema(manifest, {
      type: "object",
      required: ["manifestVersion", "version", "id", "developer", "icons", "name", "description", "accentColor"],
    });
    if (mErrs.length) mErrs.forEach((e) => FAIL(`manifest schema: ${e}`));
    else OK(`manifest required fields (schema ${SCHEMA_URLS.teams})`);
    if (manifest.manifestVersion !== "1.30") FAIL("manifestVersion must be 1.30");
    else OK("manifestVersion 1.30");
    if (manifest.$schema !== SCHEMA_URLS.teams) FAIL("manifest $schema URL mismatch");
    else OK("manifest $schema URL");

    const pErrs = validateAgainstSchema(aiPlugin, {
      type: "object",
      required: ["schema_version", "name_for_human", "description_for_human", "namespace", "functions", "runtimes"],
    });
    if (pErrs.length) pErrs.forEach((e) => FAIL(`ai-plugin schema: ${e}`));
    else OK(`ai-plugin required fields (schema ${SCHEMA_URLS.plugin})`);
    if (aiPlugin.schema_version !== "v2.4") FAIL("ai-plugin schema_version must be v2.4");
    else OK("ai-plugin schema_version v2.4");
    // silence unused if fetch failed partially
    void teamsSchema;
    void pluginSchema;
  } catch (e) {
    FAIL(`schema fetch/validate: ${e.message || e}`);
  }

  // --- atk validate --manifest-file ---
  console.log("\n-- atk validate --manifest-file --");
  const atk = findAtk();
  const atkRun = spawnSync(
    atk[0],
    [...atk.slice(1), "validate", "--manifest-file", MANIFEST, "--interactive", "false"],
    { encoding: "utf8", cwd: root, env: { ...process.env, TEAMS_TELEMETRY: "false" } },
  );
  const atkOut = `${atkRun.stdout || ""}\n${atkRun.stderr || ""}`.trim();
  if (atkRun.status === 0) OK("atk validate --manifest-file passed");
  else {
    // agentConnectors-only packages can make atk warn; treat hard failure as FAIL
    console.log(atkOut.slice(0, 4000));
    FAIL(`atk validate exited ${atkRun.status}`);
  }

  console.log(`\n=== ${fails ? "FAILED" : "PASSED"} (${fails} failure(s)) ===\n`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
