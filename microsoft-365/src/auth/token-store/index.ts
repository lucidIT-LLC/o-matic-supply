import { platform } from "node:os";

import { log } from "../../util/logger.js";
import type { TokenStore } from "../types.js";
import { KeychainTokenStore } from "./keychain.js";
import { MemoryTokenStore } from "./memory.js";

export { KeychainTokenStore } from "./keychain.js";
export { MemoryTokenStore } from "./memory.js";

/**
 * Pick the best available secret backend for this host.
 *
 * Only macOS is implemented. Elsewhere we degrade to memory and say so loudly
 * rather than silently persisting a refresh token to a file.
 */
export function createDefaultTokenStore(service: string): TokenStore {
  if (KeychainTokenStore.isSupported()) return new KeychainTokenStore(service);
  log.warn(
    `No OS keyring backend for platform "${platform()}"; refresh tokens will be held in memory only ` +
      `and sign-in will be required after every restart. Add a TokenStore implementation in src/auth/token-store/.`,
  );
  return new MemoryTokenStore();
}
