import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "fs";
import { resolve, relative } from "path";
import slugify from "slugify";
import { conf } from "../config.js";
import { getDb } from "../db.js";
import { initRepo, commitAll } from "./git.js";
import { buildVault } from "./quartz.js";
import type { AccessLevel, Vault, PageInfo } from "../types.js";

// ── Paths ──────────────────────────────────────────────────

function safeSlug(input: string): string {
  return slugify(input, { lower: true, strict: true });
}

function vaultDir(username: string, slug: string): string {
  return resolve(conf.vaultsDir, safeSlug(username), safeSlug(slug));
}

/** Resolved vault root on disk (for graph/lint/upload helpers). */
export function getVaultPath(username: string, vaultSlug: string): string {
  return vaultDir(username, vaultSlug);
}

function pagePath(username: string, slug: string, pagePath: string): string {
  const base = vaultDir(username, slug);
  const clean = pagePath.replace(/\\/g, "/").replace(/[^a-zA-Z0-9_/\-]/g, "");
  const fp = resolve(base, `${clean || "index"}.md`);
  // Path traversal guard
  if (!fp.startsWith(base)) throw new Error("Invalid page path");
  return fp;
}

// ── Create ─────────────────────────────────────────────────

export async function createVault(
  userId: number,
  username: string,
  slug: string,
  title: string,
  description = "",
  visibility: "public" | "unlisted" | "private" = "private"
): Promise<Vault> {
  const safe = safeSlug(slug);
  const dir = vaultDir(username, safe);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, "_raw"), { recursive: true });

  // Init git
  await initRepo(dir);

  // Scaffold files
  writeFileSync(
    resolve(dir, "index.md"),
    `---
title: "${title}"
tags: []
---

# ${title}

${description}

Welcome to this knowledge base vault.
`
  );

  writeFileSync(
    resolve(dir, "CLAUDE.md"),
    `# ${title} — Wiki schema

## Conventions
- One concept per page, kebab-case filenames
- YAML frontmatter: title, tags, created, updated, sources
- Use [[wiki-links]] for cross-references
- Keep _index.md updated on every ingest
- Append to _log.md on every operation

## Page template
\`\`\`markdown
---
title: Page Title
tags: [topic]
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: []
---

## TLDR
One paragraph summary.

## Content
Main content. Use [[wiki-links]] to related pages.

## Open questions
- Things to investigate.
\`\`\`

## Ingest workflow
1. Read source from _raw/
2. Create/update wiki pages
3. Update _index.md
4. Append to _log.md

## Lint checklist
Orphan pages, broken links, stale content, missing TLDRs, missing cross-refs.
`
  );

  writeFileSync(
    resolve(dir, "_index.md"),
    "# Page index\n\n*Auto-maintained by LLM agent.*\n"
  );
  writeFileSync(resolve(dir, "_log.md"), "# Activity log\n\n");

  await commitAll(dir, "Initial vault setup");

  // Register in DB
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO vaults (owner_id, slug, title, description, visibility)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(userId, safe, title, description, visibility);

  // Trigger first build
  buildVault(username, safe).catch(console.error);

  return {
    id: result.lastInsertRowid as number,
    owner_id: userId,
    slug: safe,
    title,
    description,
    visibility,
    created_at: new Date().toISOString(),
    username,
  };
}

// ── Read ───────────────────────────────────────────────────

export function getVaultMeta(
  username: string,
  vaultSlug: string
): Vault | null {
  const db = getDb();
  return (
    (db
      .prepare(
        `SELECT v.*, u.username FROM vaults v
       JOIN users u ON u.id = v.owner_id
       WHERE u.username = ? AND v.slug = ?`
      )
      .get(username, vaultSlug) as Vault | undefined) ?? null
  );
}

