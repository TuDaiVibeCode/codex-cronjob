// ---------------------------------------------------------------
// ping.js - Open Codex workspace, create a task to start 5h window
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

// -- Screenshot helper ------------------------------------------------
async function screenshot(page, name) {
  const p = `logs/${name}.png`;
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  log(`[SCREENSHOT] ${p}`);
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
      domain: "chatgpt.com",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
    {
      name: "__Secure-next-auth.session-token.1",
      value: SESSION_TOKEN_1,
      domain: "chatgpt.com",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();

  try {
    // Go to Codex landing, then into the cloud workspace
    log("[STEP 2] Opening chatgpt.com/codex/cloud ...");
    await page.goto("https://chatgpt.com/codex/cloud", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    let url = page.url();
    log(`[INFO] URL after load: ${url}`);
    await screenshot(page, "01-after-load");

    // Check if we need to click "Go to Cloud" to enter workspace
    const goToCloud = await page.$('a:has-text("Go to Cloud"), a:has-text("Open Codex"), button:has-text("Go to Cloud")');
    if (goToCloud) {
      log("[INFO] Found 'Go to Cloud' button, clicking...");
      await goToCloud.click();
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);
      url = page.url();
      log(`[INFO] URL after 'Go to Cloud': ${url}`);
      await screenshot(page, "02-after-cloud-click");
    }

    // Check if redirected to login
    if (url.includes("/auth") || url.includes("/login")) {
      log("[ERROR] Session expired - redirected to login");
      await screenshot(page, "error-login-redirect");
      await browser.close();
      process.exit(1);
    }

    // Wait for page to settle
    await page.waitForTimeout(3000);
    await screenshot(page, "03-workspace");

    // Log the full page content for debugging
    const pageText = await page.textContent("body").catch(() => "");
    log(`[DEBUG] Page text (first 500 chars): ${pageText.substring(0, 500)}`);

    // Try multiple strategies to find and use the input
    log("[STEP 3] Looking for task/message input...");

    // Strategy 1: Look for common input selectors
    const inputSelectors = [
      "#prompt-textarea",
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="ask"]',
      'textarea[placeholder*="Type"]',
      'textarea[placeholder*="Send"]',
      'textarea[placeholder*="task"]',
      'textarea[placeholder*="Task"]',
      'textarea[data-testid="chat-input"]',
      'div[contenteditable="true"]',
      'div[role="textbox"]',
      "textarea",
    ];

    let inputFound = false;
    for (const selector of inputSelectors) {
      const el = await page.$(selector);
      if (el && await el.isVisible()) {
        log(`[OK] Found input: ${selector}`);
        await el.click();
        await page.waitForTimeout(500);

        if (selector.includes("contenteditable") || selector.includes("textbox")) {
          await page.keyboard.type(PING_MESSAGE, { delay: 50 });
        } else {
          await el.fill(PING_MESSAGE);
        }
        log(`[OK] Typed: "${PING_MESSAGE}"`);
        inputFound = true;

        await screenshot(page, "04-typed");

        // Send
        await page.waitForTimeout(500);
        const sendBtn = await page.$(
          'button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="send"], button[type="submit"]'
        );
        if (sendBtn && await sendBtn.isVisible()) {
          await sendBtn.click();
          log("[OK] Clicked send button");
        } else {
          await page.keyboard.press("Enter");
          log("[OK] Pressed Enter");
        }

        await page.waitForTimeout(5000);
        await screenshot(page, "05-sent");
        log("[OK] Message sent! 5h window should be active");
        break;
      }
    }

    // Strategy 2: If no input found, try clicking "New task" or similar button first
    if (!inputFound) {
      log("[WARN] No input found directly. Looking for 'New task' button...");

      const newTaskBtns = [
        'button:has-text("New task")',
        'button:has-text("New chat")',
        'button:has-text("New")',
        'a:has-text("New task")',
        'a:has-text("New chat")',
      ];

      for (const btnSel of newTaskBtns) {
        const btn = await page.$(btnSel);
        if (btn && await btn.isVisible()) {
          log(`[OK] Found button: ${btnSel}`);
          await btn.click();
          await page.waitForTimeout(3000);
          await screenshot(page, "06-after-new-task");

          // Try finding input again after clicking new task
          for (const sel of inputSelectors) {
            const el2 = await page.$(sel);
            if (el2 && await el2.isVisible()) {
              log(`[OK] Found input after new task: ${sel}`);
              await el2.click();
              await page.waitForTimeout(500);
              if (sel.includes("contenteditable") || sel.includes("textbox")) {
                await page.keyboard.type(PING_MESSAGE, { delay: 50 });
              } else {
                await el2.fill(PING_MESSAGE);
              }
              await page.keyboard.press("Enter");
              await page.waitForTimeout(5000);
              await screenshot(page, "07-sent-after-new-task");
              log("[OK] Message sent via new task!");
              inputFound = true;
              break;
            }
          }
          break;
        }
      }
    }

    if (!inputFound) {
      log("[ERROR] Could not find any input field or task button");
      await screenshot(page, "error-no-input");
      // List all interactive elements for debugging
      const buttons = await page.$$eval("button", els => els.map(e => e.textContent?.trim()).filter(Boolean));
      log(`[DEBUG] Buttons on page: ${JSON.stringify(buttons.slice(0, 20))}`);
      const links = await page.$$eval("a", els => els.map(e => ({ text: e.textContent?.trim(), href: e.href })).filter(e => e.text));
      log(`[DEBUG] Links on page: ${JSON.stringify(links.slice(0, 20))}`);
      await browser.close();
      process.exit(1);
    }

  } catch (err) {
    log(`[ERROR] ${err.message}`);
    await screenshot(page, "error-crash");
  } finally {
    await browser.close();
    log("[DONE] Browser closed");
  }
}

ping().catch((err) => {
  log(`[FATAL] ${err.message}`);
  process.exit(1);
});
