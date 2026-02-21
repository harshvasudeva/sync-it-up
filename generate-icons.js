// ─── Icon Generator for SyncTabs ──────────────────────────────────────────────
// Run with: node generate-icons.js
// Creates PNG icons from canvas drawing

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const SIZES = [16, 48, 128];
const ICON_DIR = path.join(__dirname, 'extension', 'icons');

if (!fs.existsSync(ICON_DIR)) {
  fs.mkdirSync(ICON_DIR, { recursive: true });
}

for (const size of SIZES) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const s = size;

  // Background circle
  const gradient = ctx.createLinearGradient(0, 0, s, s);
  gradient.addColorStop(0, '#7aa2f7');
  gradient.addColorStop(1, '#3d59a1');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  ctx.fill();

  // Sync arrows icon
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, s * 0.08);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const cx = s / 2;
  const cy = s / 2;
  const r = s * 0.28;

  // Top arrow (right-pointing arc)
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI * 0.8, -Math.PI * 0.1);
  ctx.stroke();

  // Arrow head top
  const ax1 = cx + r * Math.cos(-Math.PI * 0.1);
  const ay1 = cy + r * Math.sin(-Math.PI * 0.1);
  const aSize = s * 0.12;
  ctx.beginPath();
  ctx.moveTo(ax1 - aSize, ay1 - aSize * 0.5);
  ctx.lineTo(ax1, ay1);
  ctx.lineTo(ax1 - aSize * 0.5, ay1 + aSize);
  ctx.stroke();

  // Bottom arrow (left-pointing arc)
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.2, Math.PI * 0.9);
  ctx.stroke();

  // Arrow head bottom
  const ax2 = cx + r * Math.cos(Math.PI * 0.9);
  const ay2 = cy + r * Math.sin(Math.PI * 0.9);
  ctx.beginPath();
  ctx.moveTo(ax2 + aSize, ay2 + aSize * 0.5);
  ctx.lineTo(ax2, ay2);
  ctx.lineTo(ax2 + aSize * 0.5, ay2 - aSize);
  ctx.stroke();

  const buffer = canvas.toBuffer('image/png');
  const filePath = path.join(ICON_DIR, `icon${size}.png`);
  fs.writeFileSync(filePath, buffer);
  console.log(`Created ${filePath}`);
}

console.log('Done! Icons generated.');
