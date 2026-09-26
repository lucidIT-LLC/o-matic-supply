#!/usr/bin/env node
// verify-pack.mjs — does a skill pack actually work on a host with no MCP plugin?
// Version: 1.3.0 (2026-09-26) — adds check 2c, .claude-plugin/.codex-plugin version parity (task #803).
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

  // .claude-plugin and .codex-plugin manifests must ship in lockstep on
  // version (task #803, the same defect measured in o-matic-agency: 1.4.12
  // and 1.4.13 each bumped only .claude-plugin and silently left
  // .codex-plugin behind, two releases of drift with nothing to catch it).
  // Manifest SHAPE is not enforced (the two hosts have genuinely different
  // schemas -- codex nests display fields under "interface", claude does
  // not -- so only "version" is compared).
  const codexCp = join(pd, ".codex-plugin", "plugin.json");
  if (existsSync(codexCp)) {
    let cj; try { cj = JSON.parse(readFileSync(codexCp, "utf8")); }
    catch (e) { FAIL(`${d}/.codex-plugin/plugin.json invalid: ${e.message}`); cj = null; }
    if (cj) {
      if (cj.version !== pj.version)
        FAIL(`${d}: version drift -- .claude-plugin/plugin.json is ${pj.version}, .codex-plugin/plugin.json is ${cj.version}`);
      else OK(`${d}: .claude-plugin and .codex-plugin versions match (${pj.version})`);
    }
  }
}

// 2b. compatibility tier must be declared — known_rules #284 is halt-grade
{
  checks++;
  const mkTxt = existsSync(mkPath) ? readFileSync(mkPath, "utf8") : "";
  if (/compatibilityTier/.test(mkTxt)) OK("compatibility tier declared (rule #284)");
  else FAIL("no compatibilityTier declared — rule #284 (compatibility gate) is halt-grade");
}

