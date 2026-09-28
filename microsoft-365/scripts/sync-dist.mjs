#!/usr/bin/env node
// sync-dist.mjs -- this plugin ships a BUILD of team-assistant-mcp, never a
// copy of its source (task #1013).
//
// Until 0.2.0 this directory carried its own src/ and test/: a fork of
// team-assistant-mcp that had drifted from it in both directions (OneNote and
// Goals only here, every Smith #1013 fix only there). Two codebases for one
// product is the copy-instead-of-import defect at repo scale. The source now
// lives in exactly one place, and this plugin carries dist/index.mjs built from
// a commit named in SOURCE.json.
//
//   node scripts/sync-dist.mjs [--commit <sha>] [--source <dir>]
//       Build the pack edition (`npm run build:pack`) of <sha> (default: the
//       source checkout's HEAD, which must be on origin/main), write
//       dist/index.mjs, and record the commit and sha256 in SOURCE.json.
//
//   node scripts/sync-dist.mjs --check [--source <dir>]
//       1. dist/index.mjs must hash to SOURCE.json's sha256 (needs no source).
//       2. A fresh build of SOURCE.json's commit must equal dist/index.mjs
//          byte for byte.
//       Exits 1 on any mismatch. Exits 2 when it cannot build (no source
//       checkout, no node_modules, lockfile drift): it refuses to report
//       "fresh" without having built.
//
// The source checkout defaults to the sibling layout used on the maintainer's
// machine: <this repo>/../omatic-m365-mcp. The build runs from `git archive`
// of the named commit, never from the working tree, so uncommitted edits
// cannot leak into a release. It borrows the checkout's node_modules and
// refuses if that checkout's package-lock.json differs from the commit's,
// because a different toolchain could produce different bytes.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const plugin = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const check = args.includes("--check");
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const source = resolve(argValue("--source") ?? join(plugin, "..", "..", "omatic-m365-mcp"));
const manifestPath = join(plugin, "SOURCE.json");
const distPath = join(plugin, "dist", "index.mjs");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const git = (...a) => {
  const r = spawnSync("git", ["-C", source, ...a], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
};
const cannot = (why) => {
  console.error(`sync-dist: cannot build: ${why}`);
  process.exit(2);
};

let failures = 0;
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };
const ok = (m) => console.log(`  ok    ${m}`);

const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;

// Step 1 -- needs nothing but this repo, so it can run anywhere.
if (check) {
  if (!manifest) fail("SOURCE.json is missing");
  else if (!existsSync(distPath)) fail("dist/index.mjs is missing");
  else {
    const actual = sha256(readFileSync(distPath));
    if (actual === manifest.sha256) ok(`dist/index.mjs matches SOURCE.json sha256 ${actual.slice(0, 12)}`);
    else fail(`dist/index.mjs sha256 ${actual} != SOURCE.json ${manifest.sha256}`);
  }
  if (failures) process.exit(1);
}

// Step 2 -- build the named commit.
if (!existsSync(join(source, ".git"))) cannot(`no git checkout of team-assistant-mcp at ${source} (pass --source)`);
const commit = git("rev-parse", "--verify", `${check ? manifest.commit : argValue("--commit") ?? "HEAD"}^{commit}`);
if (!commit) cannot(`commit ${check ? manifest.commit : argValue("--commit") ?? "HEAD"} is not in ${source}`);
if (!check) {
  git("fetch", "-q", "origin");
  if (git("merge-base", "--is-ancestor", commit, "origin/main") === null) {
    cannot(`${commit} is not on origin/main; push it first so the release names a reachable commit`);
  }
}
const lockAtCommit = git("show", `${commit}:package-lock.json`);
const lockInstalled = existsSync(join(source, "package-lock.json")) ? readFileSync(join(source, "package-lock.json"), "utf8").trim() : null;
if (lockAtCommit === null || lockAtCommit !== lockInstalled) {
  cannot(`${source}/package-lock.json differs from ${commit.slice(0, 12)}'s; check out that commit's lockfile and run npm ci`);
}
if (!existsSync(join(source, "node_modules", ".bin", "esbuild"))) cannot(`esbuild is not installed in ${source}; run npm ci there`);

const work = mkdtempSync(join(tmpdir(), "team-assistant-build-"));
try {
  const archive = spawnSync("sh", ["-c", `git -C "${source}" archive ${commit} | tar -x -C "${work}"`], { encoding: "utf8" });
  if (archive.status !== 0) cannot(`git archive failed: ${archive.stderr}`);
  symlinkSync(join(source, "node_modules"), join(work, "node_modules"), "dir");
  const build = spawnSync("npm", ["run", "--silent", "build:pack"], { cwd: work, encoding: "utf8" });
  if (build.status !== 0) cannot(`npm run build:pack failed at ${commit.slice(0, 12)}: ${build.stderr || build.stdout}`);
  const built = readFileSync(join(work, "dist", "pack", "index.mjs"));
  const builtSha = sha256(built);

  if (check) {
    const shipped = readFileSync(distPath);
    if (Buffer.compare(built, shipped) === 0) ok(`dist/index.mjs is a fresh pack build of ${commit.slice(0, 12)}`);
    else fail(`dist/index.mjs is not the pack build of ${commit.slice(0, 12)} (built ${builtSha.slice(0, 12)}); run node scripts/sync-dist.mjs --commit ${commit}`);
  } else {
    writeFileSync(distPath, built);
    const pkg = JSON.parse(git("show", `${commit}:package.json`));
    const next = {
      $comment: "Written by scripts/sync-dist.mjs. dist/index.mjs is `npm run build:pack` of this commit; --check proves it.",
      repository: "https://github.com/lucidIT-LLC/team-assistant-mcp",
      commit,
      serverVersion: pkg.version,
      build: "npm run build:pack",
      artifact: "dist/pack/index.mjs",
      sha256: builtSha,
    };
    writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
    ok(`dist/index.mjs <- pack build of ${commit.slice(0, 12)} (team-assistant-mcp ${pkg.version}), sha256 ${builtSha.slice(0, 12)}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.exit(failures ? 1 : 0);
