#!/usr/bin/env node
/**
 * Validate the o-MATIC Server MCP Connector package (dynamic discovery).
 *
 * Jimmy 2026-11-07: functions=[], run_for_functions=["*"], omit
 * mcpToolDescription / mcp_tool_description so Copilot uses live tools/list.
 *
 * 1. Teams 1.30 + plugin 2.4 required fields
 * 2. atk validate --manifest-file
 * 3. Dynamic-discovery shape + naming lengths + OAuthPluginVault
 * 4. Icon dimension + transparency checks
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
const CONFIG = join(pkg, "config.json");

const SCHEMA_URLS = {
  teams:
    "https://developer.microsoft.com/json-schemas/teams/v1.30/MicrosoftTeams.schema.json",
  plugin:
    "https://developer.microsoft.com/json-schemas/copilot/plugin/v2.4/schema.json",
};

const DEFAULT_URL = "https://factory.o-matic.ai/mcp";
const DEFAULT_REF =
  "MmEyNzdiN2UtMzMwYi00MDBlLTgwYmYtNWE5MDZmYzVkNTkxIyNiZWFjMWU2MC00MjgyLTRkM2MtYjNmZS1mOTI5YjJjN2ViMWE=";

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

function validateAgainstSchema(data, schema, path = "$") {
  const errors = [];
  const walk = (node, sch, p) => {
    if (!sch || typeof sch !== "object") return;
    if (sch.$ref) return;
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
  const color = buf[25];
  return {
    w,
    h,
    color,
    sha256: createHash("sha256").update(buf).digest("hex"),
  };
}

function hasAlpha(colorType) {
  return colorType === 4 || colorType === 6;
}

function findAtk() {
  return ["npx", "--yes", "@microsoft/m365agentstoolkit-cli@1.1.19"];
}

async function main() {
  console.log("\n=== validate o-MATIC Server MCP Connector (dynamic discovery) ===\n");

  for (const p of [
    MANIFEST,
    AI_PLUGIN,
    CONFIG,
    join(icons, "color.png"),
    join(icons, "outline.png"),
  ]) {
    if (!existsSync(p)) FAIL(`missing ${p}`);
    else OK(`present ${p.replace(root + "/", "")}`);
  }
  if (fails) process.exit(1);

  const cfg = loadJson(CONFIG);
  const manifest = loadJson(MANIFEST);
  const aiPlugin = loadJson(AI_PLUGIN);

  if (cfg.discoveryMode !== "dynamic") {
    FAIL('config.discoveryMode must be "dynamic"');
  } else OK('config.discoveryMode "dynamic"');

  // --- structural: no declarative agent ---
  if (manifest.copilotAgents) FAIL("manifest must not declare copilotAgents (connector only)");
  else OK("no copilotAgents / declarative agent");
  if (manifest.agentSkills) FAIL("manifest must not declare agentSkills (connector only)");
  else OK("no agentSkills");
  if (existsSync(join(pkg, "declarativeAgent.json"))) FAIL("declarativeAgent.json must not exist");
  else OK("no declarativeAgent.json");
  if (existsSync(join(pkg, "instructions.txt"))) FAIL("instructions.txt must not exist");
  else OK("no instructions.txt");

  // --- naming / description lengths ---
  const shortName = manifest.name?.short || "";
  const fullName = manifest.name?.full || "";
  const shortDesc = manifest.description?.short || "";
  const fullDesc = manifest.description?.full || "";
  if (shortName.length < 1 || shortName.length > 30) FAIL(`name.short length ${shortName.length} (1–30)`);
  else OK(`name.short "${shortName}" (${shortName.length}≤30)`);
  if (fullName.length < 1 || fullName.length > 100) FAIL(`name.full length ${fullName.length} (1–100)`);
  else OK(`name.full (${fullName.length}≤100)`);
  if (shortDesc.length < 1 || shortDesc.length > 80) FAIL(`description.short length ${shortDesc.length} (1–80)`);
  else OK(`description.short (${shortDesc.length}≤80)`);
  if (fullDesc.length < 1 || fullDesc.length > 4000) FAIL(`description.full length ${fullDesc.length}`);
  else OK(`description.full (${fullDesc.length}≤4000)`);
  if (shortDesc === fullDesc) FAIL("description.short and description.full must differ");
  else OK("description.short ≠ description.full");
  if (/https?:\/\//i.test(shortDesc)) FAIL("description.short must not contain URLs");
  else OK("description.short has no URL");
  if (!/MCP Connector/i.test(shortName) || !/MCP Connector/i.test(fullName)) {
    FAIL('display names must include "MCP Connector"');
  } else OK("rename includes MCP Connector");

  // --- agentConnectors remote MCP ---
  const connectors = manifest.agentConnectors;
  if (!Array.isArray(connectors) || connectors.length !== 1) {
    FAIL("manifest.agentConnectors must have exactly one entry");
  } else {
    const c = connectors[0];
    if (c.id !== "omaticserver") FAIL(`connector id must be omaticserver, got ${c.id}`);
    else OK("connector id omaticserver");
    if (!c.displayName || !c.description) FAIL("connector displayName and description required");
    else if (c.displayName.length > 128) FAIL("connector displayName > 128");
    else if (!/MCP Connector/i.test(c.displayName)) FAIL('connector displayName must include "MCP Connector"');
    else OK(`connector displayName "${c.displayName}"`);
    const remote = c.toolSource?.remoteMcpServer;
    if (!remote) FAIL("toolSource.remoteMcpServer required");
    else {
      if (c.toolSource.plugin || c.toolSource.localMcpServer) {
        FAIL("toolSource must be remoteMcpServer only");
      } else OK("toolSource is remoteMcpServer only");
      if (!remote.mcpServerUrl || !/^https:\/\//i.test(remote.mcpServerUrl)) {
        FAIL("mcpServerUrl must be HTTPS");
      } else {
        OK(`mcpServerUrl ${remote.mcpServerUrl}`);
        if (remote.mcpServerUrl === DEFAULT_URL) OK("default cloud endpoint");
        else OK("custom MCP URL build");
      }
      try {
        const host = new URL(remote.mcpServerUrl).hostname;
        if (!(manifest.validDomains || []).includes(host)) {
          FAIL(`validDomains must include MCP host ${host}`);
        } else OK(`validDomains includes ${host}`);
      } catch {
        FAIL("mcpServerUrl is not a parseable URL");
      }
      if (!remote.authorization) FAIL("authorization required");
      else if (remote.authorization.type !== "OAuthPluginVault") {
        FAIL("authorization.type must be OAuthPluginVault");
      } else OK("OAuthPluginVault");
      if (!remote.authorization?.referenceId) FAIL("authorization.referenceId required");
      else if (
        remote.mcpServerUrl === DEFAULT_URL &&
        remote.authorization.referenceId !== DEFAULT_REF
      ) {
        FAIL("default cloud build must keep Foundry Entra SSO referenceId");
      } else OK("referenceId present");
      // Dynamic discovery: mcpToolDescription MUST be omitted
      if (remote.mcpToolDescription) {
        FAIL("mcpToolDescription must be omitted for dynamic tools/list discovery");
      } else OK("mcpToolDescription omitted (dynamic discovery)");
    }
  }

  if (manifest.id !== cfg.appId) FAIL(`manifest.id must be ${cfg.appId}`);
  else OK("app id preserved");
  if (manifest.manifestVersion !== "1.30") FAIL("manifestVersion must be 1.30");
  else OK("manifestVersion 1.30");

  // --- ai-plugin dynamic discovery shape ---
  // https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-dynamic-tool-discovery
  if (aiPlugin.namespace !== "omaticserver") FAIL("ai-plugin namespace must be omaticserver");
  else OK("ai-plugin namespace omaticserver");
  if (aiPlugin.name_for_human !== connectors?.[0]?.displayName) {
    FAIL("ai-plugin name_for_human must match connector displayName");
  } else OK("ai-plugin name_for_human ↔ connector displayName");
  if (!Array.isArray(aiPlugin.functions) || aiPlugin.functions.length !== 0) {
    FAIL('ai-plugin functions must be [] for dynamic discovery');
  } else OK("ai-plugin functions []");
  const runtime = (aiPlugin.runtimes || []).find((r) => r.type === "RemoteMCPServer");
  const remoteUrl = connectors?.[0]?.toolSource?.remoteMcpServer?.mcpServerUrl;
  if (!runtime) FAIL("ai-plugin missing RemoteMCPServer runtime");
  else {
    OK("ai-plugin RemoteMCPServer runtime present");
    const rff = runtime.run_for_functions;
    if (!Array.isArray(rff) || rff.length !== 1 || rff[0] !== "*") {
      FAIL('run_for_functions must be ["*"] for dynamic discovery');
    } else OK('run_for_functions ["*"]');
    if (runtime.auth?.reference_id !== connectors?.[0]?.toolSource?.remoteMcpServer?.authorization?.referenceId) {
      FAIL("ai-plugin reference_id must match manifest referenceId");
    } else OK("ai-plugin reference_id ↔ manifest referenceId");
    if (runtime.auth?.type !== "OAuthPluginVault") FAIL("ai-plugin auth type must be OAuthPluginVault");
    else OK("ai-plugin OAuthPluginVault");
    if (runtime.spec?.url !== remoteUrl) FAIL("ai-plugin url must match manifest mcpServerUrl");
    else OK("ai-plugin url matches mcpServerUrl");
    if (runtime.spec?.mcp_tool_description) {
      FAIL("ai-plugin spec.mcp_tool_description must be omitted for dynamic discovery");
    } else OK("ai-plugin mcp_tool_description omitted");
  }

  // Optional historical pin file may remain in-repo; must NOT be required for zip.
  if (existsSync(join(pkg, "mcp-tools.json"))) {
    OK("note: package/mcp-tools.json may remain as historical pin; not shipped in dynamic zip");
  }

  // --- icons ---
  console.log("\n-- icons --");
  try {
    const color = readPngMeta(join(icons, "color.png"));
    const outline = readPngMeta(join(icons, "outline.png"));
    if (color.w !== 192 || color.h !== 192) FAIL(`color.png must be 192x192, got ${color.w}x${color.h}`);
    else OK(`color.png 192x192`);
    if (outline.w !== 32 || outline.h !== 32) FAIL(`outline.png must be 32x32, got ${outline.w}x${outline.h}`);
    else OK(`outline.png 32x32`);
    if (!hasAlpha(color.color)) FAIL("color.png must be RGBA");
    else OK("color.png has alpha");
    if (!hasAlpha(outline.color)) FAIL("outline.png must be RGBA");
    else OK("outline.png has alpha");
  } catch (e) {
    FAIL(String(e.message || e));
  }

  // --- JSON schemas (required fields) ---
  console.log("\n-- JSON schemas --");
  try {
    await fetchSchema("teams-v1.30", SCHEMA_URLS.teams);
    await fetchSchema("plugin-v2.4", SCHEMA_URLS.plugin);
    const mErrs = validateAgainstSchema(manifest, {
      type: "object",
      required: [
        "manifestVersion",
        "version",
        "id",
        "developer",
        "icons",
        "name",
        "description",
        "accentColor",
      ],
    });
    if (mErrs.length) mErrs.forEach((e) => FAIL(`manifest schema: ${e}`));
    else OK("manifest required fields");
    if (manifest.$schema !== SCHEMA_URLS.teams) FAIL("manifest $schema URL mismatch");
    else OK("manifest $schema URL");

    const pErrs = validateAgainstSchema(aiPlugin, {
      type: "object",
      required: [
        "schema_version",
        "name_for_human",
        "description_for_human",
        "namespace",
        "functions",
        "runtimes",
      ],
    });
    if (pErrs.length) pErrs.forEach((e) => FAIL(`ai-plugin schema: ${e}`));
    else OK("ai-plugin required fields");
    if (aiPlugin.schema_version !== "v2.4") FAIL("ai-plugin schema_version must be v2.4");
    else OK("ai-plugin schema_version v2.4");
  } catch (e) {
    FAIL(`schema fetch/validate: ${e.message || e}`);
  }

  // --- atk validate ---
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
