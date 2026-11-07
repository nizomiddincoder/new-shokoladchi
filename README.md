# Shokoladchi — Telegram Mini App buyurtma tizimi (MVP)

Mijozlar Telegram bot ichidagi Mini App orqali mahsulot tanlab buyurtma beradi, admin esa web panel orqali buyurtmalar, mahsulotlar, kategoriyalar, filiallar, mijozlar va omborni boshqaradi.

- **Til:** o'zbek (lotin), i18n kalitlari bilan (rus tili keyin qo'shiladi)
- **Valyuta:** so'm (UZS), `45 000 so'm` formatida
- **Dizayn:** shokolad brend palesti, mobile-first, Telegram light/dark rejimlari

## Texnologiyalar

| Qism | Texnologiya |
|---|---|
| Frontend | React 18 + Vite + React Router + Telegram WebApp SDK + Leaflet (xarita) |
| Backend | Node.js + Express (REST API) |
| Baza | SQLite (better-sqlite3) — keyin PostgreSQL'ga ko'chirish oson |
| Bot | grammY (buyurtma/holat xabarlari) |
| Auth | initData imzosi (mijoz) + JWT; admin: login/parol (bcrypt) |

## Papka tuzilmasi

```
Shokoladchi/
├── server/                  # Backend (Express)
│   ├── src/
│   │   ├── index.js         # Kirish nuqtasi, Express + statik rasmlar
│   │   ├── db.js            # SQLite ulanishi
│   │   ├── schema.sql       # Jadvallar (users, categories, products, ...)
│   │   ├── seed.js          # Demo ma'lumotlar (admin, mahsulotlar, filiallar)
│   │   ├── telegram.js      # grammY boti + bildirishnomalar
│   │   ├── telegram-init-data.js  # initData HMAC tekshiruvi
│   │   ├── order-utils.js   # Buyurtma raqami, pul formati, xabar matnlari
│   │   ├── middleware/auth.js     # JWT middleware'lar
│   │   └── routes/
│   │       ├── customer.js  # /api/customer/* (auth, katalog, buyurtmalar)
│   │       └── admin.js     # /api/admin/* (login, stats, CRUD, eksport)
│   ├── scripts/smoke-test.js  # Asosiy oqimlar testi
│   ├── uploads/             # Mahsulot rasmlari
│   └── .env.example
└── web/                     # Frontend (Vite)
    ├── src/
    │   ├── App.jsx          # /admin/* → admin, qolganlari → mijoz ilovasi
    │   ├── main.jsx
    │   ├── styles/design-system.css  # Umumiy dizayn tizimi (shokolad palit)
    │   ├── lib/             # api, format, i18n, telegram, status
    │   ├── components/      # Icons.jsx (SVG ikonkalar), ui.jsx
    │   ├── customer/        # Mini App sahifalari
    │   └── admin/           # Admin panel sahifalari
    ├── netlify.toml
    └── .env.example
```

## 1. Lokal o'rnatish

### Backend

```bash
cd server
npm install
copy .env.example .env      # Linux/macOS: cp
# .env faylini to'ldiring (kamida JWT_SECRET; DEV_AUTH=1 test uchun)
npm run seed                # admin/admin123 + demo mahsulotlar
npm run dev                 # http://localhost:3000
```

### Frontend

```bash
cd web
npm install
npm run dev                 # http://localhost:5173 (API localhost:3000'ga proksi)
```

- Mini App: http://localhost:5173 (Telegram'dan tashqarida `DEV_AUTH=1` bilan test mijazi ishlaydi)
- Admin panel: http://localhost:5173/admin (`admin` / `admin123`)

### Smoke test

```bash
# 1-terminal (Windows cmd):
cd server
set DEV_AUTH=1&& set PORT=3111&& node src/index.js

# 2-terminal:
cd server
node scripts/smoke-test.js
```

## 2. Siz sozlashingiz kerak bo'lgan narsalar

1. **BOT_TOKEN** — @BotFather'da `/newbot` → berilgan tokenni `server/.env` ga yozing.
2. **ADMIN_CHAT_ID** — @userinfobot'ga xabar yozing, sizning ID'ingizni qaytaradi. Yangi buyurtmalar shu chatga keladi.
3. **BotFather → Mini App sozlamasi:**
   - `/mybots` → botni tanlang → **Bot Settings → Menu Button** → URL'ga Netlify domeningizni yozing (`https://sizning-app.netlify.app`)
   - yoki `/newapp` buyrug'i bilan Web App yaratish
   - **Muhim:** URL **https** bo'lishi shart (Netlify o'zi beradi).
4. **JWT_SECRET** — uzun tasodifiy satr (masalan, `openssl rand -hex 32`).
5. **WEB_APP_URL** — Netlify domeni (botdagi «Buyurtma berish» tugmasi shu yerga ochadi).
6. **BASE_URL** — Railway domeni (rasmlar to'liq URL'da ishlashi uchun).
7. Admin parolini seed'dan keyin o'zgartiring (yoki `ADMIN_PASSWORD` bilan seed qiling).

## 3. Deploy

