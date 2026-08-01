/**
 * generate-icons.js — Generate PWA icons from the Maranatha crest
 * Run: node generate-icons.js
 */
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const SRC = path.resolve(__dirname, "src/assets/maranatha-crest.png");
const OUT = path.resolve(__dirname, "public/icons");

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  // Standard icons
  for (const size of SIZES) {
    await sharp(SRC)
      .resize(size, size, { fit: "contain", background: { r: 15, g: 31, b: 61, alpha: 1 } })
      .png()
      .toFile(path.join(OUT, `icon-${size}x${size}.png`));
    console.log(`  [ok] icon-${size}x${size}.png`);
  }

  // Maskable icon (512x512 with 20% safe zone padding on navy background)
  const maskableSize = 512;
  const innerSize = Math.round(maskableSize * 0.7);
  const resized = await sharp(SRC)
    .resize(innerSize, innerSize, { fit: "contain", background: { r: 15, g: 31, b: 61, alpha: 1 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: maskableSize,
      height: maskableSize,
      channels: 4,
      background: { r: 15, g: 31, b: 61, alpha: 255 },
    },
  })
    .composite([{ input: resized, gravity: "centre" }])
    .png()
    .toFile(path.join(OUT, `maskable-icon-512x512.png`));
  console.log("  [ok] maskable-icon-512x512.png");

  // Apple touch icon (180x180)
  await sharp(SRC)
    .resize(180, 180, { fit: "contain", background: { r: 15, g: 31, b: 61, alpha: 1 } })
    .png()
    .toFile(path.join(OUT, `apple-touch-icon-180x180.png`));
  console.log("  [ok] apple-touch-icon-180x180.png");

  // Favicon (32x32)
  await sharp(SRC)
    .resize(32, 32, { fit: "contain", background: { r: 15, g: 31, b: 61, alpha: 1 } })
    .png()
    .toFile(path.join(OUT, `favicon-32x32.png`));
  console.log("  [ok] favicon-32x32.png");

  console.log("\nAll icons generated in", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
