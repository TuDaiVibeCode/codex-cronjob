# Codex 5.5 Daily Ping

Cron job that pings ChatGPT Codex at **7:00 AM GMT+7** daily to start a conversation and trigger the 5h usage window.

## Setup

1. Get your session tokens from browser:
   - Open `chatgpt.com/codex`
   - Press `F12` -> `Application` -> `Cookies` -> `chatgpt.com`
   - Copy `__Secure-next-auth.session-token.0` -> paste as `SESSION_TOKEN_0`
   - Copy `__Secure-next-auth.session-token.1` -> paste as `SESSION_TOKEN_1`

2. Create `.env` from example:
   ```
   cp .env.example .env
   ```

3. Install and run:
   ```
   npm install
   npm run ping     # test once
   npm start        # run cron scheduler
   ```

## Deploy on GitHub Actions (free, 24/7)

1. Push this repo to GitHub (private)
2. Go to **Settings** -> **Secrets and variables** -> **Actions**
3. Add 2 secrets:
   - `SESSION_TOKEN_0` = value of cookie `.0`
   - `SESSION_TOKEN_1` = value of cookie `.1`
4. Done - runs automatically every day at 7 AM GMT+7

If GitHub blocks the workflow from editing `.github/workflows/codex-ping.yml`, add a `WORKFLOW_TOKEN` secret using a fine-grained PAT with repository contents/workflows write access.

## Quota retry

When Codex shows a quota/usage limit, `ping.js` looks for reset text such as `try again in 2 hours` or `resets at 4:30 PM`. In GitHub Actions it does not sleep and burn runner minutes: it saves the parsed reset time to `CODEX_RETRY_AT`, commits a temporary retry cron for that exact UTC minute, exits quickly, then removes that retry cron after a successful retry.

## Notes

- Session tokens expire periodically. When ping fails, grab fresh tokens from your browser.
- GitHub Actions is free for private repos (2000 min/month). This job uses ~10 seconds per run.
