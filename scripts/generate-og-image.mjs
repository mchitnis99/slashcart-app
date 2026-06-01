import sharp from "sharp";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "../public/og-image.png");

// 1200×630 OG image — dark navy background, logo scaled 3× + tagline
const W = 1200, H = 630;
const LOGO_W = 320 * 3, LOGO_H = 100 * 3; // 960×300
const LOGO_X = (W - LOGO_W) / 2;          // 120
const LOGO_Y = (H - LOGO_H) / 2 - 40;     // 115 — shift up to leave room for tagline

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <!-- Background -->
  <rect width="${W}" height="${H}" fill="#0b1426"/>

  <!-- Logo group scaled 3× and centered -->
  <g transform="translate(${LOGO_X}, ${LOGO_Y}) scale(3)">
    <!-- Cart body -->
    <rect x="20" y="22" width="52" height="36" rx="6" fill="none" stroke="#FAFAF8" stroke-width="2.5"/>
    <!-- Cart handle -->
    <path d="M72 28 Q82 28 82 38" fill="none" stroke="#FAFAF8" stroke-width="2.5" stroke-linecap="round"/>
    <!-- Cart wheels -->
    <circle cx="30" cy="66" r="5.5" fill="none" stroke="#FAFAF8" stroke-width="2.5"/>
    <circle cx="58" cy="66" r="5.5" fill="none" stroke="#FAFAF8" stroke-width="2.5"/>
    <!-- Lime slash -->
    <line x1="62" y1="12" x2="28" y2="76" stroke="#C8F135" stroke-width="4.5" stroke-linecap="round"/>
    <!-- SLASH wordmark -->
    <text x="102" y="48" font-family="'Arial Black', 'Helvetica Neue', sans-serif" font-size="36" font-weight="900" letter-spacing="2" fill="#FAFAF8">SLASH</text>
    <!-- CART wordmark -->
    <text x="102" y="80" font-family="'Arial Black', 'Helvetica Neue', sans-serif" font-size="36" font-weight="900" letter-spacing="2" fill="#C8F135">CART</text>
  </g>

  <!-- Tagline -->
  <text
    x="${W / 2}" y="${LOGO_Y + LOGO_H + 52}"
    font-family="'Helvetica Neue', Arial, sans-serif" font-size="28" font-weight="400"
    fill="#94a3b8" text-anchor="middle" letter-spacing="0.5"
  >Upload your list. Best unit prices. Cart built. Done.</text>
</svg>`;

const buf = Buffer.from(svg);
await sharp(buf).png().toFile(outPath);
console.log(`Generated ${outPath}`);
