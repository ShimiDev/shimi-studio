export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  ACCESS_TEAM_DOMAIN: string
  ACCESS_AUD: string
  /** רק ב-.dev.vars המקומי. אף פעם לא מוגדר בפרודקשן */
  DEV_BYPASS_AUTH?: string
}
export type AppEnv = { Bindings: Env }
