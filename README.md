# OpenClaw on Cloudflare Containers

Deploy [OpenClaw](https://github.com/anthropics/openclaw) — an open-source AI coding gateway — on [Cloudflare Containers](https://developers.cloudflare.com/containers/) with Workers AI integration, persistent device pairing via R2, and a built-in admin dashboard.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/lllxpr/openclaw-cloudflare-container)

## Features

- **One-click deploy** — OpenClaw running on Cloudflare's global network
- **Workers AI** — Powered by Kimi K2.5 via AI Gateway (no external API keys needed)
- **Persistent pairing** — Device approvals and chat history survive container restarts (R2-backed, no size limits)
- **Admin dashboard** — Overview stats, device management, CLI terminal (Cloudflare-themed light UI)
- **Auto-onboarding** — Container self-configures on startup with restore from R2

## Architecture

```
Browser ──► Cloudflare Worker ──► Container (OpenClaw Gateway)
                │                       │
                ├── /admin/        Admin Dashboard (HTML)
                ├── /admin/api/*   Management Server (:18700)
                ├── /persist/*     R2 Persistence Endpoints
                ├── /openai/v1/*   AI Gateway Proxy → Workers AI
                └── /*             OpenClaw Control UI (:18789)
```

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Cloudflare account](https://dash.cloudflare.com/sign-up) with Containers access (beta)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) v4+

## Step-by-Step Setup

### 1. Clone this repo

```bash
git clone https://github.com/lllxpr/openclaw-cloudflare-container.git
cd openclaw-cloudflare-container
npm install
```

### 2. Login to Cloudflare

```bash
npx wrangler login
```

### 3. Create an R2 bucket

```bash
npx wrangler r2 bucket create openclaw-data
```

The bucket name `openclaw-data` is already configured in `wrangler.toml`. If you use a different name, update it:

```toml
[[r2_buckets]]
binding = "OPENCLAW_R2"
bucket_name = "openclaw-data"   # ← change if needed
```

### 4. Configure Secrets

Copy the example secrets file and fill in your values:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars`:

```env
GATEWAY_AUTH_TOKEN=your-secret-token
AI_GATEWAY_ACCOUNT_ID=your-account-id
AI_GATEWAY_ID=your-gateway-id
AI_GATEWAY_AUTH_TOKEN=your-api-token
TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIJKlmNOPQRstUVwxYZ  # Optional
```

- **`GATEWAY_AUTH_TOKEN`** — A secret string for authenticating with the OpenClaw Chat UI. Generate one with `openssl rand -hex 16`.
- **`AI_GATEWAY_ACCOUNT_ID`** — Your Cloudflare Account ID. Find it at `dash.cloudflare.com` → any zone → Overview → right sidebar.
- **`AI_GATEWAY_ID`** — Your AI Gateway name. Create one at `dash.cloudflare.com` → AI → AI Gateway.
- **`AI_GATEWAY_AUTH_TOKEN`** — AI Gateway authentication token. To create one:
  1. Go to `dash.cloudflare.com` → AI → AI Gateway → Select your gateway → **Settings**
  2. Enable **Authenticated Gateway** (toggle on)
  3. Click **Create authentication token**
  4. Copy the generated token (format: `cfut_...`)
- **`TELEGRAM_BOT_TOKEN`** — *(Optional)* Telegram Bot token. See [Telegram Setup](#telegram-setup-optional) below.

For production deployment, set them as secrets:

```bash
npx wrangler secret put GATEWAY_AUTH_TOKEN
npx wrangler secret put AI_GATEWAY_ACCOUNT_ID
npx wrangler secret put AI_GATEWAY_ID
npx wrangler secret put AI_GATEWAY_AUTH_TOKEN
npx wrangler secret put TELEGRAM_BOT_TOKEN  # Optional
```

> **Note**: `WORKER_URL` is auto-detected from the first incoming request — no manual configuration needed.

### 5. Update `wrangler.toml`

Change the worker name:

```toml
name = "your-worker-name"
```

### 6. Deploy

```bash
npm run deploy
```

First deploy will take a few minutes to pull the container image.

### 7. Access your deployment

- **Admin Dashboard**: `https://<your-worker>.workers.dev/admin/`
- **Chat UI**: `https://<your-worker>.workers.dev/#token=<your-token>`
- **Health check**: `https://<your-worker>.workers.dev/healthz`

### 8. Approve your first device

1. Open the Chat UI link above
2. Open the Admin Dashboard → **Devices** tab
3. Click **Approve** on the pending device
4. Return to Chat UI — it should connect automatically

The approval persists in R2, so you won't need to re-approve after container restarts.

## Telegram Setup (Optional)

OpenClaw supports Telegram as a chat channel. Users can message your bot directly and get AI-powered responses.

### 1. Create a Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` and follow the prompts
3. Copy the bot token (format: `123456789:ABCdefGhIJKlmNOPQRstUVwxYZ`)

### 2. Configure the Bot Token

**For local development:**

Add to `.dev.vars`:
```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIJKlmNOPQRstUVwxYZ
```

**For production:**

```bash
echo "123456789:ABCdefGhIJKlmNOPQRstUVwxYZ" | npx wrangler secret put TELEGRAM_BOT_TOKEN
```

### 3. Deploy and Restart

```bash
npm run deploy
```

The container will automatically start Telegram long polling on startup.

### 4. Pair Your Telegram Account

1. **Send a message** to your bot on Telegram
2. Bot will reply with a **pairing code** (e.g., `PTJG6J7R`)
3. **Approve the pairing** in one of two ways:

   **Option A: Admin CLI** (faster)
   ```bash
   # In Admin Dashboard → CLI tab
   node dist/index.js pairing approve telegram <CODE> --notify
   ```

   **Option B: Admin Dashboard**
   - Go to **Devices** tab
   - Find the pending request
   - Click **Approve**

4. **Send another message** — Bot will now respond with AI-powered replies!

### Telegram Features

- **Direct messages**: Private 1-on-1 conversations with the bot
- **Group chats**: Add the bot to groups (requires mention: `@yourbot hello`)
- **Pairing security**: First-time users must be approved by the bot owner
- **Persistent sessions**: Chat history survives container restarts (stored in R2)

### Troubleshooting Telegram

**Bot not responding?**
- Check `node dist/index.js channels status` in Admin CLI
- Should show: `Telegram default: enabled, configured, running, mode:polling`

**Pairing code not working?**
- List pending requests: `node dist/index.js pairing list`
- The code expires after a few minutes — request a new one

**Want to unpair a user?**
- List paired devices: `node dist/index.js devices list`
- Remove: `node dist/index.js devices remove <device-id>`

## Admin Dashboard

The admin dashboard at `/admin/` uses a light theme with Cloudflare-style design (orange accents, white cards, clean typography). It has three tabs:

| Tab | Description |
|-----|-------------|
| **Overview** | Container stats (uptime, CPU, memory, R2 snapshot), container info (image, instance type, model, AI Gateway) |
| **Devices** | Pending pairing requests with approve buttons, paired devices list |
| **CLI** | Run commands inside the container with quick-access buttons and command history |

The header bar also includes **Open Chat** (links to the OpenClaw Control UI) and **Restart** buttons.

## How Persistence Works

OpenClaw stores pairing data and chat sessions in `/home/node/.openclaw/`. Since container filesystems are ephemeral, this project uses Cloudflare R2 to persist:

1. **On startup**: Container fetches a base64-encoded tarball from R2 and extracts it
2. **On approve**: Snapshot is saved to R2 immediately

Persisted directories: `devices/`, `identity/`, `agents/` (chat sessions).

R2 supports objects up to 5 GB, so there are no practical size limits for chat history and context.

## Project Structure

```
├── src/
│   ├── index.ts          # Worker + Container class + routing + mgmt server
│   └── admin-html.ts     # Admin dashboard HTML (Tailwind CSS)
├── .dev.vars.example      # Secrets template (GATEWAY_AUTH_TOKEN, AI_GATEWAY_AUTH_TOKEN)
├── wrangler.toml          # Cloudflare configuration
├── package.json
├── tsconfig.json
└── README.md
```

## Troubleshooting

**Container won't start?**
- Check `npx wrangler containers list --json` for container state
- Use the Admin Dashboard → **CLI** tab to run diagnostic commands inside the container

**Devices not showing?**
- The devices list caches every 30s. Click **Refresh** in the Devices tab for a fresh read.

**Chat UI shows "pairing required"?**
- Go to Admin → Devices → Approve the pending device

**R2 save failing?**
- Check `/persist/status` endpoint
- Verify R2 bucket name in `wrangler.toml` matches your actual bucket

## License

MIT
