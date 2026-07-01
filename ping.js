// ---------------------------------------------------------------
// ping.js - Send a "ping" message to Codex to start a conversation
// and trigger the 5h usage window
// Uses ChatGPT backend-api with session token auth
// ---------------------------------------------------------------
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  SESSION_TOKEN_0,
  SESSION_TOKEN_1,
  CODEX_API = "https://chatgpt.com/backend-api",
  PING_MESSAGE = "ping",
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

function uuid() {
  return crypto.randomUUID();
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
  log(`[OK] Logged in as: ${user}`);

  // Auth headers with Bearer token
  const authHeaders = {
    ...baseHeaders,
    "Authorization": `Bearer ${accessToken}`,
  };

  // 2) Get chat requirements (sentinel token)
  log("[STEP 2] Getting chat requirements...");
  const reqRes = await fetch(`${CODEX_API}/sentinel/chat-requirements`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ conversation_mode_kind: "primary_assistant" }),
  });

  let sentinelHeaders = {};
  if (reqRes.ok) {
    const reqData = await reqRes.json();
    if (reqData.token) {
      sentinelHeaders["openai-sentinel-chat-requirements-token"] = reqData.token;
      log("[OK] Got sentinel token");
    }
  } else {
    log(`[WARN] Sentinel returned HTTP ${reqRes.status} - continuing anyway`);
  }

  // 3) Send the actual message to start a conversation
  log(`[STEP 3] Sending message: "${PING_MESSAGE}"`);

  const messageId = uuid();
  const parentId = uuid();

  const payload = {
    action: "next",
    messages: [
      {
        id: messageId,
        author: { role: "user" },
        content: {
          content_type: "text",
          parts: [PING_MESSAGE],
        },
      },
    ],
    parent_message_id: parentId,
    model: "auto",
    timezone_offset_min: -420, // GMT+7
    conversation_mode: { kind: "primary_assistant" },
    force_paragen: false,
    force_paragen_model_slug: "",
    force_nulligen: false,
    force_rate_limit: false,
  };

  const convRes = await fetch(`${CODEX_API}/conversation`, {
    method: "POST",
    headers: { ...authHeaders, ...sentinelHeaders },
    body: JSON.stringify(payload),
  });

  if (convRes.ok) {
    log(`[OK] Message sent! HTTP ${convRes.status}`);
    log("[OK] Codex conversation started - 5h window should be active now");
  } else {
    const errText = await convRes.text().catch(() => "");
    log(`[ERROR] Conversation request failed: HTTP ${convRes.status}`);
    if (errText) log(`[ERROR] Response: ${errText.substring(0, 200)}`);
    process.exit(1);
  }

  log("[DONE] Ping complete");
}

ping().catch((err) => {
  log(`[FATAL] ${err.message}`);
  process.exit(1);
});
