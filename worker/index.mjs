import { handle, isWorkerPath } from "./app.mjs";
// Written by tools/build-site.mjs: the script version, the key it is
// encrypted with and where its pieces are. Bundled into the Worker, never
// published.
import { BUILD } from "./generated/build.mjs";
import { sqlDatabase } from "./store.mjs";

/**
 * One Durable Object keeps every licence, order and setting in its SQLite
 * database, and answers all the Worker's addresses in order.
 */
export class MirrorAdsStore {
  constructor(state, env) {
    this.env = env;
    this.db = sqlDatabase(state.storage);
  }

  fetch(request) {
    return handle(request, this.env, BUILD, { db: this.db });
  }
}

export default {
  fetch(request, env) {
    if (!isWorkerPath(new URL(request.url).pathname))
      return env.ASSETS.fetch(request);
    return env.STORE.get(env.STORE.idFromName("main")).fetch(request);
  },
};
