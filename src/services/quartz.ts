import { exec } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync, cpSync, rmSync } from "fs";
import { resolve } from "path";
import { conf } from "../config.js";

const execAsync = promisify(exec);

// Track active builds to prevent concurrent builds for the same vault
const activeBuilds = new Set<string>();

/**
 * Build a single vault with Quartz.
 * Quartz reads markdown from the vault dir and outputs static HTML
 * to data/builds/{username}/{vault_slug}/
 */
export async function buildVault(
  username: string,
  vaultSlug: string
): Promise<{ ok: boolean; error?: string }> {
  const key = `${username}/${vaultSlug}`;
  if (activeBuilds.has(key)) {
    return { ok: false, error: "Build already in progress" };
  }

  const vaultDir = resolve(conf.vaultsDir, username, vaultSlug);
  const outputDir = resolve(conf.buildsDir, username, vaultSlug);
  const quartzDir = resolve(conf.quartzDir);

  if (!existsSync(vaultDir)) {
    return { ok: false, error: "Vault directory not found" };
  }
  if (!existsSync(quartzDir)) {
    return { ok: false, error: "Quartz not installed. Run: npm run setup" };
  }

  activeBuilds.add(key);
  try {
    mkdirSync(outputDir, { recursive: true });

    // Quartz build: point content dir at vault, output to builds dir
    const baseUrl = `/${username}/${vaultSlug}`;
    const { stderr } = await execAsync(
      `npx quartz build \
        --directory "${vaultDir}" \
        --output "${outputDir}" \
        --serve false \
        --bundleInfo false`,
      {
        cwd: quartzDir,
        timeout: 120_000,
        env: {
          ...process.env,
          QUARTZ_BASE_URL: baseUrl,
        },
      }
    );

    if (stderr && stderr.includes("Error")) {
      console.error(`[quartz] Build error for ${key}:`, stderr);
      return { ok: false, error: stderr.slice(0, 500) };
    }

    console.log(`[quartz] Built ${key} → ${outputDir}`);
    return { ok: true };
  } catch (err: any) {
    console.error(`[quartz] Build failed for ${key}:`, err.message);
    return { ok: false, error: err.message?.slice(0, 500) };
  } finally {
    activeBuilds.delete(key);
  }
}

/**
 * Rebuild all vaults (used at startup or on demand).
 */
export async function rebuildAll(
  vaults: Array<{ username: string; slug: string }>
): Promise<void> {
  console.log(`[quartz] Rebuilding ${vaults.length} vaults...`);
  for (const v of vaults) {
    await buildVault(v.username, v.slug);
  }
}