// 2c. ${...} placeholders in shipped MCP manifests — task #659 follow-up.
// Vendor doc: code.claude.com/docs/en/plugins-reference.md, read 2026-09-13.
//
// Three built-ins substitute anywhere they are allowed at all:
//   ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_DATA} ${CLAUDE_PROJECT_DIR}
// The doc also permits "any ${ENV_VAR} from the environment" — which is why
// this is an ALLOWLIST with a written reason per exception rather than a
// denylist of bad spellings. A denylist would have caught the ${PLUGIN_ROOT}
// typo (9 occurrences) and missed all five of microsoft-365's env-block
// placeholders, which is the pair that actually broke the server.
//
// Substitution is ALSO field-scoped. The doc's table:
//   stdio servers          -> command, args, env
//   http/sse/ws servers    -> url, headers, headersHelper
//   LSP servers            -> command, args, env, workspaceFolder
// `cwd` appears in NO row. A ${...} there resolves nowhere and the host is
// handed a directory literally named "${CLAUDE_PLUGIN_ROOT}".
//
// Both manifest locations are scanned. The host loads the server from
// .claude-plugin/plugin.json; checking only .mcp.json is how the previous pass
// reached the wrong cause for the microsoft-365 crash.
{
  const BUILTINS = new Set(["CLAUDE_PLUGIN_ROOT", "CLAUDE_PLUGIN_DATA", "CLAUDE_PROJECT_DIR"]);
  const SUBST_FIELDS = {
    stdio: new Set(["command", "args", "env"]),
    http: new Set(["url", "headers", "headersHelper"]),
    sse: new Set(["url", "headers", "headersHelper"]),
    ws: new Set(["url", "headers", "headersHelper"]),
  };
  const alPath = join(root, "scripts", "placeholder-allowlist.json");
  let allow = [];
  if (existsSync(alPath)) {
    try { allow = JSON.parse(readFileSync(alPath, "utf8")).allowed ?? []; }
    catch (e) { FAIL(`scripts/placeholder-allowlist.json invalid: ${e.message}`); }
  }
  const allowed = (pack, v) => allow.some(a =>
    (a.packs ?? []).includes(pack) && (a.vars ?? []).includes(v) && a.reason);

  const TOKEN = /\$\{([^}]*)\}/g;
  // Walk a server object, remembering which top-level field we are inside.
  const scanValue = (val, field, ctx, transport) => {
    if (typeof val === "string") {
      for (const m of val.matchAll(TOKEN)) {
        const v = m[1];
        const substitutes = (SUBST_FIELDS[transport] ?? SUBST_FIELDS.stdio).has(field);
        if (!substitutes) {
          FAIL(`${ctx}: \${${v}} sits in "${field}", which the vendor doc does not list as a substituted field for a ${transport} server — it will be passed through as the literal text "\${${v}}"`);
        } else if (BUILTINS.has(v)) {
          OK(`${ctx}: \${${v}} in "${field}"`);
        } else if (allowed(ctx.split("/")[0], v)) {
          OK(`${ctx}: \${${v}} in "${field}" — allowlisted with a recorded reason`);
        } else {
          FAIL(`${ctx}: \${${v}} in "${field}" is not one of the three documented built-ins and is not in scripts/placeholder-allowlist.json. If the variable is unset the host substitutes NOTHING and the server receives the literal string "\${${v}}" (this crashed microsoft-365, measured 2026-09-13). Fix the spelling, drop it, or allowlist it with a reason.`);
        }
      }
      return;
    }
    if (Array.isArray(val)) return val.forEach(x => scanValue(x, field, ctx, transport));
    if (val && typeof val === "object")
      for (const [, x] of Object.entries(val)) scanValue(x, field, ctx, transport);
  };

  const scanManifest = (file, rel, getServers) => {
    let j; try { j = JSON.parse(readFileSync(file, "utf8")); }
    catch { return; }                       // parse errors already reported above
    const map = getServers(j);
    if (!map || typeof map !== "object") return;
    for (const [name, srv] of Object.entries(map)) {
      if (!srv || typeof srv !== "object") continue;
      checks++;
      const transport = srv.type ?? (srv.url || srv.httpUrl ? "http" : "stdio");
      for (const [field, val] of Object.entries(srv))
        scanValue(val, field, `${rel}[${name}]`, transport);
    }
  };

  for (const d of readdirSync(root)) {
    const pd = join(root, d);
    if (!statSync(pd).isDirectory() || d.startsWith(".")) continue;
    const mcp = join(pd, ".mcp.json");
    const pj  = join(pd, ".claude-plugin", "plugin.json");
    if (existsSync(mcp)) scanManifest(mcp, `${d}/.mcp.json`, j => j.mcpServers ?? j.servers ?? j);
    if (existsSync(pj))  scanManifest(pj,  `${d}/.claude-plugin/plugin.json`, j => j.mcpServers);
  }
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


// 4. PERSONA GOLD RECORD — the file-side half of the release gate (task #745).
//
// WHY THIS EXISTS. The persona release gate is three sets of DB triggers on
// factory.persona* (trg_persona_publish_gate, six trg_persona_*_integrity_gate,
// trg_persona_build_release_gate), proven to refuse 9/9 in
// factory.fn_persona_gate_selftest(). Every one of them fires ONLY on a
// database write. A skill authored as a FILE and shipped without ever recording
// a persona_build row is invisible to all of them — persona_build's own FK
// refuses the build row with SQLSTATE 23503 before the release gate is even
// reached, so the gate cannot even be ASKED about an ungoverned persona.
//
// Measured 2026-09-15: six skills ship from files whose persona_version is
// review_status='draft' with ZERO persona_build rows — andy (the pixel-photo-
// coach skill, shipping 2.5.0), brandy, carver, jake, jo, monet. The database
// gate refused nothing in any of those six cases because it was never reached.
//
// WHY AN ATTESTATION FILE AND NOT A QUERY. verify-pack runs offline, in CI, on
// a host with no database and no credentials. A check that needs a connection
// is a check that gets skipped in the one place it must run. So the database
// exports what it certified into persona-attestation.json (see
// persona-attest-export.sql, which is the query that generates it) and this
// check verifies the PACK against that export.
//
// IT FAILS CLOSED, DELIBERATELY. A missing attestation file, a skill absent
// from it, or a stale skill version all FAIL. A skip would reproduce this
// factory's signature defect — absence indistinguishable from success — inside
// the control written to catch exactly that.
const attPath = join(root, "persona-attestation.json");
const skillDirs = walk(root)
  .filter(p => basename(p) === "SKILL.md")
  .map(p => basename(p.replace(/\/SKILL\.md$/, "")));

