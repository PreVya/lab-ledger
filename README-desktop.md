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

## Update — frontend output & app icon

**Frontend build output.** `yarn build` produces a server-rendered build (no `index.html`).
The output folder is detected from `nitro.json` — currently `dist/` (`dist/client` + `dist/server`),
or `.output/` if the build preset is changed to Node. `yarn electron:pack` / `yarn electron:build`
first run `scripts/prepare-desktop.cjs`, which copies whichever one exists into `desktop-frontend/`;
electron-builder only packages that folder, so there is no "file source doesn't exist … dist" warning.
At runtime the desktop app runs this built frontend on `http://127.0.0.1:5174` and opens it.

Order: `yarn build` → `cd backend && yarn build` → `cd .. && yarn electron:pack`.

**App icon.**
1. The icon file lives at `build/icon.ico` (already generated from `public/lab-logo.png`, 16–256 px).
2. It must be a real `.ico` file — never a renamed PNG/JPG.
3. Recommended: include a 256x256 size.
4. To replace it: convert your logo to `.ico` (e.g. an online PNG→ICO converter, or
   `magick public/lab-logo.png -define icon:auto-resize=256,128,64,48,32,16 build/icon.ico`).
   If `build/icon.ico` is missing, `electron:prepare` tries to create one from `public/lab-logo.png`.
It is used for the app window, the Windows app, the installer and the uninstaller.

**Bill logo.** The bill uses `public/lab-logo.png` — change `BILL_LOGO_PATH` in `src/lib/lab-profile.ts` to swap it.
