import { z } from "zod";
import { runTool } from "../tools/helpers.js";
export function registerTeamsTools(server, ctx) {
    const { teams } = ctx;
    server.registerTool("teams_list_joined_teams", {
        title: "List joined Teams",
        description: "List the Teams the signed-in user is a member of. A Team's id is also the Microsoft 365 group id, so it can be passed to planner_list_plans as groupId.",
        inputSchema: {
            includeArchived: z.boolean().optional().describe("Include archived teams. Default false."),
        },
        annotations: { readOnlyHint: true },
    }, async (args) => runTool("teams_list_joined_teams", async () => {
        const all = await teams.listJoinedTeams();
        const filtered = args.includeArchived ? all : all.filter((t) => !t.isArchived);
        return {
            count: filtered.length,
            teams: filtered,
            note: "A team's id doubles as its Microsoft 365 group id — use it as groupId in planner_list_plans.",
        };
    }));
    server.registerTool("teams_list_channels", {
        title: "List Teams channels",
        description: "List the channels of a team.",
        inputSchema: { teamId: z.string().describe("Team (group) ID.") },
        annotations: { readOnlyHint: true },
    }, async (args) => runTool("teams_list_channels", async () => {
        const channels = await teams.listChannels(args.teamId);
        return { teamId: args.teamId, count: channels.length, channels };
    }));
    server.registerTool("teams_list_channel_messages", {
        title: "Read Teams channel messages",
        description: "Read recent messages in a channel. Read only — this server does not post to Teams. Requires the ChannelMessage.Read.All permission, which many tenants restrict.",
        inputSchema: {
            teamId: z.string().describe("Team (group) ID."),
            channelId: z.string().describe("Channel ID."),
            limit: z.number().int().min(1).max(200).optional().describe("Maximum messages. Default 50."),
            includeReplies: z
                .boolean()
                .optional()
                .describe("Also fetch each message's replies. Costs one call per message."),
        },
        annotations: { readOnlyHint: true },
    }, async (args) => runTool("teams_list_channel_messages", async () => {
        const messages = await teams.listChannelMessages(args.teamId, args.channelId, {
            maxItems: args.limit ?? 50,
            includeReplies: args.includeReplies ?? false,
        });
        return {
            teamId: args.teamId,
            channelId: args.channelId,
            count: messages.length,
            messages: messages.map((m) => ({
                id: m.id,
                createdDateTime: m.createdDateTime,
                from: m.from?.user?.displayName ?? m.from?.application?.displayName ?? null,
                fromId: m.from?.user?.id ?? null,
                subject: m.subject,
                contentType: m.body?.contentType,
                content: m.body?.content,
                replyToId: m.replyToId,
                webUrl: m.webUrl,
            })),
        };
    }));
    server.registerTool("teams_send_channel_message", {
        title: "Post a Teams channel message",
        description: "Post a NEW message to a Teams channel. Visible to everyone in the team and not quietly undoable, so `confirm` must be true — this is a deliberate gate, not a formality. To add to an existing thread use teams_reply_to_message instead of starting a new one. Pass html:true for formatted content (headings, lists, tables); Teams sanitises what it will not render.",
        inputSchema: {
            teamId: z.string().describe("Team (group) ID."),
            channelId: z.string().describe("Channel ID."),
            content: z.string().min(1).describe("Message body. Plain text unless html is true."),
            html: z.boolean().optional().describe("Treat content as HTML. Default false."),
            subject: z.string().optional().describe("Optional message subject, shown as a title."),
            confirm: z
                .boolean()
                .describe("Must be true. Posting is visible to the whole team and cannot be quietly undone."),
        },
        annotations: { readOnlyHint: false, openWorldHint: true },
    }, async (args) => runTool("teams_send_channel_message", async () => {
        if (args.confirm !== true) {
            throw new Error("Refused: posting to a channel needs confirm=true. The message would be visible to everyone in the team.");
        }
        const message = await teams.sendChannelMessage(args.teamId, args.channelId, args.content, {
            html: args.html,
            subject: args.subject,
        });
        return {
            posted: true,
            messageId: message.id,
            webUrl: message.webUrl,
            createdDateTime: message.createdDateTime,
            note: "Posted as the signed-in user. Reply into this thread with teams_reply_to_message and this messageId.",
        };
    }, args));
    server.registerTool("teams_reply_to_message", {
        title: "Reply to a Teams channel message",
        description: "Reply inside an existing channel message thread. Prefer this over teams_send_channel_message when continuing a conversation — a new top-level post fragments the thread. Requires confirm=true.",
        inputSchema: {
            teamId: z.string().describe("Team (group) ID."),
            channelId: z.string().describe("Channel ID."),
            messageId: z.string().describe("The id of the message to reply to (from teams_list_channel_messages)."),
            content: z.string().min(1).describe("Reply body. Plain text unless html is true."),
            html: z.boolean().optional().describe("Treat content as HTML. Default false."),
            confirm: z.boolean().describe("Must be true. The reply is visible to everyone in the team."),
        },
        annotations: { readOnlyHint: false, openWorldHint: true },
    }, async (args) => runTool("teams_reply_to_message", async () => {
        if (args.confirm !== true) {
            throw new Error("Refused: replying in a channel needs confirm=true.");
        }
        const message = await teams.replyToChannelMessage(args.teamId, args.channelId, args.messageId, args.content, { html: args.html });
        return { posted: true, messageId: message.id, replyToId: args.messageId, webUrl: message.webUrl };
    }, args));
}
//# sourceMappingURL=tools.js.map