checks++;
if (!skillDirs.length) {
  OK("persona gold record: pack ships no skills");
} else if (!existsSync(attPath)) {
  FAIL(`persona-attestation.json missing — ${skillDirs.length} skill(s) ship with no ` +
       `proof their persona was ever certified. Generate it with persona-attest-export.sql.`);
} else {
  let att;
  try { att = JSON.parse(readFileSync(attPath, "utf8")); OK("persona-attestation.json parses"); }
  catch (e) { FAIL(`persona-attestation.json invalid JSON: ${e.message}`); }
  if (att) {
    const bySkill = new Map((att.personas ?? []).map(x => [x.skill, x]));
    if (!att.generated_at || !att.tenant) FAIL("persona-attestation.json has no generated_at/tenant provenance");
    for (const dir of skillDirs) {
      checks++;
      const rec = bySkill.get(dir);
      if (!rec) {
        FAIL(`${dir}: not in persona-attestation.json — ships with no gold record at all`);
        continue;
      }
      const why = [];
      if (rec.review_status !== "published") why.push(`review_status='${rec.review_status}'`);
      if (!rec.identity_signature)           why.push("no identity_signature");
      if (!(rec.character_bible > 0))        why.push("no character bible");
      if (!(rec.dimensions > 0))             why.push("zero character dimensions");
      if (!(rec.builds > 0))                 why.push("no persona_build row — the release gate never ran");
      if (why.length) FAIL(`${dir}: persona '${rec.agent_name}' is not shippable — ${why.join("; ")}`);
      else OK(`${dir}: persona '${rec.agent_name}' certified (v${rec.version}, ${rec.builds} build(s))`);
    }
    // A persona attested but no longer shipped is drift in the other direction.
    for (const rec of att.personas ?? [])
      if (!skillDirs.includes(rec.skill))
        WARN(`persona-attestation.json lists '${rec.skill}' but the pack ships no such skill`);
  }
}


