import type { FastifyInstance } from "fastify";
import { extractUser, requireUser } from "../middleware/auth.js";
import { buildVault } from "../services/quartz.js";
import {
  checkAccess,
  createVault,
  grantAccess,
  getVaultMeta,
  listPages,
  listPublicVaults,
  listUserVaults,
  readPage,
  writePage,
} from "../services/vaults.js";
import { buildVaultGraph } from "../services/graph.js";
import { lintVault } from "../services/vaultLint.js";
import {
  collectAnkiCards,
  ankiCardsToTsv,
  ankiCardsToJson,
} from "../services/ankiExport.js";
import { writeRawFile } from "../services/rawUpload.js";
import { getDb } from "../db.js";

export async function apiRoutes(app: FastifyInstance): Promise<void> {
  // All API routes extract user (but don't require it for reads)
  app.addHook("preHandler", extractUser);

  // ── Vault CRUD ───────────────────────────────────────────

  app.post<{
    Body: {
      slug: string;
      title: string;
      description?: string;
      visibility?: "public" | "unlisted" | "private";
    };
  }>("/api/vaults", { preHandler: requireUser }, async (req) => {
    const { slug, title, description, visibility } = req.body;
    return createVault(
      req.user!.id,
      req.user!.username,
      slug,
      title,
      description,
      visibility
    );
  });

  app.get("/api/vaults", async () => {
    return { vaults: listPublicVaults() };
  });

  app.get<{ Params: { username: string } }>(
    "/api/vaults/:username",
    async (req) => {
      const vaults = listUserVaults(req.params.username, req.user?.id);
      return { vaults };
    }
  );

  // ── Page CRUD ────────────────────────────────────────────

  app.get<{ Params: { username: string; vault: string } }>(
    "/api/vaults/:username/:vault/pages",
    async (req, reply) => {
      const { username, vault } = req.params;
      const access = checkAccess(username, vault, req.user);
      if (access === "denied") return reply.code(403).send({ error: "Access denied" });
      return { pages: listPages(username, vault) };
    }
  );

  app.get<{ Params: { username: string; vault: string; "*": string } }>(
    "/api/vaults/:username/:vault/pages/*",
    async (req, reply) => {
      const { username, vault } = req.params;
      const page = req.params["*"];
      const access = checkAccess(username, vault, req.user);
      if (access === "denied") return reply.code(403).send({ error: "Access denied" });

      const content = readPage(username, vault, page);
      if (content === null) return reply.code(404).send({ error: "Page not found" });
      return { path: page, content };
    }
  );

  app.put<{
    Params: { username: string; vault: string; "*": string };
    Body: { content: string; commit_message?: string };
  }>(
    "/api/vaults/:username/:vault/pages/*",
    { preHandler: requireUser },
    async (req, reply) => {
      const { username, vault } = req.params;
      const page = req.params["*"];
      const access = checkAccess(username, vault, req.user);
      if (access !== "owner" && access !== "editor") {
        return reply.code(403).send({ error: "Write access required" });
      }

      await writePage(username, vault, page, req.body.content, req.body.commit_message);
      return { ok: true, path: page };
    }
  );

  // ── Graph (wiki-links as JSON) ───────────────────────────

  app.get<{ Params: { username: string; vault: string } }>(
    "/api/vaults/:username/:vault/graph",
    async (req, reply) => {
      const { username, vault } = req.params;
      const access = checkAccess(username, vault, req.user);
      if (access === "denied") return reply.code(403).send({ error: "Access denied" });

      const graph = buildVaultGraph(username, vault);
      if (!graph) return reply.code(404).send({ error: "Vault not found" });
      return graph;
    }
  );

  // ── Lint (broken wiki-links + orphan pages) ──────────────

  app.get<{ Params: { username: string; vault: string } }>(
    "/api/vaults/:username/:vault/lint",
    async (req, reply) => {
      const { username, vault } = req.params;
      const access = checkAccess(username, vault, req.user);
      if (access === "denied") return reply.code(403).send({ error: "Access denied" });

      const report = lintVault(username, vault);
      if (!report) return reply.code(404).send({ error: "Vault not found" });
      return report;
    }
  );

  // ── Anki export (pages tagged with `anki` in frontmatter) ─

  app.get<{
    Params: { username: string; vault: string };
    Querystring: { format?: string };
  }>("/api/vaults/:username/:vault/anki-export", async (req, reply) => {
    const { username, vault } = req.params;
    const access = checkAccess(username, vault, req.user);
    if (access === "denied") return reply.code(403).send({ error: "Access denied" });

    const cards = collectAnkiCards(username, vault);
    const fmt = (req.query.format || "tsv").toLowerCase();
    if (fmt === "json") {
      reply.type("application/json");
      return ankiCardsToJson(cards);
    }
    reply.type("text/tab-separated-values; charset=utf-8");
    reply.header(
      "Content-Disposition",
      `attachment; filename="${vault}-anki.tsv"`
    );
    return ankiCardsToTsv(cards);
  });

  // ── Upload binary to _raw/ ────────────────────────────────

  app.post<{ Params: { username: string; vault: string } }>(
    "/api/vaults/:username/:vault/raw/upload",
    { preHandler: requireUser },
    async (req, reply) => {
      const { username, vault } = req.params;
      const access = checkAccess(username, vault, req.user);
      if (access !== "owner" && access !== "editor") {
        return reply.code(403).send({ error: "Write access required" });
      }

      let fileBuf: Buffer | null = null;
      let relativePath = "";

      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === "file" && part.fieldname === "file") {
          fileBuf = await part.toBuffer();
          if (!relativePath && part.filename) {
            relativePath = part.filename;
          }
        } else if (part.type === "field" && part.fieldname === "path") {
          relativePath = String(part.value ?? "").trim();
        }
      }

      if (!fileBuf?.length) {
        return reply.code(400).send({ error: "Missing file field (multipart form, field name: file)" });
      }
      if (!relativePath) {
        return reply.code(400).send({ error: "Missing path — use form field `path` or filename on file" });
      }

      try {
        const result = await writeRawFile(username, vault, relativePath, fileBuf);
        return { ok: true, ...result };
      } catch (e: any) {
        return reply.code(400).send({ error: e?.message || "Upload failed" });
      }
    }
  );

  // ── Build trigger ────────────────────────────────────────

  app.post<{ Params: { username: string; vault: string } }>(
    "/api/vaults/:username/:vault/build",
    { preHandler: requireUser },
    async (req, reply) => {
      const { username, vault } = req.params;
      const access = checkAccess(username, vault, req.user);
      if (access !== "owner" && access !== "editor") {
        return reply.code(403).send({ error: "Access denied" });
      }
      const result = await buildVault(username, vault);
      return result;
    }
  );

  // ── Access management ────────────────────────────────────

  app.post<{
    Params: { username: string; vault: string };
    Body: { target_username: string; role?: "editor" | "viewer" };
  }>(
    "/api/vaults/:username/:vault/access",
    { preHandler: requireUser },
    async (req, reply) => {
      const { username, vault } = req.params;
      const access = checkAccess(username, vault, req.user);
      if (access !== "owner") {
        return reply.code(403).send({ error: "Only vault owner can grant access" });
      }

      const db = getDb();
      const target = db
        .prepare("SELECT id FROM users WHERE username = ?")
        .get(req.body.target_username) as { id: number } | undefined;
      if (!target) return reply.code(404).send({ error: "User not found" });

      const meta = getVaultMeta(username, vault);
      if (!meta) return reply.code(404).send({ error: "Vault not found" });

      grantAccess(meta.id, target.id, req.body.role || "viewer");
      return { ok: true, granted: req.body.target_username, role: req.body.role || "viewer" };
    }
  );

  // ── Git webhook (for obsidian-git push notifications) ────

  app.post<{ Params: { username: string; vault: string } }>(
    "/api/webhooks/:username/:vault/push",
    async (req, reply) => {
      // Simple webhook — could add signature verification later
      const { username, vault } = req.params;
      const result = await buildVault(username, vault);
      return result;
    }
  );
}
