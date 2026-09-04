import { createAuthProvider } from "./auth/index.js";
import { createDefaultTokenStore } from "./auth/token-store/index.js";
import { GraphClient } from "./graph/client.js";
import { UserResolver } from "./graph/users.js";
import { OneNoteApi } from "./onenote/api.js";
import { PlannerApi } from "./planner/api.js";
import { SharePointApi } from "./sharepoint/api.js";
import { TeamsApi } from "./teams/api.js";
export function createContext(config, store) {
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
//# sourceMappingURL=context.js.map