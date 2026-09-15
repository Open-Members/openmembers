import { mkdir, writeFile, copyFile, rm, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { home } from "../src/home.mjs";
import { chooseLocale, localeBootstrap, brazilZones } from "../src/locale.mjs";
import { compileDocs, helpHome, articlePage } from "./docs.mjs";
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const arg = process.argv.indexOf("--source-root");
const sourceRoot =
  arg >= 0 ? path.resolve(process.argv[arg + 1]) : path.resolve(root, "..");
const compiled = Object.fromEntries(
  ["pt", "en"].map((locale) => [locale, compileDocs(sourceRoot, locale)]),
);
const { articles, revision, redirects } = compiled.pt;
const output = path.join(root, "dist");
const dist = path.join(root, ".dist-building");
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "assets"), { recursive: true });
const assets = [];
async function sourceAsset(source, output) {
  const bytes = execFileSync("git", ["show", `${revision}:${source}`], {
    cwd: sourceRoot,
    maxBuffer: 5 * 1024 * 1024,
  });
  await writeFile(path.join(dist, "assets", output), bytes);
  assets.push({
    source,
    output,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
for (const f of [
  "wordmark-dark.svg",
  "wordmark-light.svg",
  "mark-dark.svg",
  "mark-light.svg",
])
  await sourceAsset(`public/brand/${f}`, f);
await sourceAsset("public/icon.svg", "icon.svg");
for (const f of [
  "dashboard",
  "course-catalog",
  "lesson-workspace",
  "admin-reports",
  "language-settings",
  "mobile-lesson",
])
  await sourceAsset(`docs/images/${f}.png`, f + ".png");
await sourceAsset("docs/brand/Montserrat-OFL.txt", "Montserrat-OFL.txt");
await sourceAsset("LICENSE", "Open-Members-LICENSE.txt");
await copyFile(
  path.join(root, "node_modules/marked/LICENSE.md"),
  path.join(dist, "assets/Marked-LICENSE.txt"),
);
for (const f of ["style.css", "site.js"])
  await copyFile(path.join(root, "src", f), path.join(dist, f));
await copyFile(path.join(root, "src/search.mjs"), path.join(dist, "search.js"));
await writeFile(
  path.join(dist, "locale.js"),
  `(${localeBootstrap.toString()})(${chooseLocale.toString()},${JSON.stringify(brazilZones)});`,
);
for (const locale of ["pt", "en"]) {
  const set = compiled[locale];
  const base = path.join(dist, locale);
  await mkdir(path.join(base, "help"), { recursive: true });
  await writeFile(path.join(base, "index.html"), home(locale));
  await writeFile(
    path.join(base, "help/index.html"),
    helpHome(set.articles, locale),
  );
  for (const a of set.articles) {
    await mkdir(path.join(base, "help", a.slug), { recursive: true });
    await writeFile(
      path.join(base, "help", a.slug, "index.html"),
      articlePage(a, revision, locale),
    );
  }
  await writeFile(
    path.join(base, "help/search-index.json"),
    JSON.stringify(
      set.articles.map((a) => ({
        slug: a.slug,
        title: a.title,
        category: a.category,
        lang: a.lang,
        description: a.description,
        text: a.searchText,
      })),
    ),
  );
}
// Legacy entry points remain usable without JavaScript, with complete Portuguese content.
// The small head script selects the regional route before loading the presentation.
await writeFile(path.join(dist, "index.html"), home("pt"));
await mkdir(path.join(dist, "help"), { recursive: true });
await writeFile(path.join(dist, "help/index.html"), helpHome(articles, "pt"));
for (const a of articles) {
  await mkdir(path.join(dist, "help", a.slug), { recursive: true });
  await writeFile(
    path.join(dist, "help", a.slug, "index.html"),
    articlePage(a, revision, "pt"),
  );
}
await copyFile(
  path.join(dist, "pt/help/search-index.json"),
  path.join(dist, "help/search-index.json"),
);
await writeFile(path.join(dist, "robots.txt"), "User-agent: *\nDisallow: /\n");
const websiteRevision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const info = {
  websiteRevision,
  kind: "local-preview",
  sourceRevision: revision,
  node: process.version,
  assets,
  articles: articles.map((a) => ({
    slug: a.slug,
    source: a.source,
    sha256: a.sha256,
    lang: a.lang,
    sections: a.sections || "all",
    dropRows: a.dropRows || [],
    tableColumns: a.tableColumns || null,
  })),
  remappedFragments: redirects,
  locales: ["pt-BR", "en"],
  translations: Object.fromEntries(
    Object.entries(compiled).map(([locale, set]) => [
      locale,
      set.articles.map((a) => ({
        slug: a.slug,
        sourceLanguage: a.sourceLang,
        translated: a.translated,
        sourceSha256: a.sha256,
        curatedSha256: a.curatedSha256,
        translationSha256: a.translationSha256,
      })),
    ]),
  ),
};
await writeFile(
  path.join(dist, "build-info.json"),
  JSON.stringify(info, null, 2) + "\n",
);
// Keep the last successful preview until every output file has been written.
const previous = path.join(root, ".dist-previous");
await rm(previous, { recursive: true, force: true });
try {
  await rename(output, previous);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
try {
  await rename(dist, output);
} catch (error) {
  try {
    await rename(previous, output);
  } catch {}
  throw error;
}
await rm(previous, { recursive: true, force: true });
console.log(
  `Built 36 pages (24 localized + 12 regional entry points) and 10 bilingual curated guides from ${revision}. Output: website/dist`,
);
