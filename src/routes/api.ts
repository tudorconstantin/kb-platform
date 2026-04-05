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
