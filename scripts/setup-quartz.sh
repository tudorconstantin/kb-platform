#!/usr/bin/env bash
set -euo pipefail

QUARTZ_DIR="${KB_QUARTZ_DIR:-quartz}"

if [ -d "$QUARTZ_DIR" ]; then
  echo "[setup] Quartz already exists at $QUARTZ_DIR, pulling latest..."
  cd "$QUARTZ_DIR" && git pull && npm i
  exit 0
fi

echo "[setup] Cloning Quartz..."
git clone https://github.com/jackyzha0/quartz.git "$QUARTZ_DIR"
cd "$QUARTZ_DIR"
npm i

echo "[setup] Configuring Quartz for KB Platform..."

# Patch quartz.config.ts for our use case
cat > quartz.config.ts << 'EOF'
import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

const config: QuartzConfig = {
  configuration: {
    pageTitle: "KB",
    pageTitleSuffix: " — kb.constantin.rocks",
    enableSPA: true,
    enablePopovers: true,
    analytics: null,
    locale: "en-US",
    baseUrl: "kb.constantin.rocks",
    ignorePatterns: ["private", "templates", ".obsidian", "_raw"],
    defaultDateType: "modified",
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        header: "Inter",
        body: "Inter",
        code: "JetBrains Mono",
      },
      colors: {
        lightMode: {
          light: "#faf8f8",
          lightgray: "#e5e5e5",
          gray: "#b8b8b8",
          darkgray: "#4e4e4e",
          dark: "#2b2b2b",
          secondary: "#284b63",
          tertiary: "#84a59d",
          highlight: "rgba(143, 159, 169, 0.15)",
          textHighlight: "#fff23688",
        },
        darkMode: {
          light: "#0d1117",
          lightgray: "#21262d",
          gray: "#484f58",
          darkgray: "#c9d1d9",
          dark: "#e6edf3",
          secondary: "#58a6ff",
          tertiary: "#7ee787",
          highlight: "rgba(143, 159, 169, 0.15)",
          textHighlight: "#b3aa0288",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({ priority: ["frontmatter", "git", "filesystem"] }),
      Plugin.SyntaxHighlighting({ theme: { light: "github-light", dark: "github-dark" } }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false, mermaid: true }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: "katex" }),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({ enableSiteMap: false, enableRSS: false }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.NotFoundPage(),
    ],
  },
}

export default config
EOF

echo "[setup] Quartz ready at $QUARTZ_DIR"
echo "[setup] Mermaid diagrams: enabled"
echo "[setup] Wiki-links, graph view, backlinks, search: enabled"
