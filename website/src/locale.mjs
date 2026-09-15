export const brazilZones = [
  "America/Araguaina",
  "America/Bahia",
  "America/Belem",
  "America/Boa_Vista",
  "America/Campo_Grande",
  "America/Cuiaba",
  "America/Eirunepe",
  "America/Fortaleza",
  "America/Maceio",
  "America/Manaus",
  "America/Noronha",
  "America/Porto_Acre",
  "America/Porto_Velho",
  "America/Recife",
  "America/Rio_Branco",
  "America/Santarem",
  "America/Sao_Paulo",
  "Brazil/Acre",
  "Brazil/DeNoronha",
  "Brazil/East",
  "Brazil/West",
];
export function chooseLocale(
  { saved, timezone, languages = [] },
  zones = brazilZones,
) {
  if (["pt", "en"].includes(saved)) return saved;
  if (zones.includes(timezone)) return "pt";
  if (
    timezone &&
    timezone !== "UTC" &&
    timezone !== "Etc/UTC" &&
    timezone !== "Etc/Unknown"
  )
    return "en";
  return languages[0]?.toLowerCase().startsWith("pt") ? "pt" : "en";
}
export function localeBootstrap(choose, zones) {
  if (/^\/(pt|en)(\/|$)/.test(location.pathname)) return;
  let saved;
  try {
    saved = localStorage.getItem("openmembers-language");
  } catch {}
  let timezone;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {}
  const locale = choose(
    { saved, timezone, languages: navigator.languages || [navigator.language] },
    zones,
  );
  location.replace(
    `/${locale}${location.pathname}${location.search}${location.hash}`,
  );
}
export const pick = (locale, pt, en) => (locale === "pt" ? pt : en);
export const route = (locale, path = "/") => `/${locale}${path}`;
