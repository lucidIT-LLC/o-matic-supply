#!/bin/sh
# launch.sh — the process every host spawns to run Team Assistant MCP.
#
# A manifest that declares `"command": "node"` works in every terminal-launched
# MCP host and fails in every GUI-launched one: a GUI app gets the minimal
# system PATH (/usr/bin:/bin:/usr/sbin:/sbin), so a bare interpreter name is
# unresolvable and the server is never spawned. The host then reports no
# tools, which is indistinguishable from a connector that is merely
# unconfigured. Same defect as o-matic-wordpress-factory's launcher
# (KB-0418/KB-0417); same fix, applied here so this plugin does not ship with
# it too.
#
# Usage from a manifest:
#   Claude (.mcp.json):
#     "command": "/bin/sh"
#     "args": ["${CLAUDE_PLUGIN_ROOT}/bin/launch.sh"]
#   Cursor (mcp.json) — Cursor expands CURSOR_PLUGIN_ROOT / CLAUDE_PLUGIN_ROOT,
#   NOT Agent Plugins ${PLUGIN_ROOT} (literal cwd -> spawn ENOENT):
#     "command": "${CURSOR_PLUGIN_ROOT}/bin/launch.sh"
#     "cwd": "${CURSOR_PLUGIN_ROOT}"

set -u

MIN_MAJOR=20

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1
PLUGIN_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd) || exit 1
SERVER_ENTRY="$PLUGIN_ROOT/dist/index.mjs"

usable_node() {
    _candidate=$1
    [ -n "$_candidate" ] || return 1
    [ -x "$_candidate" ] || return 1

    _ver=$("$_candidate" -v 2>/dev/null) || return 1
    case "$_ver" in
        v[0-9]*) ;;
        *) return 1 ;;
    esac

    _major=${_ver#v}
    _major=${_major%%.*}
    case "$_major" in
        ''|*[!0-9]*) return 1 ;;
    esac

    [ "$_major" -ge "$MIN_MAJOR" ]
}

NODE_BIN=""

if usable_node "${TEAM_ASSISTANT_NODE:-}"; then
    NODE_BIN=$TEAM_ASSISTANT_NODE
else
    _path_node=$(command -v node 2>/dev/null) || _path_node=""
    if usable_node "$_path_node"; then
        NODE_BIN=$_path_node
    else
        for _candidate in \
            /opt/homebrew/bin/node \
            /usr/local/bin/node \
            /usr/bin/node \
            "${HOME:-}/.local/bin/node" \
            "${HOME:-}/.volta/bin/node" \
            "${HOME:-}/.bun/bin/node" \
            "${HOME:-}"/.nvm/versions/node/*/bin/node \
            "${HOME:-}"/.fnm/node-versions/*/installation/bin/node \
            "${HOME:-}"/.asdf/installs/nodejs/*/bin/node \
            /snap/bin/node \
            /exec-daemon/node
        do
            if usable_node "$_candidate"; then
                NODE_BIN=$_candidate
                break
            fi
        done
    fi
fi

# A value the host left unexpanded ("${TEAM_ASSISTANT_TENANT_ID}") is unset.
# Passing it through makes the real server exit 78 before tools/list, and the
# chat shows no plugin at all.
configured_value() {
    _v=${1:-}
    [ -n "$_v" ] || return 1
    case "$_v" in
        *'${'*) return 1 ;;
    esac
    return 0
}

strip_placeholder() {
    _name=$1
    eval "_val=\${$_name:-}"
    case "$_val" in
        *'${'*) unset "$_name" ;;
    esac
}

config_file_has_ids() {
    _file=$1
    [ -f "$_file" ] || return 1
    grep -q '"tenantId"[[:space:]]*:[[:space:]]*"[^"][^"]*"' "$_file" || return 1
    grep -q '"clientId"[[:space:]]*:[[:space:]]*"[^"][^"]*"' "$_file" || return 1
    grep -q '"tenantId"[[:space:]]*:[[:space:]]*"\${' "$_file" && return 1
    grep -q '"clientId"[[:space:]]*:[[:space:]]*"\${' "$_file" && return 1
    return 0
}

enter_advisory() {
    OMATIC_TA_CAUSE=$1
    OMATIC_TA_REMEDY=$2
    export OMATIC_TA_CAUSE OMATIC_TA_REMEDY
    OMATIC_PLUGIN_VERSION=$(
        sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PLUGIN_ROOT/package.json" 2>/dev/null | head -1
    )
    export OMATIC_PLUGIN_VERSION="${OMATIC_PLUGIN_VERSION:-unknown}"
    exec /bin/sh "$PLUGIN_ROOT/bin/advisory-mcp.sh"
}

CONFIG_REMEDY="In Cursor, install this plugin at User scope so it loads in any chat or project. Open Customize, then Configure, and set TEAM_ASSISTANT_TENANT_ID to the Entra Directory (tenant) ID and TEAM_ASSISTANT_CLIENT_ID to the Application (client) ID. Those two values are not secrets. One user-level Configure applies to every chat. Start a new chat after saving. A project-scoped install only loads inside that one repo."

if [ -z "$NODE_BIN" ]; then
    enter_advisory \
        "no Node $MIN_MAJOR or newer runtime found on PATH or in any known install location" \
        "Install Node $MIN_MAJOR or newer, or set TEAM_ASSISTANT_NODE to the absolute path of a Node binary. $CONFIG_REMEDY"
fi

if [ ! -f "$SERVER_ENTRY" ]; then
    enter_advisory \
        "the prebuilt server bundle is missing" \
        "Restore dist/index.mjs with git checkout -- dist in the plugin directory, or rebuild with node scripts/sync-dist.mjs. $CONFIG_REMEDY"
fi

if [ "${TEAM_ASSISTANT_FORCE_ADVISORY:-0}" = "1" ]; then
    enter_advisory \
        "Entra directory tenant ID and application client ID are not set" \
        "$CONFIG_REMEDY"
fi

strip_placeholder TEAM_ASSISTANT_TENANT_ID
strip_placeholder TEAM_ASSISTANT_CLIENT_ID
strip_placeholder OMATIC_M365_TENANT_ID
strip_placeholder OMATIC_M365_CLIENT_ID

if configured_value "${TEAM_ASSISTANT_TENANT_ID:-${OMATIC_M365_TENANT_ID:-}}" \
    && configured_value "${TEAM_ASSISTANT_CLIENT_ID:-${OMATIC_M365_CLIENT_ID:-}}"; then
    exec "$NODE_BIN" "$SERVER_ENTRY" "$@"
fi

_config_file=${TEAM_ASSISTANT_CONFIG_FILE:-}
if [ -n "$_config_file" ] && config_file_has_ids "$_config_file"; then
    exec "$NODE_BIN" "$SERVER_ENTRY" "$@"
fi
for _config_file in \
    "$PWD/team-assistant.config.json" \
    "${HOME:-}/.config/team-assistant-mcp/config.json" \
    "$PWD/omatic-m365.config.json" \
    "${HOME:-}/.config/omatic-m365-mcp/config.json"
do
    if config_file_has_ids "$_config_file"; then
        exec "$NODE_BIN" "$SERVER_ENTRY" "$@"
    fi
done

enter_advisory \
    "Entra directory tenant ID and application client ID are not set" \
    "$CONFIG_REMEDY"
