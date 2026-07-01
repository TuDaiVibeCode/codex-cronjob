// ---------------------------------------------------------------
// index.js - Cron scheduler (for local use)
// ---------------------------------------------------------------
require("dotenv").config();
const cron = require("node-cron");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const {
  LOG_FILE = "./logs/codex-ping.log",
} = process.env;

// 7:00 AM GMT+7
const SCHEDULE = "0 7 * * *";

// -- Logger -----------------------------------------------------------
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

// -- Start ------------------------------------------------------------
log("-".repeat(50));
log("[START] Codex Ping Cron");
log(`   Schedule : 7:00 AM daily (Asia/Bangkok)`);
log(`   Log      : ${path.resolve(LOG_FILE)}`);
log("-".repeat(50));

cron.schedule(
  SCHEDULE,
  () => {
    log("[CRON] Triggering ping...");
    try {
      execSync("node ping.js", { cwd: __dirname, stdio: "inherit" });
    } catch (err) {
      log(`[ERROR] ${err.message}`);
    }
  },
  { timezone: "Asia/Bangkok" }
);

process.on("SIGINT", () => {
  log("[STOP] Shutting down.");
  process.exit(0);
});
