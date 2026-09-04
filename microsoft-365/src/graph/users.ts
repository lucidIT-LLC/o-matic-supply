import { M365Error } from "../errors.js";
import type { GraphClient } from "./client.js";

export interface DirectoryUser {
  id: string;
  displayName?: string;
  userPrincipalName?: string;
  mail?: string;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isGuid(value: string): boolean {
  return GUID.test(value.trim());
}

/** Escape a string for an OData string literal. */
export function odataString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Turns whatever a human typed into the user GUID that Planner assignments
 * actually require.
 *
 * This exists because Planner's `assignments` dictionary is keyed by object ID
 * and silently accepts nothing else. Callers reliably try to pass an email
 * address, so the tools accept one and resolve it here.
 */
export class UserResolver {
  private readonly graph: GraphClient;
  private readonly cache = new Map<string, DirectoryUser>();

  constructor(graph: GraphClient) {
    this.graph = graph;
  }

  private static readonly SELECT = ["id", "displayName", "userPrincipalName", "mail"];

  /** The signed-in user. */
  async me(): Promise<DirectoryUser> {
    return this.graph.get<DirectoryUser>("/me", { $select: UserResolver.SELECT });
  }

  /**
   * Resolve one identifier: a GUID (returned as-is), a UPN/email, or a display
   * name. Throws a clear error listing candidates when a name is ambiguous.
   */
  async resolve(identifier: string): Promise<DirectoryUser> {
    const key = identifier.trim().toLowerCase();
    if (key === "") {
      throw new M365Error("USER_LOOKUP", "An empty string is not a user identifier.");
    }
    const cached = this.cache.get(key);
    if (cached) return cached;

    if (key === "me" || key === "@me") return this.remember(key, await this.me());
    if (isGuid(key)) {
      const user: DirectoryUser = { id: identifier.trim() };
      return this.remember(key, user);
    }

    const matches = key.includes("@")
      ? await this.byUpnOrMail(identifier.trim())
      : await this.byDisplayName(identifier.trim());

    if (matches.length === 0) {
      throw new M365Error(
        "USER_LOOKUP",
        `No directory user matches "${identifier}".`,
        `Pass the user's UPN (user@contoso.com) or object ID. Guest accounts often have a UPN like user_contoso.com#EXT#@tenant.onmicrosoft.com.`,
      );
    }
    if (matches.length > 1) {
      const list = matches
        .slice(0, 10)
        .map((m) => `  ${m.displayName ?? "(no name)"} — ${m.userPrincipalName ?? m.mail ?? m.id} — ${m.id}`)
        .join("\n");
      throw new M365Error(
        "USER_LOOKUP_AMBIGUOUS",
        `"${identifier}" matches ${matches.length} directory users.`,
        `Pass a UPN or object ID instead. Candidates:\n${list}`,
      );
    }
    return this.remember(key, matches[0] as DirectoryUser);
  }

  /** Resolve a list, preserving order and de-duplicating by GUID. */
  async resolveMany(identifiers: string[]): Promise<DirectoryUser[]> {
    const out: DirectoryUser[] = [];
    const seen = new Set<string>();
    for (const identifier of identifiers) {
      const user = await this.resolve(identifier);
      if (seen.has(user.id)) continue;
      seen.add(user.id);
      out.push(user);
    }
    return out;
  }

  /** Best-effort GUID -> display name, for rendering assignments and comments. */
  async describe(id: string): Promise<DirectoryUser> {
    const key = id.toLowerCase();
    const cached = this.cache.get(key);
    if (cached?.displayName) return cached;
    try {
      const user = await this.graph.get<DirectoryUser>(`/users/${encodeURIComponent(id)}`, {
        $select: UserResolver.SELECT,
      });
      return this.remember(key, user);
    } catch {
      return { id };
    }
  }

  async search(term: string, limit = 15): Promise<DirectoryUser[]> {
    const matches = term.includes("@")
      ? await this.byUpnOrMail(term)
      : await this.byDisplayName(term, limit);
    return matches.slice(0, limit);
  }

  private async byUpnOrMail(value: string): Promise<DirectoryUser[]> {
    try {
      const direct = await this.graph.get<DirectoryUser>(`/users/${encodeURIComponent(value)}`, {
        $select: UserResolver.SELECT,
      });
      if (direct?.id) return [direct];
    } catch {
      // Falls through to a filter query: guests and mail-only aliases are not
      // addressable by /users/{upn}.
    }
    const literal = odataString(value);
    return this.graph.getAll<DirectoryUser>("/users", {
      $select: UserResolver.SELECT,
      $filter: `mail eq ${literal} or userPrincipalName eq ${literal} or proxyAddresses/any(p:p eq 'SMTP:${value.replace(/'/g, "''")}')`,
      $top: 10,
    });
  }

  private async byDisplayName(value: string, limit = 15): Promise<DirectoryUser[]> {
    const literal = odataString(value);
    const exact = await this.graph.getAll<DirectoryUser>("/users", {
      $select: UserResolver.SELECT,
      $filter: `displayName eq ${literal}`,
      $top: limit,
    });
    if (exact.length > 0) return exact;
    return this.graph.getAll<DirectoryUser>("/users", {
      $select: UserResolver.SELECT,
      $filter: `startswith(displayName,${literal})`,
      $top: limit,
    });
  }

  private remember(key: string, user: DirectoryUser): DirectoryUser {
    this.cache.set(key, user);
    this.cache.set(user.id.toLowerCase(), user);
    if (user.userPrincipalName) this.cache.set(user.userPrincipalName.toLowerCase(), user);
    if (user.mail) this.cache.set(user.mail.toLowerCase(), user);
    return user;
  }
}
