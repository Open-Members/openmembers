import {
  mkdir,
  readFile,
  writeFile,
  lstat,
  rm,
  rename,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { catalog } from "../src/catalog.mjs";
import { layout } from "../src/layout.mjs";
import { securityHeaders } from "../deploy/worker.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = path.join(root, "dist");
const stage = path.join(root, ".release-building");
const output = path.join(root, "release");
const origin = "https://openmembers.club";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const info = JSON.parse(
  await readFile(path.join(source, "build-info.json"), "utf8"),
);
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
if (info.websiteRevision !== git("rev-parse", "HEAD"))
  throw Error(
    "Rebuild from the current committed revision before preparing a release.",
  );
if (git("status", "--porcelain", "--untracked-files=no"))
  throw Error("Commit tracked changes before preparing a release.");

function metadata(html, pathname, locale, indexable = true) {
  const canonical = `${origin}/${locale}${pathname}`;
  const title = html.match(/<title>(.*?)<\/title>/s)?.[1] || "Open Members";
  const description =
    html.match(/<meta name="description" content="([^"]*)">/)?.[1] ||
    "Open Members";
  return html
    .replace(
      'name="robots" content="noindex,nofollow"',
      `name="robots" content="${indexable ? "index,follow" : "noindex,follow"}"`,
    )
    .replace(
      /(<link rel="alternate" hreflang="[^"]+" href=")\//g,
      `$1${origin}/`,
    )
    .replace(
      "</head>",
      `<link rel="canonical" href="${canonical}"><link rel="alternate" hreflang="x-default" href="${origin}${pathname}"><meta property="og:type" content="website"><meta property="og:site_name" content="Open Members"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${canonical}"><meta property="og:locale" content="${locale === "pt" ? "pt_BR" : "en_US"}"></head>`,
    );
}

await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
const files = new Set();
async function write(relative, bytes) {
  if (
    !/^[a-zA-Z0-9_./-]+$/.test(relative) ||
    relative.startsWith("/") ||
    relative.split("/").some((p) => p.startsWith("."))
  )
    throw Error(`Invalid release path: ${relative}`);
  await mkdir(path.dirname(path.join(stage, relative)), { recursive: true });
  await writeFile(path.join(stage, relative), bytes);
  files.add(relative);
}
async function read(relative) {
  const file = path.join(source, relative);
  if (!(await lstat(file)).isFile())
    throw Error(`Not a regular build file: ${relative}`);
  return readFile(file);
}
const pages = [
  "/",
  "/help/",
  ...catalog.map((article) => `/help/${article.slug}/`),
];
for (const locale of ["pt", "en"]) {
  for (const pathname of pages) {
    const file = `${locale}${pathname}index.html`;
    await write(
      file,
      metadata((await read(file)).toString(), pathname, locale),
    );
  }
  await write(
    `${locale}/help/search-index.json`,
    await read(`${locale}/help/search-index.json`),
  );
  const title = locale === "pt" ? "Página não encontrada" : "Page not found";
  await write(
    `${locale}/404.html`,
    layout({
      locale,
      title: `${title} — Open Members`,
      content: `<main id="main" class="help-hero"><p class="eyebrow">404</p><h1>${title}</h1><p>${locale === "pt" ? "Este endereço não está disponível. Explore o produto ou encontre um guia na Central de ajuda." : "This address is unavailable. Explore the product or find a guide in the Help Center."}</p><div class="actions"><a class="button" href="/${locale}/">Open Members</a><a class="text-link" href="/${locale}/help/">${locale === "pt" ? "Central de ajuda" : "Help Center"}</a></div></main>`,
    }),
  );
}
for (const pathname of pages) {
  const file = `${pathname.slice(1)}index.html`;
  await write(
    file,
    metadata((await read(file)).toString(), pathname, "pt", false),
  );
}
await write("help/search-index.json", await read("help/search-index.json"));
for (const file of ["style.css", "site.js", "search.js", "locale.js"])
  await write(file, await read(file));
for (const asset of info.assets) {
  if (!/^[a-zA-Z0-9_-]+\.(svg|png|txt)$/.test(asset.output))
    throw Error("Invalid asset filename");
  const bytes = await read(`assets/${asset.output}`);
  if (sha256(bytes) !== asset.sha256)
    throw Error(`Changed reviewed asset: ${asset.output}`);
  await write(`assets/${asset.output}`, bytes);
}
const markedLicense = await read("assets/Marked-LICENSE.txt");
if (
  !markedLicense.equals(
    await readFile(path.join(root, "node_modules/marked/LICENSE.md")),
  )
)
  throw Error("Changed Marked license");
await write("assets/Marked-LICENSE.txt", markedLicense);
await write(
  "robots.txt",
  `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`,
);
await write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${pages.flatMap((pathname) => ["pt", "en"].map((locale) => `  <url><loc>${origin}/${locale}${pathname}</loc><xhtml:link rel="alternate" hreflang="pt-BR" href="${origin}/pt${pathname}"/><xhtml:link rel="alternate" hreflang="en" href="${origin}/en${pathname}"/><xhtml:link rel="alternate" hreflang="x-default" href="${origin}${pathname}"/></url>`)).join("\n")}\n</urlset>\n`,
);
await write(
  "_headers",
  `/*\n${Object.entries(securityHeaders)
    .map(([name, value]) => `  ${name}: ${value}`)
    .join("\n")}\n`,
);

const entries = [];
for (const relative of [...files].sort()) {
  const bytes = await readFile(path.join(stage, relative));
  entries.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
}
const manifest = {
  origin,
  websiteRevision: info.websiteRevision,
  sourceRevision: info.sourceRevision,
  files: entries,
  fileCount: entries.length,
  totalBytes: entries.reduce((sum, f) => sum + f.bytes, 0),
  contentSha256: sha256(JSON.stringify(entries)),
};
const previous = path.join(root, ".release-previous");
await rm(previous, { recursive: true, force: true });
try {
  await rename(output, previous);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
try {
  await rename(stage, output);
} catch (error) {
  try {
    await rename(previous, output);
  } catch {}
  throw error;
}
await rm(previous, { recursive: true, force: true });
await mkdir(path.join(root, ".release-evidence"), { recursive: true });
await writeFile(
  path.join(root, ".release-evidence/manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Prepared ${manifest.fileCount} public files (${manifest.totalBytes} bytes). SHA-256: ${manifest.contentSha256}`,
);
