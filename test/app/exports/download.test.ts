import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeFileName, saveBlob } from "../../../src/app/exports/download.ts";
import { installFakeDom } from "./fake-dom.ts";

// ------------------------------------------------------------------------------------------------------------- sanitizeFileName

const CASES: Array<[string, unknown, string]> = [
  ["a plain name is kept", "report.csv", "report.csv"],
  ["spaces, dashes, brackets, digits and Unicode letters are kept", "Harbourline \u2013 FY2025 (draft) v1.2 \u7a0e\u52d9.pdf", "Harbourline \u2013 FY2025 (draft) v1.2 \u7a0e\u52d9.pdf"],
  ["parent directories cannot be reached", "../../evil.csv", "evil.csv"],
  ["a Windows path loses its separators", "C:\\Users\\x\\a.pdf", "C-Usersxa.pdf"],
  ["slashes of both kinds are dropped", "a/b\\c.xlsx", "abc.xlsx"],
  ["characters Windows rejects become dashes", 'bad<>:"|?*name.csv', "bad-------name.csv"],
  ["whitespace collapses and the ends are trimmed", "  spaced \t out   name .csv  ", "spaced out name .csv"],
  ["control characters are dropped", "a\u0000b\u0007c\u001fd\u007fe\u0085f.csv", "abcdef.csv"],
  ["a non-breaking space becomes a space", "a\u00a0b.csv", "a b.csv"],
  ["a line break is dropped", "a\r\nb.csv", "ab.csv"],
  ["leading and trailing dots are trimmed", "...hidden.csv...", "hidden.csv"],
  ["only dots falls back", "...", "download"],
  ["an empty name falls back", "", "download"],
  ["only spaces falls back", "   ", "download"],
  ["only separators falls back", "//\\\\", "download"],
  ["undefined falls back", undefined, "download"],
  ["null falls back", null, "download"],
  ["a number is made into text", 42, "42"],
  ["a lone surrogate is dropped", "a\ud800b\udc00c.csv", "abc.csv"],
  ["an emoji (a surrogate pair) is kept", "a\ud83d\ude00b.csv", "a\ud83d\ude00b.csv"],
  ["a device name gets a prefix", "CON.txt", "_CON.txt"],
  ["a device name without an extension", "nul", "_nul"],
  ["a device name in mixed case", "Aux.csv", "_Aux.csv"],
  ["COM1", "com1.pdf", "_com1.pdf"],
  ["LPT9", "LPT9", "_LPT9"],
  ["a device name with a dotted tail", "con.tent.csv", "_con.tent.csv"],
  ["a device name with a space before the dot", "CON .txt", "_CON .txt"],
  ["a trailing dot is trimmed before the device check", "NUL.", "_NUL"],
  ["console is not a device", "console.csv", "console.csv"],
  ["COM10 is not a device", "COM10.txt", "COM10.txt"],
  ["COM0 is not a device", "com0.txt", "com0.txt"],
  ["lpt is not a device", "lpt.csv", "lpt.csv"],
  ["icon is not a device", "icon.png", "icon.png"],
  ["a device name followed by more words is not a device", "con tent.txt", "con tent.txt"],
  ["a colon after a device name becomes a dash", "con:", "con-"],
];

for (const [name, input, expected] of CASES) {
  test(`sanitizeFileName: ${name}`, () => {
    assert.equal(sanitizeFileName(input as string), expected);
  });
}

test("sanitizeFileName: the fallback is used, and cleaned, when nothing is left", () => {
  assert.equal(sanitizeFileName("", "Annual statement.pdf"), "Annual statement.pdf");
  assert.equal(sanitizeFileName("///", "a/b"), "ab");
  assert.equal(sanitizeFileName("", "con"), "_con");
  assert.equal(sanitizeFileName("", ""), "download");
  assert.equal(sanitizeFileName("", "..."), "download");
  assert.equal(sanitizeFileName("x.csv", "fallback.csv"), "x.csv");
});

test("sanitizeFileName: long names are cut to 150 characters and keep a short extension", () => {
  const long = sanitizeFileName(`${"x".repeat(300)}.xlsx`);
  assert.equal(long.length, 150);
  assert.ok(long.endsWith(".xlsx") && long.startsWith("xxxx"));
  assert.equal(sanitizeFileName("x".repeat(300)), "x".repeat(150));
  assert.equal(sanitizeFileName(`${"a".repeat(100)}.${"b".repeat(100)}`).length, 150, "a long tail is not an extension");
  assert.equal(sanitizeFileName("y".repeat(150)), "y".repeat(150), "exactly 150 is kept");
  assert.equal(sanitizeFileName("y".repeat(151)), "y".repeat(150));
  assert.equal(sanitizeFileName(`${"a".repeat(144)}. ${"b".repeat(50)}.csv`), `${"a".repeat(144)}.csv`, "a cut never leaves dots or spaces before the extension");
});

const hasLoneSurrogate = (s: string) => /[\ud800-\udfff]/u.test(s);

