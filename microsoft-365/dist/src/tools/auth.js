import { z } from "zod";
import { DeviceCodeAuthProvider } from "../auth/device-code.js";
import { M365Error } from "../errors.js";
import { runTool } from "./helpers.js";
export function registerAuthTools(server, ctx) {
    server.registerTool("m365_auth_status", {
        title: "Microsoft 365 auth status",
        description: "Report the current authentication state: mode, signed-in account, token expiry, where the refresh token is stored, and which scopes were requested. Call this first when a Graph call returns 401 or 403.",
        inputSchema: {},
        annotations: { readOnlyHint: true },
    }, async () => runTool("m365_auth_status", async () => {
        const status = await ctx.auth.status();
        return {
            ...status,
            tenantId: ctx.config.tenantId,
            clientId: ctx.config.clientId,
            graphBaseUrl: ctx.config.graphBaseUrl,
            configSources: ctx.config.sources,
        };
    }));
    server.registerTool("m365_sign_in", {
        title: "Sign in to Microsoft 365 (device code)",
        description: "Start the OAuth device-code flow and return the code and URL to give the user. Show them verbatim, wait for them to confirm, then retry the work. Optionally waits here for completion. The refresh token is stored in the OS keyring, so this is normally needed once per machine.",
        inputSchema: {
            waitSeconds: z
                .number()
                .int()
                .min(0)
                .max(600)
                .optional()
                .describe("Block for up to this many seconds waiting for the user to finish. Default 0 (return immediately)."),
        },
        annotations: { openWorldHint: true },
    }, async (args) => runTool("m365_sign_in", async () => {
        const provider = ctx.auth;
        if (!(provider instanceof DeviceCodeAuthProvider)) {
            throw new M365Error("AUTH_MODE", `Interactive sign-in does not apply in "${provider.mode}" mode.`, "Set OMATIC_M365_AUTH_MODE=device-code, or configure the app-only credential.");
        }
        const prompt = await provider.beginSignIn();
        if ((args.waitSeconds ?? 0) > 0) {
            const status = await provider.awaitSignIn((args.waitSeconds ?? 0) * 1000);
            return { signedIn: status.signedIn, account: status.account, prompt };
        }
        return {
            instruction: prompt.message,
            verificationUri: prompt.verificationUri,
            userCode: prompt.userCode,
            expiresAt: prompt.expiresAt,
            next: "Give the user the URL and code exactly as shown, then call m365_auth_status to confirm sign-in completed.",
        };
    }));
    server.registerTool("m365_sign_out", {
        title: "Sign out of Microsoft 365",
        description: "Drop the cached access token and delete the stored refresh token from the OS keyring. The next Graph call will require a new device-code sign-in.",
        inputSchema: {},
        annotations: { destructiveHint: true },
    }, async () => runTool("m365_sign_out", async () => {
        await ctx.auth.signOut();
        return { signedOut: true };
    }));
}
//# sourceMappingURL=auth.js.map