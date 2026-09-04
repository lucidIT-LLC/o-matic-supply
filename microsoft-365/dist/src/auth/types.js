import { AuthError } from "../errors.js";
/**
 * Raised when a token cannot be obtained without a human completing the device
 * code flow. Distinct from a generic AuthError so tools can tell the caller to
 * run the sign-in tool instead of reporting a hard failure.
 */
export class InteractiveSignInRequired extends AuthError {
    constructor(reason) {
        super(`Interactive sign-in required: ${reason}`, `Call the m365_sign_in tool, give the user the code and URL it returns, and retry once they confirm they have signed in.`);
    }
}
/** Refresh this far before actual expiry rather than waiting for a 401. */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;
//# sourceMappingURL=types.js.map