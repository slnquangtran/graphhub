# Operations Context: GraphHub

## Runtime Architecture
GraphHub runs as two local processes:

| Process | Command | Port | Purpose |
|---|---|---|---|
| API server | `npm run serve-api` | 9000 | REST API for the dashboard and indexing |
| Dashboard | `cd dashboard && npm run dev` | 5173 | React UI (Vite dev server) |
| MCP server | `npm run serve` | stdio | AI agent integration (Claude Code, Cursor) |

Both the API server and CLI indexer share the same `.graphhub/db` KuzuDB database. **Do not run indexing and the API server concurrently** — KuzuDB does not support multiple writers.

## Starting Everything

```bash
# Start API + Dashboard together
npm run dashboard

# Index a codebase first (one-time or after major changes)
npm run index -- <absolute-path-to-dir>

# Generate a Mermaid graph snapshot
npm run visualize
```

## Data Storage

| Path | Contents |
|---|---|
| `.graphhub/db` | KuzuDB graph database (File, Symbol, Chunk, FileHash nodes + edges) |
| `.graphhub/db.wal` | KuzuDB write-ahead log |
| `graph.mermaid` | Last exported Mermaid snapshot |

To reset the graph (full re-index):
```bash
rm -rf .graphhub/
npm run index -- <dir>
```

## MCP Server Setup (Claude Code)

Add to `.claude/settings.json` or project MCP config:
```json
{
  "mcpServers": {
    "graphhub": {
      "command": "npx",
      "args": ["tsx", "src/index.ts", "serve"],
      "cwd": "<absolute-path-to-graphhub>"
    }
  }
}
```

## Environment
No environment variables or secrets are required. GraphHub is fully local with no external API calls.

## What Good Looks Like
- The API server is always started before the dashboard.
- Indexing is run after pulling significant code changes.
- `.graphhub/` is in `.gitignore` — it is a local artifact, not committed.

## What to Avoid
- Running two processes that both call `GraphClient.getInstance()` pointing at the same `.graphhub/db` simultaneously.
- Committing `.graphhub/` to version control.
- Hardcoded absolute paths in scripts — use `process.cwd()` or `path.resolve()`.
