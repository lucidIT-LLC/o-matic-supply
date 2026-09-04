import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerConfig } from "./config.js";
import { type ServerContext } from "./context.js";
export declare const SERVER_NAME = "team-assistant-mcp";
export declare const SERVER_VERSION = "0.1.0";
export declare function createServer(config: ServerConfig): {
    server: McpServer;
    ctx: ServerContext;
};
