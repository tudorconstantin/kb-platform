# KB Platform — Agent instructions

You operate on a self-hosted knowledge base at `kb.constantin.rocks`.
Each vault is a directory of markdown files backed by git.

## Authentication

```bash
export KB_API_KEY="your-api-key"
export KB_BASE="https://kb.constantin.rocks"
```

## API

```bash
# List vaults
curl -H "Authorization: Bearer $KB_API_KEY" $KB_BASE/api/vaults/{username}

# List pages
curl -H "Authorization: Bearer $KB_API_KEY" $KB_BASE/api/vaults/{username}/{vault}/pages

# Read page
curl -H "Authorization: Bearer $KB_API_KEY" $KB_BASE/api/vaults/{username}/{vault}/pages/{page}

# Write page
curl -X PUT -H "Authorization: Bearer $KB_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content": "---\ntitle: My Page\ntags: [topic]\n---\n\n# My Page\n\nContent.", "commit_message": "Update"}' \
  $KB_BASE/api/vaults/{username}/{vault}/pages/{page}

# Trigger rebuild
curl -X POST -H "Authorization: Bearer $KB_API_KEY" $KB_BASE/api/vaults/{username}/{vault}/build
```

## Vault conventions

1. One concept per page, kebab-case filenames
2. YAML frontmatter: title, tags, created, updated, sources
3. Use `[[wiki-links]]` for cross-references
4. Keep `_index.md` updated with one-line summaries
5. Append to `_log.md` after every operation
6. Raw sources go in `_raw/`, never modified
7. Start each page with a TLDR paragraph
8. Flag contradictions explicitly
9. Mermaid diagrams for architecture/flows:
   ````
   ```mermaid
   graph TD
       A --> B
   ```
   ````

## Operations

**Ingest**: read source → create/update pages → update _index.md → append _log.md
**Lint**: find orphans, broken links, stale content, missing TLDRs → fix and report
**Index**: rebuild _index.md from all pages
