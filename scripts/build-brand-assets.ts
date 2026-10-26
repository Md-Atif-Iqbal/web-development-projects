/**
 * ShopEase brand asset builder.
 *
 * Generates every raster favicon / app-icon / PWA asset from the SVG logo
 * system in public/brand/, so the browser tab and installed apps always show
 * ShopEase branding (never a default placeholder icon).
 *
 * Usage: bun scripts/build-brand-assets.ts
 *
 * Outputs:
 *   src/app/favicon.ico          (16 + 32 + 48 PNG-in-ICO)
 *   src/app/icon.svg             (copy of the square badge)
 *   src/app/apple-icon.png       (180x180 full-bleed, no transparency)
 *   public/brand/icon-192.png    (PWA icon)
 *   public/brand/icon-512.png    (PWA icon)
 *   public/brand/icon-maskable-192.png / icon-maskable-512.png
 */
import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// Resolve all paths against the repo root (the expected cwd when run
// via `bun scripts/build-brand-assets.ts`).
const ROOT_DIR = process.cwd();
const BRAND_DIR = path.join(ROOT_DIR, "public", "brand");
const APP_DIR = path.join(ROOT_DIR, "src", "app");

const badgeSvgPath = path.join(BRAND_DIR, "logo-square.svg");

/** Full-bleed variant (no rounded corners, no transparency) for apple/maskable icons. */
const fullBleedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#FF6B35"/>
  <path d="M26.5 27v-4.4a5.5 5.5 0 0 1 11 0V27" fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M20 26h24q3 0 3.6 3l1.8 15q.6 5-4.4 5H19q-5 0-4.4-5l1.8-15q.6-3 3.6-3Z" fill="#FFFFFF"/>
  <path d="M27.5 35.5a4.5 4.5 0 0 0 9 0" fill="none" stroke="#FFC857" stroke-width="3.2" stroke-linecap="round"/>
</svg>`;

async function renderPng(svg: string, size: number): Promise<Buffer> {
  return sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size)
    .png()
    .toBuffer();
}

/**
 * Pack PNG images into a valid .ico container.
 * Modern ICO supports PNG-compressed entries (Vista+); every current browser
 * and OS accepts them. Entries are declared smallest-first.
 */
function buildIco(entries: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + 16 * entries.length;
  entries.forEach((e, i) => {
    const o = i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o); // width (0 = 256)
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o + 1); // height
    dir.writeUInt8(0, o + 2); // palette size
    dir.writeUInt8(0, o + 3); // reserved
    dir.writeUInt16LE(1, o + 4); // color planes
    dir.writeUInt16LE(32, o + 6); // bits per pixel
    dir.writeUInt32LE(e.data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += e.data.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.data)]);
}

async function main(): Promise<void> {
  const badge = await readFile(badgeSvgPath, "utf8");
  await mkdir(BRAND_DIR, { recursive: true });
  await mkdir(APP_DIR, { recursive: true });

  // 1. PWA icons (rounded badge, transparent corners)
  await writeFile(path.join(BRAND_DIR, "icon-192.png"), await renderPng(badge, 192));
  await writeFile(path.join(BRAND_DIR, "icon-512.png"), await renderPng(badge, 512));

  // 2. Maskable PWA icons (full-bleed orange — the OS crops/masks these)
  await writeFile(path.join(BRAND_DIR, "icon-maskable-192.png"), await renderPng(fullBleedSvg, 192));
  await writeFile(path.join(BRAND_DIR, "icon-maskable-512.png"), await renderPng(fullBleedSvg, 512));

  // 3. Apple touch icon (180x180, full-bleed, opaque)
  await writeFile(path.join(APP_DIR, "apple-icon.png"), await renderPng(fullBleedSvg, 180));

  // 4. favicon.ico (16 + 32 + 48)
  const ico = buildIco([
    { size: 16, data: await renderPng(badge, 16) },
    { size: 32, data: await renderPng(badge, 32) },
    { size: 48, data: await renderPng(badge, 48) },
  ]);
  await writeFile(path.join(APP_DIR, "favicon.ico"), ico);

  // 5. src/app/icon.svg — Next.js auto-serves & links this as the SVG favicon
  await writeFile(path.join(APP_DIR, "icon.svg"), badge);

  console.log("ShopEase brand assets written:");
  console.log("  public/brand/icon-{192,512}.png");
  console.log("  public/brand/icon-maskable-{192,512}.png");
  console.log("  src/app/apple-icon.png (180x180)");
  console.log("  src/app/favicon.ico (16+32+48)");
  console.log("  src/app/icon.svg");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
