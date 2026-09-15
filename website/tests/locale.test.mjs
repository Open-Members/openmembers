import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { chooseLocale, brazilZones, localeBootstrap } from "../src/locale.mjs";
test("Brazilian regions use Portuguese, other regions English, with explicit preference first", () => {
  for (const timezone of brazilZones)
    assert.equal(chooseLocale({ timezone, languages: ["en-US"] }), "pt");
  for (const timezone of [
    "Europe/Lisbon",
    "America/New_York",
    "Asia/Tokyo",
    "Europe/London",
  ])
    assert.equal(chooseLocale({ timezone, languages: ["pt-BR"] }), "en");
  assert.equal(chooseLocale({ timezone: "UTC", languages: ["pt-BR"] }), "pt");
  assert.equal(chooseLocale({ languages: ["en-US"] }), "en");
  assert.equal(
    chooseLocale({ saved: "pt", timezone: "America/New_York" }),
    "pt",
  );
  assert.equal(
    chooseLocale({ saved: "en", timezone: "America/Sao_Paulo" }),
    "en",
  );
  assert.equal(
    chooseLocale({ saved: "invalid", timezone: "America/Sao_Paulo" }),
    "pt",
  );
});
test("entry redirects preserve path query and anchor; explicit locales never redirect; blocked storage is supported", () => {
  const code = `(${localeBootstrap.toString()})(${chooseLocale.toString()},${JSON.stringify(brazilZones)})`;
  for (const pathname of [
    "/",
    "/help/installation/",
    "/pt/",
    "/en/help/installation/",
  ]) {
    let destination;
    const context = {
      location: {
        pathname,
        search: "?q=auth",
        hash: "#architecture",
        replace: (v) => (destination = v),
      },
      localStorage: {
        getItem() {
          throw Error("blocked");
        },
      },
      Intl: {
        DateTimeFormat: () => ({
          resolvedOptions: () => ({ timeZone: "America/Sao_Paulo" }),
        }),
      },
      navigator: { languages: ["en-US"] },
    };
    vm.runInNewContext(code, context);
    assert.equal(
      destination,
      pathname.startsWith("/pt/") || pathname.startsWith("/en/")
        ? undefined
        : `/pt${pathname}?q=auth#architecture`,
    );
  }
});
