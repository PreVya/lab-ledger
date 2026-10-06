/**
 * 1. Auto-generates build/icon.ico from public/lab-logo.png (when missing or
 *    when the PNG is newer). Real multi-size ICO: 256, 128, 64, 48, 32, 16 px.
 *    The same PNG is also the bill logo.
 * 2. Copies the ACTUAL frontend build output into ./desktop-frontend so
 *    electron-builder always has one fixed, existing folder to package.
 *
 * Supported build outputs (detected via nitro.json, never assumed):
 *   - dist/          (nitro cloudflare-module preset -> dist/client + dist/server)
 *   - .output/       (nitro node preset -> .output/public + .output/server)
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const ICON_SOURCE = path.join(root, "public", "lab-logo.png");
const ICO = path.join(root, "build", "icon.ico");
const SIZES = [256, 128, 64, 48, 32, 16];

function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...images.map((x) => x.data)]);
}

async function generateIcon() {
  if (!fs.existsSync(ICON_SOURCE)) {
    throw new Error("public/lab-logo.png not found — cannot generate build/icon.ico.");
  }
  const stale = !fs.existsSync(ICO) || fs.statSync(ICON_SOURCE).mtimeMs > fs.statSync(ICO).mtimeMs;
  if (!stale) {
    console.log("[prepare-desktop] build/icon.ico is up to date.");
    return;
  }
  const sharp = require("sharp");
  const images = [];
  for (const size of SIZES) {
    const data = await sharp(ICON_SOURCE)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    images.push({ size, data });
  }
  fs.mkdirSync(path.dirname(ICO), { recursive: true });
  fs.writeFileSync(ICO, buildIco(images));
  console.log(`[prepare-desktop] generated build/icon.ico (${SIZES.join(", ")} px) from public/lab-logo.png`);
}

function copyFrontend() {
  const target = path.join(root, "desktop-frontend");
  const candidates = [path.join(root, "dist"), path.join(root, ".output")];
  const src = candidates.find((d) => fs.existsSync(path.join(d, "nitro.json")));
  if (!src) {
    throw new Error("No frontend build found (looked for dist/nitro.json and .output/nitro.json). Run `yarn build` first.");
  }
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(src, target, { recursive: true });
  console.log(`[prepare-desktop] copied ${path.relative(root, src)} -> desktop-frontend`);
}

(async () => {
  await generateIcon();
  copyFrontend();
})().catch((e) => {
  console.error("[prepare-desktop]", e.message);
  process.exit(1);
});
