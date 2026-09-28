// Test harness only: the real connector, with security(1) replaced by a mock
// execFile that keeps items in a JSON file. The production entry points
// (server/index.mjs, server/elementor.mjs) have no way to swap the Keychain.
import { readFileSync, writeFileSync } from "node:fs";
import { createConnectorServer, createMacKeychain } from "../../server/lib/mcp-connector.mjs";

const store = process.env.MOCK_KEYCHAIN_FILE;
const load = () => {
  try {
    return JSON.parse(readFileSync(store, "utf8"));
  } catch {
    return { items: {}, calls: [] };
  }
};
const save = (data) => writeFileSync(store, JSON.stringify(data));

function mockExecFile(file, args, options) {
  const data = load();
  // Record the call shape, never the value: the -w argument is masked.
  const masked = args.map((arg, i) => (args[0] === "add-generic-password" && args[i - 1] === "-w" ? "<value>" : arg));
  data.calls.push({ file, args: masked, shell: options?.shell ?? null });
  const flag = (name) => args[args.indexOf(name) + 1];
  const key = `${flag("-s")}|${flag("-a")}`;
  if (args[0] === "add-generic-password") {
    data.items[key] = flag("-w");
    save(data);
    return "";
  }
  if (args[0] === "find-generic-password") {
    save(data);
    if (!(key in data.items)) {
      const error = new Error(`Command failed: ${file} ${args.join(" ")}`);
      error.status = 44;
      throw error;
    }
    return `${data.items[key]}\n`;
  }
  throw new Error(`unexpected security subcommand ${args[0]}`);
}

createConnectorServer({
  connectorName: "wordpress",
  serverName: "o-matic-wordpress-connector",
  displayName: "WordPress Factory Connector",
  upstreamLabel: "WordPress MCP",
  version: "test",
  toolBase: "wordpress_factory",
  forwardPrefix: "wp__",
  factoryFileName: "wordpress-factory.json",
  defaultMcpPath: "/wp-json/mcp/mcp-adapter-default-server",
  verifyMcpOnConfigure: true,
  keychain: createMacKeychain({ execFile: mockExecFile, platform: process.env.MOCK_KEYCHAIN_PLATFORM || "darwin" }),
  instructions: "test harness",
  env: {
    configPath: "OMATIC_WORDPRESS_FACTORY_CONFIG",
    profile: "OMATIC_WORDPRESS_FACTORY_PROFILE",
    siteUrl: "OMATIC_TEST_WP_URL",
    username: "OMATIC_TEST_WP_USERNAME",
    appPassword: "OMATIC_TEST_WP_APP_PASSWORD",
  },
});
