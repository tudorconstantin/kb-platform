import { buildVaultGraph } from "./graph.js";

export interface BrokenLink {
  from: string;
  to: string;
}

export interface VaultLintReport {
  brokenLinks: BrokenLink[];
  orphans: string[];
}

/**
 * Structural lint: wiki links pointing to missing pages, and pages with no incoming wiki links.
 */
export function lintVault(username: string, vaultSlug: string): VaultLintReport | null {
  const graph = buildVaultGraph(username, vaultSlug);
  if (!graph) return null;

  const ids = new Set(graph.nodes.map((n) => n.id));
  const brokenLinks: BrokenLink[] = [];
  const seen = new Set<string>();

  for (const e of graph.edges) {
    if (!ids.has(e.target)) {
      const key = `${e.source}->${e.target}`;
      if (!seen.has(key)) {
        seen.add(key);
        brokenLinks.push({ from: e.source, to: e.target });
      }
    }
  }

  const incoming = new Map<string, number>();
  for (const n of graph.nodes) incoming.set(n.id, 0);
  for (const e of graph.edges) {
    if (ids.has(e.target)) {
      incoming.set(e.target, (incoming.get(e.target) || 0) + 1);
    }
  }

  const orphans: string[] = [];
  for (const [id, count] of incoming) {
    if (count === 0) orphans.push(id);
  }
  orphans.sort();

  return { brokenLinks, orphans };
}
