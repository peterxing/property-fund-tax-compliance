// Builds the static site into dist/. No server is involved: the app keeps its data in the browser, and every
// asset URL is relative, so the same output works at https://<user>.github.io/<repo>/ and at a custom domain.
import { build, context } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const watch = process.argv.includes("--watch");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

function gitSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try { return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return "dev"; }
}

const buildInfo = { version: pkg.version, sha: gitSha(), builtAt: new Date().toISOString() };

const options = {
  entryPoints: { app: path.join(root, "src/app/main.tsx") },
  outdir: path.join(dist, "assets"),
  entryNames: "[name]-[hash]",
  chunkNames: "chunks/[name]-[hash]",
  assetNames: "fonts/[name]-[hash]",
  bundle: true,
  format: "esm",
  splitting: true,
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  target: ["es2022", "chrome110", "edge110", "firefox110", "safari16"],
  jsx: "automatic",
  loader: { ".woff2": "file", ".woff": "file", ".svg": "file" },
  define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"', __BUILD_INFO__: JSON.stringify(buildInfo) },
  metafile: true,
  logLevel: "info",
};

function indexHtml(js, css) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="Property fund tax compliance for Australian AMIT/MIT trusts and Singapore S-REITs. Demo with fictional data." />
    <meta name="color-scheme" content="light dark" />
    <title>Property Fund Tax Compliance</title>
    <link rel="icon" type="image/svg+xml" href="./favicon.svg" />
    <link rel="stylesheet" href="./${css}" />
  </head>
  <body>
    <div id="root"></div>
    <noscript>This application needs JavaScript enabled.</noscript>
    <script type="module" src="./${js}"></script>
  </body>
</html>
`;
}

function finish(result) {
  const outputs = Object.entries(result.metafile.outputs);
  const entry = outputs.find(([, o]) => o.entryPoint && o.entryPoint.endsWith("main.tsx"));
  if (!entry) throw new Error("entry output not found in the esbuild metafile");
  const js = path.relative(dist, path.resolve(root, entry[0])).split(path.sep).join("/");
  const cssOut = entry[1].cssBundle;
  if (!cssOut) throw new Error("the app produced no CSS bundle; import the stylesheet from main.tsx");
  const css = path.relative(dist, path.resolve(root, cssOut)).split(path.sep).join("/");
  writeFileSync(path.join(dist, "index.html"), indexHtml(js, css));
  writeFileSync(path.join(dist, ".nojekyll"), "");
  const pub = path.join(root, "public");
  if (existsSync(pub)) cpSync(pub, dist, { recursive: true });
  const kb = (rel) => (readFileSync(path.join(dist, rel)).length / 1024).toFixed(0);
  console.log(`built ${buildInfo.version} (${buildInfo.sha}): ${js} ${kb(js)} KB, ${css} ${kb(css)} KB, ${readdirSync(path.join(dist, "assets", "chunks"), { withFileTypes: true }).filter((e) => e.isFile()).length} lazy chunk(s)`);
}

if (watch) {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  const ctx = await context({ ...options, plugins: [{ name: "finish", setup(b) { b.onEnd((r) => { if (r.errors.length === 0 && r.metafile) { try { finish(r); } catch (e) { console.error(e.message); } } }); } }] });
  await ctx.watch();
  console.log("watching src/ - serve dist/ with: npm run preview");
} else {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(path.join(dist, "assets", "chunks"), { recursive: true });
  finish(await build(options));
}
