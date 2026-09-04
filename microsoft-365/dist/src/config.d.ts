export type AuthMode = "device-code" | "client-credentials";
export interface ServerConfig {
    /** Entra ID directory (tenant) ID, or a verified domain. Never defaulted. */
    tenantId: string;
    /** Application (client) ID of the Entra app registration. Never defaulted. */
    clientId: string;
    authMode: AuthMode;
    /** Delegated scopes requested by the device-code flow. */
    scopes: string[];
    /** Microsoft identity platform host. Override only for sovereign clouds. */
    authorityHost: string;
    /** Microsoft Graph base URL. Override only for sovereign clouds. */
    graphBaseUrl: string;
    /** Keychain/keyring service name used to namespace the stored refresh token. */
    tokenStoreService: string;
    /** Where the effective values came from, for diagnostics. */
    sources: Record<string, "env" | "file" | "default">;
}
/**
 * Delegated permissions this server needs: Planner (incl. its beta Goals
 * endpoint, no extra scope required beyond Tasks.ReadWrite), Teams,
 * SharePoint, and OneNote. No Dataverse/Premium-Planner scopes here —
 * "Project" is a separate plugin (operator decision, task #484 / decision
 * #402), a different auth audience entirely, not just a different scope.
 */
export declare const DEFAULT_DELEGATED_SCOPES: string[];
/** App-only permissions the (unimplemented) client-credentials mode will need. */
export declare const DEFAULT_APP_ONLY_SCOPE = "https://graph.microsoft.com/.default";
/**
 * Resolve configuration from the environment, falling back to an optional
 * config file. Throws ConfigError naming exactly what is missing.
 */
export declare function loadConfig(env?: NodeJS.ProcessEnv): ServerConfig;
