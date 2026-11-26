-- הסכמה הראשונה של מערכת האולפן.
-- כללים: כסף = מספר שלם באגורות. זמנים = טקסט ISO-8601 ב-UTC. מזהים = טקסט (UUID).

-- לקוחות: אמן יחיד, להקה או מקהלה
CREATE TABLE clients (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'artist' CHECK (kind IN ('artist','band','choir','podcast','other')),
  is_group     INTEGER NOT NULL DEFAULT 0 CHECK (is_group IN (0,1)),   -- 1 = שלוש דמויות בחלון
  phone        TEXT,
  email        TEXT,
  color_a      TEXT NOT NULL,                                          -- צבע ראשי של הדמות
  color_b      TEXT NOT NULL,                                          -- צבע משני
  hourly_rate  INTEGER,                                                -- באגורות. ריק = תעריף ברירת המחדל
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at  TEXT
);
CREATE INDEX idx_clients_active ON clients(archived_at, name);

-- פרויקטים: אלבום, סינגל, פודקאסט. שיטת התמחור נקבעת כאן או בהגדרות
CREATE TABLE projects (
  id            TEXT PRIMARY KEY,
  client_id     TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  billing_mode  TEXT CHECK (billing_mode IN ('hourly','per_song','fixed')),  -- ריק = לפי ההגדרות
  unit_price    INTEGER,          -- באגורות: לשעה / לשיר / מחיר כולל, לפי billing_mode
  quote_amount  INTEGER,          -- הצעת מחיר כוללת (להתקדמות מול הצעה)
  quoted_hours  REAL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','done')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_projects_client ON projects(client_id, status);

-- שעון העבודה: כל שורה היא סשן אחד. ended_at ריק = השעון רץ עכשיו
CREATE TABLE time_entries (
  id                 TEXT PRIMARY KEY,
  client_id          TEXT REFERENCES clients(id) ON DELETE SET NULL,   -- ריק = סשן פרטי
  project_id         TEXT REFERENCES projects(id) ON DELETE SET NULL,
  kind               TEXT NOT NULL CHECK (kind IN ('recording','mix','master','edit','production')),
  is_client_present  INTEGER NOT NULL DEFAULT 0 CHECK (is_client_present IN (0,1)),
  started_at         TEXT NOT NULL,
  ended_at           TEXT,
  paused_at          TEXT,                       -- לא ריק = מושהה כרגע
  paused_seconds     INTEGER NOT NULL DEFAULT 0, -- סך זמן ההשהיות שהסתיימו
  source             TEXT NOT NULL DEFAULT 'clock' CHECK (source IN ('clock','manual')),
  charge_id          TEXT,                       -- מולא כשהשעות חויבו
  notes              TEXT
);
-- הלב של "רק שעון אחד רץ": אינדקס ייחודי על ביטוי קבוע, רק לשורות פתוחות.
-- ניסיון לפתוח שעון שני ייכשל במסד עצמו, גם אם לוחצים פעמיים משני מכשירים.
CREATE UNIQUE INDEX one_running_clock ON time_entries((1)) WHERE ended_at IS NULL;
CREATE INDEX idx_time_client ON time_entries(client_id, started_at);
CREATE INDEX idx_time_started ON time_entries(started_at);

-- תורים. שדות gcal_* ישמשו בשלב 2 (סנכרון ליומן גוגל)
CREATE TABLE appointments (
  id             TEXT PRIMARY KEY,
  client_id      TEXT REFERENCES clients(id) ON DELETE SET NULL,
  project_id     TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title          TEXT,
  kind           TEXT NOT NULL DEFAULT 'recording',
  starts_at      TEXT NOT NULL,
  ends_at        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','done','cancelled')),
  notes          TEXT,
  gcal_event_id  TEXT,
  gcal_etag      TEXT,
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (ends_at > starts_at)
);
CREATE INDEX idx_appt_start ON appointments(starts_at);
CREATE INDEX idx_appt_client ON appointments(client_id, starts_at);

-- חיובים: מה הלקוח חייב. נוצרים ידנית או מתוך שעות
CREATE TABLE charges (
  id           TEXT PRIMARY KEY,
  client_id    TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
  description  TEXT NOT NULL,
  amount       INTEGER NOT NULL CHECK (amount >= 0),
  charged_at   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_charges_client ON charges(client_id, charged_at);

-- תשלומים = הכנסות. invoice_ref ימולא בשלב 3 (הנהלת חשבונות)
CREATE TABLE payments (
  id           TEXT PRIMARY KEY,
  client_id    TEXT REFERENCES clients(id) ON DELETE SET NULL,
  project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
  amount       INTEGER NOT NULL CHECK (amount > 0),
  method       TEXT NOT NULL CHECK (method IN ('cash','bit','transfer','credit','check','other')),
  paid_at      TEXT NOT NULL,
  notes        TEXT,
  invoice_ref  TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_payments_date ON payments(paid_at);
CREATE INDEX idx_payments_client ON payments(client_id);

-- הוצאות
CREATE TABLE expenses (
  id           TEXT PRIMARY KEY,
  category     TEXT NOT NULL CHECK (category IN ('equipment','software','rent','utilities','other')),
  vendor       TEXT,
  amount       INTEGER NOT NULL CHECK (amount > 0),
  vat_amount   INTEGER,
  spent_at     TEXT NOT NULL,
  notes        TEXT,
  receipt_key  TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_expenses_date ON expenses(spent_at);

-- תזכורות
CREATE TABLE reminders (
  id          TEXT PRIMARY KEY,
  client_id   TEXT REFERENCES clients(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  due_at      TEXT,
  done_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_reminders_open ON reminders(done_at, due_at);

-- הגדרות: מפתח-ערך (ערכים ב-JSON)
CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('billing_mode', '"hourly"'),      -- hourly | per_song | fixed
  ('default_rate', '15000'),         -- 150 ₪ לשעה, באגורות
  ('vat_status', '"exempt"'),        -- exempt (פטור) | licensed (מורשה)
  ('vat_rate', '0.18');
