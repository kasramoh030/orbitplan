# OrbitPlan Native Android

این پوشه یک پایهٔ Jetpack Compose برای OrbitPlan است؛ Web/PWA را جایگزین نمی‌کند، بلکه مسیر native را برای اعلان مطمئن، Room، AlarmManager و WorkManager فراهم می‌کند.

## قابلیت‌های اجراشده در کد

- صفحهٔ Today فارسی با Compose، افزودن task و ثبت انجام‌شدن
- مدیریت پایهٔ پروژه در native: entity/DAO مستقل، نمایش پروژه‌ها و افزودن پروژه از رابط Android
- Room برای نگهداری local-first taskها و پروژه‌ها
- `AlarmManager` برای reminder دقیق و `ReminderReceiver` برای اعلان native
- بازتنظیم reminderها پس از boot با `BootReceiver`
- `WorkManager` برای صف sync در زمان وجود شبکه
- فرم ورود native برای endpoint، ایمیل و گذرواژه؛ نگهداری رمزدار endpoint و access token در `EncryptedSharedPreferences`
- Sync worker سازگار با endpoint `/api/sync` سرور همراه OrbitPlan
- همکاری native پروژه با همان backend وب: انتشار پروژه، پیوستن با کد، دریافت/ارسال revision-safe، دعوت editor/viewer و نمایش نقش
- امنیت native حساب: تغییر گذرواژه و خروج از نشست‌های دیگر با نگهداری token تازه در `EncryptedSharedPreferences`

## باز کردن پروژه

1. Android Studio جدید با JDK 17 را نصب کنید.
2. همین پوشهٔ `android/` را با Android Studio باز کنید.
3. Gradle sync را اجرا کنید.
4. در Android 13+ مجوز Notification را تأیید کنید.
5. از دکمهٔ `Cloud` در بالای Today، endpoint HTTPS سرور OrbitPlan و اطلاعات یک حساب موجود را وارد کنید؛ token و email پس از ورود در storage رمزدار دستگاه ثبت و Worker sync فعال می‌شود.
6. از `پروژه‌ها` یک پروژه را برای تیم منتشر کنید یا کد invite را وارد کنید. در پروژهٔ متصل، دکمه‌های دریافت/ارسال بر پایهٔ revision هستند و مالک می‌تواند invite editor یا viewer بسازد.
7. از `امنیت` گذرواژه را عوض کنید یا نشست‌های دیگر را باطل کنید. token جایگزین امن روی دستگاه ذخیره می‌شود.

## نکتهٔ انتشار

- برای انتشار عمومی، URL سرور باید HTTPS باشد.
- در Android 12+ کاربر ممکن است برای exact alarm نیاز به تأیید سیستم‌عامل داشته باشد؛ کد به‌صورت امن به alarm غیر‌دقیق fallback می‌کند.
- پروژهٔ حاضر با JDK 17 و Android SDK 35 هدف‌گذاری شده است. محیط فعلی فقط Java 11 دارد، بنابراین build APK اینجا اجرا نشده است؛ پیش از انتشار باید در Android Studio/CI واقعی build و روی دستگاه تست شود.
