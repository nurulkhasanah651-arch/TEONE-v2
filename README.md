# TEONE v2 — Traveling Eropa One System

Sistem operasi travel terpadu untuk Traveling Eropa.

**Stack:** Next.js 15 (App Router) · React 19 · Tailwind CSS · Supabase

## Status

V2 sedang dibangun ulang dari awal. Database Supabase tetap (project lama dipakai), tapi codebase fresh.

- [x] Week 0 — Project scaffolding (Next.js + Tailwind + Supabase setup)
- [ ] Week 1 — Login + Role picker + Dashboard shell
- [ ] Week 2 — Master Trip + Portal TL
- [ ] Week 3 — Finance + CS Daily + domain swap

## Setup (one-time, sebelum deploy pertama)

1. Buat repo GitHub baru: `TEONE-v2`
2. Upload semua file di folder ini ke repo
3. Buat Vercel project baru, import dari repo `TEONE-v2`
4. Tambah environment variables di Vercel (Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL` — dari Supabase dashboard → Project Settings → API
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — sama, ambil `anon public` key
   - `INTERNAL_CODE_OPS` — password tim Ops
   - `INTERNAL_CODE_FINANCE` — password tim Finance
   - `INTERNAL_CODE_CS` — password tim CS
5. Configure Supabase Auth:
   - Authentication → URL Configuration
   - Add redirect URL: `https://<preview-url>.vercel.app/auth/callback`
   - Add redirect URL: `https://teone.dev/auth/callback` (setelah swap domain)
6. Deploy

## Folder structure

```
TEONE-v2/
├── app/                    Next.js App Router pages
│   ├── login/              Login page
│   ├── auth/callback/      OAuth callback handler
│   ├── dashboard/          Main dashboard (after login)
│   ├── layout.jsx          Root layout
│   ├── page.jsx            Root redirect (→ login or dashboard)
│   └── globals.css         Tailwind imports
├── components/             Reusable React components
├── lib/
│   ├── supabase/           Supabase client setup
│   └── utils/              Helper functions
├── middleware.js           Auth protection middleware
├── package.json
├── next.config.mjs
├── tailwind.config.js
└── README.md
```

## Anti-crash principles

Belajar dari v1, V2 follows these rules strictly:

1. **NO inline styles** untuk theming — pakai Tailwind classes
2. **NO CSS injection / dynamic CSS** — itu yang bikin v1 crash
3. **Max ~300 baris per file** — v1 punya file 10.000+ baris
4. **Server Components by default** — Client Components hanya untuk yang perlu interactivity
5. **Test setiap fitur sebelum lanjut** — 1 fitur = 1 branch = 1 PR
