# KB Platform

Self-hosted, multi-tenant knowledge base at `kb.constantin.rocks`.

**Stack**: Node.js/TypeScript orchestrator + Quartz rendering + Obsidian editing + Copilot CLI agent.

```
Obsidian / Cursor / Copilot CLI / Web editor
        ↓ obsidian-git / REST API
   Git repos on server (one per vault)
        ↓ file watcher triggers
   Quartz static build (per vault)
        ↓
   Traefik → kb.constantin.rocks/{user}/{vault}/
```

## What you get

- **Quartz rendering**: wiki-links, graph view, backlinks, mermaid diagrams, LaTeX, search, ToC, syntax highlighting, callouts — all from your Obsidian markdown
- **Multi-user**: each user gets their own namespace with multiple vaults
- **Access control**: public / unlisted / private vaults, per-user grants (owner/editor/viewer)
- **LLM agent ready**: REST API + API keys for Copilot CLI / Claude Code / any agent
- **Git-backed**: full version history on every vault
- **Auto-rebuild**: file watcher triggers Quartz rebuild on any .md change

## Quick start

```bash
# 1. Configure
cp .env.example .env
# Edit .env — set KB_SECRET_KEY

# 2. Setup Quartz (first time only)
npm install
bash scripts/setup-quartz.sh

# 3. Run in dev mode
npm run dev

# Or with Docker:
docker compose up -d --build
```

## Traefik integration

The `docker-compose.yml` has Traefik labels for `kb.constantin.rocks`. Adjust if:
- Your Traefik network name differs from `traefik-net`
- Your certresolver name differs from `cloudflare`

DNS: add A/CNAME for `kb.constantin.rocks` → your server IP in Cloudflare.

## Obsidian sync

Install the **obsidian-git** community plugin in Obsidian:

1. Create a vault on the dashboard
2. Clone the vault repo locally: `git clone ssh://server/data/vaults/{user}/{vault}`
3. Open the cloned folder as an Obsidian vault
4. Install obsidian-git, configure auto-push interval (e.g. 5 minutes)
5. Edits in Obsidian → auto-push → file watcher → Quartz rebuild → live on site

## LLM agent (Copilot CLI)

```bash
# One-time setup: generate a fine-grained PAT at
# https://github.com/settings/personal-access-tokens/new
# with "Copilot Requests" permission
export GITHUB_TOKEN="ghp_..."

# Run maintenance on a vault
./scripts/wiki-agent.sh /path/to/vault ingest   # Process new sources
./scripts/wiki-agent.sh /path/to/vault lint      # Health check + fix
./scripts/wiki-agent.sh /path/to/vault index     # Rebuild _index.md

# Or interactively from Cursor: open vault folder, chat with AI
```

## API usage

```bash
# Get an API key from the dashboard, then:
export KB="https://kb.constantin.rocks"
export KEY="your-api-key"

# Create a vault
curl -X POST -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"slug":"orisig","title":"Orisig","visibility":"private"}' \
  $KB/api/vaults

# Write a page
curl -X PUT -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"content":"# Hello\n\nFirst page.","commit_message":"init"}' \
  $KB/api/vaults/tudorconstantin/orisig/pages/hello

# Grant access to a collaborator
curl -X POST -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"target_username":"collaborator","role":"editor"}' \
  $KB/api/vaults/tudorconstantin/orisig/access
```

## Project structure

```
kb-platform/
├── src/
│   ├── index.ts              # Fastify server + file watcher
│   ├── config.ts             # Env configuration
│   ├── db.ts                 # SQLite schema
│   ├── auth.ts               # JWT + bcrypt + API keys
│   ├── types.ts              # TypeScript types
│   ├── middleware/auth.ts     # Request auth extraction
│   ├── routes/
│   │   ├── auth.ts           # Register/login/API keys
│   │   ├── api.ts            # Vault + page CRUD, webhooks
│   │   └── web.ts            # Serve Quartz builds + dashboard
│   └── services/
│       ├── vaults.ts         # Vault filesystem + access control
│       ├── git.ts            # Git init/commit
│       └── quartz.ts         # Quartz build manager
├── scripts/
│   ├── setup-quartz.sh       # Clone + configure Quartz
│   └── wiki-agent.sh         # Copilot CLI maintenance
├── docker-compose.yml
├── Dockerfile
└── CLAUDE.md                 # LLM agent instructions
```

## Next steps

- [ ] Anki export endpoint (generate flashcards from tagged pages)
- [ ] Graph API (expose link graph as JSON for custom visualizations)
- [ ] obsidian-livesync support (CouchDB real-time sync)
- [ ] File upload endpoint (images, PDFs to _raw/)
- [ ] Cron-based auto-lint (weekly Copilot CLI health checks)
- [ ] OIDC auth (plug in Authentik/Authelia)
