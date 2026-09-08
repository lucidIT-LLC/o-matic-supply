#!/usr/bin/env node
// Verifies every shipped MCP host config in this repo uses the shape its host
// actually parses. Each rule is sourced from a vendor doc read on 2026-09-06,
// cited inline, because a copied shape goes stale silently and a wrong key
// fails by registering NOTHING rather than by erroring.
//
// Usage: node scripts/check-mcp-host-shapes.mjs [rootDir]
// Exit 0 = all shapes valid. Exit 1 = at least one FAIL.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
const servers = (o) => Object.entries(o).filter(([k]) => !k.startsWith('_'));
const isServer = (v) => v && typeof v === 'object' && ('command' in v || 'url' in v || 'httpUrl' in v);

// --- Codex: developers.openai.com/codex/plugins/build ------------------------
// The .codex-plugin/plugin.json field is camelCase "mcpServers" and MAY be a
// string path. The file it points at must be a BARE server map (no wrapper) or
// wrapped under snake_case "mcp_servers". A camelCase "mcpServers" wrapper
// INSIDE that file is neither documented shape and resolves no servers.
export function checkCodex(manifestPath) {
  const label = `codex ${manifestPath.replace(ROOT + '/', '')}`;
  const m = readJson(manifestPath);
  if (typeof m.mcpServers !== 'string') {
    return record(label, false, 'plugin.json .mcpServers must be a string path to the server file');
  }
  // Codex resolves the path from the PLUGIN ROOT (the dir containing
  // .codex-plugin/), not from the manifest's own directory. Accept either so a
  // repo that co-locates the file still validates.
  const pluginRoot = resolve(dirname(manifestPath), '..');
  const target = [resolve(pluginRoot, m.mcpServers), resolve(dirname(manifestPath), m.mcpServers)]
    .find(existsSync);
  if (!target) return record(label, false, `referenced file missing: ${m.mcpServers} (looked in ${pluginRoot} and ${dirname(manifestPath)})`);
  const f = readJson(target);
  if ('mcpServers' in f) {
    return record(label, false,
      `${m.mcpServers} is wrapped under camelCase "mcpServers" — undocumented for the referenced file; ` +
      'use a bare map or "mcp_servers"');
  }
  const map = 'mcp_servers' in f ? f.mcp_servers : f;
  const entries = servers(map);
  if (!entries.length) return record(label, false, `${m.mcpServers} declares no servers`);
  const bad = entries.filter(([, v]) => !isServer(v)).map(([k]) => k);
  if (bad.length) return record(label, false, `not server objects: ${bad.join(', ')}`);
  record(label, true, `${entries.length} server(s) via ${'mcp_servers' in f ? 'mcp_servers wrapper' : 'bare map'}`);
}

// --- Claude Code / Cowork / Gemini CLI: top-level "mcpServers" ---------------
// google-gemini.github.io/gemini-cli/docs/tools/mcp-server — same key shape.
export function checkMcpServersMap(path, label) {
  const f = readJson(path);
  if ('servers' in f && !('mcpServers' in f)) {
    return record(label, false, 'uses VS Code "servers" key; this host needs "mcpServers"');
  }
  if (!('mcpServers' in f)) return record(label, false, 'missing top-level "mcpServers"');
  const entries = servers(f.mcpServers);
  const bad = entries.filter(([, v]) => !isServer(v)).map(([k]) => k);
  if (!entries.length) return record(label, false, 'declares no servers');
  if (bad.length) return record(label, false, `no transport (command/url/httpUrl): ${bad.join(', ')}`);
  record(label, true, `${entries.length} server(s)`);
}

// --- VS Code / GitHub Copilot: code.visualstudio.com/docs/copilot/customization/mcp-servers
// Top-level key is "servers", NOT "mcpServers", and each server declares a type.
export function checkVscode(path, label) {
  const f = readJson(path);
  if ('mcpServers' in f) {
    return record(label, false, 'uses "mcpServers"; VS Code Copilot needs the "servers" key');
  }
  if (!('servers' in f)) return record(label, false, 'missing top-level "servers"');
  const entries = servers(f.servers);
  if (!entries.length) return record(label, false, 'declares no servers');
  const bad = entries.filter(([, v]) => !isServer(v)).map(([k]) => k);
  if (bad.length) return record(label, false, `no transport: ${bad.join(', ')}`);
  const untyped = entries.filter(([, v]) => !v.type).map(([k]) => k);
  if (untyped.length) return record(label, false, `missing "type" (stdio|http): ${untyped.join(', ')}`);
  record(label, true, `${entries.length} server(s), all typed`);
}

// --- agent-pack.json must not call a native-MCP host prompt-only -------------
const NATIVE_MCP = ['google-gemini', 'google-gemini-cli', 'gemini', 'github-copilot', 'github-copilot-vscode', 'copilot'];
export function checkAgentPack(path, label) {
  const f = readJson(path);
  const promptOnly = f?.compatibility?.prompt_only_hosts?.hosts ?? [];
  const mis = promptOnly.filter((h) => NATIVE_MCP.includes(h));
  if (mis.length) {
    return record(label, false, `hosts with native MCP support listed as prompt-only: ${mis.join(', ')}`);
  }
  record(label, true, `prompt_only_hosts clean (${promptOnly.join(', ') || 'empty'})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const pack of ['wordpress', 'microsoft-365']) {
    const d = resolve(ROOT, pack);
    if (!existsSync(d)) continue;
    if (existsSync(`${d}/.codex-plugin/plugin.json`)) checkCodex(`${d}/.codex-plugin/plugin.json`);
    for (const [file, fn] of [
      ['config/examples/claude-code.mcp.json', checkMcpServersMap],
      ['config/examples/generic-mcp.json', checkMcpServersMap],
      ['config/examples/gemini-cli.settings.json', checkMcpServersMap],
      ['config/examples/vscode.mcp.json', checkVscode],
      ['agent-pack.json', checkAgentPack],
    ]) if (existsSync(`${d}/${file}`)) fn(`${d}/${file}`, `${pack}/${file}`);
  }
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}\n        ${r.detail}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
