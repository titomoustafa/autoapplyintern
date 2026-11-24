const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

export function decodeEntities(s: string): string {
  // Run twice: some boards (Greenhouse, Workday) double-escape.
  for (let i = 0; i < 2; i++) {
    s = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, code: string) => {
      const c = code.toLowerCase();
      if (c.startsWith("#x")) return String.fromCodePoint(parseInt(c.slice(2), 16));
      if (c.startsWith("#")) return String.fromCodePoint(parseInt(c.slice(1), 10));
      return ENTITIES[c] ?? m;
    });
  }
  return s;
}

/** Turns job-description HTML into readable plain text. */
export function htmlToText(html: string): string {
  return decodeEntities(decodeEntities(html))
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d|\/tr)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}
