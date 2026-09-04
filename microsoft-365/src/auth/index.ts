import type { ServerConfig } from "../config.js";
import { createDefaultTokenStore } from "./token-store/index.js";
import { ClientCredentialsAuthProvider } from "./client-credentials.js";
import { DeviceCodeAuthProvider } from "./device-code.js";
import type { IntrospectableAuthProvider, TokenStore } from "./types.js";

export * from "./types.js";
export { DeviceCodeAuthProvider } from "./device-code.js";
export { ClientCredentialsAuthProvider } from "./client-credentials.js";
export { KeychainTokenStore, MemoryTokenStore, createDefaultTokenStore } from "./token-store/index.js";

/** Build the auth provider named by config.authMode. */
export function createAuthProvider(
  config: ServerConfig,
  store: TokenStore = createDefaultTokenStore(config.tokenStoreService),
): IntrospectableAuthProvider {
  return config.authMode === "client-credentials"
    ? new ClientCredentialsAuthProvider(config, store)
    : new DeviceCodeAuthProvider(config, store);
}