### Backend → Railway

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub** (repouni avval git'ga yuklang).
2. **Variables** bo'limiga `.env.example` dagi barcha qiymatlarni kiriting:
   `BOT_TOKEN, ADMIN_CHAT_ID, JWT_SECRET, WEB_APP_URL, BASE_URL, ADMIN_LOGIN, ADMIN_PASSWORD`
3. **Settings:**
   - Build Command: `npm install && npm run seed`
   - Start Command: `npm start`
4. **Volume qo'shing** (SQLite va rasmlar uchun): Settings → Volumes → mount: `/data`
   - `DB_PATH=/data/shokoladchi.db`, `UPLOAD_DIR=/data/uploads`
5. **Networking → Generate Domain** → `BASE_URL` shu domen bo'ladi.
   Bot long polling ishlatadi — webhook kerak emas.

### Frontend → Netlify

1. [netlify.com](https://netlify.com) → **Add new site → Import from Git** → `web` papkasini tanlang.
   (Netlify avtomatik `netlify.toml` ni o'qiydi: build `npm run build`, publish `dist`.)
2. **Environment variables:** `VITE_API_URL = https://sizning-backend.up.railway.app`
3. Deploy tugagach domen oling → shu domenni BotFather va `WEB_APP_URL` ga yozing.

## 4. Sinov ro'yxati (checklist)

### Mijoz oqimi
- [ ] Botda `/start` → «Buyurtma berish» tugmasi Mini App'ni ochadi
- [ ] Birinchi kirishda ism + telefon so'raladi («Raqamni ulashish» yoki qo'lda +998 formati)
- [ ] Qayta kirganda ma'lumotlar saqlanangan — so'ralmaydi
- [ ] Kategoriya chiplari filtrlaydi, qidiruv ishlaydi
- [ ] Mahsulot kartochkasi: miqdor tanlash + «Savatga qo'shish · narx»
- [ ] Savatda miqdor o'zgartirish/o'chirish, jami summa to'g'ri
- [ ] Yetkazib berish: «Joriy lokatsiya» yoki xaritadan tanlash + izoh
- [ ] Olib ketish: filial tanlanadi, manzil ko'rinadi
- [ ] Buyurtma raqami (#1001...) va holati ko'rsatiladi
- [ ] Buyurtmalar tarixi va holat kuzatuvi ishlaydi
- [ ] Yangi buyurtmada **admin Telegram chatiga xabar keladi**

### Admin oqimi
- [ ] `/admin` da login/parol bilan kirish (parollar hash)
- [ ] Hisobotlar: bugun/hafta/oy/oraliq — buyurtmalar, tushum, o'rtacha chek
- [ ] Top 10 mahsulot, kategoriyalar tushumi, olib ketish/yetkazish nisbati
- [ ] CSV (Excel) yuklab olish ochiladi
- [ ] Buyurtmalar filtri (holat, sana, tur) ishlaydi
- [ ] Buyurtma tafsilotida lokatsiya «Google Maps/Yandex»da ochiladi
- [ ] Holat o'zgartirilganda **mijozga Telegram xabar keladi**
- [ ] Yetkazish narxi kiritilsa jami summa yangilanadi
- [ ] Mahsulot: rasm yuklash, narx, qoldiq, kategoriya, faol/noFaol
- [ ] Mahsulotni «o'chirish» aslida faol emas qiladi (tarix saqlanadi)
- [ ] Kategoriya: qo'shish/tahrirlash/o'chirish (ichida mahsulot bo'lsa o'chirmaydi)
- [ ] Filiallar CRUD ishlaydi
- [ ] Mijozlar ro'yxati faqat ko'rinishda
- [ ] Ombor: kirim/chiqim, kam qoldiq ogohlantirishlari

### Xavfsizlik
- [ ] initData imzosi tekshiriladi (noto'g'ri imzo → 401)
- [ ] Token'siz admin API 401 qaytaradi
- [ ] Produksiyada `DEV_AUTH=0`

## 5. Asosiy API

| Metod | Yo'l | Tavsif |
|---|---|---|
| POST | `/api/customer/auth` | initData tekshirib JWT beradi |
| PATCH | `/api/customer/profile` | Ism/telefon saqlash |
| GET | `/api/customer/catalog` | Kategoriyalar + faol mahsulotlar |
| GET | `/api/customer/branches` | Filiallar |
| POST | `/api/customer/orders` | Buyurtma yaratish (narxlar bazadan) |
| GET | `/api/customer/orders(/:id)` | Buyurtmalar tarixi / bittasi |
| POST | `/api/admin/login` | Admin JWT |
| GET | `/api/admin/stats` | Hisobot (period/from/to) |
| GET | `/api/admin/export/orders.csv` | CSV eksport |
| GET/PATCH | `/api/admin/orders(/:id)` | Ro'yxat / holat + yetkazish narxi |
| CRUD | `/api/admin/products` | Mahsulotlar (DELETE → faol emas) |
| CRUD | `/api/admin/categories`, `/api/admin/branches` | Kategoriya, filial |
| GET | `/api/admin/customers` | Mijozlar (faqat o'qish) |
| GET/POST | `/api/admin/stock...` | Ombor qoldiqlari va harakatlar |

## 6. Keyingi bosqichlar (MVP'da YO'Q)

To'lov (Click/Payme), bonus/chegirma, ko'p tillilik (lug'at tayyor), kuryer ilovasi, push-bildirishnomalar, masofaga qarab yetkazish narxi, S3 rasm yuklash, PostgreSQL'ga migratsiya.
