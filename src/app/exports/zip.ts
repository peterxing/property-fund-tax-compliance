// Minimal ZIP writer for the XLSX package: store-only entries (method 0) with correct CRC-32, local headers, a central directory
// and the end record. The DOS timestamp is a constant, so the same input always gives the same bytes. No dependencies.

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (IEEE 802.3, as used by ZIP), returned as an unsigned 32-bit number. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const DOS_TIME = 0; // 00:00:00
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01, the DOS epoch
const VERSION = 20;
const UTF8_FLAG = 0x0800;

export function zipStore(entries: readonly ZipEntry[]): Uint8Array<ArrayBuffer> {
  if (entries.length >= 0xffff) throw new Error("Too many files for a .zip archive"); // 0xFFFF is the ZIP64 marker in the end record
  const encoder = new TextEncoder();
  const prepared = entries.map((e) => {
    const name = encoder.encode(e.name);
    return { name, flags: name.length === e.name.length ? 0 : UTF8_FLAG, data: e.data, crc: crc32(e.data) };
  });

  let total = 22; // end of central directory record
  for (const p of prepared) total += 30 + p.name.length + p.data.length + 46 + p.name.length;
  if (total > 0xffffffff) throw new Error("The archive is too large (over 4 GB)");

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let o = 0;
  const u16 = (v: number) => { view.setUint16(o, v, true); o += 2; };
  const u32 = (v: number) => { view.setUint32(o, v, true); o += 4; };
  const bytes = (b: Uint8Array) => { out.set(b, o); o += b.length; };

  const offsets: number[] = [];
  for (const p of prepared) {
    offsets.push(o);
    u32(0x04034b50); u16(VERSION); u16(p.flags); u16(0); u16(DOS_TIME); u16(DOS_DATE);
    u32(p.crc); u32(p.data.length); u32(p.data.length); u16(p.name.length); u16(0);
    bytes(p.name); bytes(p.data);
  }
  const centralStart = o;
  prepared.forEach((p, i) => {
    u32(0x02014b50); u16(VERSION); u16(VERSION); u16(p.flags); u16(0); u16(DOS_TIME); u16(DOS_DATE);
    u32(p.crc); u32(p.data.length); u32(p.data.length); u16(p.name.length); u16(0); u16(0); u16(0); u16(0); u32(0);
    u32(offsets[i]);
    bytes(p.name);
  });
  const centralSize = o - centralStart;
  u32(0x06054b50); u16(0); u16(0); u16(prepared.length); u16(prepared.length); u32(centralSize); u32(centralStart); u16(0);
  return out;
}
