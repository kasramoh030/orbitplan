# برنامهٔ QA و انتشار OrbitPlan

## تست‌های خودکار موجود

```bash
npm run check
npm test
```

این دو فرمان موارد زیر را بررسی می‌کنند:

- syntax سرور، storage adapter، OAuth adapter و Service Worker
- وجود قابلیت‌های قراردادی PWA، Sync، backup رمزدار، فلش‌کارت، تحلیل و Android source
- ساخت حساب، ورود، upload/download و guard پیکربندی OAuth روی API واقعی محلی
- ایجاد event، update event و بازگرداندن تغییر event متصل‌شده از Google adapter با mock provider
- انتشار پروژهٔ تیمی، join با invite، نقش editor، کنترل conflict و منع ساخت invite توسط editor
- تغییر گذرواژه و revoke نشست با رد tokenهای قبلی بر پایهٔ token version

## ماتریس تست دستی پیش از انتشار

| سطح | سناریو | معیار پذیرش |
|---|---|---|
| Android 13–15 | نصب APK، POST_NOTIFICATIONS، یادآور زمان‌دار، publish/join/pull/push پروژه و تغییر گذرواژه | اعلان در زمان مقرر، بازشدن task درست، نقش/revision درست و token تازه رمزنگاری‌شده ثبت شود |
| Android reboot | ساخت reminder، restart دستگاه | reminderهای آینده دوباره schedule شوند |
| Chrome Android | نصب PWA، offline launch، import/export | shell بدون اینترنت باز شود و JSON/ICS سالم باشد |
| Safari iOS | RTL، تقویم شمسی، فرم task | خوانایی و touch target مناسب |
| چنددستگاهی | تغییر یک task در وب و Android | صف sync پس از شبکه داده را منتقل کند؛ conflict آشکار باشد |
| Google/Outlook | OAuth، ساخت event، تغییر زمان event | event متصل تکراری نشود و تغییر آن در sync بعدی برگردد |
| Accessibility | TalkBack/VoiceOver، کیبورد، focus | عنوان، action و پیام وضعیت خوانده شوند |
| همکاری تیمی | publish پروژه، invite editor/viewer، لغو invite، خواندن activity، push هم‌زمان، pull تعارض‌دار | نقش‌ها enforce شوند، invite منقضی/لغوشده رد شود، history فقط برای عضو خوانده شود و هیچ overwrite بی‌هشدار رخ ندهد |
| Supabase production | Node API با session pooler و TLS، health، register، sync و collaboration | `/api/health` مقدار `postgres` دارد و اتصال بدون credential در client برقرار نمی‌شود |
| Netlify beta | deploy static PWA + function، مسیر `/api/health`، register، refresh پس از cold start | rewrite `/api/*` درست است، function به Supabase وصل می‌شود و secret در bundle دیده نمی‌شود |
| امنیت | رمز اشتباه backup، token منقضی، تغییر گذرواژه، revoke نشست، درخواست login پرتکرار | restore ناموفق امن، 401/429 مناسب، token قبلی رد و داده محلی حفظ شود |

## بررسی deployment

- [ ] HTTPS و redirect URI واقعی OAuth
- [ ] PostgreSQL backup روزانه و restore آزمایش‌شده
- [ ] secretها در secret manager، نه فایل repository
- [ ] `CORS_ORIGINS` فقط شامل دامنه‌های مجاز
- [ ] مانیتورینگ خطای API، سلامت `/api/health` و alert برای 5xx
- [ ] سیاست حریم خصوصی، حذف حساب و مسیر پشتیبانی کاربر

## محدودیت‌های آگاهانهٔ این release

- Web Push برای وب‌اپ بسته هنوز به provider سمت سرور نیاز دارد؛ Android native از AlarmManager استفاده می‌کند.
- sync تقویم دوطرفه برای eventهایی فعال است که OrbitPlan ساخته/به آن‌ها شناسه داده است. رویداد خارجی بدون شناسه به‌صورت خودکار import نمی‌شود.
- APK در این محیط build نشده است؛ wrapper آماده است اما build نهایی نیازمند JDK 17، Android SDK و emulator/دستگاه واقعی است.
