import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const projectRoot = mkdtempSync(join(tmpdir(), "omatic-wpf-smoke-"));
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = join(repoRoot, "server", "index.mjs");

mkdirSync(join(projectRoot, ".omatic"), { recursive: true });
writeFileSync(
  join(projectRoot, ".omatic", "wordpress-factory.json"),
  `${JSON.stringify(
    {
      version: 1,
      connector: "wordpress",
      profiles: {
        default: {
          siteUrl: "https://example.com",
          username: "admin",
          applicationPassword: "example-only",
          mcpPath: "/wp-json/mcp/mcp-adapter-default-server",
          restApiRoot: "https://example.com/wp-json/",
          mcp: {
            ok: true,
            endpoint: "https://example.com/wp-json/mcp/mcp-adapter-default-server",
            toolCount: 1,
            toolNames: ["example_tool"],
            capabilityGroups: [],
            requiredCapabilitiesMissing: [],
            tools: [
              {
                name: "example_tool",
                description: "Example cached tool",
                inputSchema: { type: "object", properties: {} },
              },
            ],
          },
        },
        "client-a": {
          siteUrl: "https://client-a.example",
          username: "admin",
          applicationPassword: "example-only",
          mcpPath: "/wp-json/mcp/mcp-adapter-default-server",
          restApiRoot: "https://client-a.example/wp-json/",
          mcp: {
            ok: true,
            endpoint: "https://client-a.example/wp-json/mcp/mcp-adapter-default-server",
            toolCount: 1,
            toolNames: ["client_tool"],
            capabilityGroups: [],
            requiredCapabilitiesMissing: [],
            tools: [
              {
                name: "client_tool",
                description: "Client cached tool",
                inputSchema: { type: "object", properties: {} },
              },
            ],
          },
        },
      },
    },
    null,
    2
  )}\n`
);

const child = spawn(process.execPath, [serverPath], {
  cwd: repoRoot,
  env: {
    ...process.env,
    OMATIC_PROJECT_ROOT: projectRoot,
    OMATIC_WORDPRESS_FACTORY_PROFILE: "default",
    MCP_PROTOCOL_VERSION: "2025-06-18",
  },
  stdio: ["pipe", "pipe", "pipe"],
});

const lines = [];
let buffer = "";
let stderr = "";

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const index = buffer.indexOf("\n");
    if (index < 0) break;
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line) lines.push(JSON.parse(line));
  }
});
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

try {
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  const init = await waitForId(1);
  assert(init.result?.serverInfo?.name === "o-matic-wordpress-connector", "initialize did not return server info");

  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", method: "notifications/unknown" });
  await delay(100);
  assert(!lines.some((line) => line.id === null), "server responded to an unknown notification");

  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const listed = await waitForId(2);
  const names = listed.result?.tools?.map((tool) => tool.name) || [];
  assert(names.includes("wordpress_factory_configure"), "builtin configure tool missing");
  assert(names.includes("wp__example_tool"), "cached forwarded tool missing");

  send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "wordpress_factory_activate_profile", arguments: { profile: "client-a" } },
  });
  const activated = await waitForId(3);
  assert(!activated.error, `activate_profile failed: ${JSON.stringify(activated.error)}`);

  send({ jsonrpc: "2.0", id: 4, method: "tools/list", params: {} });
  const clientListed = await waitForId(4);
  const clientNames = clientListed.result?.tools?.map((tool) => tool.name) || [];
  assert(clientNames.includes("wp__client_tool"), "activated profile cached tool missing");
  assert(!clientNames.includes("wp__example_tool"), "previous profile cached tool leaked after activation");

  child.kill();
  console.log("mcp smoke ok");
} finally {
  child.kill();
  rmSync(projectRoot, { recursive: true, force: true });
}

function send(payload) {
  child.stdin.write(`${JSON.stringify(payload)}\n`);
}

async function waitForId(id) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const found = lines.find((line) => line.id === id);
    if (found) return found;
    if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}: ${stderr}`);
    await delay(20);
  }
  throw new Error(`timed out waiting for response id ${id}. stderr: ${stderr}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
