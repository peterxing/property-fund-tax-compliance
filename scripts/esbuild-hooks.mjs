// Module-customisation hooks for the UI tests (registered by scripts/register-esbuild.mjs).
//
//  * .ts / .tsx   -> transformed with esbuild (jsx "automatic", target node22, `__DEV__` = false and a fixed `__BUILD_INFO__`,
//                    the same defines scripts/build.mjs injects), with an inline source map so stack traces point at the TypeScript.
//  * .css         -> an empty module (the stylesheet is irrelevant to a headless DOM).
//  * .woff2/.woff/.svg -> a module whose default export is the file's URL, like esbuild's "file" loader.
//  * Module generations: importing `<src file>?pfc=N` evaluates that file, and everything under src/ it imports, as a separate
//    copy. That is how a test boots the app a second time with a different localStorage (the app keeps one store per module graph);
//    bare packages such as react stay shared. Transforms are cached per file, so a generation only costs evaluation.
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transform } from "esbuild";

const SRC_URL = new URL("../src/", import.meta.url).href;
const GENERATION = /[?&]pfc=\d+/;
const BUILD_INFO = JSON.stringify({ version: "0.0.0-test", sha: "test", builtAt: "2026-10-12T09:00:00.000Z" });

const transformed = new Map();

function pathOf(url) {
  return url.startsWith("file:") ? fileURLToPath(url) : null;
}

const asModule = (source) => ({ format: "module", source, shortCircuit: true });

export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  const generation = context.parentURL ? GENERATION.exec(context.parentURL)?.[0] : undefined;
  if (generation === undefined || !resolved.url.startsWith(SRC_URL) || resolved.url.includes("?")) return resolved;
  return { ...resolved, url: `${resolved.url}?${generation.slice(1)}` };
}

async function transpile(path) {
  const info = await stat(path);
  const stamp = `${info.mtimeMs}:${info.size}`;
  const hit = transformed.get(path);
  if (hit?.stamp === stamp) return hit.code;
  const { code } = await transform(await readFile(path, "utf8"), {
    loader: path.endsWith("x") ? "tsx" : "ts",
    format: "esm",
    target: "node22",
    jsx: "automatic",
    sourcefile: path,
    sourcemap: "inline",
    define: { __DEV__: "false", __BUILD_INFO__: BUILD_INFO },
    tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true } },
  });
  transformed.set(path, { stamp, code });
  return code;
}

export async function load(url, context, nextLoad) {
  const path = pathOf(url);
  if (path === null) return nextLoad(url, context);
  const lower = path.toLowerCase();
  if (lower.endsWith(".css")) return asModule("export default {};\n");
  if (/\.(?:woff2?|svg)$/.test(lower)) return asModule(`export default ${JSON.stringify(pathToFileURL(path).href)};\n`);
  if (/\.(?:tsx?|mts)$/.test(lower)) return asModule(await transpile(path));
  return nextLoad(url, context);
}
