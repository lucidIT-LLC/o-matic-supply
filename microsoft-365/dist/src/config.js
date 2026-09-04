import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { ConfigError } from "./errors.js";
/**
 * Delegated permissions this server needs: Planner (incl. its beta Goals
 * endpoint, no extra scope required beyond Tasks.ReadWrite), Teams,
 * SharePoint, and OneNote. No Dataverse/Premium-Planner scopes here —
 * "Project" is a separate plugin (operator decision, task #484 / decision
 * #402), a different auth audience entirely, not just a different scope.
 */
export const DEFAULT_DELEGATED_SCOPES = [
    "offline_access",
    "openid",
    "profile",
    "User.Read",
    "User.ReadBasic.All",
    "Group.Read.All",
    "Tasks.ReadWrite",
    "Channel.ReadBasic.All",
    "ChannelMessage.ReadWrite",
    "Sites.ReadWrite.All",
    // OneNote. Notes.Create is least-privileged for page creation;
    // Notes.ReadWrite is needed for reading existing content and appending to
    // it. Graph's OneNote API has no Application-permission tier at all, so
    // this list is delegated-only by necessity, not by choice.
    "Notes.Create",
    "Notes.ReadWrite",
];
/** App-only permissions the (unimplemented) client-credentials mode will need. */
export const DEFAULT_APP_ONLY_SCOPE = "https://graph.microsoft.com/.default";
const ENV = {
    tenantId: "TEAM_ASSISTANT_TENANT_ID",
    clientId: "TEAM_ASSISTANT_CLIENT_ID",
    authMode: "TEAM_ASSISTANT_AUTH_MODE",
    scopes: "TEAM_ASSISTANT_SCOPES",
    authorityHost: "TEAM_ASSISTANT_AUTHORITY_HOST",
    graphBaseUrl: "TEAM_ASSISTANT_GRAPH_BASE_URL",
    tokenStoreService: "TEAM_ASSISTANT_TOKEN_SERVICE",
    configFile: "TEAM_ASSISTANT_CONFIG_FILE",
};
/**
 * Pre-rename variable names, still honoured.
 *
 * The server was called omatic-m365-mcp before it was called Team Assistant.
 * Renaming the variables without accepting the old ones would break every
 * existing deployment silently — the config would simply look unset, and the
 * error would say a required value was missing rather than that it moved.
 * New names win; these are the fallback.
 */
const LEGACY_ENV = {
    tenantId: "OMATIC_M365_TENANT_ID",
    clientId: "OMATIC_M365_CLIENT_ID",
    authMode: "OMATIC_M365_AUTH_MODE",
    scopes: "OMATIC_M365_SCOPES",
    authorityHost: "OMATIC_M365_AUTHORITY_HOST",
    graphBaseUrl: "OMATIC_M365_GRAPH_BASE_URL",
    tokenStoreService: "OMATIC_M365_TOKEN_SERVICE",
    configFile: "OMATIC_M365_CONFIG_FILE",
};
const DEFAULT_AUTHORITY_HOST = "https://login.microsoftonline.com";
const DEFAULT_GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
/**
 * Keychain service name.
 *
 * Deliberately still the pre-rename value: this string is the address of the
 * stored refresh token. Changing it would orphan every existing token and force
 * a silent re-authentication for no benefit other than tidiness. Set
 * TEAM_ASSISTANT_TOKEN_SERVICE to move it on purpose.
 */
