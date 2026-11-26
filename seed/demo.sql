-- נתוני דוגמה לפיתוח מקומי בלבד (npm run db:seed:local). לא להריץ על המסד האמיתי.
INSERT INTO clients (id, name, kind, is_group, phone, color_a, color_b, created_at) VALUES
 ('c-noa',   'נועה לוי',       'artist',  0, '050-1234567', '#ff8ac0', '#7b5cff', strftime('%Y-%m-%dT%H:%M:%fZ','now','-60 days')),
 ('c-hatzer','להקת החצר',      'band',    1, '052-2223344', '#ffb84d', '#ff5d7a', strftime('%Y-%m-%dT%H:%M:%fZ','now','-90 days')),
 ('c-erev',  'פודקאסט ערב',    'podcast', 0, '054-9876543', '#4df2c3', '#2b6cff', strftime('%Y-%m-%dT%H:%M:%fZ','now','-120 days')),
 ('c-omer',  'עומר בן דוד',    'artist',  0, '053-5550001', '#8bd3ff', '#8b7bff', strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 days')),
 ('c-dana',  'דנה כהן',        'artist',  0, NULL,          '#c6ff4d', '#1e9e7a', strftime('%Y-%m-%dT%H:%M:%fZ','now','-40 days')),
 ('c-choir', 'מקהלת הגליל',    'choir',   1, NULL,          '#ffd166', '#06b88a', strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days'));

INSERT INTO projects (id, client_id, title, billing_mode, unit_price, quote_amount) VALUES
 ('p-noa',   'c-noa',    'אלבום בכורה',   'fixed',    1200000, 1200000),
 ('p-hatzer','c-hatzer', 'מיקס EP',       'per_song', 90000,   NULL),
 ('p-erev',  'c-erev',   'הקלטה שבועית',  'hourly',   18000,   NULL),
 ('p-choir', 'c-choir',  'אלבום חנוכה',   NULL,       NULL,    800000);

INSERT INTO time_entries (id, client_id, project_id, kind, is_client_present, started_at, ended_at) VALUES
 ('t1','c-noa','p-noa','recording',1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 days','+3 hours')),
 ('t2','c-noa','p-noa','mix',0,       strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days','+2 hours')),
 ('t3','c-erev','p-erev','recording',1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 days','+90 minutes')),
 ('t4','c-hatzer','p-hatzer','mix',0, strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 days','+5 hours')),
 ('t5','c-dana',NULL,'recording',1,   strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 days','+2 hours')),
 ('t6','c-choir','p-choir','recording',1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 days','+4 hours'));

INSERT INTO charges (id, client_id, project_id, description, amount, charged_at) VALUES
 ('ch1','c-noa','p-noa','מקדמה לאלבום', 400000, strftime('%Y-%m-%dT%H:%M:%fZ','now','-20 days')),
 ('ch2','c-erev','p-erev','הקלטות אוקטובר', 280000, strftime('%Y-%m-%dT%H:%M:%fZ','now','-15 days')),
 ('ch3','c-hatzer','p-hatzer','3 שירים', 270000, strftime('%Y-%m-%dT%H:%M:%fZ','now','-8 days'));

INSERT INTO payments (id, client_id, amount, method, paid_at) VALUES
 ('pay1','c-noa', 310000,'bit',      strftime('%Y-%m-%dT%H:%M:%fZ','now','-12 days')),
 ('pay2','c-erev',140000,'transfer', strftime('%Y-%m-%dT%H:%M:%fZ','now','-4 days')),
 ('pay3','c-hatzer',270000,'cash',   strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days'));

INSERT INTO expenses (id, category, vendor, amount, spent_at) VALUES
 ('e1','software','Avid Pro Tools', 15900, strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 days')),
 ('e2','equipment','חנות כלי נגינה', 42000, strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 days'));

INSERT INTO appointments (id, client_id, title, kind, starts_at, ends_at) VALUES
 ('a1','c-noa','הקלטת שירה','recording', strftime('%Y-%m-%dT%H:%M:%fZ','now','+2 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now','+5 hours')),
 ('a2','c-erev','פרק 48','recording',    strftime('%Y-%m-%dT%H:%M:%fZ','now','+6 hours'), strftime('%Y-%m-%dT%H:%M:%fZ','now','+7 hours')),
 ('a3','c-omer','דמו ראשון','recording', strftime('%Y-%m-%dT%H:%M:%fZ','now','+2 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','+2 days','+2 hours')),
 ('a4','c-hatzer',NULL,'mix',            strftime('%Y-%m-%dT%H:%M:%fZ','now','+3 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','+3 days','+4 hours'));

INSERT INTO reminders (id, client_id, text) VALUES
 ('r1','c-noa','לשלוח לנועה את המיקס הראשון'),
 ('r2','c-erev','לגבות את יתרת אוקטובר'),
 ('r3',NULL,'להזמין כבל XLR חדש לחדר');
