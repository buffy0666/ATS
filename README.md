# ATS

A minimal applicant tracking system. Next.js (App Router) + TypeScript + Tailwind + Prisma (Postgres) + NextAuth.

## Features (v1)

- Email/password auth with `ADMIN` and `RECRUITER` roles
- Job postings (create, list, view, status)
- Candidate profiles with resume upload (PDF/DOCX, stored on local disk by default)
- Per-job pipeline view (Applied → Screen → Interview → Offer → Hired/Rejected) with inline stage updates

## Getting started

### 1. Prerequisites

- Node 20+ and npm
- A Postgres database. For local dev, the easiest options are:
  - [Neon](https://neon.tech) (free tier, hosted)
  - [Supabase](https://supabase.com) (free tier, hosted)
  - Docker: `docker run --name ats-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16`

### 2. Install and configure

```bash
npm install
cp .env.example .env
# Edit .env:
#   DATABASE_URL=postgresql://...
#   AUTH_SECRET=$(npx auth secret)
```

### 3. Initialize the database

```bash
npm run db:push        # creates tables from prisma/schema.prisma
npm run db:seed        # creates an admin user
```

The seed prints the admin email and password — change them by setting `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` before running.

### 4. Run the app

```bash
npm run dev
```

Open http://localhost:3000 and sign in with the seeded admin credentials.

## Project structure

```
prisma/
  schema.prisma          # data model
  seed.ts                # seeds the first admin
src/
  auth.ts                # NextAuth (node) — credentials + bcrypt
  auth.config.ts         # NextAuth (edge-safe) — used by middleware
  middleware.ts          # protects all routes except /login and /api/auth
  lib/prisma.ts          # prisma client singleton
  components/Nav.tsx
  app/
    page.tsx             # dashboard
    login/               # login page + signin action
    jobs/                # list, new, [id] (pipeline)
    candidates/          # list, new (with resume upload), [id]
    api/auth/[...nextauth]/route.ts
```

## Production notes

- Resume storage: the default `UPLOAD_DIR=./public/uploads` is fine for local dev but won't persist on serverless platforms (Vercel) where the filesystem is read-only. Swap `saveResume` in `src/app/candidates/actions.ts` for S3 / R2 / Vercel Blob before deploying.
- The default seed password is publicly known — rotate it immediately, or seed with env vars in CI.
- `next-auth` is on the v5 beta; pin a specific version once you go to prod.
