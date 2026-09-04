import { AuthError } from "../errors.js";
import { setAuditActor } from "../util/audit.js";
import { log } from "../util/logger.js";
import { InteractiveSignInRequired, REFRESH_MARGIN_MS, } from "./types.js";
/** Terminal device-code polling errors, mapped to something a human can act on. */
const POLL_FAILURES = {
    authorization_declined: "The user declined the sign-in request.",
    expired_token: "The device code expired before sign-in completed.",
    bad_verification_code: "The device code was rejected by Microsoft.",
    access_denied: "Sign-in was denied — usually a Conditional Access policy or an admin block.",
};
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
export class DeviceCodeAuthProvider {
    mode = "device-code";
    config;
    store;
    fetchImpl;
    now;
    sleep;
    cached = null;
    inFlight = null;
    pendingPrompt = null;
    constructor(config, store, options = {}) {
        this.config = config;
        this.store = store;
        this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
        this.now = options.now ?? (() => Date.now());
        this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    }
    get deviceCodeEndpoint() {
        return `${this.config.authorityHost}/${this.config.tenantId}/oauth2/v2.0/devicecode`;
    }
    get tokenEndpoint() {
        return `${this.config.authorityHost}/${this.config.tenantId}/oauth2/v2.0/token`;
    }
    /** Keychain account key — one stored token per tenant per client. */
    get storeAccount() {
        return `${this.config.tenantId}:${this.config.clientId}`;
    }
    async getAccessToken() {
        if (this.cached && this.cached.expiresAt - REFRESH_MARGIN_MS > this.now()) {
            return this.cached.accessToken;
        }
        if (this.inFlight)
            return (await this.inFlight).accessToken;
        const attempt = this.acquireSilently();
        this.inFlight = attempt;
        try {
            const tokens = await attempt;
            return tokens.accessToken;
        }
        finally {
            if (this.inFlight === attempt)
                this.inFlight = null;
        }
    }
    async acquireSilently() {
        const refreshToken = this.cached?.refreshToken ?? (await this.store.get(this.storeAccount));
        if (!refreshToken) {
            throw new InteractiveSignInRequired("no refresh token is stored for this tenant and client");
        }
        try {
            return await this.redeemRefreshToken(refreshToken);
        }
        catch (error) {
            if (error instanceof InteractiveSignInRequired)
                throw error;
            throw error;
        }
    }
    async redeemRefreshToken(refreshToken) {
        const body = new URLSearchParams({
            client_id: this.config.clientId,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            scope: this.config.scopes.join(" "),
        });
        const payload = await this.postForm(this.tokenEndpoint, body);
        if (payload.error) {
            // invalid_grant covers revoked, expired (90d inactivity), password change,
            // and admin-forced sign-out. All of them mean: sign in again.
            if (payload.error === "invalid_grant" || payload.error === "interaction_required") {
                await this.store.delete(this.storeAccount).catch(() => undefined);
                this.cached = null;
                throw new InteractiveSignInRequired(`the stored refresh token was rejected (${payload.error})`);
            }
            throw new AuthError(`Refreshing the access token failed: ${payload.error}${payload.error_description ? ` — ${firstLine(payload.error_description)}` : ""}`);
        }
        return this.adoptTokens(payload);
    }
    /**
     * Start a device-code sign-in and return the code to show the user. Polling
     * continues in the background; call awaitSignIn() to wait for completion.
     */
    async beginSignIn() {
        const body = new URLSearchParams({
            client_id: this.config.clientId,
            scope: this.config.scopes.join(" "),
        });
        const response = await this.fetchImpl(this.deviceCodeEndpoint, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: body.toString(),
        });
        const payload = (await safeJson(response));
        if (!response.ok || !payload.device_code) {
            throw new AuthError(`Requesting a device code failed (HTTP ${response.status})${payload.error ? `: ${payload.error}` : ""}${payload.error_description ? ` — ${firstLine(payload.error_description)}` : ""}`, `Confirm OMATIC_M365_TENANT_ID and OMATIC_M365_CLIENT_ID, and that the app registration has "Allow public client flows" enabled.`);
        }
        const intervalSeconds = payload.interval ?? 5;
        const expiresAtMs = this.now() + payload.expires_in * 1000;
        const prompt = {
            userCode: payload.user_code,
            verificationUri: payload.verification_uri,
            verificationUriComplete: payload.verification_uri_complete,
            message: payload.message ??
                `To sign in, open ${payload.verification_uri} and enter the code ${payload.user_code}.`,
            expiresAt: new Date(expiresAtMs).toISOString(),
            intervalSeconds,
        };
        this.pendingPrompt = prompt;
        // The user code is not a credential on its own — it is useless without the
        // interactive sign-in — so it is safe to log for the operator.
        log.info(`Device-code sign-in started. ${prompt.message}`);
        const poll = this.pollForToken(payload.device_code, intervalSeconds, expiresAtMs);
        this.inFlight = poll;
        // Attach settlement handling with then(onOk, onErr) rather than finally():
        // finally() returns a NEW promise that re-raises the rejection, and if the
        // caller never awaits the sign-in that becomes an unhandledRejection.
        const settle = () => {
            if (this.inFlight === poll)
                this.inFlight = null;
            this.pendingPrompt = null;
        };
        poll.then(settle, settle);
        return prompt;
    }
    /** Wait for an in-progress device-code sign-in to finish. */
    async awaitSignIn(timeoutMs = 120_000) {
        const pending = this.inFlight;
        if (!pending) {
            if (this.cached)
                return this.status();
            throw new AuthError("No device-code sign-in is in progress.", "Call m365_sign_in first.");
        }
        let timer;
        const timeout = new Promise((_resolve, reject) => {
            timer = setTimeout(() => reject(new AuthError(`Still waiting for the user to complete sign-in after ${Math.round(timeoutMs / 1000)}s.`, `The device code is still valid — ask the user to finish, then call m365_auth_status.`)), timeoutMs);
            timer.unref?.();
        });
        try {
            await Promise.race([pending, timeout]);
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
        return this.status();
    }
    async pollForToken(deviceCode, intervalSeconds, expiresAtMs) {
        let interval = intervalSeconds;
        for (;;) {
            await this.sleep(interval * 1000);
            if (this.now() > expiresAtMs) {
                throw new AuthError("The device code expired before sign-in was completed.", "Call m365_sign_in again to get a fresh code.");
            }
            const payload = await this.postForm(this.tokenEndpoint, new URLSearchParams({
                client_id: this.config.clientId,
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                device_code: deviceCode,
            }));
            if (!payload.error)
                return this.adoptTokens(payload);
            switch (payload.error) {
                case "authorization_pending":
                    continue;
                case "slow_down":
                    interval += 5;
                    continue;
                default: {
                    const known = POLL_FAILURES[payload.error];
                    throw new AuthError(known ??
                        `Device-code sign-in failed: ${payload.error}${payload.error_description ? ` — ${firstLine(payload.error_description)}` : ""}`, "Call m365_sign_in again to restart the flow.");
                }
            }
        }
    }
    async postForm(url, body) {
        const response = await this.fetchImpl(url, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: body.toString(),
        });
        const payload = (await safeJson(response));
        if (!response.ok && !payload.error) {
            throw new AuthError(`Token endpoint returned HTTP ${response.status} with no error body.`);
        }
        return payload;
    }
    async adoptTokens(payload) {
        if (!payload.access_token) {
            throw new AuthError("Token endpoint returned a success response with no access_token.");
        }
        const tokens = {
            accessToken: payload.access_token,
            expiresAt: this.now() + (payload.expires_in ?? 3600) * 1000,
            refreshToken: payload.refresh_token ?? this.cached?.refreshToken,
            scopes: payload.scope ? payload.scope.split(" ") : [...this.config.scopes],
            account: accountFromIdToken(payload.id_token) ?? this.cached?.account,
        };
        this.cached = tokens;
        if (payload.refresh_token) {
            try {
                await this.store.set(this.storeAccount, payload.refresh_token);
            }
            catch (error) {
                // Non-fatal: the access token in hand still works for this session.
                log.warn("Could not persist the refresh token; sign-in will be needed after restart.", error);
            }
        }
        // Name the human in the audit trail. Without this the connector log records
        // the mechanism but not the person, and reconciling it against the tenant's
        // unified audit log — the whole reason both exist — becomes guesswork.
        if (tokens.account)
            setAuditActor(tokens.account);
        log.info(`Access token acquired${tokens.account ? ` for ${tokens.account}` : ""}, expires ${new Date(tokens.expiresAt).toISOString()}.`);
        return tokens;
    }
    async status() {
        const stored = await this.store.get(this.storeAccount).catch(() => null);
        return {
            mode: this.mode,
            signedIn: Boolean(this.cached) || stored !== null,
            account: this.cached?.account,
            accessTokenExpiresAt: this.cached ? new Date(this.cached.expiresAt).toISOString() : undefined,
            hasStoredRefreshToken: stored !== null,
            tokenStoreBackend: this.store.backend,
            scopes: this.config.scopes,
            detail: this.pendingPrompt
                ? `A device-code sign-in is in progress: ${this.pendingPrompt.message}`
                : undefined,
        };
    }
    async signOut() {
        this.cached = null;
        this.inFlight = null;
        this.pendingPrompt = null;
        await this.store.delete(this.storeAccount);
        log.info("Signed out: cached tokens dropped and the stored refresh token removed.");
    }
}
async function safeJson(response) {
    const text = await response.text();
    if (text === "")
        return {};
    try {
        return JSON.parse(text);
    }
    catch {
        return { error: "invalid_response", error_description: `Non-JSON body (HTTP ${response.status}).` };
    }
}
function firstLine(value) {
    return value.split(/\r?\n/, 1)[0] ?? value;
}
/**
 * Read the account name out of the id_token for display only. The token is not
 * verified here and nothing is authorised on the strength of it — Graph does
 * that. Never logged, never returned beyond the account name.
 */
function accountFromIdToken(idToken) {
    if (!idToken)
        return undefined;
    const segment = idToken.split(".")[1];
    if (!segment)
        return undefined;
    try {
        const json = Buffer.from(segment.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
        const claims = JSON.parse(json);
        return claims.preferred_username ?? claims.upn ?? claims.name;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=device-code.js.map