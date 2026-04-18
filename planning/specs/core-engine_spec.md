# Spec: Core Ingestion Engine

## Goal
Parse a codebase and generate a structured knowledge graph in KuzuDB, suitable for symbol navigation, call-graph analysis, semantic search, and AI agent consumption.

## Functional Requirements

### 1. Repository Crawling ✅ Implemented
- Recursively traverse all source files in a given directory.
- Exclude `node_modules`, `.git`, `.graphhub` by default.
- Support both code files (parsed) and generic files (chunked fallback).

### 2. Language Support

| Language | Status | Method |
|---|---|---|
| TypeScript | ✅ Implemented | Tree-sitter AST |
| TSX | ✅ Implemented | Tree-sitter AST (tsx grammar) |
| JavaScript | ✅ Implemented | Tree-sitter AST |
| JSX | ✅ Implemented | Tree-sitter AST (javascript grammar) |
| Python | ⚠️ Partial | Fallback text chunker only |
| Go, Rust, Ruby, Java | ⚠️ Partial | Fallback text chunker only |
| Markdown, shell, text | ✅ Implemented | Fallback text chunker |

**Planned:** Add native Tree-sitter grammars for Python and Go.

### 3. Symbol Extraction ✅ Implemented

**Extracted symbol kinds:**
- `function` — function declarations and expressions
- `method` — class method definitions
- `class` — class declarations
- `interface` — TypeScript interface declarations
- `variable` — (planned; arrow functions assigned to `const` partially captured)
- `import` — import statements (used for cross-file edge resolution)

**Per-symbol metadata:**
- `name` — identifier text
- `kind` — symbol type (see above)
- `range` — `{ start: {row, column}, end: {row, column} }`
- `inputs` — parameter list from the function signature
- `outputs` — return type annotation, or `inferred_dynamic_type` / `void`
- `calls` — list of function/method names called within the body
- `doc` — leading JSDoc or `//` comments
- `technicalDebt` — TODO / FIXME / HACK / OPTIMIZE / XXX markers extracted from body and comments
- `status` — `'Done'` if no debt markers, `'Incomplete'` otherwise

### 4. Relationship Resolution ✅ Implemented

| Edge | How | Status |
|---|---|---|
| `CONTAINS` | File → Symbol (created during indexing) | ✅ |
| `IMPORTS` | File → File (resolved from `import` symbols) | ✅ |
| `CALLS` | Symbol → Symbol (resolved by matching `calls[]` list against symbol names in imported files, with heuristic fallback) | ✅ |
| `DESCRIBES` | Chunk → Symbol (linked during embedding creation) | ✅ |
| `INHERITS` | Class → Class (via `extends`) | ❌ Not yet |
| `IMPLEMENTS` | Class → Interface | ❌ Not yet |

### 5. Incremental Indexing ✅ Implemented

- SHA-256 hash of each file's content stored in `FileHash` node table.
- Files are skipped if their hash matches the stored value.
- Force re-index by passing `force=true` to `indexFile()` / `indexFileFallback()`.

### 6. Graph Persistence ✅ Implemented

KuzuDB schema:

```cypher
CREATE NODE TABLE File(path STRING, language STRING, PRIMARY KEY (path))
CREATE NODE TABLE Symbol(id STRING, name STRING, type STRING, kind STRING,
  range STRING, calls STRING[], import_source STRING, import_specifiers STRING[],
  PRIMARY KEY (id))
CREATE NODE TABLE Chunk(id STRING, text STRING, embedding FLOAT[384], PRIMARY KEY (id))
CREATE NODE TABLE FileHash(path STRING, hash STRING, PRIMARY KEY (path))

CREATE REL TABLE CONTAINS(FROM File TO Symbol)
CREATE REL TABLE CALLS(FROM Symbol TO Symbol)
CREATE REL TABLE IMPORTS(FROM File TO File, specifiers STRING[])
CREATE REL TABLE DESCRIBES(FROM Chunk TO Symbol)
```

## Non-Functional Requirements

| Requirement | Target | Status |
|---|---|---|
| Performance | < 5s for 100-file project | ✅ (sequential, ~1s/10 files) |
| Memory | < 500MB for medium projects | ✅ (KuzuDB embedded, low overhead) |
| Robustness | Graceful on syntax errors | ✅ (Tree-sitter is error-tolerant) |
| Incremental re-index | Skip unchanged files | ✅ Implemented |
| Concurrent indexing | Worker threads | ❌ Planned |
| `.gitignore` respect | Skip gitignored files | ✅ Implemented |

## Planned Enhancements

1. **Worker thread indexing** — offload file parsing to `worker_threads` to prevent blocking the event loop during large repo indexing.
2. ~~**`.gitignore` support**~~ ✅ **Implemented** — reads `.gitignore` from root directory and respects patterns during indexing.
3. **`INHERITS` and `IMPLEMENTS` edges** — extend `CodeParser` to extract `extends` and `implements` clauses from class declarations.
4. **Python/Go grammars** — add `tree-sitter-python` and `tree-sitter-go` for full AST symbol extraction.
5. **ANN vector index** — enable Kuzu's approximate nearest neighbor index on `Chunk.embedding` for large repos.
