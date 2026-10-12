/**
 * Generates PNG app icons (192/512, plus maskable 512) with zero
 * dependencies — a tiny PNG encoder (zlib is built into Node).
 * Draws the same sunbird-on-branch mark as icons/icon.svg.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

// ---------- PNG encoding ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(Buffer.from(type, 'ascii'), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function encodePNG(width: number, height: number, pixels: Uint8Array): Buffer {
  // pixels: width*height*3 RGB
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter: none
    raw.set(pixels.subarray(y * width * 3, (y + 1) * width * 3), y * (1 + width * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  new DataView(ihdr.buffer).setUint32(0, width);
  new DataView(ihdr.buffer).setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

// ---------- tiny rasterizer ----------
type Shape =
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; color: [number, number, number] }
  | { kind: 'poly'; pts: Array<[number, number]>; color: [number, number, number] }
  | { kind: 'roundrect'; x: number; y: number; w: number; h: number; r: number; color: [number, number, number] };

function inPoly(x: number, y: number, pts: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function draw(size: number, shapes: Shape[]): Uint8Array {
  const px = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color: [number, number, number] = [0, 0, 0];
      for (const s of shapes) {
        let hit = false;
        if (s.kind === 'ellipse') {
          const dx = (x - s.cx) / s.rx;
          const dy = (y - s.cy) / s.ry;
          hit = dx * dx + dy * dy <= 1;
        } else if (s.kind === 'poly') {
          hit = inPoly(x, y, s.pts);
        } else {
          const inRect = x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h;
          if (!inRect) hit = false;
          else {
            // rounded corners
            const cx = Math.min(Math.max(x, s.x + s.r), s.x + s.w - s.r);
            const cy = Math.min(Math.max(y, s.y + s.r), s.y + s.h - s.r);
            const dx = x - cx;
            const dy = y - cy;
            hit = dx * dx + dy * dy <= s.r * s.r;
          }
        }
        if (hit) color = s.color;
      }
      const o = (y * size + x) * 3;
      px[o] = color[0];
      px[o + 1] = color[1];
      px[o + 2] = color[2];
    }
  }
  return px;
}

// ---------- the mark (coordinates in 512 space, scaled per size) ----------
function shapesFor(size: number): Shape[] {
  const k = size / 512;
  const S = (v: number) => v * k;
  const GREEN: [number, number, number] = [0x1b, 0x5e, 0x20];
  const BIRD: [number, number, number] = [0xf9, 0xa8, 0x25];
  const WING: [number, number, number] = [0xff, 0xca, 0x28];
  const LEAF: [number, number, number] = [0x66, 0xbb, 0x6a];
  const DARKLEAF: [number, number, number] = [0x33, 0x69, 0x1e];
  const BEAK: [number, number, number] = [0xff, 0x8f, 0x00];
  const BRANCH: [number, number, number] = [0x5d, 0x40, 0x37];
  const INK: [number, number, number] = [0x21, 0x2a, 0x21];

  return [
    { kind: 'roundrect', x: 0, y: 0, w: size, h: size, r: S(96), color: GREEN },
    // branch
    {
      kind: 'poly',
      pts: [[S(110), S(348)], [S(420), S(338)], [S(420), S(356)], [S(110), S(366)]],
      color: BRANCH,
    },
    // body
    { kind: 'ellipse', cx: S(210), cy: S(250), rx: S(95), ry: S(70), color: BIRD },
    // tail
    { kind: 'poly', pts: [[S(205), S(300)], [S(260), S(330)], [S(330), S(318)], [S(330), S(336)], [S(260), S(350)], [S(205), S(322)]], color: DARKLEAF },
    // wing
    { kind: 'poly', pts: [[S(150), S(220)], [S(90), S(180)], [S(105), S(130)], [S(150), S(160)], [S(175), S(200)]], color: WING },
    // head
    { kind: 'ellipse', cx: S(285), cy: S(185), rx: S(42), ry: S(42), color: BIRD },
    // eye
    { kind: 'ellipse', cx: S(298), cy: S(176), rx: S(8), ry: S(8), color: INK },
    // beak
    { kind: 'poly', pts: [[S(322), S(190)], [S(368), S(200)], [S(322), S(212)]], color: BEAK },
    // leaf
    { kind: 'poly', pts: [[S(330), S(318)], [S(400), S(300)], [S(430), S(260)], [S(380), S(300)], [S(330), S(336)]], color: LEAF },
  ];
}

mkdirSync('public/icons', { recursive: true });

const sizes = [
  { size: 192, file: 'public/icons/icon-192.png' },
  { size: 512, file: 'public/icons/icon-512.png' },
  { size: 512, file: 'public/icons/icon-512-maskable.png' },
];

for (const { size, file } of sizes) {
  const png = encodePNG(size, size, draw(size, shapesFor(size)));
  writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
