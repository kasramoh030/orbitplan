# راه‌اندازی رسمی OAuth تقویم

OrbitPlan علاوه بر `.ics` و لینک ساخت رویداد، مسیر رسمی OAuth برای Google Calendar و Microsoft Outlook دارد. این قابلیت عمداً تا وقتی کلیدهای رسمی سرور تنظیم نشده‌اند فعال نمی‌شود.

## پیش‌نیازهای امنیتی

- دامنهٔ HTTPS، مثلاً `https://plan.example.com`
- `ORBITPLAN_TOKEN_SECRET` تصادفی و طولانی
- `CALENDAR_ENCRYPTION_KEY` تصادفی و طولانی؛ این کلید برای رمزکردن tokenهای provider در storage سمت سرور است.
- PostgreSQL و `DATABASE_URL` برای production
- یک URL بازگشت ثابت؛ مقدار `OAUTH_REDIRECT_BASE=https://plan.example.com`

> کلیدها را هرگز در `index.html`، PWA یا APK قرار ندهید. فقط روی سرور و در secret manager ذخیره شوند.

## Google Calendar

1. در Google Cloud Console یک OAuth Client از نوع Web Application بسازید.
2. Google Calendar API را فعال کنید.
3. این Redirect URI را ثبت کنید:
   ```text
   https://plan.example.com/api/calendar/google/callback
   ```
4. متغیرهای زیر را روی سرور تنظیم کنید:
   ```bash
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

## Microsoft Outlook / Graph

1. در Microsoft Entra ID یک App Registration بسازید.
2. Delegated permissions زیر را با consent مناسب فعال کنید: `User.Read` و `Calendars.ReadWrite`.
3. این Redirect URI را ثبت کنید:
   ```text
   https://plan.example.com/api/calendar/microsoft/callback
   ```
4. متغیرهای زیر را روی سرور تنظیم کنید:
   ```bash
   MICROSOFT_CLIENT_ID=...
   MICROSOFT_CLIENT_SECRET=...
   ```

## رفتار Sync

- کاربر در مرکز داده وارد حساب OrbitPlan می‌شود و «اتصال OAuth» را می‌زند.
- سرور state امضاشده و کوتاه‌عمر OAuth می‌سازد؛ callback فقط با همان state پذیرفته می‌شود.
- access token و refresh token با AES-256-GCM و `CALENDAR_ENCRYPTION_KEY` رمز می‌شوند.
- با فرمان «همگام‌سازی»، taskهای باز به event تبدیل می‌شوند. شناسهٔ task داخل private/extended property provider ثبت می‌شود؛ اجرای بعدی event همان task را update می‌کند و تکراری نمی‌سازد.
- برای eventهایی که OrbitPlan ساخته و شناسهٔ آن‌ها را نگه داشته است، تغییر عنوان، زمان یا مدت‌زمان در Google/Outlook در sync بعدی به task متناظر برمی‌گردد؛ سپس نسخهٔ به‌روز دوباره روی provider نوشته می‌شود. بنابراین مسیر دوطرفه برای eventهای متصل وجود دارد.
- رویدادهای خارجیِ بدون شناسهٔ OrbitPlan عمداً خودکار وارد برنامه نمی‌شوند تا duplicate یا تغییر ناخواسته ایجاد نشود؛ import `.ics` مسیر کنترل‌شدهٔ ورود آن‌هاست. دریافت change feed/webhook برای sync لحظه‌ای، گام production بعدی است.

## متغیرهای نمونه

```bash
NODE_ENV=production
DATABASE_URL=postgres://...
DATABASE_SSL=true
ORBITPLAN_TOKEN_SECRET=replace-with-random-secret
CALENDAR_ENCRYPTION_KEY=replace-with-another-random-secret
OAUTH_REDIRECT_BASE=https://plan.example.com
CORS_ORIGINS=https://plan.example.com
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
```
