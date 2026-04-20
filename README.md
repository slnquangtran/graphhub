<div align="center">

# GraphHub

**Local-first code intelligence for AI agents**

Transform your codebase into a queryable knowledge graph. Built for Claude Code, Cursor, and MCP-compatible tools.

[![Version](https://img.shields.io/badge/version-1.3.1-blue.svg)](https://github.com/slnquangtran/Graph-Hub/releases)
[![Stars](https://img.shields.io/github/stars/slnquangtran/Graph-Hub?style=flat-square&color=ffd700)](https://github.com/slnquangtran/Graph-Hub/stargazers)
[![License](https://img.shields.io/badge/license-ISC-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-compatible-purple.svg)](https://modelcontextprotocol.io/)

[Quick Start](#quick-start) · [Features](#features) · [Documentation](#mcp-tools) · [Token Savings](#token-savings)

</div>

---

## The Problem

AI coding assistants lose context between sessions. They re-read files, re-learn your codebase, and burn tokens on the same questions. **GraphHub fixes this.**

```
Traditional: grep → read 5 files → 9,216 tokens
GraphHub:    get_context("functionName") → 507 tokens (94% savings)
```

## Quick Start

```bash
# One command — sets up every MCP client present in your project
npm install graphhub
```

Detects and configures Claude Code, OpenCode, Gemini CLI, Antigravity, and Kilo CLI in one pass. Or explicitly:

```bash
npx graphhub setup                               # detect + install for present clients
npx graphhub setup --force                       # install for all 5 clients
npx graphhub setup --client claude-code,kilo-cli # pick specific clients
npx graphhub setup --dry-run                     # preview detection
npx graphhub setup --list                        # list supported clients
npx graphhub uninstall-all                       # remove graphhub from all clients
```

Prefer a local clone?

```bash
git clone https://github.com/slnquangtran/Graph-Hub.git
cd Graph-Hub && npm install
npm run index -- /path/to/your/project
npm run setup -- /path/to/your/project
```

That's it. Your agent now has persistent memory of your codebase.

## Features

### Core Intelligence

| Feature | Description |
|---------|-------------|
| **Knowledge Graph** | Functions, classes, imports, and call relationships stored in KuzuDB |
| **Semantic Search** | Natural language queries via local embeddings (no API costs) |
| **Impact Analysis** | See what breaks before you edit — direct and indirect callers |
| **Session Memory** | `remember` and `recall` persist learnings across sessions |
| **Pattern Memory** | Recall prior bug fixes and skill routing by similarity, across sessions |
| **One-Shot Debug** | `debug_trace` chains search → context → impact in a single call |
| **Batch Context** | Look up callers/callees for many symbols in one round trip |

### Developer Experience

| Feature | Description |
|---------|-------------|
| **One-Command Setup** | `npm install graphhub` configures all supported MCP clients globally |
| **Multi-Client Support** | Claude Code, OpenCode, Gemini CLI, Antigravity, Kilo CLI — detected and installed to global configs |
| **Auto-Reindex** | PostToolUse hook keeps graph fresh after commits |
| **Always-On Context** | PreToolUse hook reminds Claude about the graph |
| **Graph Report** | Auto-generated overview with god nodes and clusters |

### Integrations

| Feature | Description |
|---------|-------------|
| **MCP Server** | Standard Model Context Protocol for any compatible agent |
| **REST API** | Express server on port 9000 for custom integrations |
| **React Dashboard** | Interactive visualization at port 5173 |
| **Mermaid Export** | Generate visual diagrams of your architecture |

## Token Savings

Real measurements on GraphHub's own codebase:

| Task | Without | With | Savings |
|------|---------|------|---------|
| Find function callers | 9,216 | 507 | **94%** |
| Impact analysis | 7,281 | 673 | **91%** |
| List file symbols | 2,745 | 322 | **88%** |
| Search code logic | 2,115 | 759 | **64%** |
| Codebase overview | 2,381 | 1,389 | **42%** |
| **Total** | **23,738** | **3,650** | **85%** |

**Bottom line:** 5x more tasks in the same context window.

## MCP Tools

When connected to Claude Code or other MCP agents:

```typescript
// Find code by description
semantic_search({ query: "authentication validation" })

// See callers and callees
get_context({ name: "validateToken" })

// Check blast radius before editing
impact_analysis({ name: "handleRequest" })

// One-shot debugging: search + context + impact in a single call
debug_trace({ query: "null pointer in auth middleware", top_k: 3 })

// Bulk lookup: callers/callees counts for many symbols at once
batch_context({ names: ["validateToken", "handleRequest", "parseBody"] })

// Save learnings for future sessions
remember({ content: "Auth uses JWT middleware", type: "learning" })

// Retrieve past learnings
recall({ query: "how does auth work?" })

// Remember a bug fix, then recall it by symptom next time
remember_bugfix({
  symptom: "TypeError: Cannot read property user of undefined",
  root_cause: "req.session was null on the /guest route",
  fix: "Added session guard at middleware entry",
})
recall_bugfix({ symptom: "undefined user property on guest route" })

// Cache which SKILL.md worked for a task, recall it for similar tasks
remember_skill_choice({
  task_description: "rename a function safely across the repo",
  skill_path: ".claude/skills/gitnexus/gitnexus-refactoring/SKILL.md",
  outcome: "success",
})
recall_skill_choice({ task_description: "rename a symbol in multiple files" })

// Run custom Cypher queries
query_graph({ cypher: "MATCH (s:Symbol)-[:CALLS]->(t:Symbol) RETURN s, t LIMIT 10" })
```

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ Source Code │ ──▶ │  Tree-sitter │ ──▶ │ KuzuDB Graph DB │
└─────────────┘     │    Parser    │     └────────┬────────┘
                    └──────────────┘              │
                           │                      │
                    ┌──────▼──────┐      ┌───────▼───────┐
                    │  Embeddings │      │   MCP Server  │
                    │ (MiniLM-L6) │      │  REST API     │
                    └─────────────┘      │  Dashboard    │
                                         └───────────────┘
```

**Graph Schema:**
```
File ──CONTAINS──▶ Symbol ◀──DESCRIBES── Chunk
File ──IMPORTS───▶ File
Symbol ──CALLS──▶ Symbol
Symbol ──INHERITS──▶ Symbol
Symbol ──IMPLEMENTS──▶ Symbol
```

## Language Support

| Language | Support | Parser |
|----------|---------|--------|
| TypeScript / TSX | Full | Tree-sitter AST |
| JavaScript / JSX | Full | Tree-sitter AST |
| Python | Full | Tree-sitter AST |
| Go, Rust, Java | Partial | Text chunker |
| Markdown, Shell | Full | Text chunker |

## Configuration

### All Clients (Recommended)

```bash
npx graphhub setup
```

Auto-detects and configures every supported client using their **global** config files, so GraphHub is available in every project without per-project setup:

| Client | Global Config File |
|--------|--------------------|
| Claude Code | `~/.claude/settings.json` |
| OpenCode | `~/.config/opencode/opencode.json` |
| Gemini CLI | `~/.gemini/settings.json` |
| Antigravity | `~/.antigravity/mcp.json` |
| Kilo CLI | `~/.config/kilo/kilo.json` |

Existing keys are preserved — only the `graphhub` entry is added. Use `--force` to install for clients that aren't yet present. A `postinstall` hook runs the same flow after `npm install graphhub`; opt out with `GRAPHHUB_NO_INSTALL=1`, `CI=1`, or `npm_config_global=true`.

### Claude Code (legacy, Claude-only hooks + CLAUDE.md)

```bash
npm run install-claude
```

Adds the PreToolUse/PostToolUse hooks and updates `CLAUDE.md`. The multi-client `setup` above covers MCP config only.

### Manual Setup

```json
{
  "mcpServers": {
    "graphhub": {
      "command": "npx",
      "args": ["tsx", "src/index.ts", "serve"],
      "cwd": "/path/to/graphhub"
    }
  }
}
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run index -- <dir>` | Index a directory into the knowledge graph |
| `npm run serve` | Start MCP server (stdio) |
| `npm run serve-api` | Start REST API (port 9000) |
| `npm run dashboard` | Start API + React dashboard |
| `npm run report` | Generate GRAPH_REPORT.md |
| `npm run visualize` | Export to Mermaid format |
| `npm run setup` | Configure all supported MCP clients (Claude Code, OpenCode, Gemini CLI, Antigravity) |
| `npm run uninstall-all` | Remove graphhub entry from all clients |
| `npm run install-claude` | Configure Claude Code hooks + CLAUDE.md (legacy, Claude-only) |
| `npm test` | Run test suite |

## Changelog

### v1.3.1
- **Global install** — All client adapters now write to home-dir global configs (`~/.claude/`, `~/.gemini/`, etc.) so one `npx graphhub setup --force` covers every project without per-project setup
- **Kilo CLI support** — Added adapter for Kilo CLI (`~/.config/kilo/kilo.json`)
- **`graphhubDir` fix** — `npx graphhub setup` now correctly resolves the graphhub package location from `import.meta.url` instead of defaulting to `process.cwd()` (which was the user's project, causing wrong MCP server paths)
- **Gemini CLI adapter** — Was reading/writing `<project>/.gemini/` instead of `~/.gemini/`; fixed to use home dir
- **Windows path fix** — MCP server entry paths now always use forward slashes in JSON configs
- **`package.json` version** — Bumped to match README

### v1.3.0
- **DB lifecycle fix** — MCP server, watch mode, and all CLI commands now properly release the KuzuDB file lock on exit. Concurrent tool/process conflicts are gone.
- **`.gitignore` support** — cross-platform path normalization (fixes Windows `\` vs `/` mismatch so gitignore patterns apply correctly on all platforms)
- **Python parser** — upgraded to full Tree-sitter AST extraction (functions, classes, calls, inheritance)
- **Import alias resolution** — `import { foo as bar }` now stores `foo` as the specifier, fixing cross-file call graph edges for renamed imports
- **Fuzzy symbol search** — case-insensitive (`toLower(s.name) CONTAINS query`)
- **`forget()` safety** — requires at least one filter; calling with no args no longer silently deletes all observations
- **MCP `get_file_symbols`** — was returning an empty object (raw DB cursor); now returns the actual rows
- **Error resilience** — per-file parse errors during directory indexing no longer abort the entire run; `stats.errors` is now accurate
- **API `/api/index`** — now also resolves inheritance edges (was missing `resolveInheritance()`)
- **BigInt coercion** — KuzuDB `count()` results coerced to `Number` everywhere; `JSON.stringify` no longer throws on stats

## Privacy

- **100% Local** — All data stays in `.graphhub/` in your project
- **No External APIs** — Embeddings generated locally with Xenova/transformers
- **No Telemetry** — Zero network calls during indexing or querying

## Tech Stack

| Component | Technology |
|-----------|------------|
| Parser | web-tree-sitter (WASM) |
| Database | KuzuDB (embedded graph) |
| Embeddings | @xenova/transformers (all-MiniLM-L6-v2) |
| MCP | @modelcontextprotocol/sdk |
| API | Express.js |
| Dashboard | React + Vite + React Flow |

## Roadmap

- [x] Session memory (remember/recall/forget)
- [x] Always-on PreToolUse hooks
- [x] PostToolUse auto-reindex
- [x] Graph report generation
- [x] Verified 85% token reduction
- [x] Class hierarchy edges (INHERITS, IMPLEMENTS)
- [x] One-shot `debug_trace` and bulk `batch_context`
- [x] Pattern memory for bug fixes and skill routing
- [x] One-command multi-client setup (Claude Code, OpenCode, Gemini CLI, Antigravity, Kilo CLI)
- [x] Global install — writes to home-dir configs so all projects benefit without per-project setup
- [x] `.gitignore` support (cross-platform, including Windows path normalization)
- [x] Proper database lifecycle — `close()` releases the file lock immediately on MCP server, watch mode, and CLI exit
- [ ] Worker thread indexing for large repos
- [ ] Native Go/Rust/Java Tree-sitter grammars
- [ ] Community detection (Leiden algorithm)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

```bash
# Development setup
git clone https://github.com/slnquangtran/Graph-Hub.git
cd Graph-Hub && npm install

# Run tests
npm test

# Index GraphHub itself for testing
npm run index -- ./src
```

## License

[ISC](LICENSE) © 2024

---

<div align="center">

**Built for AI agents that need to remember your codebase.**

[Report Bug](https://github.com/slnquangtran/Graph-Hub/issues) · [Request Feature](https://github.com/slnquangtran/Graph-Hub/issues)

</div>