export function listUserVaults(
  username: string,
  viewerId?: number
): Vault[] {
  const db = getDb();
  if (viewerId) {
    return db
      .prepare(
        `SELECT v.*, u.username FROM vaults v
         JOIN users u ON u.id = v.owner_id
         WHERE u.username = ?
         AND (v.visibility IN ('public','unlisted')
              OR v.owner_id = ?
              OR v.id IN (SELECT vault_id FROM vault_access WHERE user_id = ?))
         ORDER BY v.created_at DESC`
      )
      .all(username, viewerId, viewerId) as Vault[];
  }
  return db
    .prepare(
      `SELECT v.*, u.username FROM vaults v
       JOIN users u ON u.id = v.owner_id
       WHERE u.username = ? AND v.visibility = 'public'
       ORDER BY v.created_at DESC`
    )
    .all(username) as Vault[];
}

export function listPublicVaults(): Vault[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT v.*, u.username FROM vaults v
       JOIN users u ON u.id = v.owner_id
       WHERE v.visibility = 'public'
       ORDER BY v.created_at DESC`
    )
    .all() as Vault[];
}

// ── Access control ─────────────────────────────────────────

export function checkAccess(
  username: string,
  vaultSlug: string,
  user?: { id: number; username: string } | null
): AccessLevel {
  const meta = getVaultMeta(username, vaultSlug);
  if (!meta) return "denied";

  // Owner always has full access
  if (user && user.id === meta.owner_id) return "owner";

  // Check explicit grants
  if (user) {
    const db = getDb();
    const grant = db
      .prepare(
        "SELECT role FROM vault_access WHERE vault_id = ? AND user_id = ?"
      )
      .get(meta.id, user.id) as { role: AccessLevel } | undefined;
    if (grant) return grant.role;
  }

  // Public/unlisted vaults are readable by anyone
  if (meta.visibility === "public" || meta.visibility === "unlisted") {
    return "public";
  }

  return "denied";
}

// ── Page CRUD ──────────────────────────────────────────────

export function readPage(
  username: string,
  vaultSlug: string,
  page: string
): string | null {
  const fp = pagePath(username, vaultSlug, page);
  if (!existsSync(fp)) return null;
  return readFileSync(fp, "utf-8");
}

export async function writePage(
  username: string,
  vaultSlug: string,
  page: string,
  content: string,
  commitMsg?: string
): Promise<void> {
  const fp = pagePath(username, vaultSlug, page);
  mkdirSync(resolve(fp, ".."), { recursive: true });
  writeFileSync(fp, content, "utf-8");

  const dir = vaultDir(username, vaultSlug);
  await commitAll(dir, commitMsg || `Update ${page}`);

  // Trigger rebuild (fire and forget)
  buildVault(username, vaultSlug).catch(console.error);
}

export function listPages(
  username: string,
  vaultSlug: string
): PageInfo[] {
  const dir = vaultDir(username, vaultSlug);
  if (!existsSync(dir)) return [];

  const pages: PageInfo[] = [];

  function walk(current: string) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = resolve(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".md")) {
        const rel = relative(dir, full);
        const path = rel.replace(/\.md$/, "");
        // Extract title from first heading or frontmatter
        const content = readFileSync(full, "utf-8");
        let title = path;
        for (const line of content.split("\n")) {
          if (line.startsWith("title:")) {
            title = line.split(":", 2)[1].trim().replace(/^["']|["']$/g, "");
            break;
          }
          if (line.startsWith("# ")) {
            title = line.slice(2).trim();
            break;
          }
        }
        pages.push({ path, title, filename: rel });
      }
    }
  }

  walk(dir);
  return pages.sort((a, b) => a.path.localeCompare(b.path));
}

// ── Grant access ───────────────────────────────────────────

export function grantAccess(
  vaultId: number,
  targetUserId: number,
  role: "editor" | "viewer"
): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO vault_access (vault_id, user_id, role)
     VALUES (?, ?, ?)`
  ).run(vaultId, targetUserId, role);
}
