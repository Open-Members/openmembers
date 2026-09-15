export const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export function requestLocale(request) {
  const saved = request.headers
    .get("Cookie")
    ?.match(/(?:^|;\s*)openmembers-language=(pt|en)(?:;|$)/)?.[1];
  if (saved) return saved;
  const country = request.cf?.country;
  if (country === "BR") return "pt";
  if (/^[A-Z]{2}$/.test(country || "") && country !== "XX") return "en";
  const languages = (request.headers.get("Accept-Language") || "")
    .split(",")
    .map((entry, index) => {
      const [language, ...parameters] = entry.trim().toLowerCase().split(";");
      const quality = parameters.find((p) => p.trim().startsWith("q="));
      return {
        language,
        index,
        quality: quality ? Number(quality.trim().slice(2)) : 1,
      };
    })
    .filter((entry) => entry.quality > 0 && entry.quality <= 1)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  return /^pt(?:-|$)/.test(languages[0]?.language || "") ? "pt" : "en";
}

function secure(response) {
  const result = new Response(response.body, response);
  for (const [name, value] of Object.entries(securityHeaders))
    result.headers.set(name, value);
  return result;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!["GET", "HEAD"].includes(request.method))
      return secure(
        new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } }),
      );
    if (url.hostname === "openmembers.club" && url.protocol !== "https:") {
      url.protocol = "https:";
      return secure(Response.redirect(url, 308));
    }
    const locale = requestLocale(request);
    if (url.pathname === "/" || /^\/help(?:\/|$)/.test(url.pathname)) {
      url.pathname = `/${locale}${url.pathname}`;
      return secure(
        new Response(null, {
          status: 302,
          headers: {
            Location: url.href,
            "Cache-Control": "private, no-store",
            Vary: "Cookie, Accept-Language",
          },
        }),
      );
    }
    let response = await env.ASSETS.fetch(request);
    if (response.status === 404 && !/^\/(pt|en)(?:\/|$)/.test(url.pathname)) {
      const fallback = new URL(`/${locale}/__not-found__/`, url);
      const page = await env.ASSETS.fetch(
        new Request(fallback, { method: request.method }),
      );
      response = new Response(page.body, {
        status: 404,
        headers: page.headers,
      });
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Vary", "Cookie, Accept-Language");
    }
    return secure(response);
  },
};
