# GraphHub Workspace

## Project
**GraphHub** — local-first code intelligence platform. Parses codebases into interactive knowledge graphs for developers and AI agents.

## Quick Start

```bash
# 1. Install dependencies
npm install
cd dashboard && npm install && cd ..

# 2. Index a codebase
npm run index -- /path/to/your/project

# 3. Start the full stack (API + dashboard)
npm run dashboard
# Open http://localhost:5173

# 4. Or use as an MCP server (add to Claude Code settings)
npm run serve
```

## Project Layout

```
graphhub/
├── src/                    Backend engine (Node.js + TypeScript)
│   ├── index.ts            CLI entry: index | serve | serve-api | visualize
│   ├── services/
│   │   ├── ingestion/      Tree-sitter parsing + indexing pipeline
│   │   ├── db/             KuzuDB graph client + Mermaid exporter
│   │   ├── ai/             Local embeddings (MiniLM) + RAG search
│   │   ├── api/            Express REST API (port 9000)
│   │   └── mcp/            MCP server (stdio)
│   └── tests/              Vitest test suites
├── dashboard/              React + TypeScript + Vite frontend
│   └── src/pages/
│       ├── Home.tsx         Workspace manager + index trigger
│       └── Explorer.tsx     Interactive graph + semantic search
├── planning/               Architecture, specs, ADRs
├── docs/                   User and API documentation
├── ops/                    Operational runbooks
├── .graphhub/              Local KuzuDB data (git-ignored)
└── graph.mermaid           Last exported graph snapshot
```

## Key Decisions
- **KuzuDB** for embedded graph storage (no server required)
- **Tree-sitter** (WASM) for language-agnostic AST parsing
- **@xenova/transformers** for 100% local embeddings (no OpenAI key needed)
- **MCP** for AI agent integration (Claude Code, Cursor, etc.)

See `planning/decisions/` for full ADRs.
