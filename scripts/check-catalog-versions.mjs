#!/usr/bin/env node
// check-catalog-versions.mjs -- the marketplace catalog states each plugin's
// real version. Claude Code installs by plugin.json and ignores a different
// entry version ("At install time, plugin.json wins"; code.claude.com
// marketplace reference), so a stale entry only misleads: this catalog read
// wordpress 1.3.7 and microsoft-365 0.2.0 while 1.3.9 and 0.2.2 shipped
// (measured 2026-09-30). CI runs this because `claude plugin validate`, which
// warns about it, is not available on the runner.
//
// 2026-10-25: also checks .cursor-plugin/marketplace.json against each
// plugin's .cursor-plugin/plugin.json (and Claude plugin.json) when present.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] || ".";
let bad = 0;

function checkCatalog(rel, hostPluginRel) {
  const catPath = join(root, rel);
  if (!existsSync(catPath)) {
    console.log(`  skip  ${rel} (absent)`);
    return;
  }
  const cat = JSON.parse(readFileSync(catPath, "utf8"));
  console.log(`--- ${rel} ---`);
  for (const e of cat.plugins ?? []) {
    if (typeof e.source !== "string") continue;
    const hostPath = join(root, e.source, hostPluginRel);
    if (!existsSync(hostPath)) {
      console.log(`  FAIL  ${e.name}: ${hostPluginRel} missing under ${e.source}`);
      bad++;
      continue;
    }
    const pj = JSON.parse(readFileSync(hostPath, "utf8"));
    if (e.version !== undefined && e.version !== pj.version) {
      console.log(`  FAIL  ${e.name}: catalog says ${e.version}, ${hostPluginRel} says ${pj.version}`);
      bad++;
    } else {
      console.log(`  ok    ${e.name} ${pj.version}`);
    }
    // Cursor catalog must also stay aligned with Claude plugin.json when both exist.
    if (hostPluginRel.includes(".cursor-plugin")) {
      const claudePath = join(root, e.source, ".claude-plugin", "plugin.json");
      if (existsSync(claudePath)) {
        const cj = JSON.parse(readFileSync(claudePath, "utf8"));
        if (pj.version !== cj.version) {
          console.log(`  FAIL  ${e.name}: .cursor-plugin ${pj.version} != .claude-plugin ${cj.version}`);
          bad++;
        }
      }
    }
  }
}

checkCatalog(join(".claude-plugin", "marketplace.json"), join(".claude-plugin", "plugin.json"));
checkCatalog(join(".cursor-plugin", "marketplace.json"), join(".cursor-plugin", "plugin.json"));
console.log(bad ? `FAIL: ${bad} catalog version(s) stale` : "PASS: catalog versions match plugin.json");
process.exit(bad ? 1 : 0);
