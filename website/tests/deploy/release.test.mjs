import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { catalog } from "../../src/catalog.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const release = path.join(root, "release");
const read = (name) => readFile(path.join(release, name), "utf8");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pages = ["/", "/help/", ...catalog.map((a) => `/help/${a.slug}/`)];
async function walk(dir, prefix = "") {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    assert.equal(entry.isSymbolicLink(), false, `No symlinks: ${entry.name}`);
    const relative = prefix + entry.name;
    if (entry.isDirectory())
      files.push(...(await walk(path.join(dir, entry.name), relative + "/")));
    else {
      assert.equal(entry.isFile(), true);
      files.push(relative);
    }
  }
  return files.sort();
}
test("public release matches an explicit allowlist and every recorded file hash", async () => {
  const assets = [
    "wordmark-dark.svg",
    "wordmark-light.svg",
    "mark-dark.svg",
    "mark-light.svg",
    "icon.svg",
    "dashboard.png",
    "course-catalog.png",
    "lesson-workspace.png",
    "admin-reports.png",
    "language-settings.png",
    "mobile-lesson.png",
    "Montserrat-OFL.txt",
    "Open-Members-LICENSE.txt",
    "Marked-LICENSE.txt",
  ];
  const expected = [
    "style.css",
    "site.js",
    "search.js",
    "locale.js",
    "robots.txt",
    "sitemap.xml",
    "_headers",
    "help/search-index.json",
    ...assets.map((a) => `assets/${a}`),
    ...pages.map((p) => `${p.slice(1)}index.html`),
  ];
  for (const locale of ["pt", "en"])
    expected.push(
      `${locale}/404.html`,
      `${locale}/help/search-index.json`,
      ...pages.map((p) => `${locale}${p}index.html`),
    );
  const files = await walk(release);
  assert.deepEqual(files, expected.sort());
  const manifest = JSON.parse(
    await readFile(path.join(root, ".release-evidence/manifest.json"), "utf8"),
  );
  assert.deepEqual(
    manifest.files.map((f) => f.path),
    files,
  );
  assert.equal(manifest.fileCount, files.length);
  assert.equal(manifest.contentSha256, digest(JSON.stringify(manifest.files)));
  let total = 0;
  for (const file of manifest.files) {
    const bytes = await readFile(path.join(release, file.path));
    assert.equal(digest(bytes), file.sha256, file.path);
    assert.equal(bytes.length, file.bytes, file.path);
    total += bytes.length;
  }
  assert.equal(manifest.totalBytes, total);
  await assert.rejects(lstat(path.join(release, "build-info.json")), {
    code: "ENOENT",
  });
});
test("production pages are indexable with bilingual canonical URLs and a complete sitemap", async () => {
  const sitemap = await read("sitemap.xml");
  assert.equal((sitemap.match(/<url>/g) || []).length, 24);
  for (const locale of ["pt", "en"])
    for (const pathname of pages) {
      const canonical = `https://openmembers.club/${locale}${pathname}`;
      const html = await read(`${locale}${pathname}index.html`);
      assert.ok(html.includes(`rel="canonical" href="${canonical}"`));
      assert.ok(html.includes('name="robots" content="index,follow"'));
      assert.ok(
        html.includes(
          `hreflang="pt-BR" href="https://openmembers.club/pt${pathname}"`,
        ),
      );
      assert.ok(
        html.includes(
          `hreflang="en" href="https://openmembers.club/en${pathname}"`,
        ),
      );
      assert.ok(
        html.includes(
          `hreflang="x-default" href="https://openmembers.club${pathname}"`,
        ),
      );
      assert.ok(sitemap.includes(`<loc>${canonical}</loc>`));
    }
  assert.match(
    await read("robots.txt"),
    /Allow: \/\nSitemap: https:\/\/openmembers.club\/sitemap.xml/,
  );
  assert.match(
    await readFile(path.join(root, "dist/robots.txt"), "utf8"),
    /Disallow: \//,
  );
  assert.match(
    await readFile(path.join(root, "dist/pt/index.html"), "utf8"),
    /noindex,nofollow/,
  );
  for (const locale of ["pt", "en"])
    assert.match(await read(`${locale}/404.html`), /noindex,nofollow/);
  assert.match(
    await read("_headers"),
    /Content-Security-Policy: default-src 'self'/,
  );
});
