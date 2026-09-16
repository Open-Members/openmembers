import { pick as t, route } from "./locale.mjs";
export const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const arrow = '<span aria-hidden="true">↗</span>';
export function layout({
  title,
  description,
  content,
  section = "",
  locale = "pt",
  pathname = "/",
}) {
  const p = (pt, en) => t(locale, pt, en);
  title ||= p(
    "Open Members — Conhecimento com a sua marca",
    "Open Members — Knowledge with your identity",
  );
  description ||= p(
    "Uma área de membros para seus cursos, conteúdos e comunidade. Conheça o produto e os futuros serviços de hospedagem e implementação.",
    "A members area for your courses, content, and community. Explore the product and upcoming hosting and implementation services.",
  );
  const links = [
    [p("Produto", "Product"), "/#experience"],
    [p("Serviços", "Services"), "/#services"],
    [p("Código aberto", "Open source"), "/#open-source"],
    [p("Central de ajuda", "Help Center"), "/help/"],
  ];
  const nav = links
    .map(
      ([name, url]) =>
        `<a href="${route(locale, url)}"${section === "help" && url === "/help/" ? ' aria-current="page"' : ""}>${name}</a>`,
    )
    .join("");
  const languages = `<nav class="language-switch" aria-label="${p("Idioma do site", "Site language")}">${["pt", "en"].map((l) => `<a href="${route(l, pathname)}" data-locale="${l}" lang="${l === "pt" ? "pt-BR" : "en"}" hreflang="${l === "pt" ? "pt-BR" : "en"}" aria-label="${l === "pt" ? "Português" : "English"}"${l === locale ? ' aria-current="true"' : ""}>${l.toUpperCase()}</a>`).join("")}</nav>`;
  return `<!doctype html><html lang="${locale === "pt" ? "pt-BR" : "en"}" data-locale="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#090b10"><link rel="alternate" hreflang="pt-BR" href="${route("pt", pathname)}"><link rel="alternate" hreflang="en" href="${route("en", pathname)}"><link rel="icon" href="/assets/icon.svg" type="image/svg+xml"><script src="/locale.js"></script><link rel="stylesheet" href="/style.css"><script type="module" src="/site.js"></script></head><body class="${section === "help" ? "help-page" : "landing-page"}"><a class="skip-link" href="#main">${p("Pular para o conteúdo", "Skip to content")}</a><header class="header"><div class="nav-wrap"><a class="logo" href="${route(locale)}" aria-label="${p("Open Members — início", "Open Members home")}"><img src="/assets/wordmark-light.svg" width="207" height="30" alt="Open Members"></a><nav class="desktop-nav" aria-label="${p("Navegação principal", "Main navigation")}">${nav}</nav>${languages}<a class="nav-cta" href="${route(locale, "/#services")}">${p("Conhecer serviços", "Explore services")} ${arrow}</a><details class="mobile-menu"><summary aria-label="${p("Abrir menu de navegação", "Open navigation menu")}"><span>Menu</span><span aria-hidden="true">＋</span></summary><nav aria-label="${p("Navegação móvel", "Mobile navigation")}">${nav}<a href="${route(locale, "/#faq")}">${p("Perguntas frequentes", "FAQ")}</a></nav></details></div></header>${content}<footer class="footer"><div class="footer-top"><a href="${route(locale)}"><img src="/assets/wordmark-light.svg" width="242" height="35" alt="Open Members"></a><p>${p("Conhecimento que aproxima.<br>Uma experiência que é sua.", "Knowledge that connects.<br>An experience that is yours.")}</p></div><nav class="footer-groups" aria-label="${p("Navegação do rodapé", "Footer navigation")}"><div><h2>${p("Produto", "Product")}</h2><a href="${route(locale, "/#experience")}">${p("Área de membros", "Members area")}</a><a href="${route(locale, "/#features")}">${p("Recursos", "Features")}</a><a href="${route(locale, "/help/")}">${p("Central de ajuda", "Help Center")}</a></div><div><h2>${p("Serviços", "Services")}</h2><a href="${route(locale, "/#service-hosting")}">${p("Hospedagem gerenciada", "Managed hosting")}</a><a href="${route(locale, "/#service-implementation")}">${p("Implementação", "Implementation")}</a><a href="${route(locale, "/#service-comparison")}">${p("Compare os serviços", "Compare the services")}</a><span class="footer-status">${p("Ambos em breve", "Both coming soon")}</span></div><div><h2>${p("Código aberto", "Open source")}</h2><a href="${route(locale, "/#open-source")}">${p("Liberdade e licença MIT", "Freedom and the MIT license")}</a><a href="${route(locale, "/help/installation/")}">${p("Instalação própria", "Self-hosting")}</a><a href="${route(locale, "/help/contributing/")}">${p("Contribuição", "Contributing")}</a><a href="${route(locale, "/help/security/")}">${p("Segurança", "Security")}</a><a class="footer-status" href="https://github.com/Open-Members/openmembers">${p("GitHub · código experimental", "GitHub · experimental source")}</a></div></nav><div class="footer-bottom"><span>© 2026 Open Members</span><span>${p("Código experimental · MIT", "Experimental source · MIT")}</span><span>${p("Serviços comerciais em breve", "Commercial services coming soon")}</span></div></footer><dialog class="image-dialog" aria-labelledby="image-title"><div class="dialog-bar"><h2 id="image-title">${p("Tela do produto", "Product screenshot")}</h2><div class="dialog-actions"><button class="button small image-size" type="button" aria-pressed="false">${p("Tamanho original", "Original size")}</button><form method="dialog"><button class="button small" aria-label="${p("Fechar imagem", "Close screenshot")}">${p("Fechar", "Close")} ×</button></form></div></div><div class="dialog-scroll"><img id="expanded-image" alt=""></div><p>${captureNote(locale)}</p></dialog></body></html>`;
}
export function captureNote(locale) {
  return t(
    locale,
    "Capturas reais da aplicação · Dados fictícios · 16/09/2026 (UTC) · Identidade atual. Os textos dentro das imagens preservam o idioma original.",
    "Real application captures · Fictitious data · September 16, 2026 (UTC) · Current identity. Text within the images keeps its original language.",
  );
}
export function screenshot(file, alt, cls = "", eager = false, locale = "pt") {
  const dims = {
    dashboard: [1280, 1465],
    "course-catalog": [1280, 1691],
    "lesson-workspace": [1280, 1384],
    "admin-reports": [1280, 1516],
    "language-settings": [1280, 2100],
    "mobile-lesson": [1082, 4407],
  };
  const [w, h] = dims[file];
  return `<a class="screenshot ${cls}" href="/assets/${file}.png" data-enlarge data-title="${esc(alt)}" aria-label="${t(locale, "Ampliar", "Enlarge")}: ${esc(alt)}"><picture>${file === "lesson-workspace" ? '<source media="(max-width: 580px)" srcset="/assets/mobile-lesson.png">' : ""}<img src="/assets/${file}.png" alt="${esc(alt)}" width="${w}" height="${h}" loading="${eager ? "eager" : "lazy"}" decoding="async"${eager ? ' fetchpriority="high"' : ""}></picture><span class="enlarge">${t(locale, "Ampliar tela", "Enlarge screenshot")} ${arrow}</span></a>`;
}
