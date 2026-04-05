export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: string;
  is_admin: number;
}

export interface Vault {
  id: number;
  owner_id: number;
  slug: string;
  title: string;
  description: string;
  visibility: "public" | "unlisted" | "private";
  created_at: string;
  // joined fields
  username?: string;
}

export interface VaultAccess {
  id: number;
  vault_id: number;
  user_id: number;
  role: "editor" | "viewer";
}

export interface ApiKey {
  id: number;
  user_id: number;
  key_hash: string;
  label: string;
  created_at: string;
}

export interface PageInfo {
  path: string;
  title: string;
  filename: string;
}

export interface JwtPayload {
  sub: number;
  username: string;
  exp: number;
}

export type AccessLevel = "owner" | "editor" | "viewer" | "public" | "denied";

declare module "fastify" {
  interface FastifyRequest {
    user?: { id: number; username: string } | null;
  }
}
