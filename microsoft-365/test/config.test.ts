import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { loadConfig, DEFAULT_DELEGATED_SCOPES } from "../src/config.js";
import { ConfigError } from "../src/errors.js";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CLIENT = "22222222-2222-2222-2222-222222222222";

/** An env with no config file in reach (the loader also probes the cwd). */
function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    OMATIC_M365_CONFIG_FILE: "/nonexistent/omatic-m365-mcp/config.json",
    ...extra,
  };
}

describe("configuration", () => {
  test("names the missing variable and how to set it", () => {
    const error = (() => {
      try {
        loadConfig(env());
        return null;
      } catch (e) {
        return e;
      }
    })();

    assert.ok(error instanceof ConfigError);
    const message = error.toToolMessage();
    assert.match(message, /TEAM_ASSISTANT_TENANT_ID/);
    assert.match(message, /Directory \(tenant\) ID/);
    assert.match(message, /will not guess/);
  });

  test("complains about the client ID once the tenant is set", () => {
    assert.throws(
      () => loadConfig(env({ OMATIC_M365_TENANT_ID: TENANT })),
      (e: unknown) => e instanceof ConfigError && /TEAM_ASSISTANT_CLIENT_ID/.test(e.toToolMessage()),
    );
  });

  test("rejects a client ID that is not a GUID rather than failing later at Entra", () => {
    assert.throws(
      () => loadConfig(env({ OMATIC_M365_TENANT_ID: TENANT, OMATIC_M365_CLIENT_ID: "my-app" })),
      ConfigError,
    );
  });

  test("accepts a GUID tenant, a domain tenant, and the common aliases", () => {
    for (const tenant of [TENANT, "contoso.onmicrosoft.com", "organizations"]) {
      const config = loadConfig(env({ OMATIC_M365_TENANT_ID: tenant, OMATIC_M365_CLIENT_ID: CLIENT }));
      assert.equal(config.tenantId, tenant);
    }
  });

  test("defaults are applied only where inventing one is safe", () => {
    const config = loadConfig(env({ OMATIC_M365_TENANT_ID: TENANT, OMATIC_M365_CLIENT_ID: CLIENT }));
    assert.equal(config.authMode, "device-code");
    assert.equal(config.graphBaseUrl, "https://graph.microsoft.com/v1.0");
    assert.deepEqual(config.scopes, DEFAULT_DELEGATED_SCOPES);
    assert.equal(config.sources["tenantId"], "env");
    assert.equal(config.sources["graphBaseUrl"], "default");
  });

  test("Planner scopes are actually requested — the whole reason this server exists", () => {
    const config = loadConfig(env({ OMATIC_M365_TENANT_ID: TENANT, OMATIC_M365_CLIENT_ID: CLIENT }));
    assert.ok(config.scopes.includes("Tasks.ReadWrite"));
    assert.ok(config.scopes.includes("offline_access"));
  });

  test("an unknown auth mode is rejected", () => {
    assert.throws(
      () =>
        loadConfig(
          env({
            OMATIC_M365_TENANT_ID: TENANT,
            OMATIC_M365_CLIENT_ID: CLIENT,
            OMATIC_M365_AUTH_MODE: "magic",
          }),
        ),
      ConfigError,
    );
  });

  test("scopes can be overridden as a space- or comma-separated list", () => {
    const config = loadConfig(
      env({
        OMATIC_M365_TENANT_ID: TENANT,
        OMATIC_M365_CLIENT_ID: CLIENT,
        OMATIC_M365_SCOPES: "offline_access, Tasks.ReadWrite",
      }),
    );
    assert.deepEqual(config.scopes, ["offline_access", "Tasks.ReadWrite"]);
  });

  test("no tenant, client or plan id is baked into the build", async () => {
    // A hardcoded GUID anywhere in src/ would make this tenant-specific.
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const guid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        return statSync(path).isDirectory() ? walk(path) : path.endsWith(".ts") ? [path] : [];
      });

    const offenders = walk(new URL("../../src", import.meta.url).pathname)
      .filter((file) => guid.test(readFileSync(file, "utf8")));
    assert.deepEqual(offenders, [], "source files must not contain literal GUIDs");
  });
});
