import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "crypto";
import { conf } from "./config.js";
import type { JwtPayload } from "./types.js";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createToken(userId: number, username: string): string {
  return jwt.sign(
    { sub: userId, username } satisfies Omit<JwtPayload, "exp">,
    conf.secretKey,
    { expiresIn: `${conf.tokenExpireHours}h` }
  );
}

export function decodeToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, conf.secretKey) as JwtPayload;
  } catch {
    return null;
  }
}

export function generateApiKey(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
