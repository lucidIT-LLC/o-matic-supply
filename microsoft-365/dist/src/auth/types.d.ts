import { AuthError } from "../errors.js";
/**
 * The one thing the Graph client needs from authentication.
 *
 * Everything else — device code, client credentials, managed identity, a cached
 * token handed in by a host — is an implementation detail behind this method.
 */
export interface AuthProvider {
    /**
     * A currently-valid bearer token for Microsoft Graph. Implementations refresh
     * proactively; callers must not implement retry-on-401 refresh themselves.
     */
    getAccessToken(): Promise<string>;
}
/** Optional surface used by the auth tools. Not required by the Graph client. */
export interface IntrospectableAuthProvider extends AuthProvider {
    readonly mode: "device-code" | "client-credentials";
    status(): Promise<AuthStatus>;
    signOut(): Promise<void>;
}
export interface AuthStatus {
    mode: "device-code" | "client-credentials";
    signedIn: boolean;
    /** UPN / display name of the signed-in account, when known. */
    account?: string | undefined;
    /** ISO timestamp the cached access token expires. */
    accessTokenExpiresAt?: string | undefined;
    /** True when a refresh token is present in the token store. */
    hasStoredRefreshToken: boolean;
    tokenStoreBackend: string;
    scopes: string[];
    detail?: string | undefined;
}
/**
 * Where a refresh token lives. macOS Keychain today; a Linux Secret Service or
 * Windows Credential Manager backend can be added without touching auth code.
 *
 * Contract: implementations persist opaque strings and never log them.
 */
export interface TokenStore {
    /** Short identifier for diagnostics, e.g. "macos-keychain". */
    readonly backend: string;
    /** Returns null when nothing is stored for the account. */
    get(account: string): Promise<string | null>;
    set(account: string, secret: string): Promise<void>;
    /** Idempotent: deleting an absent entry is not an error. */
    delete(account: string): Promise<void>;
}
/**
 * Raised when a token cannot be obtained without a human completing the device
 * code flow. Distinct from a generic AuthError so tools can tell the caller to
 * run the sign-in tool instead of reporting a hard failure.
 */
export declare class InteractiveSignInRequired extends AuthError {
    constructor(reason: string);
}
/** Normalised token endpoint response. */
export interface TokenSet {
    accessToken: string;
    /** Epoch milliseconds. */
    expiresAt: number;
    refreshToken?: string | undefined;
    scopes: string[];
    account?: string | undefined;
}
/** Refresh this far before actual expiry rather than waiting for a 401. */
export declare const REFRESH_MARGIN_MS: number;