const DEFAULT_TOKEN_SERVICE = "omatic-m365-mcp";
function candidateFiles(env) {
    const explicit = env[ENV.configFile] ?? env[LEGACY_ENV.configFile];
    if (explicit)
        return [resolve(explicit)];
    // New paths first; the pre-rename ones are still searched so an existing
    // install keeps working without being touched.
    return [
        resolve(process.cwd(), "team-assistant.config.json"),
        join(homedir(), ".config", "team-assistant-mcp", "config.json"),
        resolve(process.cwd(), "omatic-m365.config.json"),
        join(homedir(), ".config", "omatic-m365-mcp", "config.json"),
    ];
}
function loadFileConfig(env) {
    for (const path of candidateFiles(env)) {
        let raw;
        try {
            raw = readFileSync(path, "utf8");
        }
        catch {
            continue;
        }
        try {
            const parsed = JSON.parse(raw);
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                throw new Error("top-level value is not a JSON object");
            }
            return { data: parsed, path };
        }
        catch (error) {
            throw new ConfigError(`Config file ${path} could not be parsed: ${error.message}`, `Fix the JSON, or delete the file and use the ${ENV.tenantId} / ${ENV.clientId} environment variables instead.`);
        }
    }
    return { data: {}, path: null };
}
function asString(value) {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
function missing(name, human, filePath) {
    const envName = ENV[name];
    const fileHint = filePath
        ? `add "${name}" to ${filePath}`
        : `or create ./team-assistant.config.json (or ~/.config/team-assistant-mcp/config.json) containing {"${name}": "..."}`;
    throw new ConfigError(`${human} is not configured. Team Assistant has no default for it and will not guess.`, [
        `Set the environment variable ${envName} in your MCP client config, e.g.`,
        `  "env": { "${envName}": "<value>" }`,
        `— ${fileHint}.`,
        `Both values are shown on the Entra admin center Overview blade of the app registration:`,
        `  ${ENV.tenantId}  = "Directory (tenant) ID"`,
        `  ${ENV.clientId}  = "Application (client) ID"`,
    ].join("\n"));
}
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TENANT_ALIASES = new Set(["common", "organizations", "consumers"]);
/**
 * Resolve configuration from the environment, falling back to an optional
 * config file. Throws ConfigError naming exactly what is missing.
 */
export function loadConfig(env = process.env) {
    // Read the file list from the env we were handed, not from process.env — the
    // argument exists so a caller (and every test) can be isolated from whatever
    // config file happens to sit on the machine.
    const file = loadFileConfig(env);
    const sources = {};
    const pick = (key, fileValue, fallback) => {
        const fromEnv = asString(env[ENV[key]]) ?? asString(env[LEGACY_ENV[key]]);
        if (fromEnv !== undefined) {
            sources[key] = "env";
            return fromEnv;
        }
        const fromFile = asString(fileValue);
        if (fromFile !== undefined) {
            sources[key] = "file";
            return fromFile;
        }
        if (fallback !== undefined) {
            sources[key] = "default";
            return fallback;
        }
        return undefined;
    };
    const tenantId = pick("tenantId", file.data.tenantId);
    if (!tenantId)
        missing("tenantId", "Entra directory (tenant) ID", file.path);
    if (!GUID.test(tenantId) && !tenantId.includes(".") && !TENANT_ALIASES.has(tenantId.toLowerCase())) {
        throw new ConfigError(`Tenant ID "${tenantId}" is neither a GUID, a verified domain, nor a known alias.`, `Use the "Directory (tenant) ID" GUID from the Entra app registration Overview blade.`);
    }
    const clientId = pick("clientId", file.data.clientId);
    if (!clientId)
        missing("clientId", "Entra application (client) ID", file.path);
    if (!GUID.test(clientId)) {
        throw new ConfigError(`Client ID "${clientId}" is not a GUID.`, `Use the "Application (client) ID" from the Entra app registration Overview blade.`);
    }
    const authModeRaw = (pick("authMode", file.data.authMode, "device-code") ?? "device-code").toLowerCase();
    if (authModeRaw !== "device-code" && authModeRaw !== "client-credentials") {
        throw new ConfigError(`Unknown auth mode "${authModeRaw}".`, `Set ${ENV.authMode} to "device-code" (delegated, acts as the signed-in user) or "client-credentials" (app-only).`);
    }
    const scopesRaw = pick("scopes", Array.isArray(file.data.scopes) ? file.data.scopes.join(" ") : file.data.scopes);
    const scopes = scopesRaw ? scopesRaw.split(/[\s,]+/).filter(Boolean) : [...DEFAULT_DELEGATED_SCOPES];
    if (!scopesRaw)
        sources["scopes"] = "default";
    return {
        tenantId,
        clientId,
        authMode: authModeRaw,
        scopes,
        authorityHost: pick("authorityHost", file.data.authorityHost, DEFAULT_AUTHORITY_HOST).replace(/\/+$/, ""),
        graphBaseUrl: pick("graphBaseUrl", file.data.graphBaseUrl, DEFAULT_GRAPH_BASE_URL).replace(/\/+$/, ""),
        tokenStoreService: pick("tokenStoreService", file.data.tokenStoreService, DEFAULT_TOKEN_SERVICE),
        sources,
    };
}
//# sourceMappingURL=config.js.map