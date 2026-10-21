# گزارش طراحی و مسیر بهبود OrbitPlan

این سند روند اصلی بازطراحی فارسی/RTL، کیفیت تعامل، قابلیت‌های حرفه‌ای و مرزهای شفاف محصول را ثبت می‌کند.

## اصول ثابت محصول

- صفحهٔ Today ظاهر کلاسیک و آشنای خود را حفظ کرده است؛ امکانات سنگین در فضاهای اختصاصی برنامه، پروژه، یادگیری، تمرکز، هدف‌ها و بینش‌ها قرار گرفته‌اند.
- فارسی پیش‌فرض است و چیدمان RTL، تاریخ شمسی و نمایش عددی فارسی به‌صورت واقعی اعمال می‌شوند. English هم مسیر LTR و تاریخ میلادی را نگه می‌دارد.
- تم Aurora باید شاد، واضح و دارای کنتراست قابل‌خواندن باشد؛ تم Night مستقل است و رنگ متن آن به Aurora نشت نمی‌کند.
- تعامل‌های پرخطر (حذف، restore، تعارض sync، push تعارض‌دار تیمی) به تأیید و بازخورد روشن نیاز دارند.

## مرحلهٔ ۲۴: Advanced Suite — پروژه، بهره‌وری و یادگیری حرفه‌ای

طبق انتخاب «بستهٔ کامل پیشرفته» برای وب/PWA و Android، لایهٔ محصولی جدید به OrbitPlan افزوده شد.

### Project Studio و بهره‌وری هوشمند

- route مستقل «پروژه‌ها» با navigation دسکتاپ و موبایل ایجاد شد.
- هر پروژه توضیح، تاریخ هدف، رنگ، ظرفیت روزانه، مایلستون و عضوهای محلی دارد.
- برد Kanban با صف کار، در جریان و انجام‌شده، Drag & Drop، ساخت مستقیم task و بازکردن editor آماده است.
- task وابسته تا تکمیل پیش‌نیازها مسدود می‌ماند و نمی‌تواند به Done منتقل شود.
- زمان‌بندی هوشمند taskهای آماده را با اولویت، ظرفیت روزانه و انرژی انتخابی روی روزهای آینده می‌چیند.
- export/import bundle برای انتقال کنترل‌شدهٔ پروژه حفظ شده است.

### Learning Pro

- هدف آزمون، readiness، retrieval drill و weakness radar به‌صورت data-driven اضافه شد.
- مرور هدفمند از mastery، error log و lapseهای flashcard ساخته می‌شود و ادعای «یادگیری تضمینی» ندارد.

### Android هم‌راستا

- Room برای پروژه و task، Compose برای فهرست/ساخت پروژه و native Today پیاده‌سازی شده است.
- build دستگاهی به JDK 17، Android SDK و دستگاه یا emulator واقعی نیاز دارد؛ در این محیط APK ساخته نشده است.

## مرحلهٔ ۲۵: همکاری متصل و سخت‌سازی نشست

### تجربهٔ کاربر وب/PWA

- پنل همکاری به خود Project Studio افزوده شد، بدون تغییر Today کلاسیک.
- پروژهٔ خصوصی با یک اقدام به پروژهٔ تیمی منتشر می‌شود؛ کد invite پیش‌فرض editor و با اعتبار هفت‌روزه تولید می‌کند.
- عضو جدید با کد دعوت وارد پروژه می‌شود. مالک می‌تواند invite جدید برای **ویرایشگر** یا **فقط‌مشاهده** بسازد.
- نقش‌ها در رابط واضح‌اند: مالک invite می‌سازد یا لغو می‌کند، editor تغییرها را push می‌کند و viewer فقط pull دارد.
- دریافت/ارسال تغییرها صریح و دستی است تا تغییر محلی پنهانی overwrite نشود. revision نمایش داده می‌شود و در تعارض، کاربر می‌تواند نسخهٔ تازهٔ تیم را بگیرد.
- پنل فعالیت تیم، انتشار، پیوستن عضو، تغییر پروژه، ساخت invite و لغو invite را با actor و زمان نمایش می‌دهد؛ این تاریخچهٔ عملیاتی از کد invite حساس استفاده نمی‌کند.
- بخش Security حساب اکنون تغییر گذرواژه، تأیید گذرواژه و «خروج از نشست‌های دیگر» دارد. پاسخ موفق token تازه را ذخیره می‌کند؛ در 401، رابط به sign-out محلی بازمی‌گردد.

### قرارداد backend و داده

