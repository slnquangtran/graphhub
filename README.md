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

## Roadmap

- [ ] Worker thread indexing for large repos
- [ ] `.gitignore` support
- [ ] INHERITS and IMPLEMENTS edges for class hierarchies
- [ ] Native Python and Go Tree-sitter grammars
- [ ] ANN vector index for large-scale semantic search

## License

ISC

---

Built for AI agents that need to remember your codebase.
