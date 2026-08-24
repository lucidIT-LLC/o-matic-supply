#!/bin/sh
# omatic-wp-degraded-server.sh — the advisory-mode MCP server for the WordPress
# Factory connectors. Ported verbatim from omatic-server-connection 3.3.0; only
# the identity strings differ, so a fix in one is a one-line port to the other.
#
# Spawned by omatic-launch.sh only when no usable Node runtime could be found.
# It speaks just enough MCP over stdio to complete a handshake and publish one
# tool, so the host shows a server that is present and explains itself instead
# of a server that never started.
#
# Why this matters more than a stderr line: a host with zero tools looks exactly
# like a factory that failed to resolve, and KB-0417 documents a full session
# burned on that ambiguity — five hypotheses, three restarts, a proposed 93 MB
# download for a runtime that was already on the machine. One tool that names
# the cause ends that search before it starts.
#
# Deliberately dependency-free: POSIX sh, awk and sed only. A runtime probe that
# needed a runtime to run would have the same defect it is here to report.

set -u

PROTO_DEFAULT="2025-06-18"
KNOWN_PROTOCOLS="2025-11-25 2025-06-18 2025-03-26 2024-11-05 2024-10-07"

CONNECTOR=${OMATIC_WP_CONNECTOR:-wordpress}
CAUSE=${OMATIC_RUNTIME_ERROR:-"no Node runtime could be resolved"}
MIN_MAJOR=${OMATIC_MIN_NODE_MAJOR:-18}
# Supplied by the launcher, which reads it from package.json with sed. Never
# hardcode it here — a version literal in a fallback is a second source of truth
# that only announces itself once it is already wrong.
PLUGIN_VERSION=${OMATIC_PLUGIN_VERSION:-unknown}

# One sentence, naming the cause, reused verbatim everywhere this server speaks.
# No double quotes or backslashes: these strings are interpolated into JSON by
# hand, and an escaping bug here would break the very handshake that carries the
# diagnostic.
HEADLINE="The O-Matic $CONNECTOR connector is in advisory mode: $CAUSE, so no site tools are available in this session."

REMEDY="Fix: install Node $MIN_MAJOR or newer, or set OMATIC_NODE to an absolute path to a Node binary in the plugin manifest env block. A bare 'node' in a manifest does not work on GUI-launched hosts, which do not inherit your login shell PATH."

SKILLS_NOTE="The bundled skills (Brandy, Carver, Jo, Monet) still load and remain usable for planning and advice. They cannot read or write the live site until the runtime is resolved. Nothing has been changed on the site."

emit() {
    printf '%s\n' "$1"
}

# First occurrence only — awk match() is leftmost, so a nested id inside params
# cannot shadow the top-level request id.
json_id() {
    printf '%s' "$1" | awk 'match($0,/"id"[ \t]*:[ \t]*("[^"]*"|-?[0-9]+)/){
        s=substr($0,RSTART,RLENGTH); sub(/^"id"[ \t]*:[ \t]*/,"",s); print s; exit
    }'
}

json_string_field() {
    printf '%s' "$2" | awk -v key="$1" 'match($0,"\""key"\"[ \t]*:[ \t]*\"[^\"]*\""){
        s=substr($0,RSTART,RLENGTH); sub("^\""key"\"[ \t]*:[ \t]*\"","",s); sub(/"$/,"",s); print s; exit
    }'
}

negotiate_protocol() {
    _want=$1
    [ -n "$_want" ] || { printf '%s' "$PROTO_DEFAULT"; return; }
    for _known in $KNOWN_PROTOCOLS; do
        if [ "$_want" = "$_known" ]; then
            printf '%s' "$_want"
            return
        fi
    done
    printf '%s' "$PROTO_DEFAULT"
}

echo "[o-matic-wordpress-factory] advisory mode — $CAUSE" >&2

while IFS= read -r line; do
    case "$line" in
        *'"method"'*) ;;
        *) continue ;;
    esac

    id=$(json_id "$line")

    case "$line" in
        *'"method":"initialize"'*|*'"method": "initialize"'*)
            want=$(json_string_field protocolVersion "$line")
            proto=$(negotiate_protocol "$want")
            emit "{\"jsonrpc\":\"2.0\",\"id\":${id:-0},\"result\":{\"protocolVersion\":\"$proto\",\"capabilities\":{\"tools\":{}},\"serverInfo\":{\"name\":\"o-matic-wordpress-factory\",\"version\":\"$PLUGIN_VERSION-advisory\"},\"instructions\":\"$HEADLINE $SKILLS_NOTE $REMEDY\"}}"
            ;;

        *'"method":"tools/list"'*|*'"method": "tools/list"'*)
            emit "{\"jsonrpc\":\"2.0\",\"id\":${id:-0},\"result\":{\"tools\":[{\"name\":\"omatic_wp_runtime_status\",\"description\":\"$HEADLINE Call this tool for the exact cause and the fix.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{},\"additionalProperties\":false}}]}}"
            ;;

        *'"method":"tools/call"'*|*'"method": "tools/call"'*)
            tool=$(json_string_field name "$line")
            if [ "$tool" = "omatic_wp_runtime_status" ]; then
                emit "{\"jsonrpc\":\"2.0\",\"id\":${id:-0},\"result\":{\"isError\":false,\"content\":[{\"type\":\"text\",\"text\":\"$HEADLINE\n\nCause: $CAUSE\n\n$REMEDY\n\n$SKILLS_NOTE\n\nDiagnostic order (KB-0417): read the host log first, then confirm whether the interpreter resolves under a minimal PATH with: env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin node --version\"}]}}"
            else
                emit "{\"jsonrpc\":\"2.0\",\"id\":${id:-0},\"result\":{\"isError\":true,\"content\":[{\"type\":\"text\",\"text\":\"$HEADLINE The tool $tool needs the factory database and is unavailable until the runtime is resolved. $REMEDY\"}]}}"
            fi
            ;;

        *'"method":"ping"'*|*'"method": "ping"'*)
            emit "{\"jsonrpc\":\"2.0\",\"id\":${id:-0},\"result\":{}}"
            ;;

        *'"method":"notifications/'*)
            # Notifications carry no id and take no response.
            ;;

        *)
            # Only requests get an error; a notification with an unknown method
            # must stay silent or the host sees an unsolicited response.
            if [ -n "$id" ]; then
                emit "{\"jsonrpc\":\"2.0\",\"id\":$id,\"error\":{\"code\":-32601,\"message\":\"$HEADLINE This server is running without a Node runtime and implements only initialize, tools/list, tools/call and ping.\"}}"
            fi
            ;;
    esac
done

exit 0
