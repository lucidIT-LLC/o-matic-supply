// Credential custody tests (task #1013, finding F15).
// The factory file must hold a REFERENCE to the Application Password, never the
// value: an env var name, or a macOS Keychain item. Nothing here touches the real
// Keychain: the connector runs through scripts/fixtures/mock-keychain-connector.mjs.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createMacKeychain } from "../server/lib/mcp-connector.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const harness = join(repoRoot, "scripts", "fixtures", "mock-keychain-connector.mjs");
const SECRET_ENV = "Zq7T envsecret 9Kx1 abcd efgh ijkl";
const SECRET_RAW = "Rw4P rawsecret 2Lm8 abcd efgh ijkl";
const SECRET_LEGACY_A = "La1A legacysecret AAAA bbbb cccc dddd";
const SECRET_LEGACY_B = "Lb2B legacysecret BBBB cccc dddd eeee";
let passed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

// ---- 1. the Keychain adapter itself, with a mocked execFile ----------------
{
  const calls = [];
  const keychain = createMacKeychain({
    platform: "darwin",
    execFile: (file, args, options) => {
      calls.push({ file, args, options });
      if (args[0] === "find-generic-password") return "value-read\n";
      return "";
    },
  });
  keychain.set({ service: "svc", account: "acct" }, "a value; $(rm -rf /) `x`");
  assert(calls[0].file === "/usr/bin/security", "security(1) must be called by absolute path");
  assert(
    JSON.stringify(calls[0].args) ===
      JSON.stringify(["add-generic-password", "-U", "-s", "svc", "-a", "acct", "-w", "a value; $(rm -rf /) `x`"]),
    "add-generic-password must pass the value as one argv element"
  );
  assert(!calls[0].options?.shell, "execFile must not run through a shell");
  assert(keychain.get({ service: "svc", account: "acct" }) === "value-read", "get must strip exactly one trailing newline");
  assert(
    JSON.stringify(calls[1].args) === JSON.stringify(["find-generic-password", "-s", "svc", "-a", "acct", "-w"]),
    "find-generic-password argv shape"
  );

  const leaky = createMacKeychain({
    platform: "darwin",
    execFile: (file, args) => {
      const error = new Error(`Command failed: ${file} ${args.join(" ")}`);
      error.status = 44;
      error.stderr = args.join(" ");
      throw error;
    },
  });
  let caught;
  try {
    leaky.set({ service: "svc", account: "acct" }, SECRET_RAW);
  } catch (error) {
    caught = error;
  }
  assert(caught && !JSON.stringify({ m: caught.message, s: caught.stack, e: { ...caught } }).includes(SECRET_RAW), "a failed security(1) call must not carry the value in its error");
  assert(caught.keychainStatus === 44, "the exit status must survive sanitizing");

  let linuxError;
  try {
    createMacKeychain({ platform: "linux", execFile: () => "" }).get({ service: "s", account: "a" });
  } catch (error) {
    linuxError = error;
  }
  assert(linuxError && /not available/.test(linuxError.message), "non-macOS hosts must refuse Keychain access");
  passed += 1;
}

// ---- helpers for the connector subprocess ----------------------------------
function makeProject() {
  const root = mkdtempSync(join(tmpdir(), "omatic-wpf-cred-"));
  mkdirSync(join(root, ".omatic"), { recursive: true });
  return { root, factory: join(root, ".omatic", "wordpress-factory.json"), keychainFile: join(root, "mock-keychain.json") };
}

async function runConnector(project, calls, { platform = "darwin", extraEnv = {} } = {}) {
  const child = spawn(process.execPath, [harness], {
    cwd: repoRoot,
    env: {
      PATH: process.env.PATH,
      HOME: project.root,
      OMATIC_PROJECT_ROOT: project.root,
      MOCK_KEYCHAIN_FILE: project.keychainFile,
      MOCK_KEYCHAIN_PLATFORM: platform,
      ...extraEnv,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const results = [];
  let id = 0;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "initialize", params: { protocolVersion: "2025-06-18" } })}\n`);
  for (const [name, args] of calls) {
    const callId = ++id;
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: callId, method: "tools/call", params: { name, arguments: args } })}\n`);
    results.push(await waitFor(() => parseLines(stdout).find((line) => line.id === callId), () => stderr));
  }
  child.kill();
  return { results, stdout, stderr };
}

function parseLines(text) {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

async function waitFor(fn, stderr) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const found = fn();
    if (found) return found;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`timed out; stderr: ${stderr()}`);
}

