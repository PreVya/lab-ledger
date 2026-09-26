# Pratham Lab Ledger — Windows Desktop App

Packages the existing app (React frontend + NestJS backend + Supabase
PostgreSQL) into a shareable Windows installer: **Pratham Lab Ledger Setup.exe**.

Nothing about the business logic, database, or environment files changes.
The desktop app starts the local backend silently, opens the UI in a desktop
window, and uses the existing Supabase connection exactly as today.

## One-time setup (on the Windows build machine)

1. Install Node.js ≥ 20 and Yarn (`npm i -g yarn`).
2. From the project root:

   ```bash
   yarn install          # installs electron + electron-builder too
   cd backend
   yarn install          # IMPORTANT: run on Windows so Prisma gets Windows engines
   yarn prisma:generate
   cd ..
   ```

3. Make sure `backend/.env` exists with the existing working values
   (DATABASE_URL pooler on port 6543 with `?pgbouncer=true`, JWT_SECRET, …).
   **Do not change these values.** The installer bundles this file as-is.

## Build the installer

From the project root:

```bash
# 1. Build the backend
cd backend
yarn build
cd ..

# 2. Build the frontend (output goes to .output/public, not dist)
yarn build

# 3. Build the Windows installer
yarn electron:build
```

The installer is generated at:

```
release/Pratham Lab Ledger Setup <version>.exe
```

## Testing without an installer (optional)

```bash
yarn electron:pack     # unpackaged app folder under release/ — quick check
```

## What the installed app does

1. Installs like a normal Windows program (desktop + start menu shortcut).
2. Double-click the shortcut — no terminal, no browser opens.
3. The app starts the NestJS backend silently in the background
   (`backend/dist/main.js`, reading the bundled `backend/.env`).
4. Waits for `http://localhost:3000/api` to respond, then shows the UI.
5. If the backend cannot start, the user sees:
   **"Pratham backend could not start. Please contact Prerana."**

## Notes

- Prisma query engines are platform-specific. Always run
  `backend/yarn install && yarn prisma:generate` **on Windows** before
  building the installer, so the bundled `backend/node_modules` contains
  Windows engines.
- The backend keeps using the existing Supabase pooler URLs — the target
  Windows machines need internet access to reach Supabase, same as today.
- App icon: the build uses the default Electron icon. To add a custom one,
  place a 256×256 `build/icon.ico` and add `icon: build/icon.ico` under
  `win:` in `electron-builder.yml`.
- Frontend build output is `.output/public` (not `dist`); the installer copies it to `resources/frontend`.
- Dev mode: `yarn electron:dev` opens Electron against the Vite dev server
  (`yarn dev`) with the backend running separately.
