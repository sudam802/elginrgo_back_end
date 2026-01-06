import { Router } from "express";

const router = Router();

// Default "charm" background color (pastel pink-ish)
const CHARM_COLOR = "#E68FB1";

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value), 10);
  if (Number.isFinite(n)) return Math.min(Math.max(n, min), max);
  return fallback;
}

function sanitizeColor(color) {
  if (!color) return CHARM_COLOR;
  const c = String(color).trim();
  if (c.toLowerCase() === "charm") return CHARM_COLOR;
  // Allow 3/6-digit hex colors only
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)) return c;
  return CHARM_COLOR;
}

router.get("/", (req, res) => {
  const width = clampInt(req.query.w ?? req.query.width, 1, 2000, 128);
  const height = clampInt(req.query.h ?? req.query.height, 1, 2000, 128);
  const bg = sanitizeColor(req.query.bg ?? req.query.background);
  const text = (req.query.text ?? "").toString().slice(0, 4); // optional short label
  const textColor = sanitizeColor(req.query.color ?? req.query.fg ?? "#ffffff");

  const fontSize = Math.floor(Math.min(width, height) * 0.4);
  const hasText = text.length > 0;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${bg}" />
  ${hasText ? `<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="${textColor}" font-family="-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-size="${fontSize}" font-weight="600">${escapeXml(text)}</text>` : ""}
</svg>`;

  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  // Cache for 1 day; safe because controlled by querystring
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  return res.send(svg);
});

function escapeXml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export default router;

