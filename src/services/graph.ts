import { existsSync, readFileSync, readdirSync } from "fs";
import { relative, resolve } from "path";
import { extractWikiTargets } from "./wikiLinks.js";
import { getVaultPath } from "./vaults.js";

export interface GraphNode {
  id: string;
  title: string;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface VaultGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

function walkMdFiles(vaultRoot: string, cb: (absPath: string, pageId: string) => void): void {
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".md")) {
        const relPath = relative(vaultRoot, full);
        const pageId = relPath.replace(/\\/g, "/").replace(/\.md$/, "");
        cb(full, pageId);
      }
    }
  }
  walk(vaultRoot);
}

function titleFromMarkdown(content: string, fallback: string): string {
  for (const line of content.split("\n")) {
    if (line.startsWith("title:")) {
      return line.split(":", 2)[1].trim().replace(/^["']|["']$/g, "");
    }
    if (line.startsWith("# ")) {
      return line.slice(2).trim();
    }
  }
  return fallback;
}

export function buildVaultGraph(username: string, vaultSlug: string): VaultGraph | null {
  const root = getVaultPath(username, vaultSlug);
  if (!existsSync(root)) return null;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const idSet = new Set<string>();

  walkMdFiles(root, (absPath, pageId) => {
    idSet.add(pageId);
    const content = readFileSync(absPath, "utf-8");
    nodes.push({ id: pageId, title: titleFromMarkdown(content, pageId) });
  });

  walkMdFiles(root, (absPath, pageId) => {
    const content = readFileSync(absPath, "utf-8");
    for (const target of extractWikiTargets(content)) {
      edges.push({ source: pageId, target });
    }
  });

  return { nodes, edges };
}
