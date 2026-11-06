#!/usr/bin/env node
/**
 * Render Backbone PNGs from committed SVG sources.
 * color: icons/source.svg → 192×192 RGBA
 * outline: icons/outline-source.svg → 32×32 white-on-transparent RGBA
 *
 * Requires rsvg-convert (librsvg2-bin).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const icons = join(root, "icons");

function which(bin) {
  const r = spawnSync("which", [bin], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

function render(svgName, outName, w, h) {
  const svg = join(icons, svgName);
  const out = join(icons, outName);
  if (!existsSync(svg)) {
    console.error(`missing SVG source: ${svg}`);
    process.exit(1);
  }
  const rsvg = which("rsvg-convert");
  if (!rsvg) {
    console.error("rsvg-convert not found; install librsvg2-bin");
    process.exit(1);
  }
  mkdirSync(icons, { recursive: true });
  const r = spawnSync(
    rsvg,
    ["-w", String(w), "-h", String(h), svg, "-o", out],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || `rsvg-convert failed for ${svgName}`);
    process.exit(r.status ?? 1);
  }
  console.log(`rendered ${outName} ${w}x${h} from ${svgName}`);
}

render("source.svg", "color.png", 192, 192);
render("outline-source.svg", "outline.png", 32, 32);
