import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalog } from "../src/catalog.mjs";
import {
  compileDocs,
  validateTranslationRevision,
  curate,
  resolveLink,
} from "../scripts/docs.mjs";
import { searchArticles } from "../src/search.mjs";
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const htmlFiles = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const f = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith("qa-")) await walk(f);
    else if (f.endsWith(".html")) htmlFiles.push(f);
  }
}
await walk(root);
const html = new Map(
  await Promise.all(htmlFiles.map(async (f) => [f, await readFile(f, "utf8")])),
);
test("all generated navigation, images, scripts, and fragments resolve inside the public output", async () => {
  assert.equal(htmlFiles.length, 36);
  let links = 0;
  for (const [f, body] of html) {
    assert.equal((body.match(/<h1[ >]/g) || []).length, 1, f);
    assert.doesNotMatch(body, /href="#"|src="https?:|<script[^>]*>[^<\s]/, f);
    const ids = [...body.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(ids.length, new Set(ids).size, `Duplicate ID ${f}`);
    for (const match of body.matchAll(/\b(?:href|src|srcset)="([^"]+)"/g)) {
      const ref = match[1].replace(/&amp;/g, "&");
      if (ref.startsWith("https://")) continue;
      const url = new URL(ref, "http://127.0.0.1/" + path.relative(root, f));
      assert.equal(url.origin, "http://127.0.0.1");
      let target = path.join(root, decodeURIComponent(url.pathname));
      if ((await stat(target)).isDirectory())
        target = path.join(target, "index.html");
      if (url.hash) {
        const content = html.get(target);
        assert.ok(content, `Fragment on non-HTML ${ref}`);
        assert.ok(
          content.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`),
          `Missing fragment ${ref} in ${f}`,
        );
      }
      links++;
    }
  }
  assert.ok(links > 250);
  console.log(
    `Verified ${links} local URLs, 36 pages, unique IDs and one h1 per page.`,
  );
});
test("commercial preview contains exactly two unavailable offers and no enrollment form", () => {
  const home = html.get(path.join(root, "en/index.html"));
  assert.equal((home.match(/data-service\b/g) || []).length, 2);
  assert.equal(
    (home.match(/class="coming-soon">Coming soon/g) || []).length,
    2,
  );
  assert.match(home, /Monthly fee/);
  assert.match(home, /One-time payment/);
  assert.doesNotMatch(
    home,
    /action="[^\"]*(checkout|subscribe)|type="email"|Most popular|Start free trial/,
  );
});
test("search supports accents, multiple terms, empty input and real no-result states", async () => {
  const index = JSON.parse(
    await readFile(path.join(root, "help/search-index.json"), "utf8"),
  );
  assert.equal(index.length, 10);
  assert.ok(
    searchArticles(index, "instalacao").some((a) => a.slug === "installation"),
  );
  assert.ok(
    searchArticles(index, "branding").some((a) => a.slug === "customization"),
  );
  assert.equal(
    searchArticles(index, "private vulnerability")[0].slug,
    "security",
  );
  assert.deepEqual(searchArticles(index, ""), []);
  assert.deepEqual(searchArticles(index, "zzqnonexistent987"), []);
});
test("curation fails closed, includes only public guides, and preserves configuration limits", async () => {
  assert.throws(
    () =>
      curate("# Doc\n## Different\nText", {
        slug: "fixture",
        sections: ["Expected"],
      }),
    /Missing curated section/,
  );
  assert.equal(catalog.length, 10);
  assert.ok(
    catalog.every(
      (a) => !a.source.includes("HANDOFF") &&
        !a.source.includes("internal/") &&
        !a.source.includes(".private"),
    ),
  );
  const index = JSON.parse(
    await readFile(path.join(root, "help/search-index.json"), "utf8"),
  );
  const advanced = index.find((a) => a.slug === "features").text;
  const integrations = index.find((a) => a.slug === "integrations").text;
  assert.doesNotMatch(
    advanced,
    /HANDOFF|internal\/|\.private\//,
  );
  assert.doesNotMatch(
    integrations,
    /HANDOFF|internal\/|\.private\//,
  );
  assert.match(advanced, /desativado por padrão/);
  assert.match(integrations, /Configurado não significa validado/);
});
test("unknown/private references and unsafe schemes cannot become navigable site links", () => {
  const entry = catalog[0],
    headings = new Map([["overview", new Set(["architecture"])]]),
    redirects = [];
  for (const href of [
    "javascript:alert(1)",
    "data:text/html,x",
    "//unknown.test",
    "../../.private/test.md",
    "http://127.0.0.1:3000",
  ])
    assert.equal(resolveLink(href, entry, headings, redirects), null);
  assert.equal(
    resolveLink("#architecture", entry, headings, redirects),
    "/help/overview/#architecture",
  );
  assert.equal(
    resolveLink("#omitted-section", entry, headings, redirects),
    "/help/overview/",
  );
  assert.equal(redirects.length, 1);
});

test("both languages cover all guides, preserve canonical anchors and offer equivalent destinations", async () => {
  for (const locale of ["pt", "en"]) {
    const home = html.get(path.join(root, locale, "index.html"));
    assert.match(
      home,
      new RegExp(`<html lang="${locale === "pt" ? "pt-BR" : "en"}"`),
    );
    assert.equal((home.match(/data-service\b/g) || []).length, 2);
    assert.equal((home.match(/class="coming-soon"/g) || []).length, 2);
    const index = JSON.parse(
      await readFile(path.join(root, locale, "help/search-index.json"), "utf8"),
    );
    assert.equal(index.length, 10);
    assert.ok(
      index.every((a) => a.lang === (locale === "pt" ? "pt-BR" : "en")),
    );
    assert.equal(
      searchArticles(
        index,
        locale === "pt"
          ? "instalação independente"
          : "independent installation",
      )[0].slug,
      "installation",
    );
    assert.equal(
      searchArticles(
        index,
        locale === "pt" ? "política segurança" : "security policy",
      )[0].slug,
      "security",
    );
    for (const a of catalog) {
      const doc = html.get(
        path.join(root, locale, "help", a.slug, "index.html"),
      );
      assert.ok(
        doc.includes(
          `href="/${locale === "pt" ? "en" : "pt"}/help/${a.slug}/"`,
        ),
      );
      assert.ok(!doc.includes('href="/help/'));
      const other = html.get(
        path.join(
          root,
          locale === "pt" ? "en" : "pt",
          "help",
          a.slug,
          "index.html",
        ),
      );
      assert.deepEqual(
        [...doc.matchAll(/<h[2-6] id="([^"]+)"/g)].map((m) => m[1]),
        [...other.matchAll(/<h[2-6] id="([^"]+)"/g)].map((m) => m[1]),
      );
    }
  }
  assert.doesNotMatch(
    html.get(path.join(root, "pt/index.html")),
    /Skip to content|Coming soon|Monthly fee|Help Center|Original size/,
  );
  assert.doesNotMatch(
    html.get(path.join(root, "en/index.html")),
    /Em breve|Mensalidade|Pular para|Central de ajuda|Tamanho original/,
  );
});

test("translations fail closed on source or curation drift and retain executable examples", () => {
  const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
  const sets = ["pt", "en"].map(
    (locale) => compileDocs(sourceRoot, locale).articles,
  );
  for (const a of sets.flat()) {
    const blocks = (s) =>
      [...s.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1].trim());
    assert.deepEqual(
      blocks(a.markdown),
      blocks(a.sourceMarkdown),
      `${a.slug}/${a.lang}: code changed`,
    );
    assert.throws(
      () =>
        validateTranslationRevision(
          { sha256: a.sha256, curatedSha256: a.curatedSha256 },
          { sha256: "changed", curatedSha256: a.curatedSha256 },
          a.slug,
        ),
      /requires source review/,
    );
    assert.throws(
      () =>
        validateTranslationRevision(
          { sha256: a.sha256, curatedSha256: a.curatedSha256 },
          { sha256: a.sha256, curatedSha256: "changed" },
          a.slug,
        ),
      /requires source review/,
    );
  }
});
