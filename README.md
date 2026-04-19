<div align="center">

# GraphHub

**Local-first code intelligence for AI agents**

Transform your codebase into a queryable knowledge graph. Built for Claude Code, Cursor, and MCP-compatible tools.

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/slnquangtran/graphhub/releases)
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
# Clone and install
git clone https://github.com/slnquangtran/graphhub.git
cd graphhub && npm install

# Index your project
npm run index -- /path/to/your/project

# Configure Claude Code (one command)
npm run install-claude
```

That's it. Claude now has persistent memory of your codebase.

## Features

### Core Intelligence

| Feature | Description |
|---------|-------------|
| **Knowledge Graph** | Functions, classes, imports, and call relationships stored in KuzuDB |
| **Semantic Search** | Natural language queries via local embeddings (no API costs) |
| **Impact Analysis** | See what breaks before you edit — direct and indirect callers |
| **Session Memory** | `remember` and `recall` persist learnings across sessions |

### Developer Experience

| Feature | Description |
|---------|-------------|
| **One-Command Setup** | `npm run install-claude` configures everything |
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

// Save learnings for future sessions
remember({ content: "Auth uses JWT middleware", type: "learning" })

// Retrieve past learnings
recall({ query: "how does auth work?" })

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
```

## Language Support

| Language | Support | Parser |
|----------|---------|--------|
| TypeScript / TSX | Full | Tree-sitter AST |
| JavaScript / JSX | Full | Tree-sitter AST |
| Python | Partial | Text chunker |
| Go, Rust, Java | Partial | Text chunker |
| Markdown, Shell | Full | Text chunker |

## Configuration

### Claude Code (Recommended)

```bash
npm run install-claude
```

This automatically:
- Configures MCP server in `.claude/settings.json`
- Installs PreToolUse hook (graph context before reads)
- Installs PostToolUse hook (auto-reindex after commits)
- Updates `CLAUDE.md` with usage instructions

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
| `npm run install-claude` | Configure Claude Code integration |
| `npm test` | Run test suite |

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

## Comparison

| Feature | GraphHub | claude-mem | graphify | cognee |
|---------|:--------:|:----------:|:--------:|:------:|
| Code graph | ✅ | ❌ | ✅ | ⚠️ |
| Session memory | ✅ | ✅ | ❌ | ✅ |
| Always-on hooks | ✅ | ❌ | ✅ | ✅ |
| One-command install | ✅ | ✅ | ✅ | ❌ |
| 100% local | ✅ | ✅ | ✅ | ⚠️ |
| Impact analysis | ✅ | ❌ | ✅ | ❌ |
| Auto-reindex | ✅ | ❌ | ❌ | ❌ |

## Roadmap

- [x] Session memory (remember/recall/forget)
- [x] Always-on PreToolUse hooks
- [x] PostToolUse auto-reindex
- [x] Graph report generation
- [x] Verified 85% token reduction
- [ ] Worker thread indexing for large repos
- [ ] `.gitignore` support
- [ ] Class hierarchy edges (INHERITS, IMPLEMENTS)
- [ ] Native Python/Go Tree-sitter grammars
- [ ] Community detection (Leiden algorithm)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

```bash
# Development setup
git clone https://github.com/slnquangtran/graphhub.git
cd graphhub && npm install

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

[Report Bug](https://github.com/slnquangtran/graphhub/issues) · [Request Feature](https://github.com/slnquangtran/graphhub/issues)

</div>
