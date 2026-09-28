// check-dist-fresh.mjs -- the shipped bundles must be a fresh build of the source
// (task #1013, RC-2).
//
// The host runs dist/index.mjs and dist/elementor.mjs, not server/*.mjs. Until
// 1.3.7, dist/ was gitignored, so a release never carried the bundle. The
// marketplace clone kept an old ignored dist/ from an earlier local build, the
// host copied that clone into its cache, and 1.3.5 shipped new source with a
// bundle that did not contain it. Nothing failed: the stale bundle started and
// served tools.
//
// This rebuilds both bundles into a temp dir with the same esbuild options as
// `npm run build` and fails when either committed bundle differs byte for byte.
// Fix a failure with `npm run build`, then commit dist/.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const esbuild = join(root, "node_modules", ".bin", "esbuild");
if (!existsSync(esbuild)) {
  console.error("check-dist-fresh: esbuild is not installed; run `npm ci` first. Refusing to report fresh without a build.");
  process.exit(2);
}

const bundles = [
  ["server/index.mjs", "dist/index.mjs"],
  ["server/elementor.mjs", "dist/elementor.mjs"],
];
const out = mkdtempSync(join(tmpdir(), "omatic-wpf-dist-"));
let failures = 0;
try {
  for (const [entry, shipped] of bundles) {
    const fresh = join(out, shipped);
    // Must match the "build" script in package.json exactly.
    const result = spawnSync(
      esbuild,
      [entry, "--bundle", "--minify", "--platform=node", "--format=esm", `--outfile=${fresh}`, "--log-level=error"],
      { cwd: root, encoding: "utf8" }
    );
    if (result.status !== 0) {
      console.error(`FAIL  ${entry}: esbuild exited ${result.status}: ${result.stderr}`);
      failures += 1;
      continue;
    }
    const shippedPath = join(root, shipped);
    if (!existsSync(shippedPath)) {
      console.error(`FAIL  ${shipped} is missing; run npm run build and commit dist/.`);
      failures += 1;
    } else if (!readFileSync(shippedPath).equals(readFileSync(fresh))) {
      console.error(`FAIL  ${shipped} is not a fresh build of ${entry}; run npm run build and commit dist/.`);
      failures += 1;
    } else {
      console.log(`ok    ${shipped} matches a fresh build of ${entry}`);
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures) process.exit(1);
console.log("dist fresh");
