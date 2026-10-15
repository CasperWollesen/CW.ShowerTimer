import { describe, expect, it } from 'vitest';
import { formatBits, qrMatrix, qrVersionFor, reedSolomonDivisor, reedSolomonRemainder } from './qr';

const ALIGNMENT: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30] };
const DATA_CODEWORDS: Record<number, number> = { 1: 19, 2: 34, 3: 55, 4: 80, 5: 108 };
const EC_CODEWORDS: Record<number, number> = { 1: 7, 2: 10, 3: 15, 4: 20, 5: 26 };

/**
 * Independent reader for the test: its own function-module map and zigzag walk, so a
 * placement bug in the encoder is not simply mirrored back.
 */
function decode(m: boolean[][]): string {
  const size = m.length;
  const version = (size - 17) / 4;
  const reserved = (x: number, y: number): boolean => {
    if (x === 6 || y === 6) return true; // timing
    if (x <= 8 && y <= 8) return true; // top-left finder, separator, format
    if (x >= size - 8 && y <= 8) return true; // top-right
    if (x <= 8 && y >= size - 8) return true; // bottom-left (incl. dark module)
    const pos = ALIGNMENT[version]!;
    for (const cx of pos)
      for (const cy of pos) {
        const overlapsFinder = (cx === 6 && cy === 6) || (cx === 6 && cy === pos[pos.length - 1]) || (cy === 6 && cx === pos[pos.length - 1]);
        if (!overlapsFinder && Math.abs(x - cx) <= 2 && Math.abs(y - cy) <= 2) return true;
      }
    return false;
  };

  // Format info, first copy: bits 14..0 along row 8 / column 8 around the top-left finder.
  let format = 0;
  const seq: [number, number][] = [];
  for (let i = 0; i <= 5; i++) seq.push([8, i]);
  seq.push([8, 7], [8, 8], [7, 8]);
  for (let i = 9; i < 15; i++) seq.push([14 - i, 8]);
  seq.forEach(([x, y], i) => (format |= (m[y]![x] ? 1 : 0) << i));
  const mask = [0, 1, 2, 3, 4, 5, 6, 7].find((k) => formatBits(0b01, k) === format);
  if (mask === undefined) throw new Error('format info does not match level L');
  const masked = (x: number, y: number) =>
    [
      (x + y) % 2 === 0,
      y % 2 === 0,
      x % 3 === 0,
      (x + y) % 3 === 0,
      (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      ((x * y) % 2) + ((x * y) % 3) === 0,
      (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
      (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ][mask]!;

  const bits: number[] = [];
  let col = size - 1;
  let up = true;
  while (col > 0) {
    if (col === 6) col--;
    for (let k = 0; k < size; k++) {
      const y = up ? size - 1 - k : k;
      for (const x of [col, col - 1]) {
        if (!reserved(x, y)) bits.push((m[y]![x] ? 1 : 0) ^ (masked(x, y) ? 1 : 0));
      }
    }
    up = !up;
    col -= 2;
  }
  const total = DATA_CODEWORDS[version]! + EC_CODEWORDS[version]!;
  const codewords: number[] = [];
  for (let i = 0; i < total; i++) codewords.push(bits.slice(i * 8, i * 8 + 8).reduce((a, b) => (a << 1) | b, 0));
  const data = codewords.slice(0, DATA_CODEWORDS[version]);
  expect(reedSolomonRemainder(data, reedSolomonDivisor(EC_CODEWORDS[version]!))).toEqual(codewords.slice(DATA_CODEWORDS[version]));

  const stream = data.flatMap((c) => [7, 6, 5, 4, 3, 2, 1, 0].map((i) => (c >>> i) & 1));
  const read = (from: number, n: number) => stream.slice(from, from + n).reduce((a, b) => (a << 1) | b, 0);
  expect(read(0, 4)).toBe(0b0100);
  const length = read(4, 8);
  const bytes = Array.from({ length }, (_, i) => read(12 + i * 8, 8));
  return new TextDecoder().decode(new Uint8Array(bytes));
}

describe('qr', () => {
  it('computes Reed–Solomon error correction (thonky.com "HELLO WORLD" 1-M vector)', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(reedSolomonRemainder(data, reedSolomonDivisor(10))).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('computes format bits (ISO 18004 table)', () => {
    expect(formatBits(0b01, 0)).toBe(0b111011111000100); // L, mask 0
    expect(formatBits(0b00, 0)).toBe(0b101010000010010); // M, mask 0
    expect(formatBits(0b01, 7)).toBe(0b110100101110110); // L, mask 7
  });

  it('picks the smallest version', () => {
    expect(qrVersionFor(17)).toBe(1);
    expect(qrVersionFor(18)).toBe(2);
    expect(qrVersionFor(106)).toBe(5);
    expect(qrVersionFor(107)).toBeNull();
    expect(() => qrMatrix('x'.repeat(107))).toThrow();
  });

  it('round-trips the share URL and texts of every supported version', () => {
    const url = 'https://casperwollesen.github.io/CW.ShowerTimer/';
    const m = qrMatrix(url);
    expect(m).toHaveLength(29); // version 3
    expect(decode(m)).toBe(url);
    for (const text of ['a', 'x'.repeat(30), 'æøå '.repeat(10), 'y'.repeat(78), 'z'.repeat(106)]) {
      expect(decode(qrMatrix(text))).toBe(text);
    }
  });

  it('draws finder patterns in three corners', () => {
    const m = qrMatrix('hello');
    const row = (y: number, x0: number) => m[y]!.slice(x0, x0 + 7).map((d) => (d ? 1 : 0)).join('');
    const size = m.length;
    for (const [x0, y0] of [[0, 0], [size - 7, 0], [0, size - 7]] as const) {
      expect(row(y0, x0)).toBe('1111111');
      expect(row(y0 + 1, x0)).toBe('1000001');
      expect(row(y0 + 3, x0)).toBe('1011101');
    }
  });
});
