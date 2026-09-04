import type { ServerConfig } from "../config.js";
import type { IntrospectableAuthProvider, TokenStore } from "./types.js";
export * from "./types.js";
export { DeviceCodeAuthProvider } from "./device-code.js";
export { ClientCredentialsAuthProvider } from "./client-credentials.js";
export { KeychainTokenStore, MemoryTokenStore, createDefaultTokenStore } from "./token-store/index.js";
/** Build the auth provider named by config.authMode. */
export declare function createAuthProvider(config: ServerConfig, store?: TokenStore): IntrospectableAuthProvider;
