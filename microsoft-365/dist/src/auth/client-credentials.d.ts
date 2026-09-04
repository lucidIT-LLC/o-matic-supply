import type { ServerConfig } from "../config.js";
import type { AuthStatus, IntrospectableAuthProvider, TokenStore } from "./types.js";
/**
 * ============================================================================
 * NOT IMPLEMENTED — interface and shape only.
 * ============================================================================
 *
 * App-only (client credentials) authentication, for client deployments where a
 * security review will not accept a tool acting as a named user. Every call is
 * made as the application itself, so actions are attributable to the app
 * registration rather than to a person, and no user needs to stay signed in.
 *
 * What implementing this requires, in order:
 *
 *  1. A credential. Either a client secret or — strongly preferred for client
 *     sites — a certificate, producing a signed JWT client assertion. Whichever
 *     it is, it comes from the TokenStore (OS keyring), never from an env var
 *     and never from a config file. That is why the constructor takes a store.
 *  2. POST {authority}/{tenant}/oauth2/v2.0/token with
 *     grant_type=client_credentials and scope=https://graph.microsoft.com/.default.
 *     App-only never uses offline_access and never issues a refresh token — you
 *     re-request an access token, which is why no persistence is needed here.
 *  3. Admin-consented APPLICATION permissions on the app registration. The
 *     delegated names do not carry over: Tasks.ReadWrite becomes
 *     Tasks.ReadWrite.All, Group.Read.All stays, Sites.ReadWrite.All stays.
 *  4. A caveat that must be surfaced to the client before they buy this mode:
 *     several Planner operations behave differently or are unavailable app-only,
 *     and app-only Graph access to Planner has historically lagged delegated.
 *     Verify each tool against the target tenant before promising it.
 *  5. Ideally, an Application Access Policy (Teams/Exchange) or a resource-scoped
 *     consent so the app cannot read every group in the tenant. An unconstrained
 *     app-only grant is exactly what the security review will object to.
 */
export declare class ClientCredentialsAuthProvider implements IntrospectableAuthProvider {
    readonly mode: "client-credentials";
    /** The scope an implementation must request. App-only ignores granular scopes. */
    static readonly scope = "https://graph.microsoft.com/.default";
    private readonly config;
    private readonly store;
    constructor(config: ServerConfig, store: TokenStore);
    /** Keychain account key an implementation should read the credential from. */
    get credentialAccount(): string;
    getAccessToken(): Promise<string>;
    status(): Promise<AuthStatus>;
    signOut(): Promise<void>;
}