test("sanitizeFileName: a cut never splits a surrogate pair", () => {
  const name = sanitizeFileName(`a${"\ud83d\ude00".repeat(100)}.csv`);
  assert.equal(name, `a${"\ud83d\ude00".repeat(72)}.csv`);
  assert.ok(name.length <= 150);
  assert.ok(!hasLoneSurrogate(name));
  const noExtension = sanitizeFileName(`a${"\ud83d\ude00".repeat(100)}`);
  assert.ok(noExtension.length <= 150 && !hasLoneSurrogate(noExtension), "also without an extension");
});

test("sanitizeFileName: a device name that is cut still fits in 150 characters", () => {
  const name = sanitizeFileName(`con.${"z".repeat(300)}`);
  assert.ok(name.startsWith("_con."));
  assert.equal(name.length, 150);
});

test("sanitizeFileName: random names always give a safe, short, stable result", () => {
  const pool = [
    ..."abcXYZ019 ._-()[]", "\\", "/", ":", "*", "?", '"', "<", ">", "|", "\t", "\r", "\n", "\u0000", "\u001f", "\u007f", "\u0085", "\u00a0", "\u2028", "\u3000",
    "\ud83d\ude00", "\ud800", "\udc00", "\u7a0e", "\u00e9", "..", "con", "CON.", "nul", "aux", "prn", "com1", "lpt9", "console", ".csv", ".xlsx", ".pdf",
  ];
  let a = 11;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let round = 0; round < 4000; round++) {
    let input = "";
    for (let k = Math.floor(next() * (round % 10 === 0 ? 120 : 14)); k > 0; k--) input += pool[Math.floor(next() * pool.length)];
    const name = sanitizeFileName(input);
    const shown = JSON.stringify(input);
    assert.ok(name.length >= 1 && name.length <= 150, `${shown} gives a name of ${name.length} characters`);
    assert.ok(!/[\\/:*?"<>|\u0000-\u001f\u007f-\u009f]/.test(name), `${shown} gives ${JSON.stringify(name)}, which has a forbidden character`);
    assert.ok(!hasLoneSurrogate(name), `${shown} gives a lone surrogate`);
    assert.ok(!/^[.\s]|[.\s]$/.test(name), `${shown} gives ${JSON.stringify(name)}, which starts or ends with a dot or space`);
    assert.ok(!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])\s*(?:\.|$)/i.test(name), `${shown} gives the device name ${JSON.stringify(name)}`);
    assert.equal(sanitizeFileName(name), name, `${shown} gives ${JSON.stringify(name)}, which changes when sanitised again`);
  }
});

// ------------------------------------------------------------------------------------------------------------- saveBlob

test("saveBlob: a hidden anchor with a clean name is attached, clicked and removed, and the URL is released after a second", (t) => {
  const dom = installFakeDom(t);
  const blob = new Blob(["hello"], { type: "text/plain" });
  saveBlob("../a:b.csv", blob);

  assert.deepEqual(dom.events, ["create", "append", "click", "remove"]);
  assert.equal(dom.blobs[0], blob);
  assert.equal(dom.links.length, 1);
  const link = dom.links[0];
  assert.equal(link.href, "blob:fake/1");
  assert.equal(link.download, "a-b.csv");
  assert.equal(link.rel, "noopener");
  assert.equal(link.style.display, "none");

  dom.tick(999);
  assert.deepEqual(dom.events, ["create", "append", "click", "remove"], "the URL is still usable just before a second");
  dom.tick(1);
  assert.deepEqual(dom.events, ["create", "append", "click", "remove", "revoke blob:fake/1"]);
  dom.tick(60_000);
  assert.equal(dom.events.filter((e) => e.startsWith("revoke")).length, 1, "released once");
});

test("saveBlob: each call makes its own anchor and URL", (t) => {
  const dom = installFakeDom(t);
  saveBlob("one.csv", new Blob(["1"]));
  saveBlob("two.pdf", new Blob(["22"]));
  assert.deepEqual(dom.links.map((l) => [l.href, l.download]), [["blob:fake/1", "one.csv"], ["blob:fake/2", "two.pdf"]]);
  dom.tick(1000);
  assert.deepEqual(dom.events.filter((e) => e.startsWith("revoke")), ["revoke blob:fake/1", "revoke blob:fake/2"]);
});

test("saveBlob: an empty name still downloads under a default name", (t) => {
  const dom = installFakeDom(t);
  saveBlob("", new Blob(["x"]));
  assert.equal(dom.links[0].download, "download");
});

test("saveBlob: when click throws, the anchor is removed, the error reaches the caller and the URL is still released", (t) => {
  const dom = installFakeDom(t, { clickError: new Error("click blocked") });
  assert.throws(() => saveBlob("a.csv", new Blob(["x"])), /click blocked/);
  assert.deepEqual(dom.events, ["create", "append", "click", "remove"]);
  dom.tick(1000);
  assert.equal(dom.events.at(-1), "revoke blob:fake/1");
});

test("saveBlob: without a document it throws, and still releases the URL it made", (t) => {
  const dom = installFakeDom(t, { noDocument: true });
  assert.throws(() => saveBlob("a.csv", new Blob(["x"])), ReferenceError);
  assert.deepEqual(dom.events, ["create"]);
  dom.tick(1000);
  assert.deepEqual(dom.events, ["create", "revoke blob:fake/1"]);
});
