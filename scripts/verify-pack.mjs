#!/usr/bin/env node
// verify-pack.mjs — does a skill pack actually work on a host with no MCP plugin?
// Exit 1 on any FAIL. Every rule here encodes a failure this factory has already had.
import { readFileSync, readdirSync, existsSync, statSync, lstatSync } from "node:fs";
import { join, basename } from "node:path";

const root = process.argv[2];
if (!root) { console.error("usage: verify-pack.mjs <marketplace-root>"); process.exit(2); }
let fails = 0, warns = 0, checks = 0;
const FAIL = (m) => { console.log(`  FAIL  ${m}`); fails++; };
const WARN = (m) => { console.log(`  warn  ${m}`); warns++; };
const OK   = (m) => { console.log(`  ok    ${m}`); };
// Do NOT follow symlinks: host-discovery shims (.agents/skills -> ../<pack>/skills)
// point at the same files, and walking both reports every finding twice.
const walk = (d) => readdirSync(d).flatMap(f => {
  const p = join(d, f);
  if (lstatSync(p).isSymbolicLink()) return [];
  return statSync(p).isDirectory() ? walk(p) : [p];
});

// Tools that exist. Anything else called as an instruction is a ghost.
const SERVER_TOOLS = ["startup","factory_query","search","connections_list","embed_query","omatic_guide"];
const DEAD_PLUGIN_TOOLS = ["omatic_select_factory","omatic_resolve_factory","omatic_runtime_status","omatic_usage_guide",
  "omatic_execute_sql","omatic_search_memory","omatic_factory_startup_run","omatic_factory_startup"];
// A line may NAME a dead thing to forbid it. These words mark that intent.
const EXEMPT = /retired|forbid|do not call|do(es)? not exist|no longer exist|no longer|stale|decommission|superseded|previous text|history|historic|not a typo|removed in|gone, not deprecated|unknown tool|deleted, not deprecated|absent|there is no|ships no|no mcp server|pack note/i;

console.log(`\n=== verifying ${root} ===\n`);

// 1. marketplace manifest
const mkPath = join(root, ".claude-plugin", "marketplace.json");
checks++;
if (!existsSync(mkPath)) FAIL(".claude-plugin/marketplace.json missing");
else {
  let mk; try { mk = JSON.parse(readFileSync(mkPath, "utf8")); OK("marketplace.json parses"); }
  catch (e) { FAIL(`marketplace.json invalid JSON: ${e.message}`); }
  if (mk) {
    if (!mk.name) FAIL("marketplace.json has no name");
    if (!Array.isArray(mk.plugins) || !mk.plugins.length) FAIL("marketplace.json lists no plugins");
    for (const p of mk.plugins ?? []) {
      const src = join(root, p.source ?? "");
      if (!existsSync(src)) FAIL(`plugin source missing: ${p.name} -> ${p.source}`);
      else OK(`plugin source resolves: ${p.name}`);
    }
  }
}

// 2. per-plugin manifests + the no-MCP invariant
for (const d of readdirSync(root)) {
  const pd = join(root, d);
  if (!statSync(pd).isDirectory() || d.startsWith(".")) continue;
  const cp = join(pd, ".claude-plugin", "plugin.json");
  if (!existsSync(cp)) continue;
  checks++;
  let pj; try { pj = JSON.parse(readFileSync(cp, "utf8")); OK(`${d}/plugin.json parses`); }
  catch (e) { FAIL(`${d}/plugin.json invalid: ${e.message}`); continue; }
  // A SKILL pack must not declare an MCP server; a TOOL pack must. The
  // marketplace metadata says which this is, so the invariant is checked
  // against intent rather than assumed.
  const mkRaw = existsSync(mkPath) ? readFileSync(mkPath, "utf8") : "";
  const isToolPack = /"shipsMcpServer"\s*:\s*true/.test(mkRaw);
  const hasMcp = Boolean(pj.mcpServers) || existsSync(join(pd, ".mcp.json"));
  if (isToolPack) {
    if (hasMcp) OK(`${d}: tool pack ships an MCP server, as declared`);
    else FAIL(`${d}: declared shipsMcpServer=true but no mcpServers/.mcp.json found`);
  } else {
    if (hasMcp) FAIL(`${d}: skill pack DECLARES mcpServers — restricted hosts will omit it`);
    else OK(`${d}/plugin.json declares no mcpServers`);
  }
  if (!pj.skills) WARN(`${d}/plugin.json has no skills path`);
}

