import { config } from "dotenv";
import { resolve } from "path";

config();

export const conf = {
  port: parseInt(process.env.KB_PORT || "8000", 10),
  host: process.env.KB_HOST || "0.0.0.0",
  secretKey: process.env.KB_SECRET_KEY || "change-me-in-production",
  baseUrl: process.env.KB_BASE_URL || "http://localhost:8000",
  dataDir: resolve(process.env.KB_DATA_DIR || "data"),
  get vaultsDir() {
    return resolve(this.dataDir, "vaults");
  },
  get buildsDir() {
    return resolve(this.dataDir, "builds");
  },
  get dbPath() {
    return resolve(this.dataDir, "kb.db");
  },
  quartzDir: resolve(process.env.KB_QUARTZ_DIR || "quartz"),
  tokenExpireHours: 72,
};
