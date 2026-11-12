# Shokoladchi — oziq-ovqat do'koni uchun Telegram bot, Mini App va Web admin

Bitta loyiha ichida quyidagilar bor:

- **Telegram bot**: ro'yxatdan o'tish, buyurtma bildirishnomalari, guruhda buyurtmani qabul qilish, kuryerlar bilan ishlash
- **Mini App** (`/app`): mijozlar uchun do'kon, sotuvchi, omborchi, kuryer va admin ekranlari (rolga qarab)
- **Web admin panel** (`/admin`): brauzerda login/parol bilan
- **AI rasm**: mahsulot rasmi Google Gemini yordamida chiroyli studiya fonli rasmga aylantiriladi

Texnologiyalar: Node.js 20, TypeScript, Express, grammY (webhook), PostgreSQL + Prisma, React + Vite + TailwindCSS, lucide-react ikonkalari, i18next (o'zbek/rus).

---

## Mundarija

1. [BotFather'da bot yaratish](#1-botfatherda-bot-yaratish)
2. [Railway'ga joylash (deploy)](#2-railwayga-joylash-deploy)
3. [Buyurtmalar guruhini sozlash](#3-buyurtmalar-guruhini-sozlash)
4. [Google AI Studio API kaliti](#4-google-ai-studio-api-kaliti)
5. [Birinchi kirish](#5-birinchi-kirish)
6. [Xodim qo'shish](#6-xodim-qoshish)
7. [Tez-tez uchraydigan xatolar](#7-tez-tez-uchraydigan-xatolar)
8. [Dasturchilar uchun](#8-dasturchilar-uchun)

---

## 1. BotFather'da bot yaratish

1. Telegram'da **@BotFather** ni oching va `/newbot` yozing.
2. Bot uchun ism kiriting (masalan: `Shokoladchi do'koni`).
3. Username kiriting — oxiri `bot` bilan tugashi shart (masalan: `shokoladchi_shop_bot`).
4. BotFather sizga **token** beradi, masalan: `7123456789:AAH...xyz`. Uni saqlab qo'ying — bu `BOT_TOKEN`.
   > Tokenni hech kimga bermang. Agar tarqalib ketsa, BotFather'da `/revoke` qiling.
5. (Ixtiyoriy) Bot rasmi va tavsifini qo'ying: `/setuserpic`, `/setdescription`.
6. **Mini App URL'ini ulash** (Railway domeni tayyor bo'lgandan keyin, 2-bo'limdan so'ng):
   - BotFather → `/mybots` → botingiz → **Bot Settings** → **Mini Apps**
   - **Menu Button** → URL: `https://SIZNING-DOMENINGIZ/app/`
   - **Main App** → URL: `https://SIZNING-DOMENINGIZ/app/`
   > Ikkalasida ham oxiri `/app/` bo'lishi shart. `/admin` — bu brauzer uchun web panel, uni BotFather'ga qo'ymang.
   > Server ishga tushganda har bir foydalanuvchiga uning roliga mos menyu tugmasini o'zi ham o'rnatadi.

---

## 2. Railway'ga joylash (deploy)

### 2.1. Kodni GitHub'ga yuklash
Loyihani o'zingizning GitHub hisobingizdagi repozitoriyaga yuklang (private bo'lishi mumkin).

### 2.2. Railway loyihasini yaratish
1. [railway.com](https://railway.com) ga GitHub orqali kiring.
2. **New Project** → **Deploy from GitHub repo** → repozitoriyangizni tanlang.
3. Railway `Dockerfile` va `railway.json` ni o'zi topadi va build qiladi. Birinchi build xato bilan to'xtashi normal — hali o'zgaruvchilar qo'shilmagan.

### 2.3. PostgreSQL qo'shish
1. Loyiha ichida **+ Create** (yoki **New**) → **Database** → **PostgreSQL**.
2. Postgres yaratilgach, ilova servisingizga qayting → **Variables** → **New Variable**:
   - Nomi: `DATABASE_URL`
   - Qiymati: `${{Postgres.DATABASE_URL}}` (Railway buni avtomatik Postgres manziliga almashtiradi)

### 2.4. Volume qo'shish (rasmlar uchun)
Rasmlar o'chib ketmasligi uchun doimiy disk kerak:
1. Ilova servisini tanlang → **Settings** (yoki servis ustida o'ng tugma) → **Attach Volume** / **+ Volume**.
2. **Mount path**: `/data`
3. `UPLOAD_DIR` o'zgaruvchisini `/data/uploads` qilib qo'ying (pastga qarang).

### 2.5. Domen olish
Ilova servisi → **Settings** → **Networking** → **Generate Domain**. Sizga `https://xxxx.up.railway.app` kabi manzil beriladi. Shu manzil — `WEBAPP_URL`.

### 2.6. O'zgaruvchilar (Variables)

Ilova servisi → **Variables** → **Raw Editor** orqali bir yo'la qo'shish mumkin.

| O'zgaruvchi | Majburiy | Qayerdan olinadi / misol |
|---|---|---|
| `BOT_TOKEN` | ha | BotFather bergan token (1-bo'lim) |
| `WEBAPP_URL` | ha | Railway domeni, oxirida `/` siz: `https://xxxx.up.railway.app` |
| `DATABASE_URL` | ha | `${{Postgres.DATABASE_URL}}` |
| `ADMIN_TELEGRAM_ID` | ha | Sizning Telegram ID raqamingiz. **@userinfobot** ga `/start` yozing — u `Id: 123456789` qaytaradi. Bir nechta admin bo'lsa vergul bilan: `111,222` |
| `ADMIN_PHONE` | yo'q | Admin telefoni, `/help` da ko'rinadi: `+998901234567` |
| `ADMIN_WEB_LOGIN` | ha | Web panel uchun login, masalan `admin` |
| `ADMIN_WEB_PASSWORD` | ha | Web panel paroli (kamida 6, tavsiya 12+ belgi). Server start'da bcrypt bilan shifrlab bazaga yozadi |
| `JWT_SECRET` | ha | Kamida 32 belgili tasodifiy matn. Masalan istalgan parol generatoridan 40 belgili parol |
| `ORDERS_GROUP_CHAT_ID` | ha | Buyurtmalar guruhi ID'si, `-100` bilan boshlanadi (3-bo'lim) |
| `COURIERS_GROUP_CHAT_ID` | yo'q | Kuryerlar guruhi ID'si. Bo'sh bo'lsa, har bir faol kuryerga shaxsiy xabar boradi |
| `GEMINI_API_KEY` | yo'q | Google AI Studio kaliti (4-bo'lim). Bo'lmasa AI o'chiq, original rasm ishlatiladi |
| `GEMINI_IMAGE_MODEL` | yo'q | Standart: `gemini-2.5-flash-image` |
| `GEMINI_TEXT_MODEL` | yo'q | O'zbekcha → ruscha avtomatik tarjima modeli. Standart: `gemini-2.5-flash` |
| `GEMINI_IMAGE_SIZE` | yo'q | Faqat `2K`/`4K` ni qo'llaydigan modellar uchun (masalan `gemini-3-pro-image-preview`). Odatda bo'sh qoldiring |
| `UPLOAD_DIR` | yo'q | `/data/uploads` (Volume bilan bir xil bo'lishi kerak) |
| `TZ` | yo'q | `Asia/Tashkent` |
| `SEED_DEMO_DATA` | yo'q | `true` bo'lsa, bo'sh bazaga 5 kategoriya va 20 ta namuna mahsulot qo'shiladi |

Misol (Raw Editor):

```
BOT_TOKEN=7123456789:AAH-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
WEBAPP_URL=https://shokoladchi-production.up.railway.app
DATABASE_URL=${{Postgres.DATABASE_URL}}
ADMIN_TELEGRAM_ID=123456789
ADMIN_PHONE=+998901234567
ADMIN_WEB_LOGIN=admin
ADMIN_WEB_PASSWORD=Juda-Kuchli-Parol-2024
JWT_SECRET=ixtiyoriy-uzun-tasodifiy-matn-kamida-32-belgi-qwerty123
ORDERS_GROUP_CHAT_ID=-1001234567890
GEMINI_API_KEY=AIza...
UPLOAD_DIR=/data/uploads
TZ=Asia/Tashkent
SEED_DEMO_DATA=true
```

O'zgaruvchilarni saqlagach Railway avtomatik qayta deploy qiladi. Agar biror majburiy o'zgaruvchi yetishmasa, **Deploy Logs** da aniq xabar chiqadi, masalan:

```
[XATO] Majburiy environment o'zgaruvchilari topilmadi:
  - ORDERS_GROUP_CHAT_ID: Buyurtmalar guruhining ID raqami, masalan -1001234567890
```

### 2.7. Tekshirish
- Brauzerda `https://SIZNING-DOMEN/health` ni oching — `{"ok":true,"db":"ok",...}` chiqishi kerak.
- Deploy Logs'da `Bot ulandi`, `Webhook o'rnatildi` yozuvlari bo'lishi kerak.

Server har ishga tushganda o'zi:
- baza migratsiyalarini qo'llaydi (`prisma migrate deploy`),
- webhook'ni (`setWebhook` + maxfiy `secret_token`) o'rnatadi,
- bot buyruqlarini (`/start`, `/orders`, `/lang`, `/help`) ikki tilda o'rnatadi.

---

## 3. Buyurtmalar guruhini sozlash

1. Telegram'da yangi guruh yarating (masalan "Buyurtmalar"). Sotuvchilar va adminni qo'shing.
2. Botingizni guruhga qo'shing.
3. Guruh sozlamalari → **Administrators** → botni **admin** qiling (xabar yuborish va tahrirlash huquqi bilan).
4. Guruh ID'sini olish (bittasini tanlang):
   - **@RawDataBot** yoki **@getidsbot** ni vaqtincha guruhga qo'shing — u guruh ma'lumotini yuboradi. `"chat": {"id": -1001234567890 ...}` dagi raqam kerak. Keyin bu botni guruhdan chiqaring.
   - Yoki Telegram Web (web.telegram.org/a) da guruhni oching: manzil satrida `#-1234567890` ko'rinadi. Oldiga `-100` qo'shing → `-1001234567890` (agar raqam allaqachon `-100` bilan boshlansa, o'zgartirmang).
5. Shu raqamni `ORDERS_GROUP_CHAT_ID` ga yozing.
6. (Ixtiyoriy) Kuryerlar uchun ham xuddi shunday alohida guruh yaratib, `COURIERS_GROUP_CHAT_ID` ga yozing.

Guruhda "Qabul qilish" tugmasini faqat ro'yxatdan o'tgan va bloklanmagan **sotuvchi yoki admin** bosa oladi. Bir vaqtda ikki kishi bossa — faqat birinchisi yutadi, ikkinchisiga "Buyurtmani allaqachon X qabul qilgan" chiqadi.

---

## 4. Google AI Studio API kaliti

1. [aistudio.google.com](https://aistudio.google.com) ga Google hisobingiz bilan kiring.
2. Chap menyuda **Get API key** → **Create API key**.
3. Kalitni nusxalab, `GEMINI_API_KEY` ga yozing.
4. Rasm generatsiyasi pullik bo'lishi mumkin — AI Studio'da billing holatini tekshiring. Oylik chaqiruvlar soni admin panel → **Sozlamalar** → "AI (Gemini) shu oy" bo'limida ko'rinadi.

AI qanday ishlaydi:
- Mahsulot formasida rasm yuklanadi (kamera yoki galereya) — original darhol saqlanadi.
- Fonda (navbat, bir vaqtda 2 tadan) Gemini'ga yuboriladi va natija WebP'ga o'tkaziladi.
- Formada **original va AI variant yonma-yon** ko'rinadi, siz asosiysini tanlaysiz (standart — AI). "Qayta generatsiya" tugmasi bor.
- Gemini xato bersa yoki 60 soniyada javob bermasa, original rasm ishlatiladi. Mahsulotni saqlash AI'ni kutmaydi.
- AI rasm sof oq fonda bo'ladi; server ortiqcha oq chetlarni kesib, mahsulotni kadrning ~90% iga kattalashtiradi.

Gemini yana ikki ishni bajaradi:
- **Avtomatik tarjima:** mahsulot, kategoriya va bannerlarda faqat o'zbekcha yoziladi, ruschasi saqlangandan keyin fonda tarjima qilinadi. Mahsulot formasidagi "Ruscha tarjima" bo'limida kerak bo'lsa qo'lda tuzatish mumkin.
- **AI banner:** Bannerlar → Qo'shish → "AI bilan yaratish": 4 tagacha rasm (mahsulot, logo) yuklang, banner qanday bo'lishini yozing, xohlasangiz ustiga yoziladigan matnni kiriting → "Banner yaratish". Natija yoqmasa "Qayta yaratish".

---

## 5. Birinchi kirish

**Telegram orqali (admin):**
1. Botingizga `/start` yozing. Sizning ID'ingiz `ADMIN_TELEGRAM_ID` da bo'lgani uchun ro'yxatdan o'tmasdan **ADMIN** bo'lasiz.
2. Pastda **"Admin panel"** tugmasi chiqadi — bosing, mini app admin interfeysi ochiladi.

**Brauzer orqali:**
1. `https://SIZNING-DOMEN/admin` ni oching.
2. `ADMIN_WEB_LOGIN` va `ADMIN_WEB_PASSWORD` bilan kiring.
3. 5 marta xato parol kiritilsa, 15 daqiqaga blok qo'yiladi.

**Birinchi qilinadigan ishlar:**
1. **Sozlamalar**: do'kon nomi, telefon, manzil, xaritadan do'kon nuqtasi, ish vaqti, yetkazish narxi, minimal buyurtma.
2. **Kategoriyalar** va **Mahsulotlar** (yoki `SEED_DEMO_DATA=true` bilan namunalar).
3. **Bannerlar** — bosh sahifadagi reklama rasmlari.
4. Xodimlarni taklif qiling (6-bo'lim).

**Mijoz qanday ro'yxatdan o'tadi:** botga `/start` → til tanlash → ism-familiya → "Raqamni ulashish" tugmasi (qo'lda yozilgan raqam qabul qilinmaydi) → "Do'konni ochish" tugmasi.

---

## 6. Xodim qo'shish

1. Admin panel → **Xodimlar** → **Xodim taklif qilish**.
2. Xodim ismini yozing va rolini tanlang: **Sotuvchi**, **Omborchi** yoki **Kuryer**.
3. Tizim bir martalik link beradi: `https://t.me/BOTINGIZ?start=inv_...` va QR kod. **Nusxa olish** tugmasi bilan linkni xodimga yuboring (yoki QR'ni skanerlatib bering).
4. Xodim linkni bosadi → botda `/start` → **"Raqamni ulashish"** tugmasini bosadi → tayyor, u shu rol bilan qo'shildi.

Qoidalar:
- Link **bir marta** ishlaydi va **48 soatda** eskiradi. Admin "Taklif linklari" bo'limidan uni bekor qila oladi.
- Ishlatilgan/eskirgan link bosilsa: "Link yaroqsiz, admin bilan bog'laning".
- Admin xodimni **bloklashi**, **rolini o'zgartirishi** yoki **xodimlikdan chiqarishi** mumkin (buyurtmalar tarixi saqlanadi). Bloklangan xodim hech qanday amal bajara olmaydi.

**Buyurtma oqimi qisqacha:**
1. Mijoz buyurtma beradi → qoldiq zaxiraga olinadi → guruhga xabar ("Qabul qilish" tugmasi).
2. Sotuvchi qabul qiladi → shaxsiy chatida karta: "Tayyorlashni boshlash", "Tayyor", "Bekor qilish".
3. Kg/gramm mahsulotlarda sotuvchi mini app'da aniq og'irlikni kiritadi → summa qayta hisoblanadi.
4. "Tayyor" → bot rasm so'raydi → sotuvchi kamera bilan rasm yuboradi (rasmsiz "Tayyor" bo'lmaydi) → mijozga rasm va yakuniy summa boradi.
5. Yetkazish: kuryerlarga "Olib ketaman" → "Yo'lga chiqdim" → "Yetkazildi". Olib ketish: sotuvchi "Topshirildi" bosadi.
6. Buyurtma `acceptTimeoutMinutes` (standart 10 daqiqa) ichida qabul qilinmasa, guruhga va adminga ogohlantirish boradi.
7. Har kuni 09:00 da omborchi va adminga kam qolgan mahsulotlar ro'yxati keladi.

---

## 7. Tez-tez uchraydigan xatolar

| Muammo | Sabab va yechim |
|---|---|
| Deploy Logs: `Majburiy environment o'zgaruvchilari topilmadi` | Ko'rsatilgan o'zgaruvchilarni **Variables** ga qo'shing. |
| `Botga ulanib bo'lmadi. BOT_TOKEN to'g'riligini tekshiring` | Token xato nusxalangan yoki `/revoke` qilingan. BotFather'dan yangisini oling. |
| Bot `/start` ga javob bermaydi | `WEBAPP_URL` Railway domeni bilan bir xilmi? `https://` bilan va oxirida `/` siz bo'lishi kerak. Domen o'zgargan bo'lsa, o'zgaruvchini yangilab qayta deploy qiling. |
| Guruhga buyurtma kelmaydi | Bot guruhda admin emas yoki `ORDERS_GROUP_CHAT_ID` xato (minus va `-100` prefiksini tekshiring). Guruh "supergroup"ga aylanganda ID o'zgaradi — qaytadan oling. |
| Mini app'da "Avval ro'yxatdan o'ting" | Foydalanuvchi botda telefon raqamini ulashmagan. Botga `/start` yozsin. |
| Mini app "Telegram ma'lumotlari yaroqsiz" | Mini app Telegram tashqarisida ochilgan yoki 24 soatdan ko'p ochiq turgan. Botdagi tugma orqali qayta oching. |
| Rasmlar deploy'dan keyin yo'qoladi | Volume `/data` ga ulanmagan yoki `UPLOAD_DIR` `/data/uploads` emas. |
| AI rasm "xato berdi" | `GEMINI_API_KEY` xato, billing yoqilmagan yoki model nomi o'zgargan. `GEMINI_IMAGE_MODEL` ni AI Studio'dagi rasm modeli nomiga moslang. Original rasm baribir ishlaydi. |
| Web panelga kira olmayapman ("Ko'p xato urinish") | 15 daqiqa kuting. Parolni unutgan bo'lsangiz `ADMIN_WEB_PASSWORD` ni o'zgartiring — server qayta ishga tushganda yangilaydi. |
| "Hozir ish vaqtidan tashqari" | Sozlamalardagi ish vaqtini tekshiring. 24 soat ishlash uchun boshlanish va tugash vaqtini bir xil qiling (masalan `00:00` – `00:00`). |
| `P1001: Can't reach database server` | Postgres servisi ishlamayapti yoki `DATABASE_URL` noto'g'ri. `${{Postgres.DATABASE_URL}}` ko'rinishida bo'lsin. |

---

## 8. Dasturchilar uchun

### Tuzilma
```
/server     Express API, bot (grammY), cron, AI navbati
  src/bot        bot handlerlari, bildirishnomalar
  src/routes     auth, catalog, customer (shop), staff, manage, admin
  src/services   orders (holatlar), ai, broadcast, cron, export, stats, storage
/web        React (Vite)
  src/app        Telegram Mini App (mijoz + xodimlar)
  src/admin      Web admin (login + layout)
  src/adminPages admin sahifalari (mini app va web uchun umumiy)
  src/shared     UI komponentlar, i18n, API klient
/prisma     schema.prisma, migrations, seed.ts
Dockerfile, railway.json
```

### Lokal ishga tushirish
```bash
npm install
```
`.env.example` dan nusxa olib `.env` yarating (`BOT_WEBHOOK=false`, `NODE_ENV=development`, `UPLOAD_DIR=./uploads-dev`).
```bash
npx prisma migrate deploy
```
```bash
npm run db:seed
```
```bash
npm run dev:server
```
```bash
npm run dev:web
```
Mini app'ni Telegram ichida sinash uchun HTTPS kerak (masalan ngrok/cloudflared tunnel) va `WEBAPP_URL` ni tunnel manziliga qo'ying.

### Buyruqlar
- `npm run build` — Prisma client, frontend va backendni quradi
- `npm start` — `prisma migrate deploy`, keyin server
- `npm run typecheck` — TypeScript tekshiruvi

### Xavfsizlik
- Mini app'dagi har bir so'rov `Authorization: tma <initData>` sarlavhasi bilan keladi; server HMAC-SHA256 bilan tekshiradi, `auth_date` 24 soatdan eski bo'lmasligi kerak.
- Rollar har bir endpoint'da server tomonida tekshiriladi.
- Web admin: bcrypt, JWT httpOnly cookie (`SameSite=Strict`), 5 xato urinishdan keyin 15 daqiqa blok.
- Webhook `secret_token` bilan himoyalangan; helmet, rate limit, CORS faqat o'z domeni.
- Pul summalari butun son (so'm), miqdorlar `Decimal`.
- Buyurtmani qabul qilish va kuryer biriktirish atomar `UPDATE ... WHERE status = ...` bilan (race condition'dan himoya).
