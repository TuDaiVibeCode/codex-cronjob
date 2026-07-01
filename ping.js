// ---------------------------------------------------------------
// ping.js - Open Codex in real browser, send "ping" to start 5h window
// Runs on GitHub Actions (not your local machine)
// ---------------------------------------------------------------
require("dotenv").config();
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const {
  SESSION_TOKEN_0,
  SESSION_TOKEN_1,
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

// -- Validate ---------------------------------------------------------
if (!SESSION_TOKEN_0 || SESSION_TOKEN_0 === "your-token-part-0-here") {
  log("[ERROR] SESSION_TOKEN_0 not set");
  process.exit(1);
}
if (!SESSION_TOKEN_1 || SESSION_TOKEN_1 === "your-token-part-1-here") {
  log("[ERROR] SESSION_TOKEN_1 not set");
  process.exit(1);
}

// -- Main -------------------------------------------------------------
async function ping() {
  log("[STEP 1] Launching browser...");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
  });

  // Inject session cookies
  await context.addCookies([
    {
      name: "__Secure-next-auth.session-token.0",
      value: SESSION_TOKEN_0,
      domain: ".chatgpt.com",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
    {
      name: "__Secure-next-auth.session-token.1",
      value: SESSION_TOKEN_1,
      domain: ".chatgpt.com",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();

  try {
    // Navigate to Codex
    log("[STEP 2] Opening chatgpt.com/codex ...");
    await page.goto("https://chatgpt.com", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    const url = page.url();
    log(`[INFO] Current URL: ${url}`);

    // Check if redirected to login
    if (url.includes("/auth") || url.includes("/login")) {
      log("[ERROR] Session expired - redirected to login page");
      log("[ERROR] Get fresh tokens from browser and update secrets");
      await page.screenshot({ path: "logs/debug-login.png" });
      await browser.close();
      process.exit(1);
    }

    log("[OK] Codex page loaded");

    // Wait a bit for UI to fully render
    await page.waitForTimeout(3000);

    // Find the text input
    log("[STEP 3] Finding input field...");
    const selectors = [
      "#prompt-textarea",
      'textarea[placeholder*="Ask"]',
      'textarea[data-testid="chat-input"]',
      'div[contenteditable="true"]',
      "textarea",
    ];

    let inputFound = false;
    for (const selector of selectors) {
      const el = await page.$(selector);
      if (el) {
        log(`[OK] Found input: ${selector}`);
        await el.click();
        await page.waitForTimeout(500);

        // Type the message
        if (selector.includes("contenteditable")) {
          await page.keyboard.type(PING_MESSAGE, { delay: 50 });
        } else {
          await el.fill(PING_MESSAGE);
        }

        log(`[OK] Typed: "${PING_MESSAGE}"`);
        inputFound = true;
        break;
      }
    }

    if (!inputFound) {
      log("[ERROR] Could not find input field");
      await page.screenshot({ path: "logs/debug-no-input.png" });
      await browser.close();
      process.exit(1);
    }

    // Send the message
    log("[STEP 4] Sending message...");
    await page.waitForTimeout(500);

    // Try send button first, then Enter
    const sendBtn = await page.$(
      'button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="send"]'
    );
    if (sendBtn) {
      await sendBtn.click();
      log("[OK] Clicked send button");
    } else {
      await page.keyboard.press("Enter");
      log("[OK] Pressed Enter");
    }

    // Wait for response to start
    await page.waitForTimeout(5000);

    log("[OK] Message sent! 5h window should be active now");
    await page.screenshot({ path: "logs/success.png" });

  } catch (err) {
    log(`[ERROR] ${err.message}`);
    await page.screenshot({ path: "logs/debug-error.png" }).catch(() => {});
  } finally {
    await browser.close();
    log("[DONE] Browser closed");
  }
}

ping().catch((err) => {
  log(`[FATAL] ${err.message}`);
  process.exit(1);
});
