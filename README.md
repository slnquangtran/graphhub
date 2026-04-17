# GraphHub

A local-first code intelligence platform that transforms your codebase into a queryable knowledge graph. Built for AI agents like Claude Code, Cursor, and other CLI tools to remember and understand your entire codebase across sessions.

## Why GraphHub?

AI coding assistants lose context between sessions. They can't remember what they learned about your codebase yesterday. GraphHub solves this by:

- **Parsing your code** into a persistent knowledge graph (functions, classes, imports, call relationships)
- **Exposing it via MCP** (Model Context Protocol) so AI agents can query it
- **Running 100% locally** — your code never leaves your machine

## Features

- **Code Indexing** — Parse TypeScript, JavaScript, TSX, JSX with Tree-sitter AST. Extracts functions, classes, methods, interfaces, imports, and call relationships.
- **Knowledge Graph** — Stored in KuzuDB with File, Symbol, and Chunk nodes connected by CONTAINS, CALLS, IMPORTS, and DESCRIBES edges.
- **Semantic Search (RAG)** — Local embeddings via `all-MiniLM-L6-v2` for natural language code search. Zero API costs.
- **Impact Analysis** — Understand blast radius before editing. See direct and indirect callers of any function.
- **Session Memory** — `remember` and `recall` tools persist learnings across sessions. Never lose context again.
- **Always-On Hooks** — PreToolUse hooks inject graph context before Claude reads files.
- **Graph Report** — Auto-generated `GRAPH_REPORT.md` with god nodes, clusters, and architecture overview.
- **One-Command Install** — `npm run install-claude` configures MCP server and hooks automatically.
- **MCP Server** — Standard Model Context Protocol interface for AI agent integration.
- **REST API** — Express server on port 9000 for custom integrations.
- **React Dashboard** — Interactive graph visualization with React Flow.
- **Mermaid Export** — Generate visual diagrams of your codebase.
- **Incremental Indexing** — SHA-256 file hashing skips unchanged files on re-index.

## Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

```bash
git clone https://github.com/slnquangtran/graphhub.git
cd graphhub
npm install
```

### Index Your Codebase

```bash
# Index a directory (defaults to ./src)
npm run index -- ./path/to/your/project

# Or index the current directory
npm run index -- .
```

This creates a `.graphhub/` directory containing your knowledge graph.

### Generate the Graph Report

```bash
npm run report
```

Creates `.graphhub/GRAPH_REPORT.md` with god nodes, clusters, and session memory.

### Configure Claude Code (One Command)

```bash
npm run install-claude
```

This automatically:
- Adds GraphHub as an MCP server to `.claude/settings.json`
- Installs a PreToolUse hook that reminds Claude about the graph before file searches
- Updates `CLAUDE.md` with usage instructions

### Start the MCP Server

```bash
npm run serve
```

The MCP server runs over stdio and can be connected to Claude Code or other MCP-compatible AI agents.

### Start the REST API + Dashboard

```bash
# Install dashboard dependencies first
cd dashboard && npm install && cd ..

# Start both API server and dashboard
npm run dashboard
```

- REST API: http://localhost:9000
- Dashboard: http://localhost:5173

### Other Commands

```bash
# Export graph to Mermaid format
npm run visualize

# Generate documentation for all functions
npm run docs -- heuristic    # No API needed
npm run docs -- openai       # Uses OpenAI API
npm run docs -- anthropic    # Uses Anthropic API
```

## Architecture

```
Source Code → Tree-sitter Parser → KuzuDB Knowledge Graph
                                          ↓
                              ┌───────────┼───────────┐
                              ↓           ↓           ↓
                         MCP Server   REST API   Mermaid Export
                              ↓           ↓
                         AI Agents    Dashboard
```

### Graph Schema

```
File ──CONTAINS──► Symbol ◄──DESCRIBES── Chunk
File ──IMPORTS──► File
Symbol ──CALLS──► Symbol
```

**Node Types:**
- `File` — Source files with path and language
- `Symbol` — Functions, classes, methods, interfaces with metadata (inputs, outputs, calls, doc)
- `Chunk` — Embedded text chunks for semantic search (384-dim vectors)
- `FileHash` — SHA-256 hashes for incremental indexing

