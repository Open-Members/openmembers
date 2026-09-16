import { Marked, Renderer } from "marked";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { readFileSync } from "node:fs";
import { catalogFor, categoriesFor } from "../src/catalog-locales.mjs";
import { pick, route } from "../src/locale.mjs";
import { captureNote } from "../src/layout.mjs";
import { catalog } from "../src/catalog.mjs";
import { esc, layout, arrow } from "../src/layout.mjs";
export function validateTranslationRevision(manifest, actual, slug) {
  if (
    !manifest ||
    manifest.sha256 !== actual.sha256 ||
    manifest.curatedSha256 !== actual.curatedSha256
  )
    throw Error(`Translation requires source review: ${slug}`);
}
export const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
export function curate(raw, entry) {
  // Section selectors are exact and fail closed when an upstream heading changes.
  const chunks = raw.replace(/^# .+\n/, "").split(/(?=^## )/m);
  let selected = chunks;
  if (entry.sections)
    selected = entry.sections.map((name) => {
      const chunk =
        name === "@intro"
          ? chunks[0]
          : chunks.find((c) => c.startsWith(`## ${name}\n`));
      if (!chunk) throw Error(`Missing curated section: ${entry.slug}/${name}`);
      return chunk;
    });
  let body = selected.join("\n");
  if (entry.stripPreamble) body = body.slice(body.indexOf("| Integração"));
  if (entry.dropRows)
    body = body
      .split("\n")
      .filter(
        (line) =>
          !entry.dropRows.some((name) => line.startsWith(`| ${name} |`)),
      )
      .join("\n");
  return `${entry.intro ? entry.intro + "\n\n" : ""}${body.trim()}`;
}
const bySource = new Map(catalog.map((entry) => [entry.source, entry]));
const docsAlias = new Map([["docs/development/local-database.md", "development"]]);
export function resolveLink(href, entry, headings, redirects) {
  if (/^https?:\/\//i.test(href)) {
    const u = new URL(href);
    if (["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(u.hostname))
      return null;
    return u.protocol === "https:" ? u.href : null;
  }
  if (
    /^[a-z][a-z\d+.-]*:/i.test(href) ||
    href.startsWith("//") ||
    href.includes("\\")
  )
    return null;
  const [name, hash] = href.split("#");
  const source = name
    ? path.posix.normalize(
        path.posix.join(
          path.posix.dirname(entry.source),
          decodeURIComponent(name),
        ),
      )
    : entry.source;
  let target = bySource.get(source);
  if (!target && docsAlias.has(source))
    target = catalog.find((a) => a.slug === docsAlias.get(source));
  if (!target) return null;
  let fragment = hash ? decodeURIComponent(hash) : "";
  if (fragment && !headings.get(target.slug)?.has(fragment)) {
    redirects.push({
      article: entry.slug,
      reference: href,
      destination: target.slug,
    });
    fragment = "";
  }
  return `${entry.locale ? "/" + entry.locale : ""}/help/${target.slug}/${fragment ? "#" + encodeURIComponent(fragment) : ""}`;
}
export function compileDocs(sourceRoot, locale = "pt") {
  const translationManifest = JSON.parse(
    readFileSync(
      new URL("../content/translations.json", import.meta.url),
      "utf8",
    ),
  );
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: sourceRoot,
    encoding: "utf8",
  }).trim();
  const redirects = [];
  const articles = catalogFor(locale).map((entry) => {
    const raw = execFileSync("git", ["show", `${revision}:${entry.source}`], {
      cwd: sourceRoot,
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
    });
    const originalEntry = catalog.find((a) => a.slug === entry.slug);
    const sourceMarkdown = curate(raw, originalEntry);
    const sha256 = createHash("sha256").update(raw).digest("hex");
    const curatedSha256 = createHash("sha256")
      .update(sourceMarkdown)
      .digest("hex");
    const manifest = translationManifest[entry.slug];
    validateTranslationRevision(
      manifest,
      { sha256, curatedSha256 },
      entry.slug,
    );
    const translated = entry.lang !== entry.sourceLang;
    const markdown = translated
      ? readFileSync(
          new URL(`../content/${locale}/${entry.slug}.md`, import.meta.url),
          "utf8",
        )
      : sourceMarkdown;
    return {
      ...entry,
      raw,
      sourceMarkdown,
      markdown,
      sha256,
      curatedSha256,
      translated,
      translationSha256: translated
        ? createHash("sha256").update(markdown).digest("hex")
        : null,
    };
  });
  const headings = new Map(articles.map((a) => [a.slug, new Set()]));
  for (const a of articles) {
    const counts = new Map();
    const md = new Marked();
    md.walkTokens(md.lexer(a.sourceMarkdown), (token) => {
      if (token.type === "heading") {
        const base = slugify(token.text);
        const count = counts.get(base) || 0;
        counts.set(base, count + 1);
        headings.get(a.slug).add(base + (count ? `-${count}` : ""));
      }
    });
  }
  for (const a of articles) {
    const renderer = new Renderer();
    const toc = [];
    const references = new Set();
    const sourceHeadingIds = [...headings.get(a.slug)];
    let headingIndex = 0;
    renderer.heading = function (token) {
      const id = sourceHeadingIds[headingIndex++];
      if (!id) throw Error(`Translation heading mismatch: ${a.slug}/${locale}`);
      if (token.depth === 2) toc.push({ id, text: token.text });
      return `<h${Math.max(2, token.depth)} id="${esc(id)}">${this.parser.parseInline(token.tokens)}</h${Math.max(2, token.depth)}>\n`;
    };
    renderer.html = () => ""; // Never execute repository HTML in the documentation site.
    renderer.link = function (token) {
      const text = this.parser.parseInline(token.tokens);
      const href = resolveLink(token.href, a, headings, redirects);
      if (!href) {
        references.add(token.href);
        return `<span class="source-reference" title="${pick(locale, "Referência no pacote de fonte", "Reference in source package")}: ${esc(token.href)}">${text}</span>`;
      }
      return `<a href="${esc(href)}">${text}</a>`;
    };
    renderer.image = function (token) {
      const src = path.posix.normalize(
        path.posix.join(path.posix.dirname(a.source), token.href),
      );
      const allow = [
        "dashboard",
        "course-catalog",
        "lesson-workspace",
        "admin-reports",
        "language-settings",
        "mobile-lesson",
      ];
      const name = path.posix.basename(src, ".png");
      if (!allow.includes(name) || src !== `docs/images/${name}.png`)
        throw Error(`Image outside curated assets: ${a.slug}`);
      return `<img src="/assets/${name}.png" alt="${esc(token.text)}" loading="lazy">`;
    };
    const defaultTable = renderer.table;
    renderer.table = function (token) {
      if (a.tableColumns) {
        token = {
          ...token,
          header: token.header.slice(0, a.tableColumns),
          align: token.align.slice(0, a.tableColumns),
          rows: token.rows.map((row) => row.slice(0, a.tableColumns)),
        };
      }
      return `<div class="table-scroll" role="region" aria-label="${a.lang === "en" ? "Documentation table" : "Tabela da documentação"}" tabindex="0">${defaultTable.call(this, token)}</div>`;
    };
    const md = new Marked({ renderer, gfm: true, breaks: false });
    a.html = md.parse(a.markdown);
    if (headingIndex !== sourceHeadingIds.length)
      throw Error(`Translation heading mismatch: ${a.slug}/${locale}`);
    a.toc = toc;
    a.references = [...references];
    a.searchText = a.html
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z#\d]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return { articles, revision, redirects };
}
export function helpHome(articles, locale = "pt") {
  const p = (pt, en) => pick(locale, pt, en),
    url = (path) => route(locale, path);
  return layout({
    locale,
    pathname: "/help/",
    section: "help",
    title: p("Central de ajuda — Open Members", "Help Center — Open Members"),
    description: p(
      "Guias do Open Members: primeiros passos, personalização, instalação independente, integrações e contribuição.",
      "Open Members guides: getting started, customization, independent installation, integrations, and contributing.",
    ),
    content: `<main id="main"><section class="help-hero"><a class="breadcrumb" href="${url("/")}">Open Members <span aria-hidden="true">/</span></a><p class="eyebrow">${p("CENTRAL DE AJUDA OPEN MEMBERS", "THE OPEN MEMBERS HELP CENTER")}</p><h1>${p("Um pouco de orientação.<br><em>Um caminho mais claro.</em>", "A little guidance.<br><em>A clearer path.</em>")}</h1><p>${p("Conheça o produto. Entenda a configuração. Deixe com a sua cara.", "Explore the product. Understand the setup. Make it your own.")}</p><form class="search-form" role="search" action="${url("/help/")}"><label for="help-search">${p("Buscar nos guias", "Search the guides")}</label><div><span aria-hidden="true">⌕</span><input type="search" id="help-search" name="q" placeholder="${p("Busque marca, instalação ou Supabase", "Try branding, installation, or Supabase")}" autocomplete="off" maxlength="120"><button class="button small" type="submit">${p("Buscar", "Search")}</button></div></form><p class="help-language-note">${p("Dez guias em português e inglês. O projeto é experimental.", "Ten guides in English and Portuguese. The project is experimental.")}</p></section><section class="help-body"><div class="search-results" hidden><div class="search-heading"><h2>${p("Resultados da busca", "Search results")}</h2><button class="text-link" id="clear-search">${p("Limpar busca", "Clear search")} ×</button></div><p id="search-status" role="status" aria-live="polite"></p><div id="search-results-list"></div></div><div id="help-categories"><div class="help-section-heading"><h2>${p("Encontre seu ponto de partida.", "Find your starting point.")}</h2><span>${p("10 guias · 6 categorias", "10 guides · 6 categories")}</span></div><div class="category-grid">${categoriesFor(
      locale,
    )
      .map(
        ([cat, desc], i) =>
          `<section class="category"><div class="category-number">0${i + 1} ${arrow}</div><h3>${cat}</h3><p>${desc}</p><ul>${articles
            .filter((a) => a.category === cat)
            .map(
              (a) =>
                `<li><a href="${url("/help/" + a.slug + "/")}"><span>${esc(a.title)}</span>${arrow}</a></li>`,
            )
            .join("")}</ul></section>`,
      )
      .join(
        "",
      )}</div></div><aside class="help-note"><h2>${p("Documentação, com contexto.", "Documentation, with context.")}</h2><p>${p("Os guias vêm de arquivos selecionados e versionados do projeto. As traduções são revisadas junto à fonte e preservam seus limites de configuração. Os serviços comerciais estão em breve; esta biblioteca não oferece atendimento humano ao vivo.", "Guides come from selected versioned project files. Translations are reviewed against their source and retain configuration limits. Commercial services are coming soon; this library does not provide live human support.")}</p><a class="text-link" href="${url("/help/security/")}">${p("Leia a política de segurança", "Read the security policy")} ${arrow}</a></aside><noscript><p>${p("A busca precisa de JavaScript. Os dez guias estão disponíveis nas categorias acima.", "Search needs JavaScript. All ten guides are available in the categories above.")}</p></noscript></section></main>`,
  });
}
export function articlePage(a, revision, locale = "pt") {
  const p = (pt, en) => pick(locale, pt, en),
    url = (path) => route(locale, path),
    all = catalogFor(locale);
  return layout({
    locale,
    pathname: `/help/${a.slug}/`,
    section: "help",
    title: `${a.title} — ${p("Central de ajuda", "Help Center")} Open Members`,
    description: a.description,
    content: `<main id="main" class="article-main"><div class="article-breadcrumbs"><a href="${url("/help/")}">${p("Central de ajuda", "Help Center")}</a><span aria-hidden="true">/</span><span>${esc(a.category)}</span></div><div class="article-layout"><aside class="article-sidebar"><a class="back-link" href="${url("/help/")}">← ${p("Todos os guias", "All guides")}</a><nav aria-label="${p("Categorias da Central de ajuda", "Help Center categories")}">${categoriesFor(
      locale,
    )
      .map(
        ([cat]) =>
          `<div><p>${cat}</p>${all
            .filter((x) => x.category === cat)
            .map(
              (x) =>
                `<a href="${url("/help/" + x.slug + "/")}"${x.slug === a.slug ? ' aria-current="page"' : ""}>${esc(x.title)}</a>`,
            )
            .join("")}</div>`,
      )
      .join(
        "",
      )}</nav></aside><article class="article" lang="${a.lang}"><header><div class="article-meta"><span>${esc(a.category)}</span><span>${p("Português", "English")}</span><span>${Math.max(1, Math.ceil(a.searchText.split(/\s/).length / 220))} ${p("min de leitura", "min read")}</span></div><h1>${esc(a.title)}</h1><p class="article-description">${esc(a.description)}</p><div class="source-label"><span>${p("Fonte", "Source")}: <code>${esc(a.source)}</code></span><span>${p("Revisão", "Revision")}: <code>${revision.slice(0, 7)}</code></span></div></header><aside class="article-notice"><strong>${p("Documentação experimental", "Experimental documentation")}</strong><p>${p("Os procedimentos e recursos preservam os limites registrados na fonte. Leia os requisitos e o estado de validação antes de operar uma instalação.", "Procedures and features retain the limits recorded in the source. Read requirements and validation status before operating an installation.")}</p></aside>${a.toc.length ? `<details class="article-toc" open><summary>${p("Neste guia", "In this guide")}</summary><nav aria-label="${p("Sumário", "Table of contents")}">${a.toc.map((t) => `<a href="#${encodeURIComponent(t.id)}">${esc(t.text)}</a>`).join("")}</nav></details>` : ""}<div class="prose">${a.html}</div>${a.slug === "overview" ? `<figure class="article-capture"><a href="/assets/dashboard.png" data-enlarge data-title="${p("Início da área de membros com dados fictícios", "Member home with fictitious data")}"><img src="/assets/dashboard.png" alt="${p("Tela real de início com cursos fictícios e encontro agendado", "Real member home with fictitious courses and a scheduled session")}" width="1280" height="1465" loading="lazy"></a><figcaption>${captureNote(locale)} ${p("Selecione para ampliar.", "Select to enlarge.")}</figcaption></figure>` : ""}<aside class="source-note"><strong>${p("Sobre esta edição", "About this edition")}</strong><p>${a.translated ? p("Tradução editorial vinculada ao hash da fonte e à seleção de seções indicadas no registro de build. Alterações da fonte exigem nova revisão da tradução.", "Editorial translation tied to the source hash and section selection identified in the build record. Source changes require a new translation review.") : p("Gerada a partir do arquivo versionado indicado acima, no idioma da fonte.", "Generated from the versioned file identified above, in its source language.")} ${p("Comandos, identificadores, exemplos de código e rótulos citados de ferramentas preservam o texto original. Referências pontilhadas indicam arquivos do pacote de fonte fora desta seleção de guias.", "Commands, identifiers, code examples, and quoted tool labels retain their original text. Dotted references identify files in the source package outside this selection of guides.")} ${a.sections ? p("Este artigo usa uma seleção editorial de seções.", "This article uses an editorial selection of sections.") : ""}</p><p>${p("Repositório do projeto no", "Project repository on")} <a href="https://github.com/Open-Members/openmembers">GitHub</a>.</p></aside><a class="text-link" href="${url("/help/")}">${p("Voltar para todos os guias", "Back to all guides")} ${arrow}</a></article></div></main>`,
  });
}
