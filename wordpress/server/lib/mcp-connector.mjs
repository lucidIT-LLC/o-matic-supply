import { createInterface } from "node:readline";
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const DEFAULT_PROFILE = "default";
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const TOOL_CACHE_MS = 10000;

export function createConnectorServer(options) {
  const config = normalizeOptions(options);
  const requestTimeoutMs = parseTimeoutMs(envValue(config.env.timeoutMs), 15000);
  const upstreamProtocolVersion = envValue("MCP_PROTOCOL_VERSION") || DEFAULT_PROTOCOL_VERSION;
  const builtinTools = createBuiltinTools(config);
  const state = {
    initialized: false,
    sessionId: "",
    upstreamInitializedKey: "",
    toolCache: null,
    profile: envValue(config.env.profile) || DEFAULT_PROFILE,
  };

  if (process.argv.includes("--self-test")) {
    runSelfTest(config, state);
    process.exit(0);
  }

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

  rl.on("line", async (line) => {
    const raw = line.trim();
    if (!raw) return;

    let message;
    try {
      message = JSON.parse(raw);
    } catch (error) {
      writeJson({ jsonrpc: "2.0", id: null, error: { code: -32700, message: `Parse error: ${error.message}` } });
      return;
    }

    try {
      const response = await route(message);
      if (response) writeJson(response);
    } catch (error) {
      if (message.id === undefined) return;
      writeJson({
        jsonrpc: "2.0",
        id: message.id ?? null,
        error: { code: -32603, message: error.message || String(error) },
      });
    }
  });

  async function route(message) {
    if (message.id === undefined && message.method !== "notifications/initialized") return null;
    if (message.method === "initialize") return initialize(message);
    if (message.method === "notifications/initialized") return null;
    if (message.method === "ping") return { jsonrpc: "2.0", id: message.id, result: {} };
    if (message.method === "tools/list") return listTools(message);
    if (message.method === "tools/call") return callTool(message);
    if (message.id === undefined) return null;

    return {
      jsonrpc: "2.0",
      id: message.id ?? null,
      error: { code: -32601, message: `Unsupported method: ${message.method}` },
    };
  }

  function initialize(message) {
    state.initialized = true;
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: protocolVersion(message),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: config.serverName, version: config.version },
        instructions: connectorInstructions(config),
      },
    };
  }

  async function listTools(message) {
    const tools = [...builtinTools];
    const active = loadActiveConfig({ allowMissing: true });
    const meta = {};

    if (active.profile) {
      try {
        const upstreamTools = await getUpstreamTools(active.profile);
        tools.push(...upstreamTools);
      } catch (error) {
        meta.upstream_error = error.message;
        meta.configured_profile = redactProfile(active.profile);
      }
    } else {
      meta.status = "not_configured";
      meta.next = `Call ${config.toolBase}_configure with site_url, username, and application_password_env.`;
    }

    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        tools,
        ...(Object.keys(meta).length ? { _meta: meta } : {}),
      },
    };
  }

  async function callTool(message) {
    const name = message.params?.name || "";
    const args = message.params?.arguments || {};

    if (name === `${config.toolBase}_configure`) return textResult(message.id, await configureProfile(args));
    if (name === `${config.toolBase}_status`) return textResult(message.id, await statusProfile(args));
    if (name === `${config.toolBase}_forget`) return textResult(message.id, forgetProfile(args));
    if (name === `${config.toolBase}_list_profiles`) return textResult(message.id, listProfiles(args));
    if (name === `${config.toolBase}_activate_profile`) return textResult(message.id, activateProfile(args));
    if (name === `${config.toolBase}_refresh_tools`) return textResult(message.id, await refreshTools(args));
    if (name === `${config.toolBase}_usage_guide`) return textResult(message.id, usageGuide(args));

    if (!name.startsWith(config.forwardPrefix)) {
      return {
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32602,
          message: `Unknown tool "${name}". ${config.upstreamLabel} tools use the ${config.forwardPrefix} prefix.`,
        },
      };
    }

    const active = loadActiveConfig({ allowMissing: false });
    await ensureUpstreamInitialized(active.profile);
    return forwardToUpstreamMcp(active.profile, {
      jsonrpc: "2.0",
      id: message.id,
      method: "tools/call",
      params: {
        ...message.params,
        name: name.slice(config.forwardPrefix.length),
      },
    });
  }

  async function configureProfile(args) {
    const profileName = cleanProfileName(args.profile || state.profile);
    const siteUrl = normalizeSiteUrl(requiredString(args.site_url, "site_url"));
    const username = requiredString(args.username, "username");
    const password = resolveApplicationPassword(args);
    const mcpPath = normalizePath(args.mcp_path || config.defaultMcpPath, config.defaultMcpPath);
    const verify = args.verify !== false;
    const verifyMcp = args.verify_mcp ?? config.verifyMcpOnConfigure;
    const configPath = resolveConfigPath(args.factory_root);
    const now = new Date().toISOString();
    const profile = {
      siteUrl,
      username,
      applicationPassword: password.value,
      mcpPath,
      restApiRoot: normalizeOptionalUrl(args.rest_api_root),
      createdAt: now,
      updatedAt: now,
    };

    if (verify) {
      const verification = await verifyWordPressRest(profile);
      profile.restApiRoot = verification.restApiRoot;
      profile.wordpressVersion = verification.wordpressVersion || null;
      profile.lastVerifiedAt = now;
    }
    if (verifyMcp && !profile.restApiRoot) {
      const discovery = await discoverRestApi(profile);
      profile.restApiRoot = discovery.restApiRoot;
      profile.wordpressVersion = extractWordPressVersion(discovery.index);
    }
    if (verifyMcp) {
      const mcpVerification = await verifyMcpSurface(profile);
      if (mcpVerification.requiredCapabilitiesMissing.length) {
        throw new Error(
          `${config.upstreamLabel} is reachable, but required capabilities are missing: ${mcpVerification.requiredCapabilitiesMissing.join(", ")}.`
        );
      }
      profile.mcp = {
        verifiedAt: now,
        ...mcpVerification,
      };
    }

    const file = readFactoryInfo(configPath, { allowMissing: true });
    const existing = file.profiles?.[profileName];
    file.version = 1;
    file.connector = config.connectorName;
    file.profiles = file.profiles || {};
    file.profiles[profileName] = {
      ...profile,
      createdAt: existing?.createdAt || now,
    };
    writeFactoryInfo(configPath, file);
    ensureFactoryInfoGitignore(configPath);
    state.profile = profileName;
    resetUpstreamCache();

    return JSON.stringify(
      {
        ok: true,
        saved: true,
        configPath,
        profile: profileName,
        verify,
        verifyMcp,
        passwordSource: password.source,
        warnings: password.warning ? [password.warning] : [],
        connection: redactProfile(file.profiles[profileName]),
      },
      null,
      2
    );
  }

  async function statusProfile(args) {
    const profileName = cleanProfileName(args.profile || state.profile);
    const configPath = resolveConfigPath(args.factory_root);
    const file = readFactoryInfo(configPath, { allowMissing: true });
    const env = envProfile();
    const profile = env || file.profiles?.[profileName];
    const source = env ? "environment" : "factory_info";
    const ready = Boolean(profile && hasRequiredProfile(profile));
    const payload = {
      ok: Boolean(profile),
      configured: Boolean(profile),
      ready,
      source: profile ? source : null,
      configPath,
      profile: profileName,
      connector: config.connectorName,
      connection: profile ? redactProfile(profile) : null,
    };

    if (profile && args.verify === true) {
      try {
        payload.verify = await verifyWordPressRest(profile);
      } catch (error) {
        payload.verify = { ok: false, error: error.message };
      }
    }
    if (profile && args.verify_mcp === true) {
      try {
        payload.mcp = await verifyMcpSurface(profile);
      } catch (error) {
        payload.mcp = { ok: false, error: error.message };
      } finally {
        resetUpstreamCache();
      }
    }

    return JSON.stringify(payload, null, 2);
  }

  function forgetProfile(args) {
    const profileName = cleanProfileName(args.profile || state.profile);
    const configPath = resolveConfigPath(args.factory_root);
    const file = readFactoryInfo(configPath, { allowMissing: true });
    const existed = Boolean(file.profiles?.[profileName]);
    if (existed) {
      delete file.profiles[profileName];
      writeFactoryInfo(configPath, file);
    }
    resetUpstreamCache();
    return JSON.stringify({ ok: true, removed: existed, configPath, profile: profileName }, null, 2);
  }

  function listProfiles(args) {
    const configPath = resolveConfigPath(args.factory_root);
    const file = readFactoryInfo(configPath, { allowMissing: true });
    const profiles = Object.fromEntries(
      Object.entries(file.profiles || {}).map(([name, profile]) => [name, redactProfile(profile)])
    );
    return JSON.stringify({ ok: true, configPath, connector: config.connectorName, profiles }, null, 2);
  }

  function activateProfile(args) {
    const profileName = cleanProfileName(args.profile);
    const configPath = resolveConfigPath(args.factory_root);
    const env = envProfile();
    if (env) {
      throw new Error(`Environment configuration is active for ${config.displayName}; unset ${config.env.siteUrl} before switching stored profiles.`);
    }
    const file = readFactoryInfo(configPath, { allowMissing: true });
    const profile = file.profiles?.[profileName];
    if (!profile) throw new Error(`${config.displayName} profile "${profileName}" was not found at ${configPath}.`);
    state.profile = profileName;
    resetUpstreamCache();
    return JSON.stringify({ ok: true, activeProfile: state.profile, configPath, connection: redactProfile(profile) }, null, 2);
  }

  async function refreshTools(args) {
    const profileName = cleanProfileName(args.profile || state.profile);
    const configPath = resolveConfigPath(args.factory_root);
    const env = envProfile();
    const file = readFactoryInfo(configPath, { allowMissing: true });
    const profile = env || file.profiles?.[profileName];
    if (!profile) throw new Error(`${config.displayName} profile "${profileName}" was not found at ${configPath}.`);
    const mcp = await verifyMcpSurface(profile);
    if (mcp.requiredCapabilitiesMissing.length) {
      throw new Error(
        `${config.upstreamLabel} is reachable, but required capabilities are missing: ${mcp.requiredCapabilitiesMissing.join(", ")}.`
      );
    }
    if (!env) {
      file.profiles[profileName] = {
        ...profile,
        mcp: {
          verifiedAt: new Date().toISOString(),
          ...mcp,
        },
        updatedAt: new Date().toISOString(),
      };
      writeFactoryInfo(configPath, file);
    }
    state.profile = profileName;
    resetUpstreamCache();
    return JSON.stringify(
      {
        ok: true,
        cached: !env,
        profile: profileName,
        configPath,
        mcp: summarizeStoredMcp(mcp),
      },
      null,
      2
    );
  }

  function usageGuide(args) {
    const includeStoredProfile = args.include_profile !== false;
    const configPath = resolveConfigPath(args.factory_root);
    const file = readFactoryInfo(configPath, { allowMissing: true });
    const profileName = cleanProfileName(args.profile || state.profile);
    const profile = includeStoredProfile ? file.profiles?.[profileName] : null;
    return JSON.stringify(
      {
        connector: config.connectorName,
        serverName: config.serverName,
        upstreamLabel: config.upstreamLabel,
        forwardedToolPrefix: config.forwardPrefix,
        setupTool: `${config.toolBase}_configure`,
        statusTool: `${config.toolBase}_status`,
        usageGuideTool: `${config.toolBase}_usage_guide`,
        listProfilesTool: `${config.toolBase}_list_profiles`,
        activateProfileTool: `${config.toolBase}_activate_profile`,
        refreshToolsTool: `${config.toolBase}_refresh_tools`,
        statusProfile: profile ? redactProfile(profile) : null,
        guidance: config.toolUseGuide,
      },
      null,
      2
    );
  }

  function loadActiveConfig({ allowMissing }) {
    const env = envProfile();
    if (env) return { profile: env, source: "environment" };

    const configPath = resolveConfigPath();
    const file = readFactoryInfo(configPath, { allowMissing: true });
    const profile = file.profiles?.[state.profile] || file.profiles?.[DEFAULT_PROFILE];
    if (!profile && !allowMissing) {
      throw new Error(
        `${config.displayName} is not configured. Call ${config.toolBase}_configure or set ${config.env.siteUrl}, ${config.env.username}, and ${config.env.appPassword}. Looked at ${configPath}.`
      );
    }
    return { profile, source: profile ? "factory_info" : null };
  }

  function envProfile() {
    const siteUrl = firstEnvValue(config.env.siteUrl, ...config.env.siteUrlFallbacks);
    if (!siteUrl) return null;
    return {
      siteUrl: normalizeSiteUrl(siteUrl),
      username: firstEnvValue(config.env.username, ...config.env.usernameFallbacks),
      applicationPassword: firstEnvValue(config.env.appPassword, ...config.env.appPasswordFallbacks),
      mcpPath: normalizePath(envValue(config.env.mcpPath) || config.defaultMcpPath, config.defaultMcpPath),
      restApiRoot: normalizeOptionalUrl(envValue(config.env.restApiRoot)),
      createdAt: null,
      updatedAt: null,
    };
  }

  function resolveApplicationPassword(args) {
    const envName = String(args.application_password_env || "").trim();
    if (envName) {
      const value = envValue(envName);
      if (!value) throw new Error(`application_password_env "${envName}" is not set or is a placeholder.`);
      return { value, source: `env:${envName}` };
    }
    const value = requiredString(args.application_password, "application_password or application_password_env");
    return {
      value,
      source: "direct_tool_argument",
      warning:
        "Direct Application Password entry can be retained in host tool-call logs. Prefer application_password_env for real projects.",
    };
  }

  async function getUpstreamTools(profile) {
    const now = Date.now();
    const key = profileKey(profile);
    const storedTools = storedForwardedTools(profile, config.forwardPrefix);
    if (storedTools.length) {
      state.toolCache = { createdAt: now, key, tools: storedTools, source: "stored_mcp_cache" };
      return storedTools;
    }
    if (state.toolCache && state.toolCache.key === key && now - state.toolCache.createdAt < TOOL_CACHE_MS) return state.toolCache.tools;

    const tools = (await listUpstreamTools(profile, `tools-${now}`)).map((tool) => ({
      ...tool,
      name: `${config.forwardPrefix}${tool.name}`,
      description: `[${config.upstreamLabel}] ${tool.description || tool.name}`,
    }));
    state.toolCache = { createdAt: now, key, tools, source: "live_discovery" };
    return tools;
  }

  async function listUpstreamTools(profile, id = `tools-${Date.now()}`) {
    await ensureUpstreamInitialized(profile);
    const response = await forwardToUpstreamMcp(profile, {
      jsonrpc: "2.0",
      id,
      method: "tools/list",
      params: {},
    });
    if (response.error) throw new Error(response.error.message || JSON.stringify(response.error));
    return response.result?.tools || [];
  }

  async function verifyMcpSurface(profile) {
    resetUpstreamCache();
    const tools = await listUpstreamTools(profile, `verify-tools-${Date.now()}`);
    const summary = summarizeMcpSurface(tools, config.capabilityGroups);
    return {
      ok: true,
      endpoint: buildMcpUrl(profile).toString(),
      tools: sanitizeToolsForStorage(tools),
      ...summary,
    };
  }

  async function ensureUpstreamInitialized(profile) {
    const key = profileKey(profile);
    if (state.upstreamInitializedKey === key) return;
    const response = await forwardToUpstreamMcp(profile, {
      jsonrpc: "2.0",
      id: `init-${Date.now()}`,
      method: "initialize",
      params: {
        protocolVersion: upstreamProtocolVersion,
        capabilities: {},
        clientInfo: { name: config.serverName, version: config.version },
      },
    });
    if (response.error) throw new Error(response.error.message || JSON.stringify(response.error));
    state.upstreamInitializedKey = key;
    await forwardToUpstreamMcp(profile, { jsonrpc: "2.0", method: "notifications/initialized" }).catch(() => {});
  }

  async function verifyWordPressRest(profile) {
    requiredProfile(profile);
    const discovery = await discoverRestApi(profile);
    if (!Array.isArray(discovery.index?.namespaces) || !discovery.index.namespaces.includes("wp/v2")) {
      throw new Error(`WordPress REST API root found, but wp/v2 is not advertised at ${discovery.restApiRoot}.`);
    }
    const url = buildRestApiUrl(discovery.restApiRoot, "wp/v2/users/me?context=edit");
    const result = await httpJson(url, {
      headers: {
        Authorization: authHeader(profile),
        Accept: "application/json",
      },
    });
    return {
      ok: true,
      siteUrl: profile.siteUrl,
      restApiRoot: discovery.restApiRoot,
      discoveryMethod: discovery.method,
      wordpressVersion: extractWordPressVersion(discovery.index),
      username: result?.slug || result?.username || profile.username,
      userId: result?.id || null,
      roles: Array.isArray(result?.roles) ? result.roles : undefined,
    };
  }

  async function forwardToUpstreamMcp(profile, payload, retry = true) {
    requiredProfile(profile);
    const url = buildMcpUrl(profile);
    const response = await httpJsonRpc(url, payload, profile);

    if (response.httpStatus === 404 && retry) {
      const hadSession = Boolean(state.sessionId);
      state.sessionId = "";
      state.upstreamInitializedKey = "";
      const discovered = await discoverRestApi(profile).catch(() => null);
      if (discovered?.restApiRoot && discovered.restApiRoot !== profile.restApiRoot) {
        return forwardToUpstreamMcp({ ...profile, restApiRoot: discovered.restApiRoot }, payload, false);
      }
      if (hadSession) return forwardToUpstreamMcp(profile, payload, false);
    }

    if (response.sessionId) state.sessionId = response.sessionId;
    return response.body;
  }

  function httpJsonRpc(url, payload, profile) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(payload);
      const req = rawRequest(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: authHeader(profile),
          "Content-Length": Buffer.byteLength(body),
          "MCP-Protocol-Version": upstreamProtocolVersion,
          ...(state.sessionId ? { "Mcp-Session-Id": state.sessionId } : {}),
        },
        onResponse: (res, text) => {
          const sessionId = headerValue(res.headers["mcp-session-id"]);
          if (res.statusCode < 200 || res.statusCode > 299) {
            resolve({
              httpStatus: res.statusCode,
              sessionId,
              body: {
                jsonrpc: "2.0",
                id: payload.id ?? null,
                error: { code: -32603, message: `${config.upstreamLabel} HTTP ${res.statusCode}: ${text.slice(0, 500)}` },
              },
            });
            return;
          }
          try {
            resolve({ httpStatus: res.statusCode, sessionId, body: parseMcpResponse(text) });
          } catch (error) {
            reject(error);
          }
        },
        onError: reject,
      });
      req.write(body);
      req.end();
    });
  }

  function httpJson(url, options = {}) {
    return new Promise((resolve, reject) => {
      const req = rawRequest(url, {
        method: options.method || "GET",
        headers: options.headers || {},
        onResponse: (res, text) => {
          if (res.statusCode < 200 || res.statusCode > 299) {
            reject(new Error(`WordPress REST HTTP ${res.statusCode}: ${text.slice(0, 500)}`));
            return;
          }
          try {
            resolve(text.trim() ? JSON.parse(text) : {});
          } catch (error) {
            reject(error);
          }
        },
        onError: reject,
      });
      req.end();
    });
  }

  function httpText(url, options = {}) {
    return new Promise((resolve, reject) => {
      const req = rawRequest(url, {
        method: options.method || "GET",
        headers: options.headers || {},
        onResponse: (res, text) => {
          resolve({ statusCode: res.statusCode, headers: res.headers, text });
        },
        onError: reject,
      });
      req.end();
    });
  }

  async function discoverRestApi(profile) {
    const candidates = [];
    if (profile.restApiRoot) candidates.push({ url: new URL(profile.restApiRoot), method: "configured_root" });

    try {
      const head = await httpText(new URL(profile.siteUrl), { method: "HEAD" });
      const linkedRoot = apiRootFromLinkHeader(head.headers.link);
      if (linkedRoot) candidates.push({ url: new URL(linkedRoot), method: "link_header" });
    } catch {
      // Discovery continues with conventional roots below.
    }

    candidates.push({ url: new URL("/wp-json/", profile.siteUrl), method: "wp_json" });
    const restRoute = new URL("/", profile.siteUrl);
    restRoute.searchParams.set("rest_route", "/");
    candidates.push({ url: restRoute, method: "rest_route" });

    const errors = [];
    for (const candidate of uniqueUrlCandidates(candidates)) {
      try {
        const index = await httpJson(candidate.url, { headers: { Accept: "application/json" } });
        if (index && typeof index === "object") {
          return {
            restApiRoot: normalizeRestApiRoot(candidate.url.toString()),
            method: candidate.method,
            index,
          };
        }
      } catch (error) {
        errors.push(`${candidate.method}: ${error.message}`);
      }
    }
    throw new Error(`Unable to discover WordPress REST API root. Tried wp-json and rest_route forms. ${errors.join("; ")}`);
  }

  function buildMcpUrl(profile) {
    const mcpPath = profile.mcpPath || config.defaultMcpPath;
    if (/^https?:\/\//i.test(mcpPath)) return new URL(mcpPath);
    if (!profile.restApiRoot) return new URL(mcpPath, profile.siteUrl);
    return buildRestApiUrl(profile.restApiRoot, restRouteFromEndpointPath(mcpPath));
  }

  function rawRequest(url, { method, headers, onResponse, onError }) {
    const isHttps = url.protocol === "https:";
    const transport = isHttps ? httpsRequest : httpRequest;
    const req = transport(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method,
        headers,
        rejectUnauthorized: !isLoopbackHost(url.hostname),
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => onResponse(res, text));
      }
    );
    req.on("error", onError || (() => {}));
    req.setTimeout(requestTimeoutMs, () => req.destroy(new Error(`Request timeout after ${requestTimeoutMs}ms`)));
    return req;
  }

  function resetUpstreamCache() {
    state.sessionId = "";
    state.upstreamInitializedKey = "";
    state.toolCache = null;
  }

  function resolveConfigPath(factoryRoot) {
    const configPath = envValue(config.env.configPath);
    if (configPath) return resolve(configPath);
    const root = resolveFactoryRoot(factoryRoot);
    return join(root, ".omatic", config.factoryFileName);
  }

  function ensureFactoryInfoGitignore(configPath) {
    const ignorePath = join(dirname(configPath), ".gitignore");
    const entries = [config.factoryFileName, `${config.factoryFileName}.*.tmp`];
    let existing = "";
    try {
      existing = readFileSync(ignorePath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const lines = new Set(existing.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
    let changed = false;
    for (const entry of entries) {
      if (!lines.has(entry)) {
        lines.add(entry);
        changed = true;
      }
    }
    if (changed) writeFileSync(ignorePath, `${[...lines].join("\n")}\n`, { mode: 0o644 });
  }

  function protocolVersion(message) {
    return message.params?.protocolVersion || envValue("MCP_PROTOCOL_VERSION") || DEFAULT_PROTOCOL_VERSION;
  }

  function requiredProfile(profile) {
    if (!hasRequiredProfile(profile)) {
      if (!profile?.siteUrl) throw new Error(`${config.displayName} site URL is missing.`);
      if (!profile?.username) throw new Error(`${config.displayName} username is missing.`);
      if (!profile?.applicationPassword) throw new Error("WordPress Application Password is missing.");
    }
  }

  function redactProfile(profile) {
    return {
      siteUrl: profile.siteUrl,
      username: profile.username,
      applicationPassword: profile.applicationPassword ? "[stored-redacted]" : "",
      mcpPath: profile.mcpPath || config.defaultMcpPath,
      restApiRoot: profile.restApiRoot || null,
      wordpressVersion: profile.wordpressVersion || null,
      lastVerifiedAt: profile.lastVerifiedAt || null,
      mcp: profile.mcp ? summarizeStoredMcp(profile.mcp) : null,
      createdAt: profile.createdAt || null,
      updatedAt: profile.updatedAt || null,
    };
  }
}

function createBuiltinTools(config) {
  return [
    {
      name: `${config.toolBase}_configure`,
      title: `Configure ${config.displayName}`,
      description: `Store this project's ${config.displayName} connection in factory information. Requires a WordPress site URL, username, and Application Password.`,
      inputSchema: {
        type: "object",
        properties: {
          site_url: {
            type: "string",
            description: "WordPress site URL, for example https://example.com.",
          },
          username: {
            type: "string",
            description: "WordPress username for the Application Password.",
          },
          application_password: {
            type: "string",
            description:
              "WordPress Application Password. Direct entry can be logged by the host; prefer application_password_env when possible.",
          },
          application_password_env: {
            type: "string",
            description:
              "Name of an environment variable containing the WordPress Application Password. Recommended over direct entry.",
          },
          mcp_path: {
            type: "string",
            description: `${config.upstreamLabel} endpoint path. Default: ${config.defaultMcpPath}`,
          },
          rest_api_root: {
            type: "string",
            description:
              "Optional discovered WordPress REST API root. Use only when auto-discovery is blocked, for example https://example.com/wp-json/ or https://example.com/?rest_route=/.",
          },
          profile: {
            type: "string",
            description: `Factory connection profile name. Default: ${DEFAULT_PROFILE}`,
          },
          factory_root: {
            type: "string",
            description: `Project root where .omatic/${config.factoryFileName} should be stored. Defaults to OMATIC_PROJECT_ROOT or nearest .omatic root.`,
          },
          verify: {
            type: "boolean",
            description: "Verify the WordPress REST API credentials before saving. Default: true.",
          },
          verify_mcp: {
            type: "boolean",
            description: `${config.upstreamLabel} tools/list check before saving. Default: ${config.verifyMcpOnConfigure ? "true" : "false"}.`,
          },
        },
        required: ["site_url", "username"],
      },
    },
    {
      name: `${config.toolBase}_status`,
      title: `${config.displayName} Status`,
      description: `Show the active ${config.displayName} profile, redacted config, and optional live credential check.`,
      inputSchema: {
        type: "object",
        properties: {
          profile: { type: "string", description: `Profile name. Default: ${DEFAULT_PROFILE}` },
          factory_root: { type: "string", description: "Project root to inspect." },
          verify: { type: "boolean", description: "Run a live REST API credential check. Default: false." },
          verify_mcp: { type: "boolean", description: `Run a live ${config.upstreamLabel} tools/list capability check. Default: false.` },
        },
      },
    },
    {
      name: `${config.toolBase}_forget`,
      title: `Forget ${config.displayName} Profile`,
      description: `Remove a stored ${config.displayName} profile from local factory information.`,
      inputSchema: {
        type: "object",
        properties: {
          profile: { type: "string", description: `Profile name. Default: ${DEFAULT_PROFILE}` },
          factory_root: { type: "string", description: `Project root containing .omatic/${config.factoryFileName}.` },
        },
      },
    },
    {
      name: `${config.toolBase}_list_profiles`,
      title: `List ${config.displayName} Profiles`,
      description: `List stored ${config.displayName} connection profiles with secrets redacted.`,
      inputSchema: {
        type: "object",
        properties: {
          factory_root: { type: "string", description: `Project root containing .omatic/${config.factoryFileName}.` },
        },
      },
    },
    {
      name: `${config.toolBase}_activate_profile`,
      title: `Activate ${config.displayName} Profile`,
      description: `Switch this connector process to a stored ${config.displayName} profile for forwarded tool calls.`,
      inputSchema: {
        type: "object",
        properties: {
          profile: { type: "string", description: `Stored profile name to activate. Default: ${DEFAULT_PROFILE}` },
          factory_root: { type: "string", description: `Project root containing .omatic/${config.factoryFileName}.` },
        },
      },
    },
    {
      name: `${config.toolBase}_refresh_tools`,
      title: `Refresh ${config.displayName} Tool Cache`,
      description: `Run a live ${config.upstreamLabel} tools/list check and cache the forwarded tool schemas in local factory information when using stored profiles.`,
      inputSchema: {
        type: "object",
        properties: {
          profile: { type: "string", description: `Profile name. Default: ${DEFAULT_PROFILE}` },
          factory_root: { type: "string", description: `Project root containing .omatic/${config.factoryFileName}.` },
        },
      },
    },
    {
      name: `${config.toolBase}_usage_guide`,
      title: `${config.displayName} Usage Guide`,
      description: `Read this before using forwarded ${config.upstreamLabel} tools. Explains setup, prefixes, discovery, and safe tool-selection patterns for this connector.`,
      inputSchema: {
        type: "object",
        properties: {
          profile: { type: "string", description: `Profile name. Default: ${DEFAULT_PROFILE}` },
          factory_root: { type: "string", description: `Project root containing .omatic/${config.factoryFileName}.` },
          include_profile: {
            type: "boolean",
            description: "Include redacted stored profile and MCP capability summary when available. Default: true.",
          },
        },
      },
    },
  ];
}

function normalizeOptions(options) {
  const env = options.env || {};
  return {
    ...options,
    defaultMcpPath: normalizePath(options.defaultMcpPath, "/wp-json/mcp"),
    verifyMcpOnConfigure: options.verifyMcpOnConfigure === true,
    capabilityGroups: options.capabilityGroups || [],
    toolUseGuide: options.toolUseGuide || defaultToolUseGuide(options),
    env: {
      configPath: env.configPath,
      profile: env.profile,
      siteUrl: env.siteUrl,
      siteUrlFallbacks: env.siteUrlFallbacks || [],
      username: env.username,
      usernameFallbacks: env.usernameFallbacks || [],
      appPassword: env.appPassword,
      appPasswordFallbacks: env.appPasswordFallbacks || [],
      mcpPath: env.mcpPath,
      restApiRoot: env.restApiRoot,
      timeoutMs: env.timeoutMs,
    },
  };
}

function connectorInstructions(config) {
  const guideTool = `${config.toolBase}_usage_guide`;
  return [
    config.instructions,
    `Before choosing forwarded ${config.upstreamLabel} tools, call ${guideTool} and read the current capability summary.`,
    `Forwarded upstream tools are namespaced with ${config.forwardPrefix}; do not call unprefixed upstream tool names through this connector.`,
    `Use ${config.toolBase}_status with verify_mcp=true when tool availability matters for the task.`,
  ].join("\n");
}

function defaultToolUseGuide(options) {
  return {
    summary: `${options.upstreamLabel || "Upstream MCP"} tools are discovered from the live target site and forwarded through this stdio MCP connector.`,
    rules: [
      `Call ${options.toolBase}_status before using site tools if the connection may be stale.`,
      `Call ${options.toolBase}_usage_guide when you need to know how this connector expects tools to be used.`,
      `Only call forwarded tools with the ${options.forwardPrefix} prefix.`,
      "Inspect tool names and schemas from tools/list instead of guessing parameters.",
      "For write actions, confirm the target site, post/page/resource id, and intended status before invoking mutating tools.",
    ],
  };
}

function summarizeMcpSurface(tools, capabilityGroups = []) {
  const toolNames = tools.map((tool) => tool.name).filter(Boolean).sort();
  const groups = capabilityGroups.map((group) => {
    const matchedTools = toolNames.filter((name) =>
      (group.any || []).some((pattern) => toolNameMatches(name, pattern))
    );
    return {
      id: group.id,
      label: group.label || group.id,
      required: group.required === true,
      available: matchedTools.length > 0,
      matchedTools,
    };
  });
  return {
    toolCount: toolNames.length,
    toolNames,
    capabilityGroups: groups,
    requiredCapabilitiesMissing: groups
      .filter((group) => group.required && !group.available)
      .map((group) => group.id),
  };
}

function sanitizeToolsForStorage(tools) {
  return tools
    .filter((tool) => tool?.name)
    .map((tool) => ({
      name: String(tool.name),
      title: tool.title ? String(tool.title) : undefined,
      description: tool.description ? String(tool.description) : undefined,
      inputSchema: tool.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : { type: "object" },
      annotations: tool.annotations && typeof tool.annotations === "object" ? tool.annotations : undefined,
    }));
}

function storedForwardedTools(profile, forwardPrefix) {
  const tools = Array.isArray(profile?.mcp?.tools) ? profile.mcp.tools : [];
  return sanitizeToolsForStorage(tools).map((tool) => ({
    ...tool,
    name: `${forwardPrefix}${tool.name}`,
    description: tool.description || tool.name,
  }));
}

function summarizeStoredMcp(mcp) {
  if (!mcp) return null;
  return {
    ok: mcp.ok === true,
    endpoint: mcp.endpoint || null,
    verifiedAt: mcp.verifiedAt || null,
    toolCount: Number.isFinite(Number(mcp.toolCount)) ? Number(mcp.toolCount) : Array.isArray(mcp.tools) ? mcp.tools.length : 0,
    toolNames: Array.isArray(mcp.toolNames) ? mcp.toolNames : Array.isArray(mcp.tools) ? mcp.tools.map((tool) => tool.name).filter(Boolean) : [],
    capabilityGroups: Array.isArray(mcp.capabilityGroups) ? mcp.capabilityGroups : [],
    requiredCapabilitiesMissing: Array.isArray(mcp.requiredCapabilitiesMissing) ? mcp.requiredCapabilitiesMissing : [],
  };
}

function profileKey(profile) {
  return [profile?.siteUrl || "", profile?.username || "", profile?.mcpPath || "", profile?.restApiRoot || ""].join("|");
}

function toolNameMatches(name, pattern) {
  if (pattern instanceof RegExp) return pattern.test(name);
  const clean = String(pattern || "");
  return name === clean || name.includes(clean);
}

function buildRestApiUrl(restApiRoot, routePath) {
  const root = new URL(restApiRoot);
  const [pathPart, queryPart = ""] = String(routePath || "").split("?");
  const route = `/${pathPart.replace(/^\/+/, "")}`;
  if (root.searchParams.has("rest_route")) {
    root.searchParams.set("rest_route", route);
    const routeParams = new URLSearchParams(queryPart);
    for (const [key, value] of routeParams.entries()) root.searchParams.set(key, value);
    return root;
  }
  return new URL(route.replace(/^\/+/, ""), ensureTrailingSlash(root.toString()));
}

function restRouteFromEndpointPath(endpointPath) {
  const clean = String(endpointPath || "").trim();
  if (/^https?:\/\//i.test(clean)) return clean;
  return clean.replace(/^\/?wp-json\/?/i, "").replace(/^\/+/, "");
}

function apiRootFromLinkHeader(value) {
  const links = Array.isArray(value) ? value.join(",") : String(value || "");
  for (const part of links.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="?https:\/\/api\.w\.org\/?"?/i);
    if (match) return match[1];
  }
  return "";
}

function uniqueUrlCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = candidate.url.toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeRestApiRoot(value) {
  const root = new URL(value);
  if (root.searchParams.has("rest_route")) {
    root.searchParams.set("rest_route", "/");
    return root.toString();
  }
  return ensureTrailingSlash(root.toString());
}

function normalizeOptionalUrl(value) {
  const clean = String(value || "").trim();
  return clean ? normalizeRestApiRoot(clean) : null;
}

function ensureTrailingSlash(value) {
  return String(value || "").endsWith("/") ? String(value) : `${value}/`;
}

function extractWordPressVersion(index) {
  const generator = String(index?.generator || "");
  const match = generator.match(/[?&]v=([0-9][0-9A-Za-z_.-]*)/);
  return match ? match[1] : null;
}

function parseMcpResponse(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return { jsonrpc: "2.0", result: {} };
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return JSON.parse(trimmed);

  const dataLines = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== "[DONE]");
  if (!dataLines.length) throw new Error(`No JSON-RPC payload found in MCP response: ${trimmed.slice(0, 500)}`);
  return JSON.parse(dataLines[dataLines.length - 1]);
}

function readFactoryInfo(configPath, { allowMissing }) {
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    return { version: 1, profiles: {}, ...parsed };
  } catch (error) {
    if (allowMissing && error.code === "ENOENT") return { version: 1, profiles: {} };
    throw error;
  }
}

