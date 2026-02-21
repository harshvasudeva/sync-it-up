// SyncTabs icon generator — pure Node.js, no dependencies
// Generates a proper sync-arrows icon in the extension color palette
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ICON_DIR = path.join(__dirname, 'extension', 'icons');
if (!fs.existsSync(ICON_DIR)) fs.mkdirSync(ICON_DIR, { recursive: true });

// Color palette
const BG     = [0x1a, 0x1b, 0x26]; // dark navy
const ACCENT = [0x7a, 0xa2, 0xf7]; // blue
const OUTER  = [0x00, 0x00, 0x00]; // transparent (outside icon)

// Point-in-triangle test
function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const sign = (x1,y1,x2,y2,x3,y3) => (x1-x3)*(y2-y3)-(x2-x3)*(y1-y3);
  const d1 = sign(px,py,ax,ay,bx,by);
  const d2 = sign(px,py,bx,by,cx,cy);
  const d3 = sign(px,py,cx,cy,ax,ay);
  const hasNeg = (d1<0)||(d2<0)||(d3<0);
  const hasPos = (d1>0)||(d2>0)||(d3>0);
  return !(hasNeg && hasPos);
}

// Signed distance field for a rounded rectangle (centered at origin)
function sdRoundedBox(lx, ly, hw, hh, r) {
  const qx = Math.abs(lx) - hw + r;
  const qy = Math.abs(ly) - hh + r;
  return Math.sqrt(Math.max(0,qx)**2 + Math.max(0,qy)**2) - r + Math.min(0, Math.max(qx,qy));
}

function createIconData(size) {
  const data = Buffer.alloc(size * size * 3, 0);
  const cx = size / 2;
  const cy = size / 2;

  // Ring dimensions (sync icon ring)
  const outerR   = size * 0.365;
  const innerR   = size * 0.215;
  const midR     = (outerR + innerR) / 2;
  const halfTick = (outerR - innerR) / 2;

  // Rounded-square size
  const hw = size * 0.458; // half-width
  const hh = size * 0.458; // half-height
  const rc = size * 0.22;  // corner radius

  // Arrow size
  const as = size * 0.105;

  // ─ Arc angles (0=right, 90=down, in degrees) ─
  // Arc 1: spans angles [330, 144] going CW (wraps: >=330 or <=144)  → right/bottom half+
  // Arc 2: spans angles [150, 324] going CW → left/top half+
  // Gap between arcs at ~145°–150° (upper-left) and at ~325°–330° (lower-right)
  const ARC1_start = 330; // lower-right gap start
  const ARC1_end   = 144; // upper-left gap end
  const ARC2_start = 150; // upper-left gap start
  const ARC2_end   = 324; // lower-right gap end

  function inArc1(deg) {
    return deg >= ARC1_start || deg <= ARC1_end;
  }
  function inArc2(deg) {
    return deg >= ARC2_start && deg <= ARC2_end;
  }

  // Build two arrowhead triangles (one per arc)
  // Arrow A: at end of arc1 (angle ARC1_end° ≈ 144°), pointing in CW direction
  function makeArrow(atDeg, pointingCW) {
    const rad  = atDeg * Math.PI / 180;
    const ax   = cx + midR * Math.cos(rad);
    const ay   = cy + midR * Math.sin(rad);
    // Clockwise tangent: (sin(rad), -cos(rad))
    const tx   = Math.sin(rad);
    const ty   = -Math.cos(rad);
    const sign = pointingCW ? 1 : -1;
    // Radial direction
    const rx   = Math.cos(rad);
    const ry   = Math.sin(rad);
    // Tip: move along tangent
    const tipX = ax + sign * tx * as * 0.85;
    const tipY = ay + sign * ty * as * 0.85;
    // Base: back from tip, spread sideways by radial direction
    const baseX = ax - sign * tx * as * 0.55;
    const baseY = ay - sign * ty * as * 0.55;
    return [
      tipX, tipY,
      baseX + rx * as * 0.65, baseY + ry * as * 0.65,
      baseX - rx * as * 0.65, baseY - ry * as * 0.65
    ];
  }

  const arrow1 = makeArrow(ARC1_end,   true);  // end of arc1, pointing CW
  const arrow2 = makeArrow(ARC2_end,  false);  // end of arc2, pointing CCW (= into arc direction)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const lx = x - cx;
      const ly = y - cy;
      const idx = (y * size + x) * 3;

      // Is pixel inside the rounded square background?
      if (sdRoundedBox(lx, ly, hw, hh, rc) > 0.5) {
        // Outside icon: leave as black (won't matter in store, icon bg is dark)
        data[idx] = 0x10; data[idx+1] = 0x11; data[idx+2] = 0x20;
        continue;
      }

      // Default: dark background
      data[idx] = BG[0]; data[idx+1] = BG[1]; data[idx+2] = BG[2];

      // Polar coords
      const dist  = Math.sqrt(lx*lx + ly*ly);
      const angle = ((Math.atan2(ly, lx) * 180 / Math.PI) + 360) % 360;

      // Ring check with AA softness
      const inRing = dist >= innerR - 0.5 && dist <= outerR + 0.5;
      const alpha  = Math.min(
        Math.max(0, dist - (innerR - 1)),
        Math.max(0, (outerR + 1) - dist),
        1
      );

      if (inRing && (inArc1(angle) || inArc2(angle))) {
        data[idx]   = Math.round(BG[0] * (1-alpha) + ACCENT[0] * alpha);
        data[idx+1] = Math.round(BG[1] * (1-alpha) + ACCENT[1] * alpha);
        data[idx+2] = Math.round(BG[2] * (1-alpha) + ACCENT[2] * alpha);
      }

      // Draw arrowheads
      const in1 = inTriangle(x, y, arrow1[0],arrow1[1], arrow1[2],arrow1[3], arrow1[4],arrow1[5]);
      const in2 = inTriangle(x, y, arrow2[0],arrow2[1], arrow2[2],arrow2[3], arrow2[4],arrow2[5]);
      if (in1 || in2) {
        data[idx] = ACCENT[0]; data[idx+1] = ACCENT[1]; data[idx+2] = ACCENT[2];
      }
    }
  }
  return data;
}

// ─── PNG encoding ─────────────────────────────────────────────────────────────
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc>>>1) ^ (crc&1 ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t   = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function buildPng(size, rgbData) {
  const w = size, h = size;
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(w, 0);
  ihdrData.writeUInt32BE(h, 4);
  ihdrData[8] = 8; ihdrData[9] = 2; // 8-bit RGB
  ihdrData[10] = ihdrData[11] = ihdrData[12] = 0;

  // Build raw scanlines (filter byte 0 per row)
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w*3)] = 0; // filter: None
    rgbData.copy(raw, y*(1+w*3)+1, y*w*3, (y+1)*w*3);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG sig
    chunk('IHDR', ihdrData),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ─── Generate all sizes ───────────────────────────────────────────────────────
for (const size of [16, 48, 128]) {
  const pixelData = createIconData(size);
  const png = buildPng(size, pixelData);
  const out = path.join(ICON_DIR, `icon${size}.png`);
  fs.writeFileSync(out, png);
  console.log(`✓ icon${size}.png (${png.length} bytes)`);
}
console.log('Icons generated!');
