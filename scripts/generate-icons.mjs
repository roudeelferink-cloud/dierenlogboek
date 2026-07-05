// Genereert de PWA-icons (pootafdruk op bosgroen) als PNG, puur met Node's
// zlib — geen native canvas-dependency nodig. Draait via `npm run icons`.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const FOREST = [0x2d, 0x6a, 0x4f]; // C.forest
const CREAM = [0xf4, 0xf7, 0xf2];  // header-tekstkleur

// Pootafdruk in relatieve coördinaten (cx, cy, rx, ry) — binnen de veilige
// zone voor maskable icons.
const SHAPES = [
  [0.5, 0.615, 0.155, 0.13],   // grote kussen
  [0.305, 0.42, 0.07, 0.085],  // buitenteen links
  [0.435, 0.335, 0.072, 0.088],// binnenteen links
  [0.565, 0.335, 0.072, 0.088],// binnenteen rechts
  [0.695, 0.42, 0.07, 0.085],  // buitenteen rechts
];

function coverage(px, py, size) {
  // 4x4 supersampling voor gladde randen
  let inside = 0;
  const S = 4;
  for (let sy = 0; sy < S; sy++) {
    for (let sx = 0; sx < S; sx++) {
      const x = (px + (sx + 0.5) / S) / size;
      const y = (py + (sy + 0.5) / S) / size;
      for (const [cx, cy, rx, ry] of SHAPES) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) {
          inside++;
          break;
        }
      }
    }
  }
  return inside / (S * S);
}

function crc32(buf) {
  let c,
    crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function makePng(size) {
  // RGB-pixelbuffer met filterbyte 0 per scanline
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const a = coverage(x, y, size);
      const o = row + 1 + x * 3;
      for (let ch = 0; ch < 3; ch++) {
        raw[o + ch] = Math.round(FOREST[ch] * (1 - a) + CREAM[ch] * a);
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = new URL("../public/icons/", import.meta.url);
mkdirSync(outDir, { recursive: true });

for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  writeFileSync(new URL(name, outDir), makePng(size));
  console.log(`public/icons/${name} (${size}x${size})`);
}
