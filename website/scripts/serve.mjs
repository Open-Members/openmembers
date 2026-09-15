import http from "node:http";
import { layout } from "../src/layout.mjs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = await realpath(fileURLToPath(new URL("../dist", import.meta.url)));
const port = Number(process.env.PORT || 4321);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};
const server = http.createServer(async (req, res) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, { Allow: "GET, HEAD" });
    return res.end();
  }
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    const decoded = decodeURIComponent(url.pathname);
    if (
      decoded.includes("\\") ||
      decoded.split("/").some((s) => s.startsWith("."))
    )
      throw Error("invalid path");
    let file = path.resolve(root, "." + decoded);
    if (!(file === root || file.startsWith(root + path.sep)))
      throw Error("outside output");
    if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
    const real = await realpath(file);
    if (!real.startsWith(root + path.sep)) throw Error("outside output");
    const bytes = await readFile(real);
    res.writeHead(200, {
      "Content-Type": types[path.extname(real)] || "application/octet-stream",
      "Content-Length": bytes.length,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    const locale = /^\/en(?:\/|$)/.test(req.url) ? "en" : "pt";
    const title = locale === "pt" ? "Página não encontrada" : "Page not found";
    res.end(
      layout({
        locale,
        title: `${title} — Open Members`,
        content: `<main id="main" class="help-hero"><p class="eyebrow">404</p><h1>${title}</h1><p>${locale === "pt" ? "Este endereço não está disponível. Explore o produto ou encontre um guia na Central de ajuda." : "This address is unavailable. Explore the product or find a guide in the Help Center."}</p><div class="actions"><a class="button" href="/${locale}/">Open Members</a><a class="text-link" href="/${locale}/help/">${locale === "pt" ? "Central de ajuda" : "Help Center"}</a></div></main>`,
      }),
    );
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Open Members preview: http://127.0.0.1:${server.address().port}`,
  ),
);
server.on("error", (error) => {
  console.error(error.code);
  process.exitCode = 1;
});
