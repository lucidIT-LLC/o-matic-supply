import type { TokenStore } from "../types.js";
export { KeychainTokenStore } from "./keychain.js";
export { MemoryTokenStore } from "./memory.js";
/**
 * Pick the best available secret backend for this host.
 *
 * Only macOS is implemented. Elsewhere we degrade to memory and say so loudly
 * rather than silently persisting a refresh token to a file.
 */
export declare function createDefaultTokenStore(service: string): TokenStore;
