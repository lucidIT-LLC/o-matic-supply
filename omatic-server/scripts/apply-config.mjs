#!/usr/bin/env node
/**
 * Apply package/config.json (+ env overrides) into manifest.json and ai-plugin.json.
 *
 * Default = o-MATIC cloud MCP with **dynamic tool discovery** (Jimmy 2026-11-07):
 *   - agentConnectors: omit mcpToolDescription → host calls tools/list
 *   - ai-plugin: functions=[], run_for_functions=["*"], no mcp_tool_description
 *
 * Custom factory / MCP URL is first-class at *build* time (schema pins mcpServerUrl).
 *
 * Env:
 *   OMATIC_MCP_URL              — HTTPS MCP endpoint (default from config.json)
 *   OMATIC_OAUTH_REFERENCE_ID   — OAuthPluginVault / Entra SSO registration id
 *   OMATIC_VERSION              — optional version override
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "package");

function hostnameOf(url) {
  const u = new URL(url);
  if (u.protocol !== "https:") {
    throw new Error(`mcpServerUrl must be https://, got ${url}`);
  }
  return u.hostname;
}

const cfg = JSON.parse(readFileSync(join(pkg, "config.json"), "utf8"));
const mcpServerUrl = (process.env.OMATIC_MCP_URL || cfg.mcpServerUrl).trim();
const oauthReferenceId = (
  process.env.OMATIC_OAUTH_REFERENCE_ID || cfg.oauthReferenceId
).trim();
const version = (process.env.OMATIC_VERSION || cfg.version).trim();
const host = hostnameOf(mcpServerUrl);
const isDefaultCloud = mcpServerUrl === "https://factory.o-matic.ai/mcp";
const discoveryMode = cfg.discoveryMode || "dynamic";

if (discoveryMode !== "dynamic") {
  throw new Error(
    `discoveryMode must be "dynamic" (Jimmy confirmed tools/list); got ${discoveryMode}`,
  );
}

const description = { ...cfg.description };
const connectorDescription = isDefaultCloud
  ? cfg.connectorDescription
  : `o-MATIC Server MCP at ${mcpServerUrl}. Dynamic tools/list (all live tools). Entra SSO.`;
if (!isDefaultCloud) {
  description.short =
    "Entra SSO MCP connector for an o-MATIC Server factory.";
  description.full =
    `o-MATIC Server MCP Connector for Microsoft 365 Copilot. This build targets ${mcpServerUrl} with Entra SSO (OAuthPluginVault). Uses dynamic tool discovery (live tools/list) so Copilot sees every tool that server exposes. Connector only — not a declarative agent.`;
}

const remoteMcpServer = {
  mcpServerUrl,
  authorization: {
    type: "OAuthPluginVault",
    referenceId: oauthReferenceId,
  },
  // Omit mcpToolDescription → dynamic discovery (manifest 1.29+/1.30).
  // https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-dynamic-tool-discovery
};

const manifest = {
  $schema:
    "https://developer.microsoft.com/json-schemas/teams/v1.30/MicrosoftTeams.schema.json",
  manifestVersion: "1.30",
  version,
  id: cfg.appId,
  developer: { ...cfg.developer },
  icons: {
    color: "color.png",
    outline: "outline.png",
  },
  name: { ...cfg.name },
  description,
  accentColor: cfg.accentColor,
  permissions: ["identity"],
  validDomains: [host],
  agentConnectors: [
    {
      id: cfg.connectorId,
      displayName: cfg.displayName,
      description: connectorDescription,
      toolSource: {
        remoteMcpServer,
      },
    },
  ],
};

writeFileSync(join(pkg, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const ai = {
  $schema:
    "https://developer.microsoft.com/json-schemas/copilot/plugin/v2.4/schema.json",
  schema_version: "v2.4",
  name_for_human: cfg.displayName,
  description_for_human: isDefaultCloud
    ? "o-MATIC Server MCP Connector — dynamic tools/list over Entra SSO."
    : `o-MATIC Server MCP Connector targeting ${mcpServerUrl} — dynamic tools/list.`,
  namespace: cfg.namespace,
  // Dynamic discovery: empty functions + wildcard run_for_functions.
  functions: [],
  runtimes: [
    {
      type: "RemoteMCPServer",
      auth: {
        type: "OAuthPluginVault",
        reference_id: oauthReferenceId,
      },
      run_for_functions: ["*"],
      spec: {
        url: mcpServerUrl,
        // no mcp_tool_description → resolve tools from the server at runtime
      },
    },
  ],
  privacy_policy_url: cfg.developer.privacyUrl,
  legal_info_url: cfg.developer.termsOfUseUrl,
};

writeFileSync(join(pkg, "ai-plugin.json"), JSON.stringify(ai, null, 2) + "\n");

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
packageJson.version = version;
packageJson.description =
  "o-MATIC Server MCP Connector — Microsoft 365 Copilot remote MCP (agentConnectors), Entra SSO, dynamic tools/list. Default https://factory.o-matic.ai/mcp; custom URL via OMATIC_MCP_URL at build. Not an agent, not Probot.";
writeFileSync(join(root, "package.json"), JSON.stringify(packageJson, null, 2) + "\n");

console.log(
  JSON.stringify(
    {
      applied: true,
      version,
      discoveryMode: "dynamic",
      mcpServerUrl,
      host,
      isDefaultCloud,
      displayName: cfg.displayName,
      run_for_functions: ["*"],
      functions: [],
      mcpToolDescription: "omitted (dynamic tools/list)",
    },
    null,
    2,
  ),
);
