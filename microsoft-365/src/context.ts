import { createAuthProvider } from "./auth/index.js";
import { createDefaultTokenStore } from "./auth/token-store/index.js";
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

export function createContext(config: ServerConfig, store?: TokenStore): ServerContext {
  const tokenStore = store ?? createDefaultTokenStore(config.tokenStoreService);
  const auth = createAuthProvider(config, tokenStore);
  const graph = new GraphClient({ baseUrl: config.graphBaseUrl, auth });
  const users = new UserResolver(graph);

  return {
    config,
    auth,
    graph,
    users,
    planner: new PlannerApi(graph, users),
    teams: new TeamsApi(graph),
    sharepoint: new SharePointApi(graph),
    onenote: new OneNoteApi(graph),
  };
}
