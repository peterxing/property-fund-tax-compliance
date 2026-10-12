// Tiny static file server for dist/ (preview and browser testing). It mimics GitHub Pages: static files only, no rewrites.
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const port = Number(process.env.PORT ?? 4173);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2", ".png": "image/png", ".csv": "text/csv", ".map": "application/json" };

createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname); } catch { res.writeHead(400).end("bad request"); return; }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.resolve(root, "." + rel);
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end("forbidden"); return; }
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404, { "content-type": "text/plain" }).end("not found"); return; }
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`serving dist/ at http://127.0.0.1:${port}/`));
