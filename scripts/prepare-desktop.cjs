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

// Optional: generate build/icon.ico from the public logo (PNG-embedded ICO, a real .ico).
const ico = path.join(root, "build", "icon.ico");
const png = path.join(root, "public", "lab-logo.png");
if (!fs.existsSync(ico) && fs.existsSync(png)) {
  try {
    const data = fs.readFileSync(png);
    const w = data.readUInt32BE(16);
    const h = data.readUInt32BE(20);
    if (w > 256 || h > 256) {
      console.log("[prepare-desktop] logo is larger than 256px; resize to 256x256 and create build/icon.ico manually (see README-desktop.md). Using default icon.");
    } else {
      const header = Buffer.alloc(22);
      header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
      header.writeUInt8(w === 256 ? 0 : w, 6); header.writeUInt8(h === 256 ? 0 : h, 7);
      header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
      header.writeUInt32LE(data.length, 14); header.writeUInt32LE(22, 18);
      fs.mkdirSync(path.dirname(ico), { recursive: true });
      fs.writeFileSync(ico, Buffer.concat([header, data]));
      console.log("[prepare-desktop] generated build/icon.ico from public/lab-logo.png");
    }
  } catch (e) {
    console.log("[prepare-desktop] could not generate icon, using default:", e.message);
  }
}
