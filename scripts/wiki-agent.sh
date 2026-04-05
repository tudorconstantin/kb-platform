#!/usr/bin/env bash
# Wiki maintenance agent — run with Copilot CLI
# Usage: ./wiki-agent.sh <vault-dir> <operation>
# Operations: ingest, lint, index
#
# Requires:
# - Copilot CLI installed (npm i -g @github/copilot)
# - GITHUB_TOKEN or COPILOT_GITHUB_TOKEN set (fine-grained PAT with Copilot Requests permission)

set -euo pipefail

VAULT_DIR="${1:?Usage: $0 <vault-dir> <operation>}"
OP="${2:-lint}"

cd "$VAULT_DIR"

case "$OP" in
  ingest)
    echo "[agent] Ingesting new sources from _raw/..."
    copilot -p "You are a wiki maintenance agent. Read CLAUDE.md for conventions.
      List files in _raw/ that are not yet referenced in _log.md.
      For each new file:
      1. Read and summarize its key concepts
      2. Create or update relevant wiki pages (one concept per page)
      3. Add cross-references using [[wiki-links]]
      4. Update _index.md with new entries
      5. Append an ingest entry to _log.md with today's date
      Work through files one at a time. Be thorough." \
      -s --allow-tool='shell(cat:*,ls:*,grep:*,head:*,wc:*), write' --no-ask-user
    ;;

  lint)
    echo "[agent] Running wiki health check..."
    copilot -p "You are a wiki maintenance agent. Read CLAUDE.md for conventions.
      Perform a health check on this wiki:
      1. Find orphan pages (no inbound [[wiki-links]])
      2. Find broken [[wiki-links]] (target page doesn't exist)
      3. Find pages missing TLDR sections
      4. Find pages with stale dates (updated > 30 days ago)
      5. Suggest missing cross-references between related pages
      Report findings, then fix what you can (create missing pages, add links, add TLDRs).
      Update _log.md with a lint entry." \
      -s --allow-tool='shell(cat:*,ls:*,grep:*,find:*,wc:*), write' --no-ask-user
    ;;

  index)
    echo "[agent] Rebuilding _index.md..."
    copilot -p "You are a wiki maintenance agent. Read CLAUDE.md for conventions.
      Rebuild _index.md from scratch:
      1. List all .md files (excluding _ prefixed files and CLAUDE.md)
      2. For each, extract the title and a one-line summary
      3. Organize by topic/tag
      4. Write the complete _index.md" \
      -s --allow-tool='shell(cat:*,ls:*,grep:*,find:*,head:*), write' --no-ask-user
    ;;

  *)
    echo "Unknown operation: $OP"
    echo "Available: ingest, lint, index"
    exit 1
    ;;
esac

echo "[agent] Done. Committing changes..."
git add -A
git diff --cached --quiet || git commit -m "Agent: $OP $(date +%Y-%m-%d)"
echo "[agent] Complete."
