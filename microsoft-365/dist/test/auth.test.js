import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { ClientCredentialsAuthProvider } from "../src/auth/client-credentials.js";
import { DeviceCodeAuthProvider } from "../src/auth/device-code.js";
import { MemoryTokenStore } from "../src/auth/token-store/memory.js";
import { InteractiveSignInRequired, REFRESH_MARGIN_MS } from "../src/auth/types.js";
import { AuthError, NotImplementedError } from "../src/errors.js";
import { redact } from "../src/util/redact.js";
const CONFIG = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    clientId: "22222222-2222-2222-2222-222222222222",
    authMode: "device-code",
    scopes: ["offline_access", "Tasks.ReadWrite"],
    authorityHost: "https://login.microsoftonline.com",
    graphBaseUrl: "https://graph.microsoft.com/v1.0",
    tokenStoreService: "omatic-m365-mcp-test",
    sources: {},
};
const ACCOUNT = `${CONFIG.tenantId}:${CONFIG.clientId}`;
function stubTokenEndpoint(responses) {
    const calls = [];
    let index = 0;
    const fetchImpl = async (url, init) => {
        const form = Object.fromEntries(new URLSearchParams(String(init?.body ?? "")));
        calls.push({ url, form });
        const response = responses[Math.min(index, responses.length - 1)];
        index += 1;
        return new Response(JSON.stringify(response?.body ?? {}), {
            status: response?.status ?? 200,
            headers: { "content-type": "application/json" },
        });
    };
    return { fetchImpl, calls };
}
describe("DeviceCodeAuthProvider — silent acquisition", () => {
    test("with nothing stored it asks for interactive sign-in rather than hanging", async () => {
        const { fetchImpl, calls } = stubTokenEndpoint([{ body: {} }]);
        const provider = new DeviceCodeAuthProvider(CONFIG, new MemoryTokenStore(), { fetchImpl });
        const error = await provider.getAccessToken().then(() => null).catch((e) => e);
        assert.ok(error instanceof InteractiveSignInRequired);
        assert.match(error.toToolMessage(), /m365_sign_in/);
        assert.equal(calls.length, 0, "no network call should be made with nothing to redeem");
    });
    test("a stored refresh token is redeemed silently", async () => {
        const store = new MemoryTokenStore();
        await store.set(ACCOUNT, "stored-refresh-token");
        const { fetchImpl, calls } = stubTokenEndpoint([
            { body: { access_token: "access-1", refresh_token: "rotated-1", expires_in: 3600 } },
        ]);
        const provider = new DeviceCodeAuthProvider(CONFIG, store, { fetchImpl });
        assert.equal(await provider.getAccessToken(), "access-1");
        assert.equal(calls[0]?.form["grant_type"], "refresh_token");
        assert.equal(calls[0]?.form["refresh_token"], "stored-refresh-token");
        // Microsoft rotates refresh tokens; the new one must replace the old.
        assert.equal(await store.get(ACCOUNT), "rotated-1");
    });
    test("the cached token is reused until the 5-minute margin, then refreshed", async () => {
        const store = new MemoryTokenStore();
        await store.set(ACCOUNT, "rt");
        let now = 1_000_000;
        const { fetchImpl, calls } = stubTokenEndpoint([
            { body: { access_token: "access-1", refresh_token: "rt2", expires_in: 3600 } },
            { body: { access_token: "access-2", refresh_token: "rt3", expires_in: 3600 } },
        ]);
        const provider = new DeviceCodeAuthProvider(CONFIG, store, { fetchImpl, now: () => now });
        assert.equal(await provider.getAccessToken(), "access-1");
        assert.equal(calls.length, 1);
        // Well inside the token's life: no second call.
        now += 3600_000 - REFRESH_MARGIN_MS - 1000;
        assert.equal(await provider.getAccessToken(), "access-1");
        assert.equal(calls.length, 1);
        // Inside the margin, still valid: refresh proactively rather than wait for a 401.
        now += 2000;
        assert.equal(await provider.getAccessToken(), "access-2");
        assert.equal(calls.length, 2);
    });
    test("concurrent callers share one refresh, not one each", async () => {
        const store = new MemoryTokenStore();
        await store.set(ACCOUNT, "rt");
        const { fetchImpl, calls } = stubTokenEndpoint([
            { body: { access_token: "access-1", expires_in: 3600 } },
        ]);
        const provider = new DeviceCodeAuthProvider(CONFIG, store, { fetchImpl });
        const tokens = await Promise.all([
            provider.getAccessToken(),
            provider.getAccessToken(),
            provider.getAccessToken(),
        ]);
        assert.deepEqual(tokens, ["access-1", "access-1", "access-1"]);
        assert.equal(calls.length, 1);
    });
    test("a rejected refresh token is discarded and interactive sign-in demanded", async () => {
        const store = new MemoryTokenStore();
        await store.set(ACCOUNT, "revoked");
        const { fetchImpl } = stubTokenEndpoint([
            {
                status: 400,
                body: { error: "invalid_grant", error_description: "AADSTS700082: token expired\r\nTrace ID: x" },
            },
        ]);
        const provider = new DeviceCodeAuthProvider(CONFIG, store, { fetchImpl });
        const error = await provider.getAccessToken().then(() => null).catch((e) => e);
        assert.ok(error instanceof InteractiveSignInRequired);
        assert.equal(await store.get(ACCOUNT), null, "a dead refresh token must not be kept");
    });
    test("an unexpected token-endpoint error surfaces as AuthError, not a hang", async () => {
        const store = new MemoryTokenStore();
        await store.set(ACCOUNT, "rt");
        const { fetchImpl } = stubTokenEndpoint([
            { status: 500, body: { error: "temporarily_unavailable", error_description: "try later" } },
        ]);
        const provider = new DeviceCodeAuthProvider(CONFIG, store, { fetchImpl });
        const error = await provider.getAccessToken().then(() => null).catch((e) => e);
        assert.ok(error instanceof AuthError);
        assert.ok(!(error instanceof InteractiveSignInRequired));
    });
});
describe("DeviceCodeAuthProvider — device code flow", () => {
    test("returns the user code, then polls through pending and slow_down to success", async () => {
        const store = new MemoryTokenStore();
        const waits = [];
        let call = 0;
        const fetchImpl = async (url, init) => {
            const form = Object.fromEntries(new URLSearchParams(String(init?.body ?? "")));
            call += 1;
            if (url.endsWith("/devicecode")) {
                assert.equal(form["scope"], CONFIG.scopes.join(" "));
                return new Response(JSON.stringify({
                    device_code: "DEV-CODE",
                    user_code: "ABCD-EFGH",
                    verification_uri: "https://microsoft.com/devicelogin",
                    expires_in: 900,
                    interval: 5,
                    message: "Go to https://microsoft.com/devicelogin and enter ABCD-EFGH.",
                }), { status: 200 });
            }
            assert.equal(form["grant_type"], "urn:ietf:params:oauth:grant-type:device_code");
            if (call === 2)
                return new Response(JSON.stringify({ error: "authorization_pending" }), { status: 400 });
            if (call === 3)
                return new Response(JSON.stringify({ error: "slow_down" }), { status: 400 });
            return new Response(JSON.stringify({
                access_token: "access-final",
                refresh_token: "refresh-final",
                expires_in: 3600,
                // { "preferred_username": "dana@contoso.com" }
                id_token: `x.${Buffer.from('{"preferred_username":"dana@contoso.com"}').toString("base64url")}.y`,
            }), { status: 200 });
        };
        const provider = new DeviceCodeAuthProvider(CONFIG, store, {
            fetchImpl,
            sleep: async (ms) => { waits.push(ms); },
        });
        const prompt = await provider.beginSignIn();
        assert.equal(prompt.userCode, "ABCD-EFGH");
        assert.equal(prompt.verificationUri, "https://microsoft.com/devicelogin");
        const status = await provider.awaitSignIn(5000);
        assert.equal(status.signedIn, true);
        assert.equal(status.account, "dana@contoso.com");
        assert.equal(await store.get(ACCOUNT), "refresh-final");
        assert.equal(await provider.getAccessToken(), "access-final");
        // slow_down must increase the interval, per RFC 8628.
        assert.deepEqual(waits, [5000, 5000, 10000]);
    });
    test("a declined sign-in fails with a readable reason", async () => {
        const fetchImpl = async (url) => {
            if (url.endsWith("/devicecode")) {
                return new Response(JSON.stringify({
                    device_code: "D",
                    user_code: "U",
                    verification_uri: "https://microsoft.com/devicelogin",
                    expires_in: 900,
                }), { status: 200 });
            }
            return new Response(JSON.stringify({ error: "authorization_declined" }), { status: 400 });
        };
        const provider = new DeviceCodeAuthProvider(CONFIG, new MemoryTokenStore(), {
            fetchImpl,
            sleep: async () => undefined,
        });
        await provider.beginSignIn();
        const error = await provider.awaitSignIn(5000).then(() => null).catch((e) => e);
        assert.ok(error instanceof AuthError);
        assert.match(error.message, /declined/);
    });
    test("signing out clears the store", async () => {
        const store = new MemoryTokenStore();
        await store.set(ACCOUNT, "rt");
        const provider = new DeviceCodeAuthProvider(CONFIG, store, { fetchImpl: async () => new Response("{}") });
        await provider.signOut();
        assert.equal(await store.get(ACCOUNT), null);
        assert.equal((await provider.status()).signedIn, false);
    });
});
describe("ClientCredentialsAuthProvider — declared, not implemented", () => {
    const provider = new ClientCredentialsAuthProvider({ ...CONFIG, authMode: "client-credentials" }, new MemoryTokenStore());
    test("satisfies the AuthProvider interface", () => {
        assert.equal(typeof provider.getAccessToken, "function");
        assert.equal(provider.mode, "client-credentials");
    });
    test("fails loudly instead of pretending to work", async () => {
        const error = await provider.getAccessToken().then(() => null).catch((e) => e);
        assert.ok(error instanceof NotImplementedError);
        assert.match(error.toToolMessage(), /not implemented/i);
        assert.match(error.toToolMessage(), /device-code/);
    });
    test("status says so, so a caller is never misled about being signed in", async () => {
        const status = await provider.status();
        assert.equal(status.signedIn, false);
        assert.match(status.detail ?? "", /not implemented/);
        assert.equal(status.scopes[0], "https://graph.microsoft.com/.default");
    });
    test("app-only reads its credential from the keyring, not from config", () => {
        assert.match(provider.credentialAccount, /client-credential$/);
    });
});
describe("redaction", () => {
    test("bearer headers, JWTs and OAuth fields never survive", () => {
        const jwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from('{"a":1}').toString("base64url")}.signature`;
        assert.ok(!redact(`Authorization: Bearer ${jwt}`).includes(jwt));
        assert.ok(!redact(`{"refresh_token":"0.AXoAsecretvalue"}`).includes("secretvalue"));
        assert.ok(!redact(`access_token=abcdef123456`).includes("abcdef123456"));
    });
    test("ordinary text is left alone", () => {
        assert.equal(redact("Planner task 'Draft the SOW' updated."), "Planner task 'Draft the SOW' updated.");
    });
});
//# sourceMappingURL=auth.test.js.map