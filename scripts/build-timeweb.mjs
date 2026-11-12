import { build, createServer } from "vite";
import react from "@vitejs/plugin-react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
process.env.NODE_ENV = "production";
const source = path.join(root, "timeweb");
const frontend = path.join(source, "frontend");
const output = path.join(root, "outputs/timeweb");
const publicRoot = path.join(output, "public_html");
const originUrl = new URL(process.env.ENERGY_SITE_ORIGIN || "https://top-generator.ru");
if (originUrl.protocol !== "https:" || originUrl.username || originUrl.password || originUrl.port || originUrl.pathname !== "/" || originUrl.search || originUrl.hash) {
  throw new Error("ENERGY_SITE_ORIGIN must be a bare HTTPS origin");
}
const origin = originUrl.origin;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// Pre-render the same React page used by the original site. No Cloudflare runtime is bundled.
const renderer = await createServer({ root, configFile: false, plugins: [react()], server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
let page, metadata;
try {
  const module = await renderer.ssrLoadModule("/app/page.tsx");
  metadata = (await renderer.ssrLoadModule("/app/layout.tsx")).metadata;
  page = renderToString(createElement(module.default, { leadEndpoint: "/api/leads.php" }), { identifierPrefix: "energy-" });
} finally { await renderer.close(); }

const image = metadata.openGraph.images[0];
const replacements = {
  APP_HTML: page, TITLE: escape(metadata.title), DESCRIPTION: escape(metadata.description), ORIGIN: escape(origin),
  OG_TITLE: escape(metadata.openGraph.title), OG_DESCRIPTION: escape(metadata.openGraph.description),
  OG_IMAGE: escape(new URL(typeof image === "string" ? image : image.url, origin).href),
};
let template = await readFile(path.join(frontend, "template.html"), "utf8");
template = template.replace(/<!--([A-Z_]+)-->/g, (_, key) => {
  if (!(key in replacements)) throw new Error(`Unknown template placeholder: ${key}`);
  return replacements[key];
});
await writeFile(path.join(frontend, "index.html"), template);
await build({
  root: frontend, configFile: false, publicDir: path.join(root, "public"), plugins: [react()],
  resolve: { alias: { "@": root } }, css: { postcss: { plugins: [] } },
  build: { outDir: publicRoot, emptyOutDir: true, target: "es2022", sourcemap: false },
});
await cp(path.join(source, "public"), publicRoot, { recursive: true });
await cp(path.join(source, "server"), path.join(output, "private"), {
  recursive: true, filter: name => path.basename(name) !== "config.php" && !name.split(path.sep).includes("storage"),
});
await writeFile(path.join(publicRoot, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`);
await writeFile(path.join(publicRoot, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escape(origin)}/</loc></url></urlset>\n`);
await cp(path.join(source, "README.md"), path.join(output, "README.md"));
let sourceCommit = process.env.ENERGY_SOURCE_COMMIT || "unknown";
try { if (sourceCommit === "unknown") sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch {}
await writeFile(path.join(output, "build-info.json"), JSON.stringify({ target: "timeweb-shared-php", origin, source_commit: sourceCommit, built_at: new Date().toISOString() }, null, 2) + "\n");
console.log(`Timeweb package: ${output}`);
