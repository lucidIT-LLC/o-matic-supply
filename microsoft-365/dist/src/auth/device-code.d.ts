import type { ServerConfig } from "../config.js";
import { type AuthStatus, type IntrospectableAuthProvider, type TokenStore } from "./types.js";
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export interface DeviceCodeOptions {
    fetchImpl?: FetchLike;
    /** Injected for tests. */
    now?: () => number;
    /** Injected for tests; must resolve after roughly `ms`. */
    sleep?: (ms: number) => Promise<void>;
}
export interface DeviceCodePrompt {
    userCode: string;
    verificationUri: string;
    verificationUriComplete?: string | undefined;
    /** Microsoft's own human-readable instruction string. */
    message: string;
    expiresAt: string;
    intervalSeconds: number;
}
/**
 * OAuth 2.0 device authorization grant (RFC 8628) against the Microsoft
 * identity platform. The server acts as the signed-in user.
 *
 * Design notes:
 *  - getAccessToken() is *silent*. It uses the cached access token, or the
 *    stored refresh token, and otherwise throws InteractiveSignInRequired. A
 *    tool call must never block for minutes waiting on a human.
 *  - Refresh happens at REFRESH_MARGIN_MS remaining, not on a 401. Reacting to
 *    a 401 means every token expiry costs one failed write, and with Planner's
 *    ETag semantics a failed write means a re-read too.
 *  - Microsoft rotates refresh tokens on every redemption, so the store is
 *    rewritten after every successful token response.
 */
export declare class DeviceCodeAuthProvider implements IntrospectableAuthProvider {
    readonly mode: "device-code";
    private readonly config;
    private readonly store;
    private readonly fetchImpl;
    private readonly now;
    private readonly sleep;
    private cached;
    private inFlight;
    private pendingPrompt;
    constructor(config: ServerConfig, store: TokenStore, options?: DeviceCodeOptions);
    private get deviceCodeEndpoint();
    private get tokenEndpoint();
    /** Keychain account key — one stored token per tenant per client. */
    private get storeAccount();
    getAccessToken(): Promise<string>;
    private acquireSilently;
    private redeemRefreshToken;
    /**
     * Start a device-code sign-in and return the code to show the user. Polling
     * continues in the background; call awaitSignIn() to wait for completion.
     */
    beginSignIn(): Promise<DeviceCodePrompt>;
    /** Wait for an in-progress device-code sign-in to finish. */
    awaitSignIn(timeoutMs?: number): Promise<AuthStatus>;
    private pollForToken;
    private postForm;
    private adoptTokens;
    status(): Promise<AuthStatus>;
    signOut(): Promise<void>;
}
