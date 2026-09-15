const locale = document.documentElement.dataset.locale;
const p = (pt, en) => (locale === "pt" ? pt : en);
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
document.querySelectorAll("a[data-locale]").forEach((link) => {
  link.addEventListener("click", () => {
    try {
      localStorage.setItem("openmembers-language", link.dataset.locale);
    } catch {}
    try {
      if (["pt", "en"].includes(link.dataset.locale))
        document.cookie = `openmembers-language=${link.dataset.locale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    } catch {}
    const url = new URL(link.href);
    url.search = location.search;
    url.hash = location.hash;
    link.href = url.href;
  });
});
const menu = document.querySelector(".mobile-menu");
menu?.addEventListener("click", (event) => {
  if (event.target.closest("a")) menu.open = false;
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menu?.open) {
    menu.open = false;
    menu.querySelector("summary").focus();
  }
});
document.addEventListener("click", (event) => {
  if (menu?.open && !menu.contains(event.target)) menu.open = false;
});
const dialog = document.querySelector(".image-dialog");
let imageTrigger;
document.querySelectorAll("[data-enlarge]").forEach((link) =>
  link.addEventListener("click", (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    imageTrigger = link;
    const image = dialog.querySelector("img");
    image.src = link.querySelector("img")?.currentSrc || link.href;
    image.alt = link.dataset.title;
    dialog.querySelector(".dialog-scroll").classList.remove("natural-size");
    dialog.querySelector(".image-size").setAttribute("aria-pressed", "false");
    document.querySelector("#image-title").textContent = link.dataset.title;
    dialog.showModal();
    document.body.classList.add("dialog-open");
  }),
);
dialog?.addEventListener("close", () => {
  document.body.classList.remove("dialog-open");
  imageTrigger?.focus();
});
dialog?.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
dialog?.querySelector(".image-size").addEventListener("click", (event) => {
  const original = dialog
    .querySelector(".dialog-scroll")
    .classList.toggle("natural-size");
  event.currentTarget.setAttribute("aria-pressed", String(original));
});
const tour = document.querySelector(".product-tour");
if (tour) {
  const links = [...tour.querySelectorAll("[data-journey]")],
    screens = [...tour.querySelectorAll("[data-screen]")],
    play = tour.querySelector(".tour-play"),
    stage = tour.querySelector(".tour-screens");
  let index = 0,
    paused = reduced.matches,
    visible = false,
    hovered = false,
    timer;
  play.hidden = false;
  const show = (next, animate = true) => {
    index = (next + screens.length) % screens.length;
    screens.forEach((screen, i) => {
      screen.hidden = i !== index;
      screen.classList.toggle(
        "is-arriving",
        i === index && animate && !reduced.matches,
      );
      screen.setAttribute("role", "group");
      screen.setAttribute(
        "aria-label",
        `${i + 1} ${p("de", "of")} ${screens.length}`,
      );
    });
    links.forEach((link, i) => {
      if (i === index) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  };
  const schedule = () => {
    clearTimeout(timer);
    if (
      !paused &&
      !reduced.matches &&
      visible &&
      !hovered &&
      !document.hidden
    ) {
      timer = setTimeout(() => {
        show(index + 1);
        schedule();
      }, 6500);
    }
  };
  const setPaused = (value) => {
    paused = value;
    play.setAttribute("data-paused", String(paused));
    play.textContent = paused
      ? p("Reproduzir apresentação", "Play presentation")
      : p("Pausar apresentação", "Pause presentation");
    play.disabled = reduced.matches;
    if (reduced.matches)
      play.textContent = p(
        "Movimento reduzido ativo",
        "Reduced motion enabled",
      );
    stage.setAttribute("aria-live", paused ? "polite" : "off");
    schedule();
  };
  const fromHash = () => {
    const found = links.findIndex(
      (l) => `#screen-${l.dataset.journey}` === location.hash,
    );
    if (found >= 0) {
      setPaused(true);
      show(found, false);
    }
    return found;
  };
  if (fromHash() < 0) show(0, false);
  setPaused(paused);
  links.forEach((link, i) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      setPaused(true);
      show(i);
      history.replaceState(null, "", link.hash);
    });
    link.addEventListener("keydown", (event) => {
      if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? links.length - 1
            : (i + (event.key === "ArrowRight" ? 1 : -1) + links.length) %
              links.length;
      setPaused(true);
      show(next);
      links[next].focus();
      history.replaceState(null, "", links[next].hash);
    });
  });
  play.addEventListener("click", () => setPaused(!paused));
  tour.addEventListener("focusin", (event) => {
    if (event.target !== play) setPaused(true);
  });
  tour.addEventListener("mouseenter", () => {
    hovered = true;
    schedule();
  });
  tour.addEventListener("mouseleave", () => {
    hovered = false;
    schedule();
  });
  tour.addEventListener(
    "touchstart",
    (event) => {
      if (event.target !== play) setPaused(true);
    },
    { passive: true },
  );
  document.addEventListener("visibilitychange", schedule);
  reduced.addEventListener("change", () => {
    setPaused(true);
  });
  window.addEventListener("hashchange", fromHash);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        schedule();
      },
      { threshold: 0.35 },
    ).observe(tour);
  } else {
    setPaused(true);
  }
}
if ("IntersectionObserver" in window && !reduced.matches) {
  const observer = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        }
      }),
    { threshold: 0.12 },
  );
  document
    .querySelectorAll("[data-reveal]")
    .forEach((el) => observer.observe(el));
}
const searchForm = document.querySelector(".search-form");
if (searchForm) {
  const { searchArticles } = await import("./search.js");
  const input = document.querySelector("#help-search"),
    results = document.querySelector(".search-results"),
    list = document.querySelector("#search-results-list"),
    status = document.querySelector("#search-status"),
    categories = document.querySelector("#help-categories");
  let indexPromise,
    version = 0,
    timer;
  const renderSearch = async (updateUrl = true) => {
    const current = ++version,
      query = input.value.trim();
    if (updateUrl) {
      const url = new URL(location.href);
      query ? url.searchParams.set("q", query) : url.searchParams.delete("q");
      history.replaceState(null, "", url);
    }
    if (!query) {
      results.hidden = true;
      categories.hidden = false;
      return;
    }
    results.hidden = false;
    categories.hidden = true;
    status.textContent = p("Buscando nos guias…", "Searching the guides…");
    list.replaceChildren();
    try {
      indexPromise ||= fetch(`/${locale}/help/search-index.json`)
        .then((r) => {
          if (!r.ok) throw Error("index unavailable");
          return r.json();
        })
        .catch((error) => {
          indexPromise = null;
          throw error;
        });
      const articles = await indexPromise;
      if (current !== version) return;
      const matches = searchArticles(articles, query);
      status.textContent = matches.length
        ? p(
            `${matches.length} ${matches.length === 1 ? "guia encontrado" : "guias encontrados"} para “${query}”.`,
            `${matches.length} ${matches.length === 1 ? "guide" : "guides"} found for “${query}”.`,
          )
        : p(
            `Nenhum guia encontrado para “${query}”. Tente menos palavras, “marca”, “instalação” ou explore todos os guias.`,
            `No guides found for “${query}”. Try fewer words, “branding”, “installation”, or browse all guides.`,
          );
      for (const a of matches) {
        const link = document.createElement("a");
        link.href = `/${locale}/help/${a.slug}/`;
        link.className = "search-result";
        const title = document.createElement("h3");
        title.textContent = a.title;
        const meta = document.createElement("span");
        meta.textContent = a.category;
        const desc = document.createElement("p");
        desc.textContent = a.description;
        link.append(meta, title, desc);
        list.append(link);
      }
    } catch {
      if (current !== version) return;
      status.textContent = p(
        "A busca está temporariamente indisponível. Explore os guias abaixo ou tente novamente.",
        "Search is temporarily unavailable. Browse the guides below or try again.",
      );
      categories.hidden = false;
    }
  };
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    renderSearch();
  });
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(renderSearch, 150);
  });
  document.querySelector("#clear-search").addEventListener("click", () => {
    input.value = "";
    clearTimeout(timer);
    renderSearch();
    input.focus();
  });
  input.value =
    new URLSearchParams(location.search).get("q")?.slice(0, 120) || "";
  if (input.value) renderSearch(false);
}