// 5. RETIRED PERSONA NAME DETECTOR (task #777). A persona rename — Pixel ->
// Andy (decision #538), Rimmer -> Smith (decision #416) — must be caught by a
// gate, not by the operator reading a diff by hand. scripts/retired-persona-
// allowlist.json lists {name, replaced_by, decision, reason} for every retired
// persona name relevant to THIS pack.
//
// Scope, deliberately narrow: only files a host actually LOADS as instruction
// or routing metadata — SKILL.md, and anything under adapters/ or contracts/.
// A CHANGELOG, an audit record, or a reference README is supposed to name a
// retired persona; that is how history gets written down, and scanning those
// genres for it is the same false-positive shape check 3's own EXEMPT comment
// already documents three times over. The risk this check exists for is a
// retired name surviving in something a host still reads as live routing.
//
// Matching is CASE-SENSITIVE on the capitalized form (e.g. "Pixel", not
// "pixel"). "Pixel" collides with the ordinary English noun for a picture
// element, which this pack's own photography domain uses constantly ("measure
// a single pixel", "pixel-forensics", "pixel statistics") — a case-insensitive
// match fails on every one of those. The persona name is always written
// capitalized as a proper noun; the common noun is not.
//
// Exemption is WHOLE-PARAGRAPH here, unlike check 3's line-by-line rule for
// retired mechanisms. A retired persona is explained in continuous prose
// ("the precedent is X: his lane became Y... because his skill was removed"),
// not a one-line "call this dead tool" instruction sitting next to an
// unrelated historical aside — so paragraph-level judgment fits this domain
// without reopening the false-negative gap check 3 was built against.
const PERSONA_SCAN_SCOPE = (rel) => /SKILL\.md$/.test(rel) || /\/(adapters|contracts)\//.test(rel);
const PERSONA_EXEMPT = new RegExp(EXEMPT.source + "|replac|successor|former |is gone|renamed|rename\\b|moved to|four.step|became|\\bremoved\\b", "i");
{
  const raPath = join(root, "scripts", "retired-persona-allowlist.json");
  checks++;
  if (!existsSync(raPath)) {
    WARN("no scripts/retired-persona-allowlist.json — retired-persona-name detector has nothing to check against (task #777)");
  } else {
    let ra;
    try { ra = JSON.parse(readFileSync(raPath, "utf8")); OK("retired-persona-allowlist.json parses"); }
    catch (e) { FAIL(`retired-persona-allowlist.json invalid JSON: ${e.message}`); }
    const retired = (ra?.retired ?? []).filter(r => {
      if (!r.name || !r.replaced_by || !r.reason) {
        FAIL(`retired-persona-allowlist.json entry missing name/replaced_by/reason: ${JSON.stringify(r)}`);
        return false;
      }
      return true;
    });
    if (ra && !retired.length) OK("retired-persona-allowlist.json declares no retired names for this pack");
    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    // case-INsensitive, whole-token match against a directory's hyphen/underscore
    // segments — a narrow, deliberate context, not free prose, so the common-word
    // collision risk that rules out case-insensitivity below does not apply here.
    const dirHasSegment = (dir, name) =>
      dir.split(/[-_]/).some(seg => seg.toLowerCase() === name.toLowerCase());
    // case-SENSITIVE on the capitalized proper-noun form for prose scanning.
    const proseRe = (n) => new RegExp(`\\b${escape(cap(n))}\\b`);

    // a) a skill's own identity must never BE a retired name — no context
    //    exempts a skill from naming itself after a persona that no longer exists.
    for (const dir of skillDirs) {
      checks++;
      for (const r of retired)
        if (dirHasSegment(dir, r.name))
          FAIL(`${dir}: skill directory IS a retired persona name ('${r.name}', replaced by '${r.replaced_by}' — ${r.decision})`);
    }

    // b) SKILL.md / adapters / contracts, whole paragraph at a time.
    if (retired.length) {
      for (const f of walk(root).filter(p => p.endsWith(".md"))) {
        const rel = f.replace(root, ".");
        if (!PERSONA_SCAN_SCOPE(rel)) continue;
        const txt = readFileSync(f, "utf8");
        checks++;
        let para = [], startLine = 1;
        const flush = () => {
          if (!para.length) return;
          const block = para.join("\n");
          if (!PERSONA_EXEMPT.test(block)) {
            for (const r of retired)
              if (proseRe(r.name).test(block))
                FAIL(`${rel}:${startLine}: names retired persona '${r.name}' as a live reference — replaced by '${r.replaced_by}' (${r.decision})`);
          }
          para = [];
        };
        txt.split("\n").forEach((line, i) => {
          if (line.trim() === "") { flush(); startLine = i + 2; return; }
          if (!para.length) startLine = i + 1;
          para.push(line);
        });
        flush();
      }
    }
  }
}

console.log(`\n${fails ? "RESULT: FAIL" : "RESULT: PASS"} — ${checks} units checked, ${fails} fail, ${warns} warn\n`);
process.exit(fails ? 1 : 0);