function writeFactoryInfo(configPath, data) {
  mkdirSync(dirname(configPath), { recursive: true, mode: 0o700 });
  const tmpPath = `${configPath}.${process.pid}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmpPath, configPath);
  try {
    statSync(configPath);
  } catch {
    // Rename succeeded on normal filesystems; this is a defensive no-op.
  }
}

function resolveFactoryRoot(factoryRoot) {
  const explicit = factoryRoot || envValue("OMATIC_PROJECT_ROOT") || envValue("PROJECT_ROOT") || "";
  if (explicit) return resolve(explicit);

  // Codex binds no project dir into cwd — the launcher forces cwd=${PLUGIN_ROOT}
  // (see .mcp.json) — and it does not set OMATIC_PROJECT_ROOT. It exports the
  // workspace path in CODEX_WORKSPACE instead. Without this, a zero-config Codex
  // factory walks up from the plugin install dir, finds no .omatic, and reports
  // unconfigured while a perfectly good factory.json sits in the workspace.
  //
  // This mirrors omatic-server-connection/server/factory.js:detectPlatform,
  // which already reads the same three. envValue strips an unresolved "${VAR}"
  // literal, so a host that leaves the placeholder unsubstituted is treated as
  // absent rather than resolving the factory root to the string "${CODEX_...}".
  const codexWorkspace =
    envValue("CODEX_WORKSPACE") || envValue("CODEX_PROJECT_ROOT") || envValue("CODEX_WORKSPACE_ROOT") || "";
  if (codexWorkspace) return resolve(codexWorkspace);

  let current = process.cwd();
  for (;;) {
    try {
      if (statSync(join(current, ".omatic")).isDirectory()) return current;
    } catch {
      // Keep walking up.
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
}

function textResult(id, text) {
  return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: false } };
}

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function authHeader(profile) {
  return `Basic ${Buffer.from(`${profile.username}:${profile.applicationPassword}`).toString("base64")}`;
}

function hasRequiredProfile(profile) {
  return Boolean(profile?.siteUrl && profile?.username && profile?.applicationPassword);
}

function requiredString(value, name) {
  const clean = String(value || "").trim();
  if (!clean) throw new Error(`${name} is required.`);
  return clean;
}

function normalizeSiteUrl(value) {
  const clean = requiredString(value, "site_url").replace(/\/+$/, "");
  const url = new URL(clean);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("site_url must use http or https.");
  if (url.protocol !== "https:" && !isLoopbackHost(url.hostname)) {
    throw new Error("site_url must use https unless it is a local development host.");
  }
  return url.toString().replace(/\/+$/, "");
}

function normalizePath(value, fallback) {
  const clean = String(value || "").trim();
  if (!clean) return fallback;
  return clean.startsWith("/") ? clean : `/${clean}`;
}

function cleanProfileName(value) {
  const clean = String(value || DEFAULT_PROFILE).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return clean || DEFAULT_PROFILE;
}

function headerValue(value) {
  return Array.isArray(value) ? value[0] : value || "";
}

function isLoopbackHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host.startsWith("127.") || host === "::1" || host === "[::1]";
}

function firstEnvValue(...names) {
  for (const name of names) {
    const value = envValue(name);
    if (value) return value;
  }
  return "";
}

function envValue(name) {
  if (!name) return "";
  const value = process.env[name];
  if (!value) return "";
  if (/^\$\{[^}]+\}$/.test(value)) return "";
  return value;
}

function parseTimeoutMs(value, fallback) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runSelfTest(config) {
  assert(normalizePath("wp-json/mcp", config.defaultMcpPath) === "/wp-json/mcp", "normalizePath should add leading slash");
  assert(
    buildRestApiUrl("https://example.com/wp-json/", "wp/v2/users/me").toString() ===
      "https://example.com/wp-json/wp/v2/users/me",
    "pretty permalink REST URL build failed"
  );
  assert(
    buildRestApiUrl("https://example.com/?rest_route=/", "wp/v2/users/me?context=edit").toString() ===
      "https://example.com/?rest_route=%2Fwp%2Fv2%2Fusers%2Fme&context=edit",
    "rest_route REST URL build failed"
  );
  assert(
    restRouteFromEndpointPath("/wp-json/mcp/mcp-adapter-default-server") === "mcp/mcp-adapter-default-server",
    "REST endpoint path normalization failed"
  );
  assert(
    apiRootFromLinkHeader('<https://example.com/wp-json/>; rel="https://api.w.org/"') ===
      "https://example.com/wp-json/",
    "REST Link header parsing failed"
  );
  assert(isLoopbackHost("localhost"), "localhost should be treated as loopback");
  assert(isLoopbackHost("127.10.20.30"), "127/8 should be treated as loopback");
  assert(!isLoopbackHost("example.dev"), ".dev must not disable TLS verification");
  assert(!isLoopbackHost("printer.local"), ".local must not disable TLS verification");
  assert(cleanProfileName("Client A!") === "client-a-", "cleanProfileName should normalize profile names");
  assert(
    storedForwardedTools(
      {
        mcp: {
          tools: [{ name: "example_tool", description: "Example", inputSchema: { type: "object", properties: {} } }],
        },
      },
      "wp__"
    )[0].name === "wp__example_tool",
    "stored forwarded tool prefixing failed"
  );
  process.env[config.env.siteUrl] = `\${${config.env.siteUrl}}`;
  assert(firstEnvValue(config.env.siteUrl) === "", "placeholder env values should be ignored");
  delete process.env[config.env.siteUrl];
  process.env[config.env.timeoutMs] = `\${${config.env.timeoutMs}}`;
  assert(parseTimeoutMs(envValue(config.env.timeoutMs), 15000) === 15000, "placeholder timeout should fall back");
  delete process.env[config.env.timeoutMs];
  process.env.TEST_CONNECTOR_APP_PASSWORD = "secret-from-env";
  assert(envValue("TEST_CONNECTOR_APP_PASSWORD") === "secret-from-env", "env password lookup failed");
  delete process.env.TEST_CONNECTOR_APP_PASSWORD;
  assert(parseMcpResponse('data: {"jsonrpc":"2.0","result":{"ok":true}}').result.ok === true, "SSE parser failed");

  const redacted = {
    siteUrl: "https://example.com",
    username: "admin",
    applicationPassword: "[stored-redacted]",
    mcpPath: config.defaultMcpPath,
  };
  const tmpRoot = join(process.cwd(), `.tmp-self-test-${config.connectorName}`);
  const configPath = join(tmpRoot, ".omatic", config.factoryFileName);
  writeFactoryInfo(configPath, { version: 1, profiles: { default: redacted } });
  const roundTrip = readFactoryInfo(configPath, { allowMissing: false });
  assert(roundTrip.profiles.default.siteUrl === "https://example.com", "factory info write/read failed");
  rmSync(tmpRoot, { recursive: true, force: true });
  process.stdout.write("self-test ok\n");
}
