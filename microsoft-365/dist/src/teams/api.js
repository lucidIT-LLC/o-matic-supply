/**
 * Teams: read, plus deliberately-gated posting.
 *
 * Posting to a channel is a different risk class from moving a card on a board
 * — it is visible to everyone in the team and cannot be quietly undone. That is
 * why it stayed out of this file until it was asked for explicitly (operator
 * decision, 2026-08-25) rather than arriving by accident alongside a read tool.
 *
 * The gate survives that decision: every send requires an explicit `confirm`
 * from the caller, and the tools carry no readOnlyHint, so a host that prompts
 * on write still prompts. The `ChannelMessage.ReadWrite` scope was already
 * granted; what was missing was the deliberate choice to use it.
 */
export class TeamsApi {
    graph;
    constructor(graph) {
        this.graph = graph;
    }
    async listJoinedTeams() {
        return this.graph.getAll("/me/joinedTeams", {
            $select: ["id", "displayName", "description", "isArchived"],
        });
    }
    async listChannels(teamId) {
        return this.graph.getAll(`/teams/${encodeURIComponent(teamId)}/channels`);
    }
    async listChannelMessages(teamId, channelId, options = {}) {
        const messages = await this.graph.getAll(`/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`, { $top: options.top ?? 50 }, { maxItems: options.maxItems ?? 50 });
        if (!options.includeReplies)
            return messages;
        const withReplies = [];
        for (const message of messages) {
            withReplies.push(message);
            const replies = await this.graph
                .getAll(`/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(message.id)}/replies`, { $top: 50 }, { maxItems: 100 })
                .catch(() => []);
            withReplies.push(...replies);
        }
        return withReplies;
    }
    /**
     * Post a new message to a channel. `html` is passed to Graph as-is with
     * contentType html; Teams sanitises what it will not render.
     */
    async sendChannelMessage(teamId, channelId, content, options = {}) {
        const response = await this.graph.request(`/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`, {
            method: "POST",
            body: {
                ...(options.subject ? { subject: options.subject } : {}),
                body: { contentType: options.html ? "html" : "text", content },
            },
        });
        if (!response.body)
            throw new Error("Teams accepted the post but returned no message.");
        return response.body;
    }
    /** Reply inside an existing message thread rather than starting a new one. */
    async replyToChannelMessage(teamId, channelId, messageId, content, options = {}) {
        const response = await this.graph.request(`/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/replies`, {
            method: "POST",
            body: { body: { contentType: options.html ? "html" : "text", content } },
        });
        if (!response.body)
            throw new Error("Teams accepted the reply but returned no message.");
        return response.body;
    }
}
//# sourceMappingURL=api.js.map