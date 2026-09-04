// One-off script to generate placeholder PWA icons for Paisa.
//
// Renders a simple rounded-square background in the app accent colour
// (#4f46e5) with a centered rupee (₹) glyph in white, then rasterizes it
// via sharp into the three PNGs referenced by public/manifest.json:
//   - public/icons/icon-192.png            (192x192)
//   - public/icons/icon-512.png            (512x512)
//   - public/icons/icon-512-maskable.png   (512x512, safe-zone padded)
//
// This is placeholder branding only — a plain rupee mark — to be swapped
// for real design art later.
//
// Usage: node scripts/generate-pwa-icons.mjs (run from dime-web/)

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'public', 'icons')

const ACCENT = '#4f46e5'
const GLYPH_COLOR = '#ffffff'

/**
 * Build an SVG for an icon of the given pixel size.
 *
 * `glyphScale` controls how large the rupee glyph is relative to the
 * canvas. For the maskable variant we shrink this (and therefore leave a
 * larger margin) so all visual detail stays within the ~60% safe zone that
 * OS icon masks won't crop, per standard maskable-icon guidance.
 */
function buildSvg(size, { glyphScale, cornerRatio }) {
  const fontSize = size * glyphScale
  const radius = size * cornerRatio

  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${ACCENT}" />
  <text
    x="50%"
    y="50%"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="Arial, Helvetica, sans-serif"
    font-weight="700"
    font-size="${fontSize}"
    fill="${GLYPH_COLOR}"
  >₹</text>
</svg>`
}

async function renderIcon(size, outFile, opts) {
  const svg = buildSvg(size, opts)
  await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer().then((buf) => writeFile(outFile, buf))
  console.log(`wrote ${path.relative(process.cwd(), outFile)} (${size}x${size})`)
}

async function main() {
  await mkdir(outDir, { recursive: true })

  // Standard (non-maskable) icons: glyph fills most of the canvas, corners
  // are rounded for a friendly app-icon look on platforms that render the
  // PNG as-is.
  await renderIcon(192, path.join(outDir, 'icon-192.png'), {
    glyphScale: 0.58,
    cornerRatio: 0.2,
  })
  await renderIcon(512, path.join(outDir, 'icon-512.png'), {
    glyphScale: 0.58,
    cornerRatio: 0.2,
  })

  // Maskable icon: OS masks (circle, squircle, etc.) can crop anywhere
  // outside the inner ~80% of the canvas, so keep the glyph well within a
  // ~60% safe zone (i.e. at least ~20% padding on every side) and fill the
  // full square with the background colour with no rounded corners — the
  // mask itself will shape the icon.
  await renderIcon(512, path.join(outDir, 'icon-512-maskable.png'), {
    glyphScale: 0.34,
    cornerRatio: 0,
  })
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