// 2b. compatibility tier must be declared — known_rules #284 is halt-grade
{
  checks++;
  const mkTxt = existsSync(mkPath) ? readFileSync(mkPath, "utf8") : "";
  if (/compatibilityTier/.test(mkTxt)) OK("compatibility tier declared (rule #284)");
  else FAIL("no compatibilityTier declared — rule #284 (compatibility gate) is halt-grade");
}

// A skill whose JOB is detecting retired mechanisms must name them to detect
// them. Scanning it for "names a retired mechanism" is the same false positive
// this factory has now hit three times in one day: v_retired_role_references
// fired on the ticket written to retire the roles, v_decommission_audit fired
// 5/5 on records that say "retained verbatim as historical evidence", and this
// check fired 11/11 on the staleness auditor's own detection vocabulary.
//
// Exempt by ROLE, not by phrase. A denylist of wordings keeps firing on every
// well-written retirement record; the detector is exempt because detecting is
// what it is for. Its DESCRIPTION is still checked below -- that is the routing
// text hosts read, and it must not read as a live Conductor instruction.
const RETIREMENT_DETECTORS = new Set(["factory-staleness-audit"]);

// 3. every SKILL.md
for (const f of walk(root).filter(p => basename(p) === "SKILL.md")) {
  const rel = f.replace(root, ".");
  const txt = readFileSync(f, "utf8");
  checks++;
  const fm = txt.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) { FAIL(`${rel}: no frontmatter`); continue; }
  const name = (fm[1].match(/^name:\s*(.+)$/m) || [])[1]?.trim();
  const desc = (fm[1].match(/^description:\s*(.+)$/m) || [])[1]?.trim();
  const dir = basename(f.replace(/\/SKILL\.md$/, ""));
  if (!name) FAIL(`${rel}: frontmatter has no name`);
  else if (name !== dir) FAIL(`${rel}: name '${name}' != directory '${dir}'`);
  if (!desc) FAIL(`${rel}: frontmatter has no description`);
  else if (/conductor/i.test(desc)) FAIL(`${rel}: DESCRIPTION names Conductor — this is the routing text hosts read`);

  // Scan by PARAGRAPH, not line: a prohibition marker on the first line of a
  // blockquote or paragraph exempts the whole construct. Line-granular scanning
  // flags the continuation lines of every "Conductor is retired" warning, and a
  // check that cries wolf is a check nobody runs.
  let para = [], startLine = 1;
  const flush = () => {
    if (!para.length) return;
    const block = para.join("\n");
    // A whole-paragraph exemption is too coarse: a paragraph can carry a LIVE
    // instruction and an unrelated historical clause ("...removed in 5.0.0"),
    // and the historical clause was clearing the live one. This shipped a real
    // Conductor instruction to GitHub on 2026-08-24. Exempt a paragraph only
    // when it is a blockquote prohibition; otherwise judge line by line.
    const isBlockquote = para.every((l) => l.trimStart().startsWith(">"));
    const isDetector = [...RETIREMENT_DETECTORS].some((d) => rel.includes(d));
    if (!isDetector && !(isBlockquote && EXEMPT.test(block))) {
      para.forEach((line, k) => {
        const n = startLine + k;
        if (EXEMPT.test(line)) return;              // the LINE itself disowns it
        if (/8438/.test(line)) FAIL(`${rel}:${n}: routes to dead port 8438`);
        else if (/\bconductor\b/i.test(line)) FAIL(`${rel}:${n}: names Conductor as live instruction`);
        for (const t of DEAD_PLUGIN_TOOLS)
          if (line.includes(t)) FAIL(`${rel}:${n}: calls ${t} — no plugin ships in this pack`);
      });
    }
    para = [];
  };
  txt.split("\n").forEach((line, i) => {
    if (line.trim() === "") { flush(); startLine = i + 2; return; }
    if (!para.length) startLine = i + 1;
    para.push(line);
  });
  flush();

  // shared fragment integrity
  const s = txt.indexOf("<!-- shared:system-5-detection start -->");
  const e = txt.indexOf("<!-- shared:system-5-detection end -->");
  if (s !== -1 && e === -1) FAIL(`${rel}: shared block opened but never closed`);
}

console.log(`\n${fails ? "RESULT: FAIL" : "RESULT: PASS"} — ${checks} units checked, ${fails} fail, ${warns} warn\n`);
process.exit(fails ? 1 : 0);
