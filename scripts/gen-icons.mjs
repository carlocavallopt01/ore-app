import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

// Generatore puro Node (nessuna dipendenza da immagini) per le icone PWA di
// ORE: un quadrante di orologio ambra con lancette ink su sfondo ink scuro
// (#14182B / #F59E0B), in stile "cartellino orario". Stessa tecnica usata
// nel progetto Scontrino: encoder PNG minimale, più un pacchetto ICO fatto
// a mano, così l'app resta installabile senza dipendere da librerie
// esterne di immagine.

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const INK = [0x14, 0x18, 0x2b];
const AMBER = [0xf5, 0x9e, 0x0b];

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

// shape: "rounded" (icona standard, angoli smussati e trasparenti fuori dal
// bordo) oppure "bleed" (quadrato pieno, senza trasparenza: per l'icona
// maskable di Android e per l'apple-touch-icon, che applicano da soli la
// propria maschera/arrotondamento).
function renderIcon(size, { shape = "rounded", padding = 0 } = {}) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const cx = size / 2;
  const cy = size / 2;
  const cornerRadius = size * 0.22;
  const clockRadius = (size - padding * 2) * 0.3;
  const handThickness = Math.max(1, size * 0.045);
  const minuteLen = clockRadius * 0.78;
  const hourLen = clockRadius * 0.5;
  const minuteAngle = -Math.PI / 2; // ore 12
  const hourAngle = 0; // ore 3, angolo retto con la lancetta dei minuti per restare leggibile anche in piccolo

  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // filter type 0
    for (let x = 0; x < size; x++) {
      const idx = y * (1 + size * 4) + 1 + x * 4;
      let inBounds = true;
      if (shape === "rounded") {
        const rx = Math.max(0, Math.abs(x - cx) - (cx - cornerRadius));
        const ry = Math.max(0, Math.abs(y - cy) - (cy - cornerRadius));
        inBounds = rx * rx + ry * ry <= cornerRadius * cornerRadius;
      }

      let r, g, b, a;
      if (!inBounds) {
        r = g = b = 0;
        a = 0;
      } else {
        const dx = x - cx;
        const dy = y - cy;
        const inClockFace = Math.hypot(dx, dy) <= clockRadius;
        const onMinuteHand =
          distToSegment(x, y, cx, cy, cx + minuteLen * Math.cos(minuteAngle), cy + minuteLen * Math.sin(minuteAngle)) <=
          handThickness / 2;
        const onHourHand =
          distToSegment(x, y, cx, cy, cx + hourLen * Math.cos(hourAngle), cy + hourLen * Math.sin(hourAngle)) <=
          handThickness / 2;

        if (inClockFace && (onMinuteHand || onHourHand)) {
          [r, g, b] = INK;
        } else if (inClockFace) {
          [r, g, b] = AMBER;
        } else {
          [r, g, b] = INK;
        }
        a = 255;
      }
      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = a;
    }
  }
  return raw;
}

function makePng(size, opts) {
  return encodePng(size, renderIcon(size, opts));
}

// Pacchetto .ico minimale (Windows Vista+ e tutti i browser accettano PNG
// incapsulato direttamente nella directory ICO, niente bisogno di BMP).
function makeIco(pngEntries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngEntries.length, 4);

  let offset = 6 + pngEntries.length * 16;
  const dirEntries = [];
  const dataBlocks = [];
  for (const { size, data } of pngEntries) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    dirEntries.push(entry);
    dataBlocks.push(data);
  }
  return Buffer.concat([header, ...dirEntries, ...dataBlocks]);
}

mkdirSync("public/icons", { recursive: true });

writeFileSync("public/icons/icon-192.png", makePng(192, { shape: "rounded" }));
writeFileSync("public/icons/icon-512.png", makePng(512, { shape: "rounded" }));
writeFileSync("public/icons/icon-maskable-512.png", makePng(512, { shape: "bleed", padding: 64 }));
writeFileSync("public/apple-touch-icon.png", makePng(180, { shape: "bleed", padding: 14 }));

const icon16 = makePng(16, { shape: "rounded" });
const icon32 = makePng(32, { shape: "rounded" });
writeFileSync(
  "public/favicon.ico",
  makeIco([
    { size: 16, data: icon16 },
    { size: 32, data: icon32 },
  ])
);

console.log("Icone generate in public/icons/, public/apple-touch-icon.png e public/favicon.ico");
