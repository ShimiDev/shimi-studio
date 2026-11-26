-- הערות מהסשן: נכתבות תוך כדי הקלטה או עבודה, ונשמרות על הלקוח (ועל הסשן, אם רץ שעון)
CREATE TABLE notes (
  id             TEXT PRIMARY KEY,
  client_id      TEXT REFERENCES clients(id) ON DELETE CASCADE,
  time_entry_id  TEXT REFERENCES time_entries(id) ON DELETE SET NULL,
  text           TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_notes_client ON notes(client_id, created_at);

-- משימה שנכתבה בסשן זוכרת מאיזה סשן היא באה
ALTER TABLE reminders ADD COLUMN time_entry_id TEXT REFERENCES time_entries(id) ON DELETE SET NULL;
