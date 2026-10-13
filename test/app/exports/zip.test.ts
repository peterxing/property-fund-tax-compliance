import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32, zipStore } from "../../../src/app/exports/zip.ts";
import type { ZipEntry } from "../../../src/app/exports/zip.ts";
import { readZip, referenceCrc32 } from "./zip-reader.ts";

const bytes = (s: string) => new TextEncoder().encode(s);

test("crc32 matches the published check values", () => {
  assert.equal(crc32(new Uint8Array(0)), 0);
  assert.equal(crc32(bytes("123456789")), 0xcbf43926);
  assert.equal(crc32(bytes("The quick brown fox jumps over the lazy dog")), 0x414fa339);
  assert.equal(crc32(new Uint8Array(1024)), referenceCrc32(new Uint8Array(1024)));
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  assert.equal(crc32(all), referenceCrc32(all));
  assert.equal(typeof crc32(all), "number");
  assert.ok(crc32(bytes("\u00ff".repeat(100))) >= 0, "unsigned");
});

test("zipStore writes entries that an independent reader reads back byte for byte", () => {
  const binary = Uint8Array.from({ length: 70_000 }, (_, i) => (i * 7 + (i >> 8)) & 0xff);
  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: bytes("<Types/>") },
    { name: "empty.bin", data: new Uint8Array(0) },
    { name: "dir/nested/file.txt", data: bytes("hello \u00fcnic\u00f6de \u2014 \u{1F600}") },
    { name: "binary.dat", data: binary },
    { name: "d\u00e9j\u00e0 vu \u65e5\u672c.txt", data: bytes("non-ASCII name") },
  ];
  const zip = readZip(zipStore(entries));
  assert.deepEqual(zip.map((f) => f.name), entries.map((e) => e.name));
  zip.forEach((f, i) => {
    assert.deepEqual(f.data, entries[i].data, f.name);
    assert.equal(f.method, 0, "store-only");
    assert.equal(f.dosTime, 0);
    assert.equal(f.dosDate, (1 << 5) | 1);
  });
  assert.equal(zip[0].flags, 0, "an ASCII name needs no UTF-8 flag");
  assert.equal(zip[4].flags, 0x0800, "a non-ASCII name sets the UTF-8 flag");
});

test("zipStore is deterministic and an empty archive is just the end record", () => {
  const entries: ZipEntry[] = [{ name: "a.txt", data: bytes("a") }, { name: "b.txt", data: bytes("b") }];
  assert.deepEqual(zipStore(entries), zipStore(entries.map((e) => ({ ...e }))));
  const empty = zipStore([]);
  assert.equal(empty.length, 22);
  assert.deepEqual(readZip(empty), []);
});

test("zipStore refuses archives it cannot describe", () => {
  const many: ZipEntry[] = Array.from({ length: 0xffff }, (_, i) => ({ name: `f${i}`, data: new Uint8Array(0) }));
  assert.throws(() => zipStore(many), /Too many files/);
  const ok = zipStore(many.slice(0, 0xfffe));
  assert.equal(readZip(ok).length, 0xfffe);
});

test("the reader used by these tests rejects a damaged archive (so a pass means something)", () => {
  const good = zipStore([{ name: "a.txt", data: bytes("some content") }, { name: "b.txt", data: bytes("more") }]);
  const flip = (offset: number) => {
    const copy = good.slice();
    copy[offset] ^= 0xff;
    return copy;
  };
  const dataOffset = 30 + "a.txt".length;
  assert.throws(() => readZip(flip(dataOffset)), /CRC-32/, "a damaged data byte");
  assert.throws(() => readZip(good.subarray(0, good.length - 1)), /end of central directory|bytes after/, "a truncated end record");
  assert.throws(() => readZip(flip(good.length - 22)), /end of central directory/, "a damaged end signature");
});
