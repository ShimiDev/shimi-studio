# Shimon Leibowitz Studio — מערכת ניהול האולפן

מערכת אישית לניהול אולפן הקלטות: לקוחות, שעון עבודה (REC, מיקס, מאסטרינג, עריכה, הפקה), תורים, חיובים, תשלומים, הוצאות ודוח חודשי.
המסך הראשי הוא "חדר הבקרה": חלון תלת־ממדי לחדר ההקלטה, שבו הדמות של הלקוח נכנסת ונעמדת מול המיקרופון.

הכול רץ על Cloudflare, בחינם: Worker אחד מגיש גם את האתר וגם את ה־API, והנתונים ב־D1.

## מבנה

```
migrations/      סכמת המסד (D1 / SQLite)
worker/          השרת: Hono, בדיקת כניסה, ונתיבי /api
shared/          טיפוסים וחישובי זמן שמשותפים לשרת ולממשק
web/src/         הממשק: React
  pages/         לקוחות, חדר בקרה, יומן, כסף, הגדרות
  components/    טפסים, חלון קופץ, תפריט שעון, נגן צף
  three/         הדמויות וחדר ההקלטה בתלת־ממד (three.js)
seed/demo.sql    נתוני דוגמה לפיתוח מקומי בלבד
```

כללים: כסף נשמר באגורות כמספר שלם. זמנים נשמרים ב־UTC ומוצגים בשעון ישראל.

## פיתוח מקומי

```bash
npm install
cp .dev.vars.example .dev.vars      # מדלג על הכניסה, רק ב-localhost
npm run db:migrate:local
npm run db:seed:local               # לא חובה: לקוחות לדוגמה
npm run dev                         # http://localhost:5173
```

## העלאה אוטומטית מ-GitHub (Workers Builds)

הריפו מחובר ל-Cloudflare, וכל דחיפה בונה ומעלה. בהגדרות ה-Worker (Settings → Build):

- Build command: `npm run build`
- Deploy command: `npm run cf:deploy` (מריץ קודם את המיגרציות על D1 ואז מעלה)

## העלאה ידנית (פעם ראשונה)

1. `npx wrangler login`
2. `npx wrangler d1 create shimi-studio-db` ולהעתיק את ה-`database_id` שחוזר אל `wrangler.jsonc`.
3. `npm run db:migrate:remote`
4. `npm run deploy`. הכתובת תהיה בערך `https://shimi-studio.<החשבון>.workers.dev`.
5. **הגנה בכניסה (Cloudflare Access, חינם):**
   - בלוח של Cloudflare: Workers & Pages → shimi-studio → Settings → Domains & Routes → ליד `workers.dev` להפעיל **Cloudflare Access**. אפשר גם דרך Zero Trust → Access → Applications → Self-hosted על אותה כתובת.
   - במדיניות: Allow, Emails = המייל של שימי. הכניסה היא בקוד חד־פעמי למייל.
   - להכניס את דומיין הצוות (`<team>.cloudflareaccess.com`) ל-`ACCESS_TEAM_DOMAIN` ב-`wrangler.jsonc`. ה-AUD של האפליקציה (`ACCESS_AUD`) רשות ומוסיף בדיקה שהטוקן שייך בדיוק לאפליקציה הזו.
6. עד שסעיף 5 הושלם, ה-API נעול ומחזיר "המערכת עדיין לא הוגדרה". זה בכוונה.

אבטחה בשתי שכבות: Access עוצר את מי שלא מורשה לפני שהוא מגיע לאתר, וה-Worker בודק בכל בקשה את החתימה של Access. כך גם כתובות תצוגה מקדימה של Cloudflare לא חושפות נתונים.

אין במאגר הזה אף סוד. מפתחות עתידיים (יומן גוגל, הנהלת חשבונות) יישמרו עם `npx wrangler secret put`.

## שלבים הבאים

1. סנכרון דו־כיווני עם יומן גוגל (השדות `gcal_*` כבר קיימים בטבלת התורים).
2. הנהלת חשבונות: הפקת קבלה מתשלום (השדה `invoice_ref`).
3. סליקה: דף תשלום ללקוח.
4. גיבוי שבועי אוטומטי ל-R2.
5. החלפת הדמויות והחדר בנכסים מלוטשים מ-Spline או Blender (קובצי GLB), בלי לשנות את הנתונים.

## מייל: זימונים ותזכורות (SMTP)

המערכת שולחת זימונים, עדכונים, ביטולים ותזכורות מתיבת המייל של שימי עצמו, בלי שירות חיצוני.
ב-Cloudflare: Workers ← shimi-studio ← Settings ← Variables and Secrets. מוסיפים כל אחד מאלה כ-**Secret**:

| שם | ערך |
|---|---|
| `SMTP_HOST` | שרת היציאה, למשל `smtp.gmail.com` |
| `SMTP_PORT` | `465` (או `587`) |
| `SMTP_USER` | כתובת המייל המלאה |
| `SMTP_PASS` | סיסמה. בג׳ימייל: "סיסמת אפליקציה" (myaccount.google.com/apppasswords, דורש אימות דו-שלבי) |
| `SMTP_FROM` | לא חובה: כתובת שולח אם שונה מ-`SMTP_USER` |

אחרי השמירה, ב"הגדרות" במערכת מופיע "מחובר" ואפשר לשלוח מייל בדיקה. התזכורות האוטומטיות רצות כל רבע שעה (Cron), ומופעלות רק אם סימנו אותן בהגדרות.
