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
   (`backend/dist/src/main.js`, reading the bundled `backend/.env`).
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
- Frontend build output is `.output/public` (not `dist`); the installer copies it to `resources/frontend`.
- Dev mode: `yarn electron:dev` opens Electron against the Vite dev server
  (`yarn dev`) with the backend running separately.

## Update — frontend output & app icon

**Frontend build output.** `yarn build` produces a server-rendered build (no `index.html`).
The output folder is detected from `nitro.json` — currently `dist/` (`dist/client` + `dist/server`),
or `.output/` if the build preset is changed to Node. `yarn electron:pack` / `yarn electron:build`
first run `scripts/prepare-desktop.cjs`, which copies whichever one exists into `desktop-frontend/`;
electron-builder only packages that folder, so there is no "file source doesn't exist … dist" warning.
At runtime the desktop app runs this built frontend on `http://127.0.0.1:5174` and opens it.

Order: `yarn build` → `cd backend && yarn build` → `cd .. && yarn electron:pack`.

**App icon.** See "Logos & desktop icon" below.

**Bill logo.** The bill uses `public/lab-logo.png` — change `BILL_LOGO_PATH` in `src/lib/lab-profile.ts` to swap it.

## Logos & desktop icon

1. `public/lab-logo.png` (transparent PNG) is the single logo source: bill header, in-app display and desktop icon.
2. `build/icon.ico` is **auto-generated** by `scripts/prepare-desktop.cjs` (run by `yarn electron:pack` / `yarn electron:build`):
   a real multi-size ICO (256, 128, 64, 48, 32, 16 px), regenerated when missing or when the PNG is newer.
3. No manual ImageMagick step is required.
4. If the icon looks stale, delete `build/icon.ico` and rerun `yarn electron:build`.
5. Rebuild:
   ```bash
   yarn install
   yarn build
   yarn electron:build
   ```
