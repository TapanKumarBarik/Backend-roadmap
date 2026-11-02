// What the Worker receives on `context.env`: the D1 binding and variables from wrangler.jsonc, and the secrets
// listed in .dev.vars.example (set with `wrangler pages secret put` in production).

export interface Bindings {
  DB: D1Database;
  ADMIN_EMAIL: string;
  SITE_ORIGINS: string;
  /** Older single-origin spelling of SITE_ORIGINS, still read as a fallback. */
  SITE_ORIGIN?: string;
  SESSION_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  IMAGES_CONTAINER_SAS: string;
  FEED_CONTAINER_SAS: string;
  BACKUPS_CONTAINER_SAS: string;
  GITHUB_PAT: string;
  /** The writing assistant's two possible sources (api/lib/assistant/provider.js): neither is needed. */
  AI?: { run(model: string, input: unknown): Promise<any> };
  ANTHROPIC_API_KEY?: string;
  /** "anthropic" to prefer it when both sources are set up. */
  ASSISTANT_PROVIDER?: string;
}

export type AppEnv = { Bindings: Bindings };
