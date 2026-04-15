# Documentation Context: GraphHub Docs

## Purpose
Centralized documentation for GraphHub — a local-first code intelligence platform that parses codebases into interactive knowledge graphs.

## What Lives Here
- **`/api`** — API reference for the REST API (`/api/graph`, `/api/search`, `/api/symbol/:name`, etc.) and MCP tools (`query_graph`, `get_file_symbols`, `semantic_search`, `get_context`, `impact_analysis`).
- **`/guides`** — User-facing walkthroughs: Getting Started, Indexing a Codebase, Using the Explorer, MCP Integration.
- **`/changelog`** — Version history linking features to releases.

## What Good Looks Like
- **Accurate**: Docs reflect the current implementation. When a feature is added or changed, the relevant doc is updated in the same commit.
- **Outcome-oriented**: Guides are written from the user's perspective ("How do I index a Python project?"), not from the code's perspective.
- **No duplication**: Link to `planning/specs/` and `planning/architecture/` rather than restating design decisions here.

## What to Avoid
- Documenting planned features as if they are implemented.
- Repeating the schema definition that already lives in `planning/specs/core-engine_spec.md`.
- Stale API signatures — always verify against `src/services/api/server.ts` and `src/services/mcp/server.ts`.

## Key Source Files Docs Should Track

| Doc | Source of truth |
|---|---|
| REST API reference | `src/services/api/server.ts` |
| MCP tool reference | `src/services/mcp/server.ts` |
| Graph schema | `src/services/db/graph-client.ts` |
| Parser capabilities | `src/services/ingestion/parser.ts` |
| Dashboard UI | `dashboard/README.md` |
