# Pathology Lab — Backend (NestJS + Prisma + PostgreSQL)

Production-style modular monolith. Microservice-ready: each module is self-contained.

> **Database:** standard PostgreSQL via Prisma. Works with any Postgres host —
> we use **Supabase Postgres** in production. The app is provider-agnostic.

## Prerequisites

- Node.js ≥ 20
- **Yarn** (`npm i -g yarn`)
- A PostgreSQL database (Supabase recommended)

## 1) Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project.
2. **Project Settings → Database → Connection string → URI** — copy two values:
   - **Connection pooling** (port `6543`, pgbouncer) → use for `DATABASE_URL`
   - **Direct connection** (port `5432`) → use for `DIRECT_URL` (Prisma migrations)
3. Do **not** paste these credentials into Git. They go only into your local `.env`.

## 2) Configure environment

```bash
cd backend
cp .env.example .env
# Edit .env and paste the two connection strings + a strong JWT_SECRET
```

`backend/.env` is git-ignored. Never commit real credentials.

The server validates env on boot and exits with a clear message if
`DATABASE_URL` / `JWT_SECRET` are missing or malformed.

## 3) Install & run

```bash
yarn install
yarn prisma:generate
yarn prisma:migrate:dev      # first time only — creates tables on Supabase
yarn seed                    # default admin (admin / admin123) + sample tests
yarn start:dev               # http://localhost:3000/api
```

For production deploys use `yarn prisma:migrate` (= `prisma migrate deploy`).

## Environment variables

| Var              | Required | Description                                                       |
| ---------------- | -------- | ----------------------------------------------------------------- |
| `DATABASE_URL`   | ✅       | PostgreSQL URL used by the app (Supabase pooled, port 6543).      |
| `DIRECT_URL`     | optional | Direct Postgres URL (port 5432) for Prisma Migrate when pooling.  |
| `JWT_SECRET`     | ✅       | ≥16 chars. Used to sign auth tokens.                              |
| `JWT_EXPIRES_IN` | optional | Default `12h`.                                                    |
| `PORT`           | optional | Default `3000`.                                                   |
| `CORS_ORIGIN`    | optional | Comma-separated list of allowed frontend origins.                 |

## Modules

```
src/
  main.ts
  app.module.ts
  config/env.validation.ts
  prisma/prisma.service.ts
  common/
    guards/jwt-auth.guard.ts
    guards/roles.guard.ts
    decorators/roles.decorator.ts
    decorators/current-user.decorator.ts
  modules/
    auth/        # login, JWT, admin-creates-users
    users/       # CRUD users + roles
    tests/       # test catalog
    patients/    # patient entries + daily serial
    payments/    # append-only payment audit log
    ledger/      # daily ledger automation
    expenses/    # today's expenses
```

## Roles

`admin | receptionist | technician | doctor` — enforced via `@Roles()` + `RolesGuard`.

## Daily ledger automation

`LedgerService.ensureToday()` runs on every Today-Register fetch:
- If today's ledger row exists → return it.
- Else create it with `openingBalance = previousDay.closingBalance ?? 0`.

`closingBalance` is recomputed live as: `opening + sum(net advances today) - sum(expenses today)`.

## Patient daily serial

`patients.dailySerial` is `MAX(dailySerial WHERE entryDate = today) + 1`, computed inside a transaction to avoid races. Display ID = `YYYYMMDD-NNN`.
