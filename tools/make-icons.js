/* VIPERLOOP — генератор иконок PWA (чистый Node, без зависимостей).
 * Запуск: node tools/make-icons.js
 * Рисуем «спираль-змейку с glowing-сферой» по пикселям и кодируем PNG вручную.
 */
"use strict";
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

// ---------- PNG-энкодер ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // битная глубина
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // фильтр: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---------- рисование ----------
function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function renderIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;

  // спираль змейки: от головы (снаружи) к хвосту (внутрь)
  const N = 24;
  const segs = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const ang = -Math.PI / 2 - t * Math.PI * 1.9;
    const rad = (0.3 - t * 0.15) * size;
    segs.push({
      cx: c + Math.cos(ang) * rad,
      cy: c + 0.015 * size + Math.sin(ang) * rad,
      r: (0.088 - t * 0.048) * size,
      col: hslToRgb(145 + t * 60, 0.75, 0.62 - t * 0.28),
    });
  }
  // глаза на голове (последний по порядку отрисовки = самый верхний)
  const head = segs[0];
  const eyeR = head.r * 0.22;
  const eyes = [];
  for (const sgn of [-1, 1]) {
    eyes.push({ cx: head.cx + sgn * head.r * 0.45, cy: head.cy + head.r * 0.4, r: eyeR, col: [255, 255, 255] });
  }
  for (const sgn of [-1, 1]) {
    eyes.push({ cx: head.cx + sgn * head.r * 0.45 + head.r * 0.08, cy: head.cy + head.r * 0.42, r: eyeR * 0.5, col: [10, 12, 20] });
  }
  // порядок: хвост -> ... -> голова -> глаза -> зрачки
  const draws = [...segs.slice().reverse(), ...eyes];
  const orb = { x: c, y: c, r: 0.075 * size, glow: 0.24 * size };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let R = 10 + (y / size) * 6;
      let G = 15 + (y / size) * 8;
      let B = 28 + (y / size) * 10;

      // свечение сферы
      const od = Math.hypot(x - orb.x, y - orb.y);
      if (od < orb.glow) {
        const og = Math.max(0, 1 - od / orb.glow);
        R += 255 * og * og * 0.5;
        G += 205 * og * og * 0.42;
        B += 90 * og * og * 0.3;
      }
      if (od < orb.r) {
        R = 255;
        G = 205 + 35 * (1 - od / orb.r);
        B = 105;
      }
      if (od < orb.r * 0.35 && (x - orb.x) < 0 && (y - orb.y) < 0) {
        R = 255;
        G = 250;
        B = 190; // блик
      }

      // сегменты змейки
      for (const g of draws) {
        const d = Math.hypot(x - g.cx, y - g.cy);
        if (d < g.r) {
          const aa = Math.min(1, (g.r - d) / 1.2 + 0.2);
          R = R * (1 - aa) + g.col[0] * aa;
          G = G * (1 - aa) + g.col[1] * aa;
          B = B * (1 - aa) + g.col[2] * aa;
        }
      }

      px[i] = Math.round(Math.min(255, R));
      px[i + 1] = Math.round(Math.min(255, G));
      px[i + 2] = Math.round(Math.min(255, B));
      px[i + 3] = 255;
    }
  }
  return px;
}

// ---------- вывод ----------
const out = path.join(__dirname, "..", "icons");
fs.mkdirSync(out, { recursive: true });
const jobs = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-512-maskable.png", 512],
  ["apple-touch-icon.png", 180],
];
for (const [name, size] of jobs) {
  const png = encodePng(size, size, renderIcon(size));
  fs.writeFileSync(path.join(out, name), png);
  console.log("icons/" + name, size + "x" + size, png.length, "bytes");
}
