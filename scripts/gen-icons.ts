// Generates PWA/tab icons from the crab logos (design/logo-{dark,light}.svg). Run: `yarn icons`.
// favicon SVGs theme-switch: the disc CONTRASTS the tab chrome (dark-disc logo on a light tab, and vice-versa) so the badge pops.
// Install/manifest icons can't theme-switch (one set served), so they use the light logo.
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const design = join(root, "design");

const darkSvg = readFileSync(join(design, "logo-dark.svg"));
const lightSvg = readFileSync(join(design, "logo-light.svg"));

const LIGHT_DISC = "#ffffff"; // must match logo-light.svg's disc so it merges into the square fill

writeFileSync(join(pub, "favicon-dark.svg"), darkSvg);
writeFileSync(join(pub, "favicon-light.svg"), lightSvg);

const disc = (svg: Buffer, size: number, out: string) =>
  sharp(svg).resize(size, size).png().toFile(join(pub, out));

// Disc merges into the matching square fill, leaving only the crab inside the ~80% maskable safe zone.
const SAFE = 0.8;
const masked = async (svg: Buffer, bg: string, size: number, out: string) => {
  const inner = Math.round(size * SAFE);
  const crab = await sharp(svg).resize(inner, inner).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: crab, gravity: "center" }])
    .png()
    .toFile(join(pub, out));
};

await Promise.all([
  disc(lightSvg, 48, "favicon.png"),
  disc(lightSvg, 192, "icon-192.png"),
  disc(lightSvg, 512, "icon-512.png"),
  masked(lightSvg, LIGHT_DISC, 512, "icon-maskable-512.png"),
  masked(lightSvg, LIGHT_DISC, 180, "apple-touch-icon.png"),
]);
console.log("icons generated");
