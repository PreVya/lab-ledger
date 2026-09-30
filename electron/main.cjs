/**
 * Pratham Lab Ledger — Electron main process.
 *
 * Packaged mode:
 *   1. Starts the built NestJS backend (backend/dist/main.js) silently.
 *   2. Waits for http://localhost:3000/api to answer.
 *   3. Runs the built (server-rendered) frontend on a local port.
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

/**
 * Frontend is a server-rendered (Nitro) build — there is NO index.html.
 * We read nitro.json to find the server entry + public dir, then:
 *   - node presets: run the built server itself on FRONTEND_PORT;
 *   - fetch-handler presets (cloudflare-module, current default): wrap its
 *     `fetch(request)` in a local http server, serving static assets first.
 */
function frontendRoot() {
  const candidates = app.isPackaged
    ? [resourcePath("frontend")]
    : [resourcePath("desktop-frontend"), resourcePath("dist"), resourcePath(".output")];
  const root = candidates.find((p) => fs.existsSync(path.join(p, "nitro.json")));
  if (!root) throw new Error("Frontend build not found. Run `yarn build` then `yarn electron:prepare`.");
  return root;
}

let frontendProc = null;

async function startFrontendServer() {
  const root = frontendRoot();
  const meta = JSON.parse(fs.readFileSync(path.join(root, "nitro.json"), "utf8"));
  const entry = path.join(root, meta.serverEntry || "server/index.mjs");
  const publicDir = path.join(root, meta.publicDir || "public");
  const preset = String(meta.preset || "");

  if (preset.startsWith("node")) {
    frontendProc = spawn(process.execPath, [entry], {
      cwd: root,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PORT: String(FRONTEND_PORT), HOST: "127.0.0.1", NITRO_PORT: String(FRONTEND_PORT), NITRO_HOST: "127.0.0.1" },
      stdio: "ignore",
      windowsHide: true,
    });
    await waitForUrl(`http://127.0.0.1:${FRONTEND_PORT}/`);
    return;
  }

  const { pathToFileURL } = require("url");
  const mod = await import(pathToFileURL(entry).href);
  const handler = mod.default;
  const ctx = { waitUntil() {}, passThroughOnException() {} };

  await new Promise((resolve, reject) => {
    staticServer = http.createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        const file = path.join(publicDir, urlPath);
        if (file.startsWith(publicDir) && urlPath !== "/" && fs.existsSync(file) && fs.statSync(file).isFile()) {
          const ext = path.extname(file).toLowerCase();
          res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
          return fs.createReadStream(file).pipe(res);
        }
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = chunks.length && req.method !== "GET" && req.method !== "HEAD" ? Buffer.concat(chunks) : undefined;
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
        const request = new Request(`http://127.0.0.1:${FRONTEND_PORT}${req.url}`, { method: req.method, headers, body });
        const response = await handler.fetch(request, {}, ctx);
        const out = {};
        response.headers.forEach((v, k) => { if (k !== "content-encoding" && k !== "content-length") out[k] = v; });
        res.writeHead(response.status, out);
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Frontend error: " + (e && e.message));
      }
    });
    staticServer.once("error", reject);
    staticServer.listen(FRONTEND_PORT, "127.0.0.1", () => resolve());
  });
}

function waitForUrl(url, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const r = http.get(url, (res) => { res.resume(); resolve(); });
      r.on("error", () => (Date.now() - started > timeoutMs ? reject(new Error("Frontend did not start.")) : setTimeout(tryOnce, 300)));
    };
    tryOnce();
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
    icon: fs.existsSync(path.join(__dirname, "..", "build", "icon.ico")) ? path.join(__dirname, "..", "build", "icon.ico") : undefined,
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
    await startFrontendServer();
    await mainWindow.loadURL(`http://127.0.0.1:${FRONTEND_PORT}/`);
  } catch (err) {
    showFatalError(err && err.message);
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (backendProc) backendProc.kill();
  if (staticServer) staticServer.close();
  if (frontendProc) frontendProc.kill();
  app.quit();
});

app.on("before-quit", () => {
  if (backendProc) backendProc.kill();
});
