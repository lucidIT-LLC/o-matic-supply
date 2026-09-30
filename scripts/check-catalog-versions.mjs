#!/usr/bin/env node
// check-catalog-versions.mjs -- the marketplace catalog states each plugin's
// real version. Claude Code installs by plugin.json and ignores a different
// entry version ("At install time, plugin.json wins"; code.claude.com
// marketplace reference), so a stale entry only misleads: this catalog read
// wordpress 1.3.7 and microsoft-365 0.2.0 while 1.3.9 and 0.2.2 shipped
// (measured 2026-09-30). CI runs this because `claude plugin validate`, which
// warns about it, is not available on the runner.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] || ".";
const cat = JSON.parse(readFileSync(join(root, ".claude-plugin", "marketplace.json"), "utf8"));
let bad = 0;
for (const e of cat.plugins) {
  if (typeof e.source !== "string") continue;
  const pj = JSON.parse(readFileSync(join(root, e.source, ".claude-plugin", "plugin.json"), "utf8"));
  if (e.version !== undefined && e.version !== pj.version) {
    console.log(`  FAIL  ${e.name}: catalog says ${e.version}, plugin.json says ${pj.version}`);
    bad++;
  } else {
    console.log(`  ok    ${e.name} ${pj.version}`);
  }
}
console.log(bad ? `FAIL: ${bad} catalog version(s) stale` : "PASS: catalog versions match plugin.json");
process.exit(bad ? 1 : 0);
