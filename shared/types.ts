// טיפוסים משותפים לשרת ולממשק. כסף תמיד באגורות (מספר שלם).

export type ClientKind = 'artist' | 'band' | 'choir' | 'podcast' | 'other'
export type WorkKind = 'recording' | 'mix' | 'master' | 'edit' | 'production'
export type BillingMode = 'hourly' | 'per_song' | 'fixed'
export type PayMethod = 'cash' | 'bit' | 'transfer' | 'credit' | 'check' | 'other'
export type ExpenseCategory = 'equipment' | 'software' | 'rent' | 'utilities' | 'other'

export interface Client {
  id: string
  name: string
  kind: ClientKind
  is_group: 0 | 1
  phone: string | null
  email: string | null
  color_a: string
  color_b: string
  hourly_rate: number | null
  notes: string | null
  created_at: string
  archived_at: string | null
}

/** לקוח ברשימה, עם נתונים מחושבים */
export interface ClientSummary extends Client {
  balance: number          // חיובים פחות תשלומים
  seconds: number          // סך זמן עבודה שנרשם
  last_session: string | null
  next_appt: string | null
  today: 0 | 1             // יש תור היום
  project_title: string | null
}

export interface Project {
  id: string
  client_id: string
  title: string
  billing_mode: BillingMode | null
  unit_price: number | null
  quote_amount: number | null
  quoted_hours: number | null
  status: 'active' | 'done'
  created_at: string
}

export interface TimeEntry {
  id: string
  client_id: string | null
  project_id: string | null
  kind: WorkKind
  is_client_present: 0 | 1
  started_at: string
  ended_at: string | null
  paused_at: string | null
  paused_seconds: number
  source: 'clock' | 'manual'
  charge_id: string | null
  notes: string | null
}

/** השעון שרץ עכשיו, עם שם הלקוח לנוחות */
export interface RunningClock extends TimeEntry {
  client_name: string | null
  color_a: string | null
  color_b: string | null
  is_group: 0 | 1 | null
}

export interface Appointment {
  id: string
  client_id: string | null
  project_id: string | null
  title: string | null
  kind: string
  starts_at: string
  ends_at: string
  status: 'scheduled' | 'done' | 'cancelled'
  notes: string | null
  client_name?: string | null
  color_a?: string | null
  client_email?: string | null
  invite_sent_at?: string | null
  invite_email?: string | null
  reminder_sent_at?: string | null
}

export type ProductUnit = 'hour' | 'song' | 'project' | 'day' | 'unit'
export const PRODUCT_UNITS: Record<ProductUnit, { label: string; per: string }> = {
  hour: { label: 'לשעה', per: 'שעות' }, song: { label: 'לשיר', per: 'שירים' }, project: { label: 'לפרויקט', per: 'פרויקטים' },
  day: { label: 'ליום', per: 'ימים' }, unit: { label: 'ליחידה', per: 'יחידות' },
}
export interface Product {
  id: string
  name: string
  category: string | null
  unit: ProductUnit
  price: number
  description: string | null
  active: number
  sort: number
  used?: number
}

export interface Charge {
  id: string
  client_id: string
  project_id: string | null
  description: string
  amount: number
  charged_at: string
  client_name?: string
  product_id?: string | null
  quantity?: number | null
  unit_price?: number | null
}

export interface Payment {
  id: string
  client_id: string | null
  project_id: string | null
  amount: number
  method: PayMethod
  paid_at: string
  notes: string | null
  client_name?: string | null
  invoice_ref?: string | null
}

export interface Expense {
  id: string
  category: ExpenseCategory
  vendor: string | null
  amount: number
  vat_amount: number | null
  spent_at: string
  notes: string | null
}

export interface Reminder {
  id: string
  client_id: string | null
  text: string
  due_at: string | null
  done_at: string | null
  client_name?: string | null
}

export interface Settings {
  billing_mode: BillingMode
  default_rate: number
  vat_status: 'exempt' | 'licensed'
  vat_rate: number
  studio_name: string
  studio_address: string
  studio_phone: string
  email_signature: string
  reminders_enabled: boolean
  /** כמה שעות לפני התור לשלוח תזכורת */
  reminder_hours: number
}

export interface Dashboard {
  today: Appointment[]
  reminders: Reminder[]
  month: { income: number; expenses: number; open_balance: number; seconds: number }
  next_up: Appointment | null
}

export interface ChargePreview {
  mode: BillingMode
  seconds: number
  rate: number          // לשעה / לשיר / מחיר כולל
  songs: number | null
  amount: number
  entry_ids: string[]
  description: string
}

export interface MonthReport {
  month: string
  income: number
  expenses: number
  profit: number
  by_method: { method: PayMethod; amount: number }[]
  by_kind: { kind: WorkKind; seconds: number }[]
  by_client: { client_id: string; name: string; income: number; seconds: number }[]
  by_category: { category: ExpenseCategory; amount: number }[]
}

export const WORK_KINDS: { id: WorkKind; label: string; color: string }[] = [
  { id: 'recording', label: 'הקלטה', color: '#ff3b5c' },
  { id: 'mix', label: 'מיקס', color: '#4df2c3' },
  { id: 'master', label: 'מאסטרינג', color: '#ffb84d' },
  { id: 'edit', label: 'עריכה', color: '#8bd3ff' },
  { id: 'production', label: 'הפקה', color: '#ff8ac0' },
]
export const workKind = (k: WorkKind) => WORK_KINDS.find(w => w.id === k)!

export const CLIENT_KINDS: Record<ClientKind, string> = {
  artist: 'אמן/ית', band: 'להקה', choir: 'מקהלה', podcast: 'פודקאסט', other: 'אחר',
}
export const PAY_METHODS: Record<PayMethod, string> = {
  cash: 'מזומן', bit: 'ביט', transfer: 'העברה', credit: 'אשראי', check: "צ'ק", other: 'אחר',
}
export const EXPENSE_CATEGORIES: Record<ExpenseCategory, string> = {
  equipment: 'ציוד', software: 'תוכנות ומנויים', rent: 'שכירות', utilities: 'חשמל ושוטף', other: 'אחר',
}
export const BILLING_MODES: Record<BillingMode, string> = {
  hourly: 'לפי שעה', per_song: 'לפי שיר', fixed: 'מחיר כולל לפרויקט',
}
