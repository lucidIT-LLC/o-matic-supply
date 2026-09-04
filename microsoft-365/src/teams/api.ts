import type { GraphClient } from "../graph/client.js";

export interface Team {
  id: string;
  displayName?: string;
  description?: string;
  isArchived?: boolean;
}

export interface Channel {
  id: string;
  displayName?: string;
  description?: string;
  membershipType?: string;
  webUrl?: string;
  createdDateTime?: string;
}

export interface ChatMessage {
  id: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  messageType?: string;
  subject?: string | null;
  importance?: string;
  webUrl?: string;
  from?: { user?: { id?: string; displayName?: string } | null; application?: { displayName?: string } | null };
  body?: { contentType?: string; content?: string };
  attachments?: Array<{ id?: string; name?: string; contentType?: string; contentUrl?: string }>;
  replyToId?: string | null;
}

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
  private readonly graph: GraphClient;

  constructor(graph: GraphClient) {
    this.graph = graph;
  }

  async listJoinedTeams(): Promise<Team[]> {
    return this.graph.getAll<Team>("/me/joinedTeams", {
      $select: ["id", "displayName", "description", "isArchived"],
    });
  }

  async listChannels(teamId: string): Promise<Channel[]> {
    return this.graph.getAll<Channel>(`/teams/${encodeURIComponent(teamId)}/channels`);
  }

  async listChannelMessages(
    teamId: string,
    channelId: string,
    options: { top?: number; maxItems?: number; includeReplies?: boolean } = {},
  ): Promise<ChatMessage[]> {
    const messages = await this.graph.getAll<ChatMessage>(
      `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`,
      { $top: options.top ?? 50 },
      { maxItems: options.maxItems ?? 50 },
    );
    if (!options.includeReplies) return messages;

    const withReplies: ChatMessage[] = [];
    for (const message of messages) {
      withReplies.push(message);
      const replies = await this.graph
        .getAll<ChatMessage>(
          `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(message.id)}/replies`,
          { $top: 50 },
          { maxItems: 100 },
        )
        .catch(() => []);
      withReplies.push(...replies);
    }
    return withReplies;
  }

  /**
   * Post a new message to a channel. `html` is passed to Graph as-is with
   * contentType html; Teams sanitises what it will not render.
   */
  async sendChannelMessage(
    teamId: string,
    channelId: string,
    content: string,
    options: { html?: boolean; subject?: string } = {},
  ): Promise<ChatMessage> {
    const response = await this.graph.request<ChatMessage>(
      `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`,
      {
        method: "POST",
        body: {
          ...(options.subject ? { subject: options.subject } : {}),
          body: { contentType: options.html ? "html" : "text", content },
        },
      },
    );
    if (!response.body) throw new Error("Teams accepted the post but returned no message.");
    return response.body;
  }

  /** Reply inside an existing message thread rather than starting a new one. */
  async replyToChannelMessage(
    teamId: string,
    channelId: string,
    messageId: string,
    content: string,
    options: { html?: boolean } = {},
  ): Promise<ChatMessage> {
    const response = await this.graph.request<ChatMessage>(
      `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/replies`,
      {
        method: "POST",
        body: { body: { contentType: options.html ? "html" : "text", content } },
      },
    );
    if (!response.body) throw new Error("Teams accepted the reply but returned no message.");
    return response.body;
  }
}
