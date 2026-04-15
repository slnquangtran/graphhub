# GraphHub Dashboard

The React + TypeScript frontend for GraphHub. Provides an interactive graph explorer and semantic search interface over an indexed codebase.

## Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Graph rendering | React Flow + Dagre (auto-layout) |
| Routing | React Router DOM |
| Icons | Lucide React |

## Pages

### `/` — Home
Entry point for the application. Allows you to:
- Submit an absolute directory path to trigger live indexing via the API
- View previously indexed workspaces and navigate directly to their graph

### `/explorer?workspace=<path>` — Explorer
The main visualization view. Features:
- **Interactive graph** — Nodes represent `File`, `Symbol` (function / class / method / variable / interface). Edges show `CALLS` (green, animated), `IMPORTS` (blue), and `CONTAINS` (amber).
- **Dagre layout** — Automatic top-down or left-right hierarchical layout.
- **Minimap + controls** — Pan, zoom, fit-to-view.
- **Semantic search** — Natural language query highlights matching nodes using cosine similarity RAG.
- **Node detail panel** — Click any node to see its type, file path, documentation, and outbound calls.

## Running

```bash
# From project root — starts API server + Vite dev server concurrently
npm run dashboard

# Or start only the frontend (requires API already running on :9000)
cd dashboard
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies data from the API at `http://localhost:9000`.

## API Endpoints Used

| Endpoint | Description |
|---|---|
| `GET /api/workspaces` | List previously indexed workspace roots |
| `POST /api/index` | Trigger indexing for a given `targetDir` |
| `GET /api/graph?workspace=<path>` | Fetch nodes and edges for the graph view |
| `POST /api/search` | Semantic search (RAG); returns ranked symbol matches |
| `GET /api/symbol/:name` | Detailed symbol info: inputs, outputs, callers, callees, technical debt |

## Node Types & Colors

| Type | Color |
|---|---|
| `File` | Blue border |
| `Symbol` (function) | Green |
| `Symbol` (class) | Purple |
| `Symbol` (method) | Teal |
| `Symbol` (interface) | Light blue |

## Building for Production

```bash
cd dashboard
npm run build
# Output in dashboard/dist/
```