function text(result) {
  return result.result?.content?.[0]?.text || JSON.stringify(result.error || {});
}

function payload(result) {
  return JSON.parse(text(result));
}

function hasPasswordKey(file) {
  return Object.values(JSON.parse(readFileSync(file, "utf8")).profiles || {}).some((p) => "applicationPassword" in p);
}

// ---- 2. configure with application_password_env writes no secret -----------
{
  const project = makeProject();
  try {
    // Configure alone, then read the file before any later load can tidy it.
    const run = await runConnector(
      project,
      [
        [
          "wordpress_factory_configure",
          { site_url: "https://example.com", username: "admin", application_password_env: "CLIENT_APP_PASSWORD", verify: false, verify_mcp: false },
        ],
      ],
      { extraEnv: { CLIENT_APP_PASSWORD: SECRET_ENV } }
    );
    const configured = payload(run.results[0]);
    assert(configured.ok === true, `configure(env) failed: ${text(run.results[0])}`);
    const fileText = readFileSync(project.factory, "utf8");
    assert(!fileText.includes(SECRET_ENV), "configure(env) wrote the secret value to the factory file");
    assert(!hasPasswordKey(project.factory), "configure(env) wrote an applicationPassword key");
    const stored = JSON.parse(fileText).profiles.default;
    assert(stored.credential?.source === "env" && stored.credential.env === "CLIENT_APP_PASSWORD", "configure(env) must store the env var name");
    assert(!existsSync(project.keychainFile) || !readFileSync(project.keychainFile, "utf8").includes("add-generic-password"), "configure(env) must not write the Keychain");
    const statusRun = await runConnector(project, [["wordpress_factory_status", {}]], { extraEnv: { CLIENT_APP_PASSWORD: SECRET_ENV } });
    const status = payload(statusRun.results[0]);
    assert(status.ready === true, `status(env) must be ready: ${text(statusRun.results[0])}`);
    assert(status.connection.credential.storedIn === "environment" && status.connection.credential.env === "CLIENT_APP_PASSWORD", "status must show the env var name");
    for (const r of [run, statusRun]) {
      assert(!r.stdout.includes(SECRET_ENV) && !r.stderr.includes(SECRET_ENV), "the env secret appeared in connector output");
    }
    passed += 1;
  } finally {
    rmSync(project.root, { recursive: true, force: true });
  }
}

// ---- 3. configure with a raw password writes a Keychain reference ----------
{
  const project = makeProject();
  try {
    const run = await runConnector(project, [
      ["wordpress_factory_configure", { site_url: "https://example.com", username: "admin", application_password: SECRET_RAW, verify: false, verify_mcp: false }],
    ]);
    const configured = payload(run.results[0]);
    assert(configured.ok === true, `configure(raw) failed: ${text(run.results[0])}`);
    assert(configured.passwordSource === "keychain" && configured.secretWrittenToFile === false, "configure(raw) must report Keychain custody");
    const fileText = readFileSync(project.factory, "utf8");
    assert(!fileText.includes(SECRET_RAW), "configure(raw) wrote the secret value to the factory file");
    assert(!hasPasswordKey(project.factory), "configure(raw) wrote an applicationPassword key");
    const ref = JSON.parse(fileText).profiles.default.credential;
    assert(ref.source === "keychain" && ref.service === "o-matic.wordpress-connector" && ref.account === "default/admin@example.com", "configure(raw) must store the Keychain reference");
    const mock = JSON.parse(readFileSync(project.keychainFile, "utf8"));
    assert(mock.items["o-matic.wordpress-connector|default/admin@example.com"] === SECRET_RAW, "the value must be in the Keychain");
    const add = mock.calls.find((c) => c.args[0] === "add-generic-password");
    assert(add && add.file === "/usr/bin/security" && add.shell === null, "add-generic-password must go through execFile without a shell");
    assert(JSON.stringify(add.args.slice(0, 2)) === '["add-generic-password","-U"]', "add-generic-password must update in place (-U)");
    const listRun = await runConnector(project, [["wordpress_factory_list_profiles", {}]]);
    const listed = payload(listRun.results[0]);
    assert(listed.profiles.default.credential.storedIn === "macos_keychain", "list_profiles must show the Keychain item");
    for (const r of [run, listRun]) {
      assert(!r.stdout.includes(SECRET_RAW) && !r.stderr.includes(SECRET_RAW), "the raw secret appeared in connector output");
    }
    passed += 1;
  } finally {
    rmSync(project.root, { recursive: true, force: true });
  }
}

