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

# Wiki-link graph (JSON: nodes + edges) for custom visualizations
curl -H "Authorization: Bearer $KEY" \
  $KB/api/vaults/tudorconstantin/orisig/graph

# Structural lint: broken [[wiki-links]] and pages with no incoming links
curl -H "Authorization: Bearer $KEY" \
  $KB/api/vaults/tudorconstantin/orisig/lint

# Anki export (TSV for import, or ?format=json). Pages need frontmatter tag anki (see below).
curl -H "Authorization: Bearer $KEY" \
  -o orisig-anki.tsv \
  "$KB/api/vaults/tudorconstantin/orisig/anki-export?format=tsv"

# Upload a file into the vault _raw/ folder (multipart: field `file`, form field `path` = relative path under _raw/)
curl -X POST -H "Authorization: Bearer $KEY" \
  -F "path=sources/paper.pdf" \
  -F "file=@./paper.pdf" \
  $KB/api/vaults/tudorconstantin/orisig/raw/upload
```

### Anki flashcards from markdown

Mark pages with **`anki: true`** or **`tags: [anki, ...]`** in YAML frontmatter.

- Optional **`## Front`** / **`## Back`** sections in the body; if omitted, the note **title** (from `title:` or first `#` heading) is the front and the rest of the body is the back.
- Export is **TSV** (`?format=tsv`, default) with columns `front`, `back`, `source` — import into Anki with “Import” and map fields, or use **`?format=json`** for tooling.

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
│       ├── quartz.ts         # Quartz build manager
│       ├── wikiLinks.ts      # [[wiki-link]] parsing
│       ├── graph.ts          # Vault link graph JSON
│       ├── vaultLint.ts      # Broken links + orphans
│       ├── ankiExport.ts     # Anki TSV/JSON from tagged pages
│       └── rawUpload.ts      # Binary uploads to _raw/
├── scripts/
│   ├── setup-quartz.sh       # Clone + configure Quartz
│   └── wiki-agent.sh         # Copilot CLI maintenance
├── docker-compose.yml
├── Dockerfile
└── CLAUDE.md                 # LLM agent instructions
```

## Next steps

**Implemented in this repo**

- [x] **Anki export** — `GET /api/vaults/{user}/{vault}/anki-export` (`?format=tsv` or `json`). See [Anki flashcards from markdown](#anki-flashcards-from-markdown).
- [x] **Graph API** — `GET /api/vaults/{user}/{vault}/graph` returns `{ nodes, edges }` derived from `[[wiki-links]]`.
- [x] **File upload** — `POST /api/vaults/{user}/{vault}/raw/upload` (multipart: `file` + `path`). Max size: `KB_MAX_UPLOAD_BYTES` (default 25 MiB).
- [x] **Structural lint** — `GET /api/vaults/{user}/{vault}/lint` returns `brokenLinks` and `orphans` (pages with no incoming wiki-links). Use for health checks or CI; no Copilot required.

**Operational / external (not bundled here)**

- [ ] **Cron + Copilot auto-lint** — Run `wiki-agent.sh … lint` on a schedule from the host or a job runner, or call `…/lint` weekly with an API key for link/orphan checks only. Full Copilot-based fixes still need `GITHUB_TOKEN` where that script runs.
- [ ] **Obsidian LiveSync** — Requires a separate **CouchDB** (or compatible) server and the [obsidian-livesync](https://github.com/vrtmrz/obsidian-livesync) plugin pointed at it. This platform stays **git + REST + Quartz**; LiveSync is an alternative sync path for a local vault folder, not a substitute for the server-side git remote.
- [ ] **OIDC (Authentik / Authelia)** — Planned: optional `KB_OIDC_*` env vars and routes to delegate login to your IdP. Today auth is **local users + API keys** only.
