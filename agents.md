# Identity
You are helping Quang build GraphHub — a local-first code intelligence platform that parses codebases into interactive knowledge graphs.

## What GraphHub Does
1. **Indexes** a source directory → extracts symbols (functions, classes, methods, interfaces) via Tree-sitter
2. **Stores** the symbol graph in KuzuDB (`.graphhub/db`)
3. **Embeds** doc comments locally via `Xenova/all-MiniLM-L6-v2` (no external API)
4. **Serves** the graph via REST API (port 9000) and MCP stdio server
5. **Visualizes** it in a React dashboard at port 5173

## Architecture at a Glance

```
src/services/
  ingestion/   ← parsing + orchestration (CodeParser, IngestionService)
  db/          ← KuzuDB wrapper + Mermaid exporter (GraphClient, GraphExporter)
  ai/          ← local embeddings + RAG (EmbeddingService, RAGService)
  api/         ← Express REST API :9000 (GraphHubAPIServer)
  mcp/         ← MCP stdio server — 5 tools (GraphHubMCPServer)
dashboard/     ← React + React Flow frontend :5173
```

## Folder Structure
- `/planning` — Specs, architecture decisions (ADRs)
- `/src` — Backend engine and servers
- `/dashboard` — React frontend
- `/docs` — User and API documentation
- `/ops` — Operational runbooks

## Routing
| Task | Go to | Read first |
|------|-------|------------|
| Spec a new feature | `/planning/specs/` | `planning/context.md` |
| Write backend code | `/src/` | `src/context.md` |
| Write frontend code | `/dashboard/src/` | `dashboard/README.md` |
| Write docs | `/docs/` | `docs/context.md` |
| Deploy or debug | `/ops/` | `ops/context.md` |

## Naming Conventions
- Specs: `feature-name_spec.md`
- React components: `PascalCase.tsx`
- Tests: `feature-name.test.ts`
- Decision records: `YYYY-MM-DD-decision-title.md`

## Critical Rules
- **Never call `new GraphClient()`** — always use `GraphClient.getInstance()`.
- **Always call `IngestionService.initialize()` before any indexing** — it boots the parser, DB schema, and embedding model.
- **KuzuDB is single-writer** — do not run indexing and `serve-api` against the same `.graphhub/db` simultaneously.
- **No `any` types** — use `SymbolDefinition`, `SearchResult`, and properly typed Kuzu rows.
- **Incremental indexing is on** — files are skipped if their SHA-256 hash hasn't changed. Use `force=true` to override.
- **Spec before feature** — for non-trivial work, update or create a file in `planning/specs/` first.

## MCP Tools Available (when GraphHub serves another repo)
| Tool | Input | Use When |
|---|---|---|
| `query_graph` | `{ cypher }` | Custom graph traversals |
| `get_file_symbols` | `{ path }` | List symbols in a specific file |
| `semantic_search` | `{ query, limit? }` | Find code by description |
| `get_context` | `{ name }` | Callers + callees of a symbol |
| `impact_analysis` | `{ name }` | What breaks if you change this symbol |

## Common Commands
```bash
npm run index -- <dir>    # Index a codebase
npm run docs              # Generate purpose/strategy for all functions (heuristic)
npm run docs -- openai    # Generate docs using OpenAI (needs OPENAI_API_KEY)
npm run docs -- ollama    # Generate docs using local Ollama
npm run dashboard         # Start API + React dashboard
npm run serve             # Start MCP server (stdio)
npm run visualize         # Export graph.mermaid
npm test                  # Run vitest
```

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **graphhub** (336 symbols, 777 relationships, 26 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/graphhub/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/graphhub/context` | Codebase overview, check index freshness |
| `gitnexus://repo/graphhub/clusters` | All functional areas |
| `gitnexus://repo/graphhub/processes` | All execution flows |
| `gitnexus://repo/graphhub/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
