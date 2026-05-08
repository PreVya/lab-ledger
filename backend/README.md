# Pathology Lab — Backend (NestJS + Prisma + PostgreSQL)

Production-style modular monolith. Microservice-ready: each module is self-contained.

## Quick start

```bash
cd backend
npm install
cp .env.example .env       # set DATABASE_URL + JWT_SECRET
npx prisma migrate dev     # create schema
npm run seed               # creates default admin (admin / admin123) + sample tests
npm run start:dev          # http://localhost:3000
```

The frontend reads `VITE_API_BASE_URL` (default `http://localhost:3000`).

## Modules

```
src/
  main.ts
  app.module.ts
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

## Migration to microservices later

Each `modules/*` folder owns its Prisma models, DTOs, controller, service. Splitting one out = move the folder + its Prisma models into a new repo and replace direct service injections with HTTP clients.
