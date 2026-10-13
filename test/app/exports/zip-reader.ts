// Independent ZIP reader for the export tests. It shares no code with src/app/exports/zip.ts: it only follows the ZIP specification
// (end of central directory, central directory, local headers), so it can catch mistakes the writer would also make against itself.
import * as zlib from "node:zlib";

export interface ZipFile {
  name: string;
  method: number;
  flags: number;
  crc: number;
  dosTime: number;
  dosDate: number;
  data: Uint8Array;
}

/** CRC-32 computed bit by bit: slow, but obviously correct. */
export function referenceCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Node's own CRC-32 (zlib.crc32, Node 22+), when this runtime has it. */
export function nodeCrc32(data: Uint8Array): number | undefined {
  const fn = (zlib as unknown as { crc32?: (data: Uint8Array, value?: number) => number }).crc32;
  return typeof fn === "function" ? fn(data) : undefined;
}

/**
 * Reads every entry of a ZIP archive and verifies its structure as it goes: the end record, the central directory, each local
 * header (it must agree with the central directory), the CRC-32 of the data, and that the local entries fill the file up to the
 * central directory with no gaps. Entries stored with method 8 are inflated; method 0 is returned as is. Throws on any inconsistency.
 */
export function readZip(bytes: Uint8Array): ZipFile[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder("utf-8", { fatal: true });

  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("end of central directory record not found");
  const commentLength = view.getUint16(end + 20, true);
  if (end + 22 + commentLength !== bytes.length) throw new Error("bytes after the end of central directory record");
  if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) throw new Error("multi-disk archives are not supported");
  const entriesOnDisk = view.getUint16(end + 8, true);
  const entries = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  const centralOffset = view.getUint32(end + 16, true);
  if (entriesOnDisk !== entries) throw new Error("entry counts disagree");
  if (centralOffset + centralSize !== end) throw new Error("the central directory does not end where the end record starts");

  const files: ZipFile[] = [];
  let cursor = centralOffset;
  let expectedLocal = 0;
  for (let n = 0; n < entries; n++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error(`bad central directory signature for entry ${n}`);
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const dosTime = view.getUint16(cursor + 12, true);
    const dosDate = view.getUint16(cursor + 14, true);
    const crc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = decoder.decode(nameBytes);
    cursor += 46 + nameLength + extraLength + commentLen;

    if (localOffset !== expectedLocal) throw new Error(`entry ${name} does not start where the previous one ended`);
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`bad local header signature for ${name}`);
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const localCrc = view.getUint32(localOffset + 14, true);
    const localCompressed = view.getUint32(localOffset + 18, true);
    const localSize = view.getUint32(localOffset + 22, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const localName = decoder.decode(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength));
    if (localName !== name) throw new Error(`local header name ${localName} differs from the central directory name ${name}`);
    if (localFlags !== flags || localMethod !== method) throw new Error(`local header flags or method differ for ${name}`);
    if (localCrc !== crc || localCompressed !== compressedSize || localSize !== size) throw new Error(`local header sizes or CRC differ for ${name}`);
    if (flags & 0x0008) throw new Error(`${name} uses a data descriptor, which this reader does not expect`);

    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const stored = bytes.subarray(dataStart, dataStart + compressedSize);
    expectedLocal = dataStart + compressedSize;

    let data: Uint8Array;
    if (method === 0) {
      if (compressedSize !== size) throw new Error(`${name}: stored entry with different sizes`);
      data = stored;
    } else if (method === 8) {
      data = zlib.inflateRawSync(stored);
    } else {
      throw new Error(`${name}: unsupported compression method ${method}`);
    }
    if (data.length !== size) throw new Error(`${name}: size ${data.length} differs from the recorded ${size}`);
    if (referenceCrc32(data) !== crc) throw new Error(`${name}: CRC-32 mismatch`);
    const viaNode = nodeCrc32(data);
    if (viaNode !== undefined && viaNode !== crc) throw new Error(`${name}: CRC-32 differs from zlib.crc32`);
    // names must be UTF-8; flag bit 11 has to be set exactly when a name is not plain ASCII
    const ascii = nameBytes.every((b) => b < 0x80);
    if (((flags & 0x0800) !== 0) === ascii) throw new Error(`${name}: UTF-8 name flag does not match the name`);

    files.push({ name, method, flags, crc, dosTime, dosDate, data });
  }
  if (cursor !== end) throw new Error("the central directory has unexplained bytes");
  if (expectedLocal !== centralOffset) throw new Error("the local entries do not fill the file up to the central directory");
  return files;
}
