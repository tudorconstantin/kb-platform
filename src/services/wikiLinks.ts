import slugify from "slugify";

const WIKI_LINK =
  /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;

/**
 * Normalize Obsidian-style [[wiki link]] target to vault page path (kebab segments, no .md).
 */
export function normalizeWikiTarget(raw: string): string {
  let t = raw.trim();
  const hashIdx = t.indexOf("#");
  if (hashIdx >= 0) t = t.slice(0, hashIdx);
  t = t.replace(/\.md$/i, "").trim();
  if (!t) return "";
  const parts = t
    .split("/")
    .map((p) => slugify(p.trim(), { lower: true, strict: true }))
    .filter(Boolean);
  return parts.join("/");
}

/** All wiki link targets found in markdown body (normalized paths, unique order preserved). */
export function extractWikiTargets(markdown: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  WIKI_LINK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKI_LINK.exec(markdown)) !== null) {
    const raw = m[1].trim();
    if (/^(https?:|mailto:)/i.test(raw)) continue;
    const target = normalizeWikiTarget(raw);
    if (!target) continue;
    if (!seen.has(target)) {
      seen.add(target);
      out.push(target);
    }
  }
  return out;
}
