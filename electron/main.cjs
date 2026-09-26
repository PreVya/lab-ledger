/**
 * Pratham Lab Ledger — Electron main process.
 *
 * Packaged mode:
 *   1. Starts the built NestJS backend (backend/dist/main.js) silently.
 *   2. Waits for http://localhost:3000/api to answer.
 *   3. Serves the built frontend from a tiny in-process static server.
 *   4. Opens the desktop window. No terminal, no browser.
 *
 * Dev mode (ELECTRON_DEV=1): loads the Vite dev server on :8080 and
 * assumes the backend is already running (or starts it the same way).
 */

const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const BACKEND_PORT = 3000;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}/api`;
const FRONTEND_PORT = 5174;
const IS_DEV = process.env.ELECTRON_DEV === "1";

let backendProc = null;
let staticServer = null;
let mainWindow = null;

function resourcePath(...parts) {
  // Packaged: resources/backend, resources/frontend. Dev: project root.
  const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
  return path.join(base, ...parts);
}

function startBackend() {
  const backendDir = resourcePath("backend");
  const entry = path.join(backendDir, "dist", "main.js");
  if (!fs.existsSync(entry)) {
    throw new Error(`Backend entry not found: ${entry}`);
  }
  // cwd = backend dir so backend/.env and prisma resolve exactly as today.
  backendProc = spawn(process.execPath, [entry], {
    cwd: backendDir,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "ignore",
    windowsHide: true,
  });
  backendProc.on("exit", (code) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      showFatalError(`Backend process exited (code ${code}).`);
    }
  });
}

function waitForBackend(timeoutMs = 60000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(BACKEND_URL, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error("Backend did not become ready in time."));
        } else {
          setTimeout(tryOnce, 500);
        }
      });
      req.setTimeout(2000, () => req.destroy());
    };
    tryOnce();
  });
}

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function startStaticServer() {
  // Built client assets: packaged -> resources/frontend (copied from
  // .output/public); unpackaged -> <project>/.output/public.
  const candidates = app.isPackaged
    ? [resourcePath("frontend")]
    : [resourcePath(".output", "public")];
  const root = candidates.find((p) => fs.existsSync(path.join(p, "index.html"))) || candidates[0];

  return new Promise((resolve, reject) => {
    staticServer = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      let file = path.join(root, urlPath === "/" ? "index.html" : urlPath);
      if (!file.startsWith(root)) {
        res.writeHead(403);
        return res.end();
      }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(root, "index.html"); // SPA fallback
      }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    staticServer.once("error", reject);
    staticServer.listen(FRONTEND_PORT, "127.0.0.1", () => resolve());
  });
}

function showFatalError(detail) {
  dialog.showErrorBox(
    "Pratham Lab Ledger",
    "Pratham backend could not start. Please contact Prerana." +
      (detail ? `\n\n(${detail})` : ""),
  );
  app.quit();
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "Pratham Lab Ledger",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (IS_DEV) {
    await mainWindow.loadURL("http://localhost:8080");
    return;
  }

  try {
    startBackend();
    await waitForBackend();
    await startStaticServer();
    await mainWindow.loadURL(`http://127.0.0.1:${FRONTEND_PORT}/`);
  } catch (err) {
    showFatalError(err && err.message);
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (backendProc) backendProc.kill();
  if (staticServer) staticServer.close();
  app.quit();
});

app.on("before-quit", () => {
  if (backendProc) backendProc.kill();
});
