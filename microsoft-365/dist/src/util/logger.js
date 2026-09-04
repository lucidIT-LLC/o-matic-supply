import { redactUnknown } from "./redact.js";
const ORDER = { debug: 10, info: 20, warn: 30, error: 40 };
function configuredLevel() {
    const raw = (process.env.OMATIC_M365_LOG_LEVEL ?? "info").toLowerCase();
    return raw in ORDER ? raw : "info";
}
function emit(level, message, detail) {
    if (ORDER[level] < ORDER[configuredLevel()])
        return;
    const line = `[team-assistant-mcp] ${new Date().toISOString()} ${level.toUpperCase()} ${redactUnknown(message)}`;
    const suffix = detail === undefined ? "" : ` ${redactUnknown(detail)}`;
    process.stderr.write(`${line}${suffix}\n`);
}
export const log = {
    debug: (message, detail) => emit("debug", message, detail),
    info: (message, detail) => emit("info", message, detail),
    warn: (message, detail) => emit("warn", message, detail),
    error: (message, detail) => emit("error", message, detail),
};
//# sourceMappingURL=logger.js.map