#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import { M365Error } from "./errors.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";
import { initAudit } from "./util/audit.js";
import { log } from "./util/logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  initAudit();
  const { server } = createServer(config);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log.info(
    `${SERVER_NAME} ${SERVER_VERSION} ready on stdio — tenant ${config.tenantId}, auth mode ${config.authMode}.`,
  );
}

main().catch((error: unknown) => {
  // Config failures are the common case and deserve a readable message rather
  // than a stack trace: the MCP host shows stderr to the operator.
  if (error instanceof M365Error) {
    process.stderr.write(`\n${SERVER_NAME}: ${error.toToolMessage()}\n\n`);
    process.exit(78); // EX_CONFIG
  }
  process.stderr.write(`\n${SERVER_NAME}: fatal: ${(error as Error).stack ?? String(error)}\n\n`);
  process.exit(1);
});
