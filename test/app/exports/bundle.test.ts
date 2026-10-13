import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import type { Metafile } from "esbuild";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

type Output = Metafile["outputs"][string];

// The same options as scripts/build.mjs (ESM, code splitting, minified, same targets and defines), without writing anything.
async function bundle(): Promise<Record<string, Output>> {
  const result = await build({
    absWorkingDir: ROOT,
    entryPoints: ["src/app/exports/index.ts"],
    bundle: true,
    splitting: true,
    format: "esm",
    outdir: "out",
    write: false,
    metafile: true,
    minify: true,
    logLevel: "silent",
    target: ["es2022", "chrome111", "edge111", "firefox113", "safari16"],
    define: { "process.env.NODE_ENV": '"production"', __DEV__: "false" },
    entryNames: "[name]-[hash]",
    chunkNames: "chunks/[name]-[hash]",
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  return result.metafile.outputs;
}

test("in a production bundle the entry point stays small and pdfkit, the PDF layout and the XLSX writer are only reached by dynamic import", { timeout: 120_000 }, async () => {
  const outputs = await bundle();
  const entries = Object.entries(outputs).filter(([, output]) => output.entryPoint === "src/app/exports/index.ts");
  assert.equal(entries.length, 1, "one entry chunk");
  const [entryPath, entry] = entries[0];

  const inputsOf = (output: Output) => Object.keys(output.inputs);
  const owner = (pattern: RegExp) => {
    const hits = Object.entries(outputs).filter(([, output]) => inputsOf(output).some((input) => pattern.test(input)));
    assert.equal(hits.length, 1, `${pattern} is in exactly one chunk`);
    return hits[0];
  };
  const [pdfkitPath, pdfkit] = owner(/node_modules\/pdfkit\/js\/pdfkit\.standalone\.js$/);
  const [pdfPath] = owner(/src\/app\/exports\/pdf\.ts$/);
  const [xlsxPath] = owner(/src\/app\/exports\/xlsx\.ts$/);
  const [csvPath] = owner(/src\/app\/exports\/csv\.ts$/);
  assert.equal(csvPath, entryPath, "the CSV writer is in the entry chunk");
  for (const lazy of [pdfkitPath, pdfPath, xlsxPath]) assert.notEqual(lazy, entryPath);

  // Everything the page loads up front: the entry and what it imports statically, transitively.
  const eager = new Set<string>();
  const visit = (path: string) => {
    if (eager.has(path)) return;
    eager.add(path);
    for (const edge of outputs[path].imports) if (edge.kind === "import-statement" && outputs[edge.path]) visit(edge.path);
  };
  visit(entryPath);
  for (const lazy of [["pdfkit", pdfkitPath], ["the PDF layout", pdfPath], ["the XLSX writer", xlsxPath]] as const) {
    assert.ok(!eager.has(lazy[1]), `${lazy[0]} is not loaded up front (${[...eager].join(", ")})`);
  }
  const dynamic = new Set(entry.imports.filter((edge) => edge.kind === "dynamic-import").map((edge) => edge.path));
  for (const lazy of [pdfkitPath, pdfPath, xlsxPath]) assert.ok(dynamic.has(lazy), `${lazy} is imported dynamically by the entry chunk`);

  const eagerBytes = [...eager].reduce((sum, path) => sum + outputs[path].bytes, 0);
  assert.ok(eagerBytes < 30_000, `what loads up front is ${eagerBytes} bytes`);
  assert.ok(pdfkit.bytes > 300_000, `the pdfkit chunk is the real library (${pdfkit.bytes} bytes)`);
  assert.ok(!inputsOf(entry).some((input) => input.includes("node_modules")), "no library in the entry chunk");
});
