import { existsSync, readFileSync, readdirSync } from "fs";
import { relative, resolve } from "path";
import { getVaultPath } from "./vaults.js";

export interface AnkiCard {
  front: string;
  back: string;
  source: string;
}

function splitFrontmatter(content: string): { fm: string; body: string } {
  if (!content.startsWith("---\n")) {
    return { fm: "", body: content };
  }
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) {
    return { fm: "", body: content };
  }
  return {
    fm: content.slice(4, end),
    body: content.slice(end + 5),
  };
}

function frontmatterHasAnkiTag(fm: string): boolean {
  if (/^anki:\s*true\s*$/im.test(fm) || /\banki:\s*true\b/i.test(fm)) return true;
  const tagsBracket = fm.match(/tags:\s*\[([^\]]*)\]/i);
  if (tagsBracket) {
    const inner = tagsBracket[1].split(",").map((s) =>
      s.trim().replace(/^["']|["']$/g, "")
    );
    if (inner.includes("anki")) return true;
  }
  return false;
}

function titleFromFm(fm: string, fallback: string): string {
  const m = fm.match(/^title:\s*(.+)$/m);
  if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  return fallback;
}

function extractSection(body: string, heading: string): string | null {
  const re = new RegExp(
    `^##\\s+${heading}\\s*\\r?\\n([\\s\\S]*?)(?=^##\\s|$)`,
    "m"
  );
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function parseAnkiCards(
  pageId: string,
  content: string
): AnkiCard[] {
  const { fm, body } = splitFrontmatter(content);
  if (!frontmatterHasAnkiTag(fm)) return [];

  const title = titleFromFm(fm, pageId);
  let front = extractSection(body, "Front");
  let back = extractSection(body, "Back");
  if (front === null && back === null) {
    front = title;
    back = body.replace(/\r\n/g, "\n").trim();
    if (!back) return [];
  } else {
    front = front ?? title;
    back = back ?? "";
  }

  return [{ front, back, source: pageId }];
}

function walkMd(
  vaultRoot: string,
  cb: (pageId: string, content: string) => void
): void {
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".md")) {
        const relPath = relative(vaultRoot, full);
        const pageId = relPath.replace(/\\/g, "/").replace(/\.md$/, "");
        cb(pageId, readFileSync(full, "utf-8"));
      }
    }
  }
  walk(vaultRoot);
}

export function collectAnkiCards(username: string, vaultSlug: string): AnkiCard[] {
  const root = getVaultPath(username, vaultSlug);
  if (!existsSync(root)) return [];

  const cards: AnkiCard[] = [];
  walkMd(root, (pageId, content) => {
    cards.push(...parseAnkiCards(pageId, content));
  });
  return cards;
}

/** Tab-separated for Anki import (plain text; tabs/newlines flattened in fields). */
export function ankiCardsToTsv(cards: AnkiCard[]): string {
  const esc = (s: string) =>
    s.replace(/\r?\n/g, "<br>").replace(/\t/g, " ");
  const lines = ["front\tback\tsource"];
  for (const c of cards) {
    lines.push(`${esc(c.front)}\t${esc(c.back)}\t${esc(c.source)}`);
  }
  return lines.join("\n") + "\n";
}

export function ankiCardsToJson(cards: AnkiCard[]): string {
  return JSON.stringify({ cards }, null, 2);
}
