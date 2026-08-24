import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = join(repoRoot, "skills");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || args.has("--check");
const force = args.has("--force");
const json = args.has("--json");
const targetRoot = resolve(valueArg("--target") || process.env.CODEX_SKILLS_DIR || join(process.env.CODEX_HOME || join(homedir(), ".codex"), "skills"));
const pluginCacheRoot = resolve(valueArg("--plugin-cache") || join(process.env.CODEX_HOME || join(homedir(), ".codex"), "plugins", "cache"));

const results = bundledSkills().map(syncSkill);

if (json) {
  console.log(JSON.stringify({ dryRun, force, targetRoot, results }, null, 2));
} else {
  for (const result of results) {
    console.log(`${result.action}: ${result.name} ${result.sourceVersion || "unknown"} -> ${result.targetVersion || "missing"} (${result.reason})`);
  }
}

if (args.has("--check") && results.some((result) => result.action === "install" || result.action === "update")) {
  process.exitCode = 1;
}

function syncSkill(skill) {
  const targetDir = join(targetRoot, skill.name);
  const targetFile = join(targetDir, "SKILL.md");
  const target = existsSync(targetFile) ? readSkill(targetDir) : null;
  const installed = target || findInstalledPluginSkill(skill.name);
  const comparison = target ? compareVersions(skill.version, target.version) : 1;

  if (!target && installed && compareVersions(skill.version, installed.version) < 1) {
    return writeResult("skip", skill, installed, targetDir, "installed plugin-cache version is current or newer");
  }
  if (!target) return writeResult("install", skill, null, targetDir, "not installed");
  if (!force && comparison < 1) return writeResult("skip", skill, target, targetDir, "installed version is current or newer");
  if (!force && comparison === 0) return writeResult("skip", skill, target, targetDir, "installed version matches bundled version");
  return writeResult(comparison > 0 ? "update" : "update", skill, target, targetDir, force ? "forced" : "installed version is older");
}

function writeResult(action, skill, target, targetDir, reason) {
  const result = {
    action,
    name: skill.name,
    sourceDir: skill.dir,
    targetDir,
    sourceVersion: skill.version,
    targetVersion: target?.version || null,
    reason,
  };
  if (!dryRun && (action === "install" || action === "update")) {
    mkdirSync(targetRoot, { recursive: true });
    rmSync(targetDir, { recursive: true, force: true });
    cpSync(skill.dir, targetDir, { recursive: true });
  }
  return result;
}

function bundledSkills() {
  const dirs = [];
  if (existsSync(skillsRoot)) {
    dirs.push(
      ...readdirSync(skillsRoot)
        .map((name) => join(skillsRoot, name))
        .filter((path) => statSync(path).isDirectory() && existsSync(join(path, "SKILL.md")))
    );
  }
  if (!dirs.length) {
    dirs.push(...agentPackSkillDirs());
  }
  if (!dirs.length) {
    dirs.push(...nestedAgentSkillDirs());
  }
  return uniqueSkillDirs(dirs).map(readSkill).sort((a, b) => a.name.localeCompare(b.name));
}

function agentPackSkillDirs() {
  const manifestPath = join(repoRoot, "agent-pack.json");
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const entries = Array.isArray(manifest.agents) ? manifest.agents : Array.isArray(manifest.skills) ? manifest.skills : [];
  return entries
    .map((entry) => entry.canonical_skill)
    .filter(Boolean)
    .map((skillPath) => join(repoRoot, skillPath, ".."))
    .filter((dir) => existsSync(join(dir, "SKILL.md")));
}

function uniqueSkillDirs(dirs) {
  return [...new Set(dirs.map((dir) => resolve(dir)))];
}

function nestedAgentSkillDirs() {
  return readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules")
    .flatMap((entry) => {
      const skillsDir = join(repoRoot, entry.name, "skills");
      if (!existsSync(skillsDir)) return [];
      return readdirSync(skillsDir)
        .map((name) => join(skillsDir, name))
        .filter((dir) => existsSync(join(dir, "SKILL.md")));
    });
}

function findInstalledPluginSkill(name) {
  const matches = [];
  collectPluginSkillMatches(pluginCacheRoot, name, matches);
  return matches.sort((a, b) => compareVersions(b.version, a.version))[0] || null;
}

function collectPluginSkillMatches(root, name, matches, depth = 0) {
  if (depth > 8 || !existsSync(root)) return;
  let entries = [];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  if (existsSync(join(root, "SKILL.md"))) {
    const skill = readSkill(root);
    if (skill.name === name || basename(root) === name) matches.push(skill);
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) collectPluginSkillMatches(join(root, entry.name), name, matches, depth + 1);
  }
}

function readSkill(dir) {
  const skillPath = join(dir, "SKILL.md");
  const text = readFileSync(skillPath, "utf8");
  const frontmatter = parseFrontmatter(text, skillPath);
  const version = parseVersion(text);
  return {
    dir,
    name: frontmatter.name || basename(dir),
    description: frontmatter.description || "",
    version,
  };
}

function parseFrontmatter(text, file) {
  if (!text.startsWith("---\n")) throw new Error(`${file} is missing YAML frontmatter`);
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) throw new Error(`${file} is missing closing YAML frontmatter`);
  return Object.fromEntries(
    text
      .slice(4, end)
      .split(/\r?\n/)
      .map((line) => {
        const index = line.indexOf(":");
        if (index < 0) return ["", ""];
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
      .filter(([key]) => key)
  );
}

function parseVersion(text) {
  const match = text.match(/<!--\s*version:\s*([0-9]+(?:\.[0-9]+){0,2})\b/i);
  return match ? match[1] : "0.0.0";
}

function compareVersions(a, b) {
  const left = String(a || "0.0.0").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = String(b || "0.0.0").split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function valueArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}
