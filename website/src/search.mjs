export const normalize = (text) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
export function searchArticles(articles, query) {
  const terms = normalize(query).split(" ").filter(Boolean);
  if (!terms.length) return [];
  return articles
    .map((a) => {
      const title = normalize(a.title),
        body = normalize(a.text),
        category = normalize(a.category),
        description = normalize(a.description);
      const all = `${title} ${category} ${description} ${body}`;
      return {
        ...a,
        score: terms.every((t) => all.includes(t))
          ? terms.reduce(
              (n, t) =>
                n +
                (title.includes(t)
                  ? 10
                  : description.includes(t)
                    ? 6
                    : category.includes(t)
                      ? 4
                      : 1),
              0,
            )
          : 0,
      };
    })
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}
