-- עד עכשיו סשנים מהשעון נשמרו בלי פרויקט. משייכים סשנים פתוחים (שעוד לא חויבו)
-- ללקוחות שיש להם בדיוק פרויקט פעיל אחד, כדי שיופיעו בסיכום הפרויקט ובחיוב שלו.
UPDATE time_entries
SET project_id = (SELECT p.id FROM projects p WHERE p.client_id = time_entries.client_id AND p.status = 'active')
WHERE project_id IS NULL AND charge_id IS NULL AND client_id IS NOT NULL
  AND (SELECT COUNT(*) FROM projects p WHERE p.client_id = time_entries.client_id AND p.status = 'active') = 1;
