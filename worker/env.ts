export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  ACCESS_TEAM_DOMAIN: string
  ACCESS_AUD: string
  /** רק ב-.dev.vars המקומי. אף פעם לא מוגדר בפרודקשן */
  DEV_BYPASS_AUTH?: string
  /** שליחת מייל דרך תיבת הדואר של שימי. מוגדרים כ-Secrets בלוח של Cloudflare */
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_USER?: string
  SMTP_PASS?: string
  /** כתובת השולח, אם שונה משם המשתמש */
  SMTP_FROM?: string
  /** off = בלי הצפנה. רק לבדיקות מקומיות */
  SMTP_TLS?: string
}
export type AppEnv = { Bindings: Env }
