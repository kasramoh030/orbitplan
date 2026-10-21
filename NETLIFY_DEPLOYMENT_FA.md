# استقرار رایگان OrbitPlan روی Netlify

## مدل استقرار

Netlify فایل‌های PWA را به‌صورت static منتشر می‌کند و همهٔ درخواست‌های `/api/*` را با `netlify.toml` به Netlify Function `orbitplan` می‌فرستد. همان Node API موجود، از طریق adapter `serverless-http` اجرا می‌شود؛ بنابراین رابط وب و API روی یک origin HTTPS هستند.

```text
https://YOUR_SITE.netlify.app
 ├─ index.html / PWA assets
 └─ /api/* → Netlify Function → Supabase PostgreSQL session pooler (TLS)
```

## محدودیت رایگان که باید بدانید

- Netlify برای frontend/PWA و functionهای request-response مناسب است، اما این API **server دائمی** نیست.
- حضور لحظه‌ای WebSocket، worker دائمی، Push provider و rate limiting توزیع‌شده در این مرحله فعال نیستند.
- rate limit داخلی Node روی هر warm instance مستقل است؛ برای حمله/ترافیک واقعی باید Netlify WAF یا یک rate-limit store خارجی اضافه شود.
- اتصال PostgreSQL فقط داخل Function انجام می‌شود؛ `DATABASE_URL`، پسورد دیتابیس و secretها هرگز به browser یا Android ارسال نمی‌شوند.

## آماده‌سازی repository

1. محتوای پوشهٔ `app/OrbitPlan/` را در یک GitHub repository خصوصی یا عمومی قرار دهید.
2. وارد [Netlify](https://app.netlify.com/) شوید و **Add new project → Import an existing project** را انتخاب کنید.
3. repository را انتخاب کنید. Netlify فایل `netlify.toml` را خودکار تشخیص می‌دهد:
   - Publish directory: `.`
   - Functions directory: `netlify/functions`
   - Node version: `20`
4. قبل از اولین deploy، در **Site configuration → Environment variables** متغیرهای زیر را اضافه کنید:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | connection string از `.env.supabase.example` با database password واقعی |
| `DATABASE_SSL` | `true` |
| `ORBITPLAN_TOKEN_SECRET` | یک secret تصادفی و طولانی، مستقل از password دیتابیس |
| `CALENDAR_ENCRYPTION_KEY` | یک secret تصادفی و مستقل دیگر |
| `CORS_ORIGINS` | ابتدا URL نهایی Netlify، مانند `https://YOUR_SITE.netlify.app` |
| `OAUTH_REDIRECT_BASE` | همان URL، تنها هنگام فعال‌کردن OAuth رسمی |

نمونهٔ connection string که **بدون پسورد واقعی** است:

```text
postgresql://postgres.duzlpceowvcyfnjkkqtm:<DATABASE_PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
```

5. **Deploy site** را بزنید.

## بررسی پس از deploy

1. آدرس زیر باید پاسخ `storage: "postgres"` بدهد:

```text
https://YOUR_SITE.netlify.app/api/health
```

2. یک حساب آزمایشی بسازید، sync را تست کنید، سپس publish/join/revoke invite/activity را با دو حساب امتحان کنید.
3. در صورت افزودن domain اختصاصی، ابتدا HTTPS Netlify را فعال کنید، سپس `CORS_ORIGINS` و `OAUTH_REDIRECT_BASE` را به domain جدید تغییر دهید و redeploy کنید.

## وضعیت OAuth و Android

- OAuth Google/Outlook تا ثبت redirect URI دقیق، client ID/secret و domain واقعی فعال نیست.
- Android از همان API URL نهایی Netlify و همان حساب OrbitPlan استفاده می‌کند.
- Netlify Function برای prototype/beta رایگان مناسب است. برای realtime، WebSocket یا SLA production، یک Node host همیشه‌روشن لازم خواهد بود.
