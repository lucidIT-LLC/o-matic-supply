#!/bin/sh
# advisory-mcp.sh — stdio MCP that stays up when Team Assistant cannot load
# the real server. A host with zero tools looks the same as a plugin that was
# never installed. One tool that names the cause is how the plugin shows up
# in every chat until the operator finishes Configure.
#
# Spawned only by bin/launch.sh. Dependency-free: POSIX sh and awk.
# Strings interpolated into JSON must not contain double quotes or backslashes.

set -u

PROTO_DEFAULT="2025-06-18"
KNOWN_PROTOCOLS="2025-11-25 2025-06-18 2025-03-26 2024-11-05 2024-10-07"

CAUSE=${OMATIC_TA_CAUSE:-"Team Assistant could not start"}
REMEDY=${OMATIC_TA_REMEDY:-"Set TEAM_ASSISTANT_TENANT_ID and TEAM_ASSISTANT_CLIENT_ID on the plugin Configure page."}
PLUGIN_VERSION=${OMATIC_PLUGIN_VERSION:-unknown}

HEADLINE="Team Assistant is in advisory mode: $CAUSE."

emit() {
    printf '%s\n' "$1"
}

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

echo "[team-assistant-mcp] advisory mode — $CAUSE" >&2

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
            emit "{\"jsonrpc\":\"2.0\",\"id\":${id:-0},\"result\":{\"protocolVersion\":\"$proto\",\"capabilities\":{\"tools\":{}},\"serverInfo\":{\"name\":\"team-assistant\",\"version\":\"$PLUGIN_VERSION-advisory\"},\"instructions\":\"$HEADLINE $REMEDY\"}}"
            ;;

        *'"method":"tools/list"'*|*'"method": "tools/list"'*)
            emit "{\"jsonrpc\":\"2.0\",\"id\":${id:-0},\"result\":{\"tools\":[{\"name\":\"team_assistant_setup\",\"description\":\"$HEADLINE Call this tool for the exact cause and the fix. The 33 Planner, Teams, SharePoint and OneNote tools load after Configure.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{},\"additionalProperties\":false}}]}}"
            ;;

        *'"method":"tools/call"'*|*'"method": "tools/call"'*)
            emit "{\"jsonrpc\":\"2.0\",\"id\":${id:-0},\"result\":{\"isError\":false,\"content\":[{\"type\":\"text\",\"text\":\"$HEADLINE\n\n$REMEDY\"}]}}"
            ;;

        *'"method":"ping"'*|*'"method": "ping"'*)
            emit "{\"jsonrpc\":\"2.0\",\"id\":${id:-0},\"result\":{}}"
            ;;

        *'"method":"notifications/'*)
            ;;

        *)
            if [ -n "$id" ]; then
                emit "{\"jsonrpc\":\"2.0\",\"id\":$id,\"error\":{\"code\":-32601,\"message\":\"$HEADLINE This advisory server implements only initialize, tools/list, tools/call and ping.\"}}"
            fi
            ;;
    esac
done
