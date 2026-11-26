-- שלב 1.1: זימונים ותזכורות במייל, ומחירון מוצרים ושירותים

-- זימונים: מתי נשלח, וכמה פעמים עודכן (SEQUENCE בקובץ היומן)
ALTER TABLE appointments ADD COLUMN invite_sent_at TEXT;
ALTER TABLE appointments ADD COLUMN invite_email TEXT;
ALTER TABLE appointments ADD COLUMN invite_seq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN reminder_sent_at TEXT;

-- מחירון: מה האולפן מוכר ובכמה
CREATE TABLE products (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  category     TEXT,                       -- חופשי: הקלטה, מיקס, חבילה...
  unit         TEXT NOT NULL DEFAULT 'unit' CHECK (unit IN ('hour','song','project','day','unit')),
  price        INTEGER NOT NULL CHECK (price >= 0),   -- באגורות, ליחידה
  description  TEXT,
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_products_active ON products(active, sort);

-- חיוב שנוצר מפריט במחירון זוכר מאיזה פריט ובאיזו כמות
ALTER TABLE charges ADD COLUMN product_id TEXT REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE charges ADD COLUMN quantity REAL;
ALTER TABLE charges ADD COLUMN unit_price INTEGER;
