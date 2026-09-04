import type { IntrospectableAuthProvider, TokenStore } from "./auth/types.js";
import type { ServerConfig } from "./config.js";
import { GraphClient } from "./graph/client.js";
import { UserResolver } from "./graph/users.js";
import { OneNoteApi } from "./onenote/api.js";
import { PlannerApi } from "./planner/api.js";
import { SharePointApi } from "./sharepoint/api.js";
import { TeamsApi } from "./teams/api.js";
/**
 * Everything the tool layer needs, wired once at start-up.
 *
 * Deliberately no Dataverse / Premium Planner ("Project") here. That is a
 * separate plugin by design (operator decision, task #484 / decision #402) —
 * a different auth audience, a different admin-consent story, and a
 * different backend entirely. Keeping this server to Graph-only Planner,
 * Teams, SharePoint and OneNote is what keeps it simple.
 */
export interface ServerContext {
    config: ServerConfig;
    auth: IntrospectableAuthProvider;
    graph: GraphClient;
    users: UserResolver;
    planner: PlannerApi;
    teams: TeamsApi;
    sharepoint: SharePointApi;
    onenote: OneNoteApi;
}
export declare function createContext(config: ServerConfig, store?: TokenStore): ServerContext;
