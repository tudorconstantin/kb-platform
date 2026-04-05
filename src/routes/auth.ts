import type { FastifyInstance } from "fastify";
import { getDb } from "../db.js";
import {
  hashPassword,
  verifyPassword,
  createToken,
  generateApiKey,
} from "../auth.js";
import { requireUser } from "../middleware/auth.js";
import type { User } from "../types.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: { username: string; email: string; password: string; display_name?: string };
  }>("/auth/register", async (req, reply) => {
    const { username, email, password, display_name } = req.body;
    const db = getDb();

    const lower = username.toLowerCase();
    const existing = db
      .prepare("SELECT id FROM users WHERE username = ? OR email = ?")
      .get(lower, email.toLowerCase());
    if (existing) {
      return reply.code(400).send({ error: "Username or email already exists" });
    }

    const hash = await hashPassword(password);
    const result = db
      .prepare(
        `INSERT INTO users (username, email, password_hash, display_name)
         VALUES (?, ?, ?, ?)`
      )
      .run(lower, email.toLowerCase(), hash, display_name || lower);

    const token = createToken(result.lastInsertRowid as number, lower);
    return { token, username: lower };
  });

  app.post<{
    Body: { username: string; password: string };
  }>("/auth/login", async (req, reply) => {
    const { username, password } = req.body;
    const db = getDb();
    const user = db
      .prepare("SELECT id, username, password_hash FROM users WHERE username = ?")
      .get(username.toLowerCase()) as Pick<User, "id" | "username" | "password_hash"> | undefined;

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const token = createToken(user.id, user.username);
    reply.setCookie("kb_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 72 * 3600,
      path: "/",
    });
    return { token, username: user.username };
  });

  app.post("/auth/logout", async (_req, reply) => {
    reply.clearCookie("kb_token", { path: "/" });
    return { ok: true };
  });

  app.post("/auth/api-keys", { preHandler: requireUser }, async (req) => {
    const { raw, hash } = generateApiKey();
    const db = getDb();
    db.prepare(
      "INSERT INTO api_keys (user_id, key_hash, label) VALUES (?, ?, ?)"
    ).run(req.user!.id, hash, "default");

    return {
      key: raw,
      message: "Save this key — it won't be shown again.",
    };
  });

  app.get("/auth/me", { preHandler: requireUser }, async (req) => {
    return req.user;
  });
}
