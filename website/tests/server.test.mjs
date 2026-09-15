import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
let child, origin;
before(async () => {
  child = spawn(process.execPath, ["scripts/serve.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Preview did not start")),
      5000,
    );
    child.stdout.on("data", (chunk) => {
      const match = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (!origin) {
        clearTimeout(timer);
        reject(Error(`Preview exited ${code}`));
      }
    });
  });
});
after(() => child?.kill());
test("direct article loads and client modules have their correct content type", async () => {
  for (const [url, type] of [
    ["/pt/help/installation/", "text/html"],
    ["/en/help/installation/", "text/html"],
    ["/locale.js", "text/javascript"],
    ["/search.js", "text/javascript"],
    ["/help/search-index.json", "application/json"],
    ["/assets/icon.svg", "image/svg+xml"],
  ]) {
    const r = await fetch(origin + url);
    assert.equal(r.status, 200);
    assert.ok(r.headers.get("content-type").startsWith(type));
    assert.match(
      r.headers.get("content-security-policy"),
      /connect-src 'self'/,
    );
  }
});
test("preview serves only public output and refuses writes", async () => {
  for (const url of [
    "/.git/config",
    "/%2eprivate/",
    "/..%2f..%2fpackage.json",
    "/package.json",
    "/docs/README.md",
    "/missing",
  ]) {
    assert.equal((await fetch(origin + url)).status, 404, url);
  }
  assert.equal(
    (await fetch(origin + "/help/", { method: "POST" })).status,
    405,
  );
  const head = await fetch(origin + "/", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("missing pages retain the requested language and usable navigation", async () => {
  for (const [locale, heading] of [
    ["pt", "Página não encontrada"],
    ["en", "Page not found"],
  ]) {
    const result = await fetch(origin + `/${locale}/missing/`);
    assert.equal(result.status, 404);
    const body = await result.text();
    assert.ok(body.includes(heading));
    assert.ok(body.includes(`href="/${locale}/help/"`));
  }
});
