import type { FastifyRequest, FastifyReply } from "fastify";
import { decodeToken, hashApiKey } from "../auth.js";
import { getDb } from "../db.js";

/** Populate request.user if authenticated (does NOT reject unauthenticated) */
export async function extractUser(req: FastifyRequest): Promise<void> {
  req.user = null;

  // 1. Try cookie
  const cookieToken = (req.cookies as Record<string, string>)?.kb_token;
  if (cookieToken) {
    const payload = decodeToken(cookieToken);
    if (payload) {
      req.user = { id: payload.sub, username: payload.username };
      return;
    }
  }

  // 2. Try Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return;
  const tokenOrKey = authHeader.slice(7);

  // Try as JWT
  const payload = decodeToken(tokenOrKey);
  if (payload) {
    req.user = { id: payload.sub, username: payload.username };
    return;
  }

  // Try as API key
  const keyHash = hashApiKey(tokenOrKey);
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.id, u.username FROM users u
       JOIN api_keys ak ON ak.user_id = u.id
       WHERE ak.key_hash = ?`
    )
    .get(keyHash) as { id: number; username: string } | undefined;

  if (row) {
    req.user = { id: row.id, username: row.username };
  }
}

/** Reject if not authenticated */
export async function requireUser(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await extractUser(req);
  if (!req.user) {
    reply.code(401).send({ error: "Not authenticated" });
  }
}
