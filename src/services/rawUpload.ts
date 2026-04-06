import { mkdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { getVaultPath } from "./vaults.js";
import { commitAll } from "./git.js";
import { buildVault } from "./quartz.js";
import slugify from "slugify";

function safeBasename(name: string): string {
  const n = name.replace(/[^a-zA-Z0-9._\-+()]/g, "_").replace(/\.{2,}/g, ".").slice(0, 220);
  return n || "upload.bin";
}

/**
 * Write a file under vault/_raw/ with traversal protection. Commits and triggers rebuild.
 */
export async function writeRawFile(
  username: string,
  vaultSlug: string,
  relativePath: string,
  data: Buffer
): Promise<{ path: string }> {
  const vaultRoot = getVaultPath(username, vaultSlug);
  const base = resolve(vaultRoot, "_raw");

  const normalized = relativePath
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s !== "" && s !== "." && s !== "..");

  if (normalized.length === 0) {
    throw new Error("Path required");
  }

  const dirParts = normalized.slice(0, -1).map((seg) => slugify(seg, { lower: true, strict: true }));
  const safeFile = safeBasename(normalized[normalized.length - 1]!);
  const safe = [...dirParts, safeFile].join("/");
  const fp = resolve(base, safe);

  if (!fp.startsWith(base)) {
    throw new Error("Invalid path");
  }

  mkdirSync(dirname(fp), { recursive: true });
  writeFileSync(fp, data);

  await commitAll(vaultRoot, `Upload _raw/${safe}`);
  buildVault(username, vaultSlug).catch(console.error);

  return { path: `_raw/${safe}` };
}
