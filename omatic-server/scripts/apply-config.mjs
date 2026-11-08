#!/usr/bin/env node
/**
 * Apply package/config.json (+ env overrides) into manifest.json and ai-plugin.json.
 *
 * Default = o-MATIC cloud MCP. Custom factory / MCP URL is first-class at *build*
 * time because Microsoft's agentConnectors.remoteMcpServer.mcpServerUrl is a
 * static HTTPS string in the zip (no runtime URL field in schema 1.30).
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

const manifest = JSON.parse(readFileSync(join(pkg, "manifest.json"), "utf8"));
manifest.version = version;
manifest.id = cfg.appId;
manifest.developer = { ...cfg.developer };
manifest.name = { ...cfg.name };
manifest.description = { ...cfg.description };
if (!isDefaultCloud) {
  // Custom build: keep names, clarify full description endpoint.
  manifest.description.full =
    `o-MATIC Server MCP Connector for Microsoft 365 Copilot. This build targets ${mcpServerUrl} with Entra SSO (OAuthPluginVault). Exposes the full MCP tool surface pinned at build time. Connector only — not a declarative agent.`;
  manifest.description.short =
    "Entra SSO MCP connector for an o-MATIC Server factory.";
}
manifest.accentColor = cfg.accentColor;
manifest.validDomains = [host];
manifest.agentConnectors = [
  {
    id: cfg.connectorId,
    displayName: cfg.displayName,
    description: isDefaultCloud
      ? cfg.connectorDescription
      : `o-MATIC Server MCP at ${mcpServerUrl}. Full tool surface. Entra SSO.`,
    toolSource: {
      remoteMcpServer: {
        mcpServerUrl,
        authorization: {
          type: "OAuthPluginVault",
          referenceId: oauthReferenceId,
        },
        // Cowork still requires a packaged tool file on 1.29+. Pin the FULL
        // live tool surface (not a curated subset). Dynamic discovery
        // (omit mcpToolDescription) is host-dependent and refused here so
        // Install always exposes every pinned tool after SSO.
        mcpToolDescription: {
          file: "mcp-tools.json",
        },
      },
    },
  },
];

writeFileSync(join(pkg, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const ai = JSON.parse(readFileSync(join(pkg, "ai-plugin.json"), "utf8"));
ai.name_for_human = cfg.displayName;
ai.description_for_human = isDefaultCloud
  ? "o-MATIC Server MCP Connector — full tool surface over Entra SSO."
  : `o-MATIC Server MCP Connector targeting ${mcpServerUrl} — full tool surface.`;
ai.namespace = cfg.namespace;
const runtime = (ai.runtimes || []).find((r) => r.type === "RemoteMCPServer");
if (!runtime) {
  throw new Error("ai-plugin.json missing RemoteMCPServer runtime");
}
runtime.auth = {
  type: "OAuthPluginVault",
  reference_id: oauthReferenceId,
};
runtime.spec = runtime.spec || {};
runtime.spec.url = mcpServerUrl;
if (runtime.spec.mcp_tool_description) {
  runtime.spec.mcp_tool_description.file = "mcp-tools.json";
}
writeFileSync(join(pkg, "ai-plugin.json"), JSON.stringify(ai, null, 2) + "\n");

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
packageJson.version = version;
packageJson.description =
  "o-MATIC Server MCP Connector — Microsoft 365 Copilot remote MCP (agentConnectors), Entra SSO. Default https://factory.o-matic.ai/mcp; custom URL via OMATIC_MCP_URL at build. Not an agent, not Probot.";
writeFileSync(join(root, "package.json"), JSON.stringify(packageJson, null, 2) + "\n");

console.log(
  JSON.stringify(
    {
      applied: true,
      version,
      mcpServerUrl,
      host,
      isDefaultCloud,
      displayName: cfg.displayName,
      toolFile: "mcp-tools.json",
    },
    null,
    2,
  ),
);
