/**
 * Copies the ACTUAL frontend build output into ./desktop-frontend so
 * electron-builder always has one fixed, existing folder to package.
 *
 * Supported build outputs (detected via nitro.json, never assumed):
 *   - dist/          (current: nitro cloudflare-module preset -> dist/client + dist/server)
 *   - .output/       (nitro node preset -> .output/public + .output/server)
 * Also optionally converts public/lab-logo.png -> build/icon.ico if missing.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const target = path.join(root, "desktop-frontend");

const candidates = [path.join(root, "dist"), path.join(root, ".output")];
const src = candidates.find((d) => fs.existsSync(path.join(d, "nitro.json")));
if (!src) {
  console.error("No frontend build found (looked for dist/nitro.json and .output/nitro.json). Run `yarn build` first.");
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(src, target, { recursive: true });
console.log(`[prepare-desktop] copied ${path.relative(root, src)} -> desktop-frontend`);

// Desktop icon: build/icon.ico is generated from DESKTOP_ICON_SOURCE (JPG).
// The PNG logo (public/lab-logo.png) is for bills/in-app only and is never used here.
const DESKTOP_ICON_SOURCE = path.join(root, "public", "lab-logo.jpg");
const ico = path.join(root, "build", "icon.ico");
if (!fs.existsSync(ico)) {
  console.log("[prepare-desktop] build/icon.ico is missing — the default Electron icon will be used.");
  console.log("  Create it from public/lab-logo.jpg (see README-desktop.md), e.g.:");
  console.log("  magick public/lab-logo.jpg -resize 256x256 -define icon:auto-resize=256,128,64,48,32,16 build/icon.ico");
} else if (fs.existsSync(DESKTOP_ICON_SOURCE) && fs.statSync(DESKTOP_ICON_SOURCE).mtimeMs > fs.statSync(ico).mtimeMs) {
  console.log("[prepare-desktop] public/lab-logo.jpg is newer than build/icon.ico — regenerate the icon (see README-desktop.md).");
}
