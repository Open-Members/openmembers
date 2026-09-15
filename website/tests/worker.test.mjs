import test from "node:test";
import assert from "node:assert/strict";
import worker, { requestLocale } from "../deploy/worker.mjs";

function request(path = "/", country, headers = {}, method = "GET") {
  const req = new Request(`https://openmembers.club${path}`, {
    headers,
    method,
  });
  if (country) Object.defineProperty(req, "cf", { value: { country } });
  return req;
}
test("edge locale respects explicit preference, country, weighted browser fallback", () => {
  assert.equal(
    requestLocale(request("/", "BR", { "Accept-Language": "en-US" })),
    "pt",
  );
  assert.equal(
    requestLocale(request("/", "US", { "Accept-Language": "pt-BR" })),
    "en",
  );
  assert.equal(
    requestLocale(
      request("/", "BR", {
        Cookie: "other=1; openmembers-language=en; rest=1",
      }),
    ),
    "en",
  );
  assert.equal(
    requestLocale(request("/", "US", { Cookie: "openmembers-language=pt" })),
    "pt",
  );
  assert.equal(
    requestLocale(
      request("/", "BR", { Cookie: "openmembers-language=english" }),
    ),
    "pt",
  );
  assert.equal(
    requestLocale(
      request("/", "XX", { "Accept-Language": "en;q=0.3,pt-BR;q=0.9" }),
    ),
    "pt",
  );
  assert.equal(
    requestLocale(request("/", undefined, { "Accept-Language": "pt;q=0,en" })),
    "en",
  );
  assert.equal(
    requestLocale(request("/", undefined, { "CF-IPCountry": "BR" })),
    "en",
  );
});
test("regional redirects preserve guide and query and cannot be publicly cached", async () => {
  const env = {
    ASSETS: {
      fetch() {
        throw Error("Redirect should not request assets");
      },
    },
  };
  for (const path of ["/", "/help/installation/?from=launch"]) {
    const response = await worker.fetch(request(path, "BR"), env);
    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get("Location"),
      `https://openmembers.club/pt${path}`,
    );
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(response.headers.get("Vary"), "Cookie, Accept-Language");
    assert.match(
      response.headers.get("Content-Security-Policy"),
      /frame-ancestors 'none'/,
    );
  }
});
test("explicit language paths remain stable and unknown paths get localized 404s", async () => {
  const paths = [];
  const env = {
    ASSETS: {
      async fetch(req) {
        const path = new URL(req.url).pathname;
        paths.push(path);
        return new Response(
          path.includes("__not-found__") ? "Página não encontrada" : "asset",
          {
            status:
              path.includes("missing") || path.includes("__not-found__")
                ? 404
                : 200,
          },
        );
      },
    },
  };
  const page = await worker.fetch(
    request("/en/help/", "BR", { Cookie: "openmembers-language=pt" }),
    env,
  );
  assert.equal(page.status, 200);
  assert.deepEqual(paths, ["/en/help/"]);
  const missing = await worker.fetch(request("/missing", "BR"), env);
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), "Página não encontrada");
  assert.equal(paths.at(-1), "/pt/__not-found__/");
  assert.equal(missing.headers.get("Cache-Control"), "private, no-store");
});
test("HEAD uses asset metadata, unsupported methods fail, production HTTP redirects", async () => {
  let calls = 0;
  const env = {
    ASSETS: {
      async fetch(req) {
        calls++;
        assert.equal(req.method, "HEAD");
        return new Response(null, { headers: { "Content-Type": "text/html" } });
      },
    },
  };
  assert.equal(
    (await worker.fetch(request("/en/", "US", {}, "HEAD"), env)).headers.get(
      "Content-Type",
    ),
    "text/html",
  );
  const rejected = await worker.fetch(request("/en/", "US", {}, "POST"), env);
  assert.equal(rejected.status, 405);
  assert.equal(rejected.headers.get("Allow"), "GET, HEAD");
  const https = await worker.fetch(
    new Request("http://openmembers.club/en/?q=test"),
    env,
  );
  assert.equal(https.status, 308);
  assert.equal(
    https.headers.get("Location"),
    "https://openmembers.club/en/?q=test",
  );
  assert.equal(calls, 1);
});
