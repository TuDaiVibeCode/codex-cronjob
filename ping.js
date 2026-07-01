// ---------------------------------------------------------------
// ping.js - Lightweight ping to warm up Codex session
// Hits auth + sentinel + conversations + models endpoints
// Cannot POST conversation from datacenter IP (anti-bot blocked)
// ---------------------------------------------------------------
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const {
  SESSION_TOKEN_0,
  SESSION_TOKEN_1,
  CODEX_API = "https://chatgpt.com/backend-api",
  LOG_FILE = "./logs/codex-ping.log",
} = process.env;

// -- Logger -----------------------------------------------------------
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

// -- Validate ---------------------------------------------------------
if (!SESSION_TOKEN_0 || SESSION_TOKEN_0 === "your-token-part-0-here") {
  log("[ERROR] SESSION_TOKEN_0 not set. See .env.example");
  process.exit(1);
}
if (!SESSION_TOKEN_1 || SESSION_TOKEN_1 === "your-token-part-1-here") {
  log("[ERROR] SESSION_TOKEN_1 not set. See .env.example");
  process.exit(1);
}

// -- Shared headers ---------------------------------------------------
const cookie = `__Secure-next-auth.session-token.0=${SESSION_TOKEN_0}; __Secure-next-auth.session-token.1=${SESSION_TOKEN_1}`;
const baseHeaders = {
  "Cookie": cookie,
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Content-Type": "application/json",
};

async function ping() {
  // 1) Get access token from session
  log("[STEP 1] Getting access token...");
  const start = Date.now();

  const sessionRes = await fetch("https://chatgpt.com/api/auth/session", {
    headers: baseHeaders,
  });

  if (!sessionRes.ok) {
    log(`[ERROR] Session request failed: HTTP ${sessionRes.status}`);
    log("[ERROR] Token expired. Get a fresh one from browser.");
    process.exit(1);
  }

  const session = await sessionRes.json();
  const accessToken = session.accessToken;

  if (!accessToken) {
    log("[ERROR] No accessToken in session response. Token may be expired.");
    process.exit(1);
  }

  const user = session.user?.name || session.user?.email || "unknown";
  log(`[OK] Logged in as: ${user} (${Date.now() - start}ms)`);

  const authHeaders = {
    ...baseHeaders,
    "Authorization": `Bearer ${accessToken}`,
  };

  // 2) Get chat requirements (warms up sentinel system)
  log("[STEP 2] Warming up sentinel...");
  const reqRes = await fetch(`${CODEX_API}/sentinel/chat-requirements`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ conversation_mode_kind: "primary_assistant" }),
  });

  if (reqRes.ok) {
    log("[OK] Sentinel warmed up");
  } else {
    log(`[WARN] Sentinel returned HTTP ${reqRes.status}`);
  }

  // 3) Touch conversations list
  log("[STEP 3] Touching conversations...");
  const convRes = await fetch(`${CODEX_API}/conversations?offset=0&limit=1&order=updated`, {
    headers: authHeaders,
  });

  if (convRes.ok) {
    log("[OK] Conversations endpoint responded");
  } else {
    log(`[WARN] Conversations returned HTTP ${convRes.status}`);
  }

  // 4) Warm up models endpoint
  log("[STEP 4] Warming up models...");
  const modelsRes = await fetch(`${CODEX_API}/models`, {
    headers: authHeaders,
  });

  if (modelsRes.ok) {
    log("[OK] Models endpoint warmed up");
  } else {
    log(`[WARN] Models returned HTTP ${modelsRes.status}`);
  }

  log(`[DONE] Ping complete - total ${Date.now() - start}ms`);
}

ping().catch((err) => {
  log(`[FATAL] ${err.message}`);
  process.exit(1);
});
