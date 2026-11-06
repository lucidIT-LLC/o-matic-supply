---
name: start-factory
description: Start or restart an o-MATIC factory, reconnect the o-MATIC Server MCP tools, check startup readiness, or recover after SSO/tool discovery changes. Use before factory work in a new conversation whenever this skill is available.
---

# Start an o-MATIC factory

Use the installed o-MATIC Server MCP connection. Do not infer factory identity,
grants, readiness, or governance from local files or cached tool lists.

1. If the Server connection is missing, disconnected, or its tools are stale,
   have the user reconnect the plugin and complete the host's OAuth/SSO flow.
   After a grant or authentication change, refresh or rediscover the MCP tools.
2. Call the Server's `startup` tool first. Use the host's stable conversation ID
   as `conversation_key` when available. Otherwise create one unique key once in
   this conversation, keep it in the conversation context, and reuse it for
   later kernel operations. Never share a key across chats. If this host cannot
   preserve a key, call without one and report the limitation from the card; do
   not claim that kernel continuity is established.
3. If startup returns several grants and asks for a factory, select by the
   returned connection's `database` field and pass its returned `name` exactly.
   For the Foundry database, match `database: o-matic`; do not guess a display
   name or use the MCP registration alias as a factory grant.
4. Read the returned `state` first. Render the Server's startup card without
   recomputing readiness. If it is `BLOCKED`, stop factory-dependent work. If it
   is `DEGRADED`, report the returned reason and proceed only within its limits.
5. Use the returned Server tools for retrieval, governance, work, and optional
   capabilities. Use `search` for governed retrieval; do not copy Policies,
   SOPs, roster, tasks, session state, or memory into plugin files.
6. After a tool list changes, reconnect/discover the Server tools before calling
   newly added tools. A stale tool list is not evidence that the Server lacks a
   capability.

## Limits

Installing this plugin connects a host to the Server; it does not create a
factory grant, guarantee that the host runs this skill, or make startup
automatic. Hosts without plugin skills need their own startup instructions.
The Server remains the authority for SSO validation, grants, governance, and
audit. Report a failed or unavailable startup plainly; never substitute local
files, a static bearer token, or another database connection.
