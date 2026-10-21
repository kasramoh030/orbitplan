# Runbook استقرار OrbitPlan با Supabase PostgreSQL

## وضعیت آماده‌سازی

پروژهٔ Supabase ایجاد و schema OrbitPlan روی آن اعمال شده است:

- Project ref: `duzlpceowvcyfnjkkqtm`
- Region: `eu-west-1`
- Migration: `orbitplan_core_collaboration`
- جدول‌های account، sync، calendar connection، shared project، member، invite و activity audit ایجاد و تأیید شده‌اند.
- تست integration واقعی Node API روی PostgreSQL برای register، publish، join، optimistic update، activity و revoke invite با موفقیت اجرا شده است.

OrbitPlan از **Node API اختصاصی خودش** برای حساب و session استفاده می‌کند. Supabase در این معماری تنها PostgreSQL مدیریت‌شده است؛ URL دیتابیس، database password و keyهای service نباید هرگز به وب‌اپ یا Android client ارسال شوند.

## اتصال runtime

1. در Supabase Dashboard برای پروژه، database password را در جای امن reset/ثبت کنید. گذرواژهٔ provision اولیه در source یا release نگهداری نشده است.
2. فایل `.env.supabase.example` را به `.env.supabase` کپی کنید.
3. مقدارهای زیر را با مقدار واقعی پر کنید:
   - `DATABASE_PASSWORD` داخل `DATABASE_URL`
   - `ORBITPLAN_TOKEN_SECRET` و `CALENDAR_ENCRYPTION_KEY` با دو secret مستقل و تصادفی
   - `CORS_ORIGINS` و `OAUTH_REDIRECT_BASE` با origin نهایی HTTPS
4. استقرار کانتینری Node API:

```bash
cp .env.supabase.example .env.supabase
# مقادیر placeholder را اصلاح کنید
docker compose -f docker-compose.supabase.yml --env-file .env.supabase up --build -d
curl -fsS https://YOUR_DOMAIN/api/health
```

برای شبکه‌هایی که IPv6 ندارند، از **session pooler** ثبت‌شده در template استفاده کنید؛ direct host ممکن است فقط IPv6 برگرداند. اتصال TLS به session pooler روی پورت `5432` با runtime واقعی OrbitPlan پس از rotation پسورد اعتبارسنجی شد. تنظیم `DATABASE_SSL=true` الزامی است.

## بررسی پیش از بازکردن عمومی

```bash
npm install
npm run check
npm test
```

- روی runtime واقعی، `/api/health` باید `storage: "postgres"` نشان دهد.
- با دو حساب، register/login، Cloud Sync، publish/join، viewer/editor، revoke invite، activity audit، conflict و password rotation را بررسی کنید.
- `CORS_ORIGINS` را فقط به domainهای واقعی محدود کنید، نه `*`.
- برای OAuth یا Push تا قبل از داشتن HTTPS/domain و credential واقعی ادعای فعال‌بودن نکنید.

## عملیات

- backup point-in-time و retention مطابق پلن Supabase را در Dashboard بررسی کنید.
- برای تغییر schema، migration تازه‌ای بسازید؛ migration اعمال‌شده را rewrite نکنید.
- secretها را تنها در secret manager/deployment variables نگه دارید؛ هرگز در ZIP، repository یا localStorage قرار ندهید.
- مانیتورینگ health endpoint، خطاهای 401/429/5xx و ظرفیت pooler را به سرویس hosting اضافه کنید.

## محدودیت شفاف

این اتصال، دیتابیس production را آماده و integration آن را تأیید می‌کند؛ هنوز domain عمومی، HTTPS deployment، provider credentialهای OAuth، email transactional و Push provider در این محیط فراهم نشده‌اند.