- هر دو adapter JSON و PostgreSQL از `orbit_shared_projects`، member role و invite پشتیبانی می‌کنند.
- `findCollabProjectByInvite(code)` برای هر دو adapter وجود دارد؛ join به یک مسیر مشترک متکی است، نه دسترسی داخلی JSON.
- update پروژه با revision پایه انجام می‌شود. PostgreSQL شرط `WHERE revision = baseRevision` دارد و JSON نیز همان compare-and-set را اتمیک اجرا می‌کند؛ بنابراین آخرین نویسنده نمی‌تواند بی‌خبر از تعارض overwrite کند.
- افزودن عضو و invite در PostgreSQL upsert/insert جداگانه دارد و update payload را دوباره نمی‌نویسد.
- owner می‌تواند invite را با DELETE لغو کند. adapterهای JSON و PostgreSQL جدول/record فعالیت پروژه را نگه می‌دارند و فقط اعضای همان پروژه آن را می‌خوانند.
- token امضاشده `tokenVersion` دارد. login، password rotation و revoke session با نسخهٔ user مقایسه می‌شوند؛ password change و revoke، نسخه را بالا می‌برند و tokenهای قبلی را نامعتبر می‌کنند.

### اعتبارسنجی

- `collaboration-smoke.js`: انتشار، join نقش editor، خواندن، update، conflict و منع ساخت invite برای editor.
- `session-security-smoke.js`: password rotation، رد token قبلی، revoke نشست، رد token پیشین و login با گذرواژهٔ جدید.
- `advanced-suite-smoke.js`: نگاشت payload تیمی به پروژه/task محلی و رندر پنل همکاری، در کنار Kanban، scheduler و Learning Pro.

### مرزهای آگاهانه

- این نسخه realtime presence، WebSocket، merge سه‌طرفه، notification/email دعوت یا audit log کامل ندارد.
- invite code دادهٔ حساس است و باید صرفاً از کانال امن ارسال شود؛ در production HTTPS، PostgreSQL و secret تصادفی الزامی‌اند.
- Android native اکنون همان contract را با رابط Compose برای publish/join/pull/push/invite و نقش‌ها مصرف می‌کند و token جایگزین password/session action را رمزنگاری‌شده نگه می‌دارد. با این حال build دستگاهی واقعی همچنان برای انتشار عمومی الزامی است.

## کنترل انتشار

پیش از انتشار عمومی:

1. PostgreSQL migrationهای `001_initial.sql` و `002_collaboration_and_sessions.sql` را اجرا کنید.
2. `ORBITPLAN_TOKEN_SECRET` تصادفی، HTTPS و `CORS_ORIGINS` محدود به originهای واقعی تنظیم شوند.
3. `npm run check && npm test` اجرا شود.
4. OAuth/Push/ایمیل را تنها پس از credential، domain و تست واقعی provider فعال معرفی کنید.

## مرحلهٔ ۲۶: پایهٔ Supabase برای production

- پروژهٔ Supabase `orbitplan-production` در منطقهٔ اروپا ایجاد شد و schema account، sync، calendar connection، collaboration، invite و activity audit روی PostgreSQL اعمال شد.
- Node API واقعی با session pooler، TLS و adapter PostgreSQL اجرا و flow register، publish، join، revision update، audit و revoke invite را با موفقیت تست کرد.
- `.env.supabase.example`، `docker-compose.supabase.yml` و `SUPABASE_PRODUCTION_RUNBOOK_FA.md` مسیر deploy امن را بدون قرار دادن credential در source فراهم می‌کنند.
- domain عمومی، HTTPS hosting، OAuth credential، transactional email و Push provider هنوز خارج از این محیط‌اند و فعال/تست‌شده معرفی نمی‌شوند.

## مرحلهٔ ۲۷: مسیر Netlify رایگان برای beta

- `netlify.toml`، `/api/*` را به Netlify Function بازنویسی می‌کند و PWA را روی همان HTTPS origin منتشر می‌کند.
- adapter `netlify/functions/orbitplan.js` همان Node API را با `serverless-http` اجرا می‌کند؛ endpointهای account، sync، OAuth guard، collaboration و audit دو backend جدا پیدا نکرده‌اند.
- smoke test adapter، health و register را با event سازگار Netlify بررسی می‌کند.
- اتصال دیتابیس همچنان از environment variable سمت Function به Supabase PostgreSQL session pooler با TLS است؛ هیچ secret به client bundle وارد نمی‌شود.
- Netlify free برای beta مناسب است، اما realtime/WebSocket، worker دائمی و rate limit توزیع‌شده را تضمین نمی‌کند.
