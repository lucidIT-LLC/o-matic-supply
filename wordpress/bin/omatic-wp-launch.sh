#!/bin/sh
# omatic-wp-launch.sh — the process the host spawns for both WordPress Factory
# connectors. Ported from omatic-server-connection 3.3.0, same defect, same fix.
#
# A manifest that declares `"command": "node"` works in every terminal-launched
# MCP host and fails in every GUI-launched one: a GUI app gets the minimal system
# PATH (/usr/bin:/bin:/usr/sbin:/sbin), so a bare interpreter name is
# unresolvable and the server is never spawned. The host then reports no tools,
# which is indistinguishable from a connector that is merely unconfigured
# (KB-0418 defect A, KB-0417).
#
# Usage from a manifest:
#   "command": "/bin/sh"
#   "args": ["${CLAUDE_PLUGIN_ROOT}/bin/omatic-wp-launch.sh", "server/index.mjs", "wordpress"]
#
# $1 = server entry, relative to the plugin root
# $2 = connector label, used only in the advisory message

set -u

MIN_MAJOR=18

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1
PLUGIN_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd) || exit 1

ENTRY_REL=${1:-server/index.mjs}
CONNECTOR=${2:-wordpress}
shift 2 2>/dev/null || true

SERVER_ENTRY="$PLUGIN_ROOT/$ENTRY_REL"
DEGRADED="$SCRIPT_DIR/omatic-wp-degraded-server.sh"

found_but_old=""

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

    if [ "$_major" -lt "$MIN_MAJOR" ]; then
        found_but_old="$_candidate ($_ver)"
        return 1
    fi
    return 0
}

NODE_BIN=""

# Same test hook as the server connector: advisory mode cannot be exercised on a
# machine where the runtime works, so without a forced path it would ship
# untested — the failure class rule #284 exists to prevent.
if [ "${OMATIC_FORCE_NO_RUNTIME:-0}" = "1" ]; then
    found_but_old=""
elif usable_node "${OMATIC_NODE:-}"; then
    NODE_BIN=$OMATIC_NODE
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
            "${HOME:-}"/Library/Caches/*/node \
            /snap/bin/node
        do
            if usable_node "$_candidate"; then
                NODE_BIN=$_candidate
                break
            fi
        done
    fi
fi

if [ -n "$NODE_BIN" ]; then
    OMATIC_RESOLVED_NODE=$NODE_BIN
    export OMATIC_RESOLVED_NODE
    exec "$NODE_BIN" "$SERVER_ENTRY" "$@"
fi

if [ -n "$found_but_old" ]; then
    OMATIC_RUNTIME_ERROR="found Node $found_but_old but this connector requires Node >= $MIN_MAJOR"
else
    OMATIC_RUNTIME_ERROR="no Node runtime found on PATH or in any known install location"
fi
export OMATIC_RUNTIME_ERROR
export OMATIC_MIN_NODE_MAJOR="$MIN_MAJOR"
export OMATIC_WP_CONNECTOR="$CONNECTOR"

OMATIC_PLUGIN_VERSION=$(
    sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PLUGIN_ROOT/package.json" 2>/dev/null | head -1
)
export OMATIC_PLUGIN_VERSION="${OMATIC_PLUGIN_VERSION:-unknown}"

if [ -r "$DEGRADED" ]; then
    exec /bin/sh "$DEGRADED"
fi

echo "[o-matic-wordpress-factory/$CONNECTOR] FATAL: $OMATIC_RUNTIME_ERROR, and the degraded server at $DEGRADED is missing." >&2
exit 1
