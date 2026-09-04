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
#   "command": "/bin/sh"
#   "args": ["${PLUGIN_ROOT}/bin/launch.sh"]

set -u

MIN_MAJOR=20

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1
PLUGIN_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd) || exit 1
SERVER_ENTRY="$PLUGIN_ROOT/dist/src/index.js"

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
            /snap/bin/node
        do
            if usable_node "$_candidate"; then
                NODE_BIN=$_candidate
                break
            fi
        done
    fi
fi

if [ -z "$NODE_BIN" ]; then
    echo "[team-assistant-mcp] FATAL: no Node >= $MIN_MAJOR runtime found on PATH or in any known install location. Install Node $MIN_MAJOR+ and either put it on PATH or set TEAM_ASSISTANT_NODE to its full path." >&2
    exit 1
fi

if [ ! -f "$SERVER_ENTRY" ]; then
    echo "[team-assistant-mcp] FATAL: $SERVER_ENTRY is missing. Run 'npm install && npm run build' in $PLUGIN_ROOT." >&2
    exit 1
fi

exec "$NODE_BIN" "$SERVER_ENTRY" "$@"