// ---- 4. a legacy plaintext file migrates on load, silently -----------------
{
  const project = makeProject();
  try {
    writeFileSync(
      project.factory,
      JSON.stringify({
        version: 1,
        connector: "wordpress",
        profiles: {
          default: { siteUrl: "https://a.example", username: "admin", applicationPassword: SECRET_LEGACY_A, mcpPath: "/wp-json/mcp/x" },
          clientb: { siteUrl: "https://b.example", username: "editor", applicationPassword: SECRET_LEGACY_B, mcpPath: "/wp-json/mcp/x" },
        },
      }),
      { mode: 0o600 }
    );
    const run = await runConnector(project, [
      ["wordpress_factory_status", { profile: "clientb" }],
      ["wordpress_factory_list_profiles", {}],
    ]);
    const status = payload(run.results[0]);
    assert(status.ready === true, `migrated profile must resolve: ${text(run.results[0])}`);
    assert(
      JSON.stringify(status.credentialMigration?.migratedToKeychain?.sort()) === JSON.stringify(["clientb", "default"]),
      `status must report both profiles migrated: ${text(run.results[0])}`
    );
    const fileText = readFileSync(project.factory, "utf8");
    assert(!hasPasswordKey(project.factory), "legacy file still has an applicationPassword key after load");
    assert(!fileText.includes(SECRET_LEGACY_A) && !fileText.includes(SECRET_LEGACY_B), "legacy secret still in the factory file");
    const leftovers = readdirSync(join(project.root, ".omatic")).filter((f) => f.endsWith(".tmp"));
    assert(leftovers.length === 0, "atomic rewrite left a temp file behind");
    const mock = JSON.parse(readFileSync(project.keychainFile, "utf8"));
    assert(mock.items["o-matic.wordpress-connector|default/admin@a.example"] === SECRET_LEGACY_A, "legacy A not in Keychain");
    assert(mock.items["o-matic.wordpress-connector|clientb/editor@b.example"] === SECRET_LEGACY_B, "legacy B not in Keychain");
    for (const secret of [SECRET_LEGACY_A, SECRET_LEGACY_B]) {
      assert(!run.stdout.includes(secret) && !run.stderr.includes(secret), "a legacy secret appeared in connector output");
    }
    passed += 1;
  } finally {
    rmSync(project.root, { recursive: true, force: true });
  }
}

// ---- 5. a missing Keychain item gives a clear error ------------------------
{
  const project = makeProject();
  try {
    writeFileSync(
      project.factory,
      JSON.stringify({
        version: 1,
        profiles: {
          default: {
            siteUrl: "https://example.com",
            username: "admin",
            credential: { source: "keychain", service: "o-matic.wordpress-connector", account: "default/admin@example.com" },
          },
        },
      })
    );
    const run = await runConnector(project, [["wordpress_factory_status", {}]]);
    const status = payload(run.results[0]);
    assert(status.ready === false, "a profile whose Keychain item is gone must not be ready");
    assert(
      /Keychain item not found: service "o-matic\.wordpress-connector", account "default\/admin@example\.com"/.test(status.credentialError || ""),
      `missing Keychain item error must name the item: ${text(run.results[0])}`
    );
    passed += 1;
  } finally {
    rmSync(project.root, { recursive: true, force: true });
  }
}

// ---- 6. non-macOS: env only, and the error says so --------------------------
{
  const project = makeProject();
  try {
    const run = await runConnector(
      project,
      [
        ["wordpress_factory_configure", { site_url: "https://example.com", username: "admin", application_password: SECRET_RAW, verify: false, verify_mcp: false }],
        ["wordpress_factory_configure", { site_url: "https://example.com", username: "admin", application_password_env: "UNSET_VAR", verify: false, verify_mcp: false }],
      ],
      { platform: "linux" }
    );
    assert(run.results[0].result?.isError === true && /environment variable/.test(text(run.results[0])), "non-macOS raw password must be refused with an env hint");
    assert(run.results[1].result?.isError === true && /environment variables are the only credential source/.test(text(run.results[1])), "non-macOS unset env must say env only");
    assert(!existsSync(project.factory), "a refused configure must not write the factory file");
    assert(!run.stdout.includes(SECRET_RAW) && !run.stderr.includes(SECRET_RAW), "refused raw secret appeared in output");
    passed += 1;
  } finally {
    rmSync(project.root, { recursive: true, force: true });
  }
}

console.log(`credential tests ok (${passed}/6)`);