## MCP Tools

When connected to an AI agent, GraphHub exposes these tools:

| Tool | Description |
|------|-------------|
| `query_graph` | Run raw Cypher queries against the knowledge graph |
| `get_file_symbols` | Get all symbols defined in a specific file |
| `semantic_search` | Natural language search for code functionality |
| `get_context` | Get all callers and callees of a symbol |
| `impact_analysis` | Analyze blast radius — what breaks if you change a symbol |
| `remember` | Save a learning, decision, or finding to session memory |
| `recall` | Search session memory using natural language |
| `forget` | Delete observations from session memory |

### Session Memory Example

```
# Save what you learned
remember({content: "Auth flow validates JWT in middleware", type: "learning", related_symbols: ["validateToken"]})

# Retrieve it later (even in a new session)
recall({query: "how does auth work?"})
```

## Configuring with Claude Code

Add GraphHub as an MCP server in your Claude Code settings:

```json
{
  "mcpServers": {
    "graphhub": {
      "command": "npm",
      "args": ["run", "serve"],
      "cwd": "/path/to/graphhub"
    }
  }
}
```

Or use `tsx` directly:

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

## Language Support

| Language | Status | Method |
|----------|--------|--------|
| TypeScript | Full | Tree-sitter AST |
| JavaScript | Full | Tree-sitter AST |
| TSX/JSX | Full | Tree-sitter AST |
| Python | Partial | Text chunker fallback |
| Go, Rust, Java | Partial | Text chunker fallback |
| Markdown, Shell | Full | Text chunker |

## Privacy

- **100% local** — All data stays in `.graphhub/` in your project directory
- **No external APIs** — Embeddings generated locally with `@xenova/transformers`
- **No telemetry** — Zero network calls during indexing or querying

## Tech Stack

- **Parser:** web-tree-sitter (WASM)
- **Database:** KuzuDB (embedded graph database)
- **Embeddings:** @xenova/transformers (all-MiniLM-L6-v2)
- **MCP:** @modelcontextprotocol/sdk
- **API:** Express.js
- **Dashboard:** React + TypeScript + Vite + React Flow

## Development

```bash
# Run tests
npm test

# Index GraphHub itself
npm run index -- ./src

# Start API server only
npm run serve-api
```

## Token Reduction

GraphHub dramatically reduces token consumption for codebase navigation:

| Traditional Approach | With GraphHub | Savings |
|---------------------|---------------|---------|
| Read 5 files to find a function | `semantic_search` query | ~80% |
| Grep + read to find callers | `get_context` | ~90% |
| Read entire files for impact | `impact_analysis` | ~85% |
| Re-explain context each session | `recall` past learnings | ~70% |

**How it works:** Instead of reading full file contents, Claude queries the knowledge graph for specific symbols and relationships. The report provides god nodes (high-traffic symbols) and clusters (module groupings) without reading code.

## Comparison with Similar Tools

| Feature | GraphHub | claude-mem | graphify | cognee |
|---------|----------|-----------|----------|--------|
| Code graph | Yes | No | Yes | Limited |
| Session memory | Yes | Yes | No | Yes |
| Always-on hooks | Yes | No | Yes | Yes |
| One-command install | Yes | Yes | Yes | No |
| 100% local | Yes | Yes | Yes | Optional |
| Semantic search | Yes | Yes | Yes | Yes |
| Impact analysis | Yes | No | Yes | No |

## Roadmap

- [x] Session memory (remember/recall/forget)
- [x] Always-on PreToolUse hooks
- [x] Graph report generation
- [x] One-command Claude Code install
- [ ] Worker thread indexing for large repos
- [ ] `.gitignore` support
- [ ] INHERITS and IMPLEMENTS edges for class hierarchies
- [ ] Native Python and Go Tree-sitter grammars
- [ ] ANN vector index for large-scale semantic search
- [ ] Community detection (Leiden algorithm)

## License

ISC

---

Built for AI agents that need to remember your codebase.
