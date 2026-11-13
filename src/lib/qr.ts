/**
 * A small QR code encoder: byte mode, error correction level L, versions 1 to 10 (up to 271 bytes).
 * Enough for the otpauth:// address an authenticator app scans, without a dependency.
 * Returns the modules as rows of booleans (true = dark), without the quiet zone.
 */

/** Per version: error correction bytes per block, then the data bytes of each block. */
const BLOCKS: Record<number, { ec: number; data: number[] }> = {
  1: { ec: 7, data: [19] },
  2: { ec: 10, data: [34] },
  3: { ec: 15, data: [55] },
  4: { ec: 20, data: [80] },
  5: { ec: 26, data: [108] },
  6: { ec: 18, data: [68, 68] },
  7: { ec: 20, data: [78, 78] },
  8: { ec: 24, data: [97, 97] },
  9: { ec: 30, data: [116, 116] },
  10: { ec: 18, data: [68, 68, 69, 69] },
};
const MAX_VERSION = 10;

// Galois field of 256 elements (polynomial 0x11d), for the Reed-Solomon bytes.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function errorCorrection(data: number[], count: number): number[] {
  let gen = [1];
  for (let i = 0; i < count; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= mul(gen[j], EXP[i]);
    }
    gen = next;
  }
  const rest = [...data, ...new Array<number>(count).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const factor = rest[i];
    if (factor) for (let j = 0; j < gen.length; j++) rest[i + j] ^= mul(gen[j], factor);
  }
  return rest.slice(data.length);
}

/** The data and error correction bytes in the order they are drawn. */
function codewords(bytes: Uint8Array, version: number): number[] {
  const { ec, data } = BLOCKS[version];
  const capacity = data.reduce((a, b) => a + b, 0);
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capacity * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const all: number[] = [];
  for (let i = 0; i < bits.length; i += 8) all.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; all.length < capacity; pad ^= 0xec ^ 0x11) all.push(pad);

  const blocks: number[][] = [];
  let at = 0;
  for (const size of data) {
    blocks.push(all.slice(at, at + size));
    at += size;
  }
  const corrections = blocks.map((b) => errorCorrection(b, ec));
  const out: number[] = [];
  for (let i = 0; i < Math.max(...data); i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ec; i++) for (const c of corrections) out.push(c[i]);
  return out;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** The standard's four penalties: the mask with the lowest score reads best. */
function penalty(m: boolean[][]): number {
  const size = m.length;
  let score = 0;
  const line = (get: (i: number) => boolean) => {
    let run = 1;
    let history = 0;
    for (let i = 0; i < size; i++) {
      if (i > 0 && get(i) === get(i - 1)) run++;
      else run = 1;
      if (run === 5) score += 3;
      else if (run > 5) score++;
      // A finder-like 1:1:3:1:1 pattern with four light modules on one side.
      history = ((history << 1) | (get(i) ? 1 : 0)) & 0x7ff;
      if (i >= 10 && (history === 0b10111010000 || history === 0b00001011101)) score += 40;
    }
  };
  let dark = 0;
  for (let y = 0; y < size; y++) {
    line((i) => m[y][i]);
    line((i) => m[i][y]);
    for (let x = 0; x < size; x++) {
      if (m[y][x]) dark++;
      if (x + 1 < size && y + 1 < size && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
    }
  }
  return score + Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
}

/** Thrown when the text doesn't fit in the largest version drawn here. */
export class QrTooLongError extends Error {}

export function qrCode(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  let version = 1;
  // 4 mode bits, the length (8 bits up to version 9, 16 from version 10) and the bytes.
  while (version <= MAX_VERSION && 4 + (version < 10 ? 8 : 16) + bytes.length * 8 > BLOCKS[version].data.reduce((a, b) => a + b, 0) * 8) version++;
  if (version > MAX_VERSION) throw new QrTooLongError("Texte trop long pour un QR code.");

  const size = 17 + 4 * version;
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    fixed[y][x] = true;
  };

  // Timing lines, then the three finders (with their light border) over them.
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
      }
  }
  // Alignment patterns, except where a finder already stands.
  if (version > 1) {
    const count = Math.floor(version / 7) + 2;
    const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
    const positions = [6];
    for (let pos = size - 7; positions.length < count; pos -= step) positions.splice(1, 0, pos);
    for (const cy of positions)
      for (const cx of positions) {
        const last = positions[positions.length - 1];
        if ((cx === 6 && cy === 6) || (cx === 6 && cy === last) || (cx === last && cy === 6)) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
  }
  // Version number, from version 7.
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }
  /** The 15 format bits (level L and the mask), drawn twice. */
  const drawFormat = (mask: number) => {
    const data = (1 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);

  // The data, in a zigzag from the bottom right corner, two columns at a time.
  const data = codewords(bytes, version);
  let n = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fixed[y][x] && n < data.length * 8) {
          modules[y][x] = ((data[n >>> 3] >>> (7 - (n & 7))) & 1) === 1;
          n++;
        }
      }
  }

  // Try the eight masks and keep the one a reader will find easiest.
  const applyMask = (mask: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y][x] && MASKS[mask](x, y)) modules[y][x] = !modules[y][x];
  };
  let best = 0;
  let lowest = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask);
    drawFormat(mask);
    const score = penalty(modules);
    if (score < lowest) {
      lowest = score;
      best = mask;
    }
    applyMask(mask);
  }
  applyMask(best);
  drawFormat(best);
  return modules;
}

/** The modules as one SVG path, with `margin` light modules around (4 is the standard's quiet zone). */
export function qrPath(modules: boolean[][], margin = 4): { path: string; size: number } {
  let path = "";
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${x + margin} ${y + margin}h1v1h-1z`;
    }),
  );
  return { path, size: modules.length + margin * 2 };
}
