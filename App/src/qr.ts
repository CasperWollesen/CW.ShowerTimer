/**
 * Minimal QR code encoder (ISO/IEC 18004) for the share code in Settings: byte mode,
 * error correction level L, versions 1–5 (single Reed–Solomon block, no version info),
 * automatic mask choice. Enough for a URL of up to 106 bytes; written here instead of
 * adding a dependency. Structure follows Project Nayuki's reference implementation.
 *
 * Coordinates: `x` is the column, `y` the row; `matrix[y][x]` is true for a dark module.
 */

interface VersionInfo {
  dataCodewords: number;
  ecCodewords: number;
  /** Alignment pattern centre coordinates (both axes). */
  alignment: number[];
}

/** Level L, versions 1–5: one block each. */
const VERSIONS: Record<number, VersionInfo> = {
  1: { dataCodewords: 19, ecCodewords: 7, alignment: [] },
  2: { dataCodewords: 34, ecCodewords: 10, alignment: [6, 18] },
  3: { dataCodewords: 55, ecCodewords: 15, alignment: [6, 22] },
  4: { dataCodewords: 80, ecCodewords: 20, alignment: [6, 26] },
  5: { dataCodewords: 108, ecCodewords: 26, alignment: [6, 30] },
};

/** Format-info bits for level L. */
const EC_LEVEL_L = 0b01;

// ---------------------------------------------------------------------------
// Reed–Solomon over GF(256) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1.

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

export function reedSolomonDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j]!, root);
      if (j + 1 < result.length) result[j]! ^= result[j + 1]!;
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

export function reedSolomonRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    divisor.forEach((coef, i) => (result[i]! ^= gfMultiply(coef, factor)));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Format information: 2 EC bits + 3 mask bits, BCH(15,5), XOR mask 0x5412.

export function formatBits(ecLevel: number, mask: number): number {
  const data = (ecLevel << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

// ---------------------------------------------------------------------------

function encodeData(bytes: readonly number[], capacity: number): number[] {
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, 8); // character count (versions 1–9)
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capacity * 8 - bits.length)); // terminator
  push(0, (8 - (bits.length % 8)) % 8);
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) codewords.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0));
  for (let pad = 0xec; codewords.length < capacity; pad ^= 0xec ^ 0x11) codewords.push(pad);
  return codewords;
}

function maskApplies(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

class Grid {
  readonly modules: boolean[][];
  readonly isFunction: boolean[][];

  constructor(readonly size: number) {
    this.modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.isFunction = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }

  setFunction(x: number, y: number, dark: boolean) {
    this.modules[y]![x] = dark;
    this.isFunction[y]![x] = true;
  }
}

function drawFunctionPatterns(grid: Grid, info: VersionInfo) {
  const { size } = grid;
  for (let i = 0; i < size; i++) {
    grid.setFunction(6, i, i % 2 === 0);
    grid.setFunction(i, 6, i % 2 === 0);
  }
  // Finder patterns with their separators.
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        grid.setFunction(x, y, dist !== 2 && dist !== 4);
      }
    }
  }
  // Alignment patterns, skipping the three that would overlap finders.
  const pos = info.alignment;
  pos.forEach((cx, i) =>
    pos.forEach((cy, j) => {
      const last = pos.length - 1;
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) grid.setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }),
  );
  drawFormatBits(grid, 0); // reserve the areas; redrawn with the real mask later
}

function drawFormatBits(grid: Grid, mask: number) {
  const { size } = grid;
  const bits = formatBits(EC_LEVEL_L, mask);
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) grid.setFunction(8, i, bit(i));
  grid.setFunction(8, 7, bit(6));
  grid.setFunction(8, 8, bit(7));
  grid.setFunction(7, 8, bit(8));
  for (let i = 9; i < 15; i++) grid.setFunction(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) grid.setFunction(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) grid.setFunction(8, size - 15 + i, bit(i));
  grid.setFunction(8, size - 8, true); // the always-dark module
}

function drawCodewords(grid: Grid, codewords: readonly number[]) {
  const { size } = grid;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip the vertical timing column
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (grid.isFunction[y]![x] || i >= codewords.length * 8) continue;
        grid.modules[y]![x] = ((codewords[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1;
        i++;
      }
    }
  }
}

function applyMask(grid: Grid, mask: number) {
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      if (!grid.isFunction[y]![x] && maskApplies(mask, x, y)) grid.modules[y]![x] = !grid.modules[y]![x];
    }
  }
}

/** Standard penalty score (rules N1–N4); lower is easier to scan. */
function penalty(m: boolean[][]): number {
  const size = m.length;
  let score = 0;
  const lines: boolean[][] = [];
  for (let i = 0; i < size; i++) {
    lines.push(m[i]!);
    lines.push(m.map((row) => row[i]!));
  }
  const finderLike = [
    [true, false, true, true, true, false, true, false, false, false, false],
    [false, false, false, false, true, false, true, true, true, false, true],
  ];
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    for (let i = 0; i + 11 <= size; i++) {
      if (finderLike.some((p) => p.every((v, k) => line[i + k] === v))) score += 40;
    }
  }
  let dark = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (m[y]![x]) dark++;
      if (y + 1 < size && x + 1 < size) {
        const c = m[y]![x];
        if (m[y]![x + 1] === c && m[y + 1]![x] === c && m[y + 1]![x + 1] === c) score += 3;
      }
    }
  }
  score += 10 * Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5);
  return score;
}

/** Smallest version (1–5) that fits `byteLength` bytes, or null when too long. */
export function qrVersionFor(byteLength: number): number | null {
  for (let v = 1; v <= 5; v++) {
    // 4 mode bits + 8 count bits = 12 bits of overhead.
    if (byteLength * 8 + 12 <= VERSIONS[v]!.dataCodewords * 8) return v;
  }
  return null;
}

/** Encodes `text` (UTF-8) as a QR code. Throws when it does not fit version 5-L (106 bytes). */
export function qrMatrix(text: string): boolean[][] {
  const bytes = [...new TextEncoder().encode(text)];
  const version = qrVersionFor(bytes.length);
  if (version === null) throw new Error(`Text too long for a version 1–5 QR code: ${bytes.length} bytes`);
  const info = VERSIONS[version]!;
  const data = encodeData(bytes, info.dataCodewords);
  const codewords = [...data, ...reedSolomonRemainder(data, reedSolomonDivisor(info.ecCodewords))];

  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const grid = new Grid(17 + 4 * version);
    drawFunctionPatterns(grid, info);
    drawCodewords(grid, codewords);
    applyMask(grid, mask);
    drawFormatBits(grid, mask);
    const score = penalty(grid.modules);
    if (score < bestScore) {
      bestScore = score;
      best = grid.modules;
    }
  }
  return best!;
}
