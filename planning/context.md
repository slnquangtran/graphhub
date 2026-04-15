# Planning Context: GraphHub

## Project Summary
GraphHub is a local-first code intelligence platform. It parses a codebase using Tree-sitter, stores the resulting symbol and call graph in KuzuDB, exposes it via a REST API and MCP server, and visualizes it in a React dashboard. The goal is to help developers and AI agents understand any codebase through an interactive knowledge graph.

## Current Status (2026-04-15)
The core engine, API, MCP server, and dashboard are functionally complete. Incremental indexing, improved Mermaid export, and the `get_context` / `impact_analysis` MCP tools are implemented. Remaining gaps are tracked in the spec files.

## What Good Looks Like
- **Spec before feature**: Non-trivial features have a corresponding file in `specs/` describing requirements and implementation status.
- **ADR for decisions**: Significant technical trade-offs are recorded in `decisions/` in ADR format with Status (Proposed → Accepted → Superseded).
- **Architecture stays current**: `architecture/system-overview.md` reflects the actual implemented system, not just aspirational design.

## What to Avoid
- Starting development on complex features (new language parsers, ANN search, worker threads) without updating the relevant spec first.
- Combining visualization logic with data processing — keep `src/services/` isolated from `dashboard/`.
- Stale planning docs — update context files when the project pivots.

## Planning Structure

| Directory | Purpose |
|---|---|
| `specs/` | Functional requirements and implementation status per feature area |
| `architecture/` | System design: data flows, component boundaries, schema |
| `decisions/` | ADRs for major technology and design choices |

## Key Open Work

| Item | Priority | Spec |
|---|---|---|
| `.gitignore` support in crawler | Medium | `specs/core-engine_spec.md` |
| `INHERITS` / `IMPLEMENTS` edges | Medium | `specs/core-engine_spec.md` |
| Worker thread indexing | Low | `specs/core-engine_spec.md` |
| Python / Go Tree-sitter grammars | Low | `specs/core-engine_spec.md` |
| ANN vector index for large repos | Low | `specs/core-engine_spec.md` |
