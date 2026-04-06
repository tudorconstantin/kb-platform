import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import multipart from "@fastify/multipart";
import { watch } from "chokidar";

import { conf } from "./config.js";
import { initDb } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { apiRoutes } from "./routes/api.js";
import { webRoutes } from "./routes/web.js";
import { buildVault } from "./services/quartz.js";
import { mkdirSync } from "fs";

async function main() {
  // Ensure data directories exist
  mkdirSync(conf.vaultsDir, { recursive: true });
  mkdirSync(conf.buildsDir, { recursive: true });

  // Init database
  initDb();
  console.log(`[db] Initialized at ${conf.dbPath}`);

  // Create Fastify instance
  const app = Fastify({ logger: true });

  // Plugins
  await app.register(cookie);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(formbody);
  await app.register(multipart, { limits: { fileSize: conf.maxUploadBytes } });

  // Routes (order matters: specific before catch-all)
  await app.register(authRoutes);
  await app.register(apiRoutes);
  await app.register(webRoutes);

  // File watcher: rebuild vault on .md file changes
  const watcher = watch(`${conf.vaultsDir}/**/*.md`, {
    ignoreInitial: true,
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    // Debounce: wait for writes to settle
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
  });

  const pendingBuilds = new Map<string, NodeJS.Timeout>();

  watcher.on("all", (_event, filePath) => {
    // Extract username/vault from path
    const rel = filePath.replace(conf.vaultsDir + "/", "");
    const parts = rel.split("/");
    if (parts.length < 2) return;
    const [username, vaultSlug] = parts;
    const key = `${username}/${vaultSlug}`;

    // Debounce builds per vault (5s window)
    if (pendingBuilds.has(key)) clearTimeout(pendingBuilds.get(key)!);
    pendingBuilds.set(
      key,
      setTimeout(async () => {
        pendingBuilds.delete(key);
        console.log(`[watcher] Changes detected in ${key}, rebuilding...`);
        await buildVault(username, vaultSlug);
      }, 5000)
    );
  });

  // Start server
  try {
    await app.listen({ port: conf.port, host: conf.host });
    console.log(`[server] Listening on ${conf.host}:${conf.port}`);
    console.log(`[server] Vaults dir: ${conf.vaultsDir}`);
    console.log(`[server] Builds dir: ${conf.buildsDir}`);
    console.log(`[watcher] Watching ${conf.vaultsDir} for changes`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
