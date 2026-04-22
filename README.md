<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=180&section=header&text=GraphHub&fontSize=72&fontColor=fff&animation=twinkling&fontAlignY=32&desc=Local-first%20code%20intelligence%20for%20AI%20agents&descAlignY=55&descSize=20" width="100%" />

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=18&duration=2500&pause=800&color=6C63FF&center=true&vCenter=true&multiline=false&width=600&lines=Transform+your+codebase+into+a+knowledge+graph;94%25+fewer+tokens+%E2%80%94+verified+on+real+code;One+command+installs+across+all+5+AI+agents;Persistent+memory+that+survives+session+restarts" alt="Typing SVG" />

<br/>

[![Version](https://img.shields.io/badge/version-1.4.0-6C63FF?style=for-the-badge&logo=git&logoColor=white)](https://github.com/slnquangtran/Graph-Hub/releases)
[![Stars](https://img.shields.io/github/stars/slnquangtran/Graph-Hub?style=for-the-badge&logo=github&color=ffd700&logoColor=white)](https://github.com/slnquangtran/Graph-Hub/stargazers)
[![License](https://img.shields.io/badge/license-ISC-22c55e?style=for-the-badge)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-compatible-9333ea?style=for-the-badge)](https://modelcontextprotocol.io/)
[![KuzuDB](https://img.shields.io/badge/KuzuDB-graph%20engine-f59e0b?style=for-the-badge)](https://kuzudb.com/)
[![Tests](https://img.shields.io/badge/tests-77%20passing-22c55e?style=for-the-badge&logo=vitest&logoColor=white)](https://github.com/slnquangtran/Graph-Hub)

<br/>

[ Quick Start](#-quick-start) · [ How It Works](#-how-it-works) · [ MCP Tools](#-mcp-tools) · [ Token Savings](#-token-savings) · [ Roadmap](#-roadmap)

</div>

---

## The Problem

AI coding assistants **lose context between sessions**. They re-read the same files, re-learn your codebase, and burn tokens on questions they've already answered.

<div align="center">

| Approach | Tokens Used | What Happens |
|:--------:|:-----------:|:------------:|
| Traditional | `9,216` | grep → read 5 files → hope for the best |
| **GraphHub** | **`507`** | `get_context("functionName")` → done ✓ |

**94% fewer tokens. Same answer. Every time.**

</div>

---

## ⚡ Quick Start

```bash
npm install graphhub
```

> One command. GraphHub auto-detects every AI agent on your machine and writes to their **global** configs — no per-project setup, ever.

<details>
<summary><b>All setup options</b></summary>

```bash
npx graphhub setup                                # auto-detect + install present clients
npx graphhub setup --force                        # install for all 5 clients regardless
npx graphhub setup --client claude-code,kilo-cli  # pick specific clients
npx graphhub setup --dry-run                      # preview what would be installed
npx graphhub setup --list                         # list all supported clients
npx graphhub uninstall-all                        # remove from all clients
```

</details>

<details>
<summary><b>Clone & run locally</b></summary>

```bash
git clone https://github.com/slnquangtran/Graph-Hub.git
cd Graph-Hub && npm install

npm run index -- /path/to/your/project
npm run setup -- /path/to/your/project
```

</details>

---

## 🧠 How It Works

```
  Your Source Code
        │
        ▼
  ┌─────────────────┐     ┌──────────────────┐
  │  Tree-sitter    │────▶│  KuzuDB Graph DB │
  │  AST Parser     │     │                  │
  │  TS · JS · PY   │     │  File ──CONTAINS─▶ Symbol
  └─────────────────┘     │  Symbol ──CALLS──▶ Symbol
        │                 │  File ──IMPORTS──▶ File
        ▼                 │  Symbol ──INHERITS▶ Symbol
  ┌─────────────────┐     └────────┬─────────┘
  │  Local Embeddings│             │
  │  (MiniLM-L6-v2) │      ┌──────▼──────────┐
  │  No API needed   │      │   MCP Server    │
  └─────────────────┘      │   REST API :9000 │
                            │   Dashboard :5173│
                            └─────────────────┘
```

<div align="center">

### Supported AI Agents

| Agent | Global Config | Status |
|:-----:|:-------------:|:------:|
| ![Claude](https://img.shields.io/badge/Claude_Code-D97706?style=flat-square&logo=anthropic&logoColor=white) | `~/.claude/settings.json` | ✅ Full support |
| ![OpenCode](https://img.shields.io/badge/OpenCode-0ea5e9?style=flat-square) | `~/.config/opencode/opencode.json` | ✅ Full support |
| ![Gemini](https://img.shields.io/badge/Gemini_CLI-4285F4?style=flat-square&logo=google&logoColor=white) | `~/.gemini/settings.json` | ✅ Full support |
| ![Antigravity](https://img.shields.io/badge/Antigravity-7c3aed?style=flat-square) | `~/.antigravity/mcp.json` | ✅ Full support |
| ![Kilo](https://img.shields.io/badge/Kilo_CLI-f43f5e?style=flat-square) | `~/.config/kilo/kilo.json` | ✅ Full support |

</div>

---

## 📊 Token Savings

> Real measurements on GraphHub's own codebase — not synthetic benchmarks.

<div align="center">

| Task | Without GraphHub | With GraphHub | Savings |
|:-----|:----------------:|:-------------:|:-------:|
| Find function callers | 9,216 | 507 | 🟢 **94%** |
| Impact analysis | 7,281 | 673 | 🟢 **91%** |
| List file symbols | 2,745 | 322 | 🟢 **88%** |
| Search code logic | 2,115 | 759 | 🟡 **64%** |
| Codebase overview | 2,381 | 1,389 | 🟡 **42%** |
| **Total** | **23,738** | **3,650** | 🚀 **85%** |

**Result: 5× more tasks in the same context window.**

</div>

---

## 🛠 MCP Tools

GraphHub registers **27 MCP tools** across 7 categories. Click each to expand.

<details>
<summary><b>🔍 Search & Discovery</b></summary>

```typescript
// Natural language → code
semantic_search({ query: "authentication validation", mode: "hybrid" })

// Exact or fuzzy symbol name
search_by_name({ name: "validateToken" })

// Results grouped by file
search_grouped({ query: "error handling middleware" })

// Cosine-similar symbols
find_similar({ name: "parseRequest", top_k: 5 })

// Explain which strategy was chosen
explain_search({ query: "jwt token refresh" })
```

</details>

<details>
<summary><b>🕸 Graph & Impact</b></summary>

```typescript
// Callers + callees of a symbol
get_context({ name: "validateToken" })

// Full blast radius before you edit
impact_analysis({ name: "handleRequest" })

// Callers/callees for many symbols at once
batch_context({ names: ["validateToken", "handleRequest", "parseBody"] })

// Symbols in git-changed files + risk buckets
changed_symbols({ diff: "staged" })

// Raw Cypher for power users
query_graph({ cypher: "MATCH (s:Symbol)-[:CALLS]->(t) RETURN s.name, t.name LIMIT 20" })

// All symbols in a file
get_file_symbols({ path: "src/services/auth/token.ts" })
```

</details>

<details>
<summary><b>🐛 One-Shot Debugging</b></summary>

```typescript
// RAG search + context + impact + next steps in one call
debug_trace({ query: "null pointer in auth middleware", top_k: 3 })
```

</details>

<details>
<summary><b>🧹 Code Health</b></summary>

```typescript
// Find functions/classes nobody calls — safe to delete?
find_dead_code({ kinds: ["function", "method"] })

// Find near-duplicate implementations (uses stored embeddings, no API cost)
find_duplicates({ name: "validateToken", min_similarity: 0.85, cross_file_only: true })

// Detect circular import chains and mutual-recursion call cycles
find_cycles({ type: "both", max_length: 3 })
```

</details>

<details>
<summary><b>🧠 Session Memory</b></summary>

```typescript
// Save a learning
remember({ content: "Auth uses JWT with 15m TTL", type: "learning", project: "myapp" })

// Retrieve by similarity
recall({ query: "how does auth work?" })

// Chronological view
timeline({ limit: 20, project: "myapp" })

// Update or delete
update_observation({ id: "abc-123", content: "Updated: now uses refresh tokens" })
forget({ project: "myapp", type: "learning" })

// Linked to specific symbols
related_observations({ symbol: "validateToken" })
```

</details>

<details>
<summary><b>🔁 Pattern Memory — Bug Fixes & Skills</b></summary>

```typescript
// Store a bug fix pattern
remember_bugfix({
  symptom: "TypeError: Cannot read property user of undefined",
  root_cause: "req.session was null on the /guest route",
  fix: "Added session guard at middleware entry",
})

// Recall by symptom similarity — even next week
recall_bugfix({ symptom: "undefined user property on guest route" })

// Cache which skill worked for a task
remember_skill_choice({
  task_description: "rename a function safely across the repo",
  skill_path: ".claude/skills/refactoring/SKILL.md",
  outcome: "success",
})

// Route future similar tasks to the same skill
recall_skill_choice({ task_description: "rename a symbol in multiple files" })
```

</details>

---

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### 🧩 Core Intelligence
- **Knowledge Graph** — functions, classes, imports, call chains stored in KuzuDB
- **Semantic Search** — natural language queries, no API costs (local MiniLM-L6-v2)
- **Impact Analysis** — see blast radius before editing, direct + indirect callers
- **Session Memory** — `remember` / `recall` / `forget` across sessions
- **Pattern Memory** — recall past bug fixes and skill choices by similarity
- **One-Shot Debug** — `debug_trace` chains search → context → impact in one call
- **Batch Context** — callers/callees for many symbols in one round trip

</td>
<td width="50%" valign="top">

### 🚀 Developer Experience
- **One Command** — `npm install graphhub` configures all detected agents globally
- **5 Agents** — Claude Code, OpenCode, Gemini CLI, Antigravity, Kilo CLI
- **Auto-Reindex** — PostToolUse hook keeps graph fresh after commits
- **Always-On** — PreToolUse hook reminds Claude about the graph before every search
- **Graph Report** — auto-generated `GRAPH_REPORT.md` with god nodes + clusters
- **100% Local** — all data stays in `.graphhub/`, no telemetry, no cloud
- **React Dashboard** — interactive call graph at `:5173`

</td>
</tr>
</table>

---

## 🌐 Language Support

| Language | Support | Parser |
|:--------:|:-------:|:------:|
| TypeScript / TSX | ✅ Full | Tree-sitter AST |
| JavaScript / JSX | ✅ Full | Tree-sitter AST |
| Python | ✅ Full | Tree-sitter AST |
| Go · Rust · Java | ⚡ Partial | Text chunker |
| Markdown · Shell | ✅ Full | Text chunker |

---

## ⚙️ Configuration

<details>
<summary><b>Global install (recommended)</b></summary>

```bash
npx graphhub setup
```

Auto-detects and writes to each agent's **global** config — no per-project setup needed.

| Client | Global Config File |
|--------|-------------------|
| Claude Code | `~/.claude/settings.json` |
| OpenCode | `~/.config/opencode/opencode.json` |
| Gemini CLI | `~/.gemini/settings.json` |
| Antigravity | `~/.antigravity/mcp.json` |
| Kilo CLI | `~/.config/kilo/kilo.json` |

Existing keys are preserved — only the `graphhub` entry is added or updated. Use `--force` to install for agents that aren't yet present. A `postinstall` hook runs automatically after `npm install graphhub`; opt out with `GRAPHHUB_NO_INSTALL=1`, `CI=1`, or `npm_config_global=true`.

</details>

<details>
<summary><b>Claude Code hooks + CLAUDE.md (legacy)</b></summary>

```bash
npm run install-claude
```

Adds PreToolUse/PostToolUse hooks and updates `CLAUDE.md`. The `setup` command above covers MCP config only.

</details>

<details>
<summary><b>Manual JSON config</b></summary>

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

</details>

---

## 📋 Commands

| Command | Description |
|---------|-------------|
| `npm run index -- <dir>` | Index a directory into the knowledge graph |
| `npm run serve` | Start MCP server (stdio) |
| `npm run serve-api` | Start REST API on port 9000 |
| `npm run dashboard` | Start API + React dashboard |
| `npm run report` | Generate `GRAPH_REPORT.md` |
| `npm run visualize` | Export graph to Mermaid format |
| `npm run setup` | Configure all supported MCP clients |
| `npm run uninstall-all` | Remove GraphHub from all clients |
| `npm run install-claude` | Configure Claude Code hooks + CLAUDE.md (legacy) |
| `npm test` | Run 77-test suite |

---

## 🏗 Tech Stack

<div align="center">

| Component | Technology |
|:---------:|:----------:|
| Parser | `web-tree-sitter` (WASM) |
| Database | `KuzuDB` (embedded graph) |
| Embeddings | `@xenova/transformers` · all-MiniLM-L6-v2 |
| MCP | `@modelcontextprotocol/sdk` |
| API | `Express.js` |
| Dashboard | `React + Vite + React Flow` |
| Tests | `Vitest` · 77 tests |

</div>

---

## 🗺 Roadmap

<details>
<summary><b>Completed ✅</b></summary>

- [x] Session memory (remember / recall / forget)
- [x] Always-on PreToolUse hooks
- [x] PostToolUse auto-reindex
- [x] Graph report generation
- [x] Verified 85% token reduction
- [x] Class hierarchy edges (INHERITS, IMPLEMENTS)
- [x] One-shot `debug_trace` and bulk `batch_context`
- [x] Pattern memory for bug fixes and skill routing
- [x] One-command multi-client setup (Claude Code, OpenCode, Gemini CLI, Antigravity, Kilo CLI)
- [x] Global install — writes to home-dir configs so all projects benefit without per-project setup
- [x] `.gitignore` support (cross-platform, including Windows path normalization)
- [x] Proper database lifecycle — `close()` releases the file lock on MCP server, watch mode, and CLI exit

</details>

**Coming next:**
- [x] Dead code detection (`find_dead_code`)
- [x] Duplicate function detection (`find_duplicates`)
- [x] Circular dependency / call cycle detection (`find_cycles`)
- [ ] Worker thread indexing for large repos
- [ ] Native Go / Rust / Java Tree-sitter grammars
- [ ] Community detection (Leiden algorithm)

---

## 📜 Changelog

<details>
<summary><b>v1.4.0 — Code Health Tools</b></summary>

- **`find_dead_code`** — Find functions, methods, and classes with zero callers. Common entry-point patterns (`main`, `init`, `onX`, `handleX`…) are filtered automatically; pass `include_entry_points: true` to see everything.
- **`find_duplicates`** — Find near-duplicate implementations of any symbol using stored cosine embeddings. No API cost — works offline. Supports `min_similarity` threshold and `cross_file_only` filter.
- **`find_cycles`** — Detect circular import chains and mutual-recursion call cycles up to length 3. Reports each cycle as an ordered list of file paths (import) or symbol names (call).
- **14 new tests** — Full coverage of entry-point filtering, cycle detection, similarity threshold, and cross-file filtering.

</details>

<details>
<summary><b>v1.3.1 — Global Install + Kilo CLI</b></summary>

- **Global install** — All adapters now write to home-dir global configs (`~/.claude/`, `~/.gemini/`, etc.) so one `npx graphhub setup --force` covers every project without per-project setup
- **Kilo CLI support** — New adapter for Kilo CLI (`~/.config/kilo/kilo.json`)
- **`graphhubDir` fix** — `npx graphhub setup` now correctly resolves the package location from `import.meta.url` instead of `process.cwd()` (which pointed to the user's project, causing broken MCP server paths)
- **Gemini CLI fix** — Was writing to `<project>/.gemini/` instead of `~/.gemini/`; fixed to use home dir
- **Windows path fix** — MCP server entry paths now always use forward slashes in JSON configs

</details>

<details>
<summary><b>v1.3.0 — Stability & Python</b></summary>

- **DB lifecycle fix** — MCP server, watch mode, and all CLI commands now properly release the KuzuDB file lock on exit
- **`.gitignore` support** — cross-platform path normalization (fixes Windows `\` vs `/` mismatch)
- **Python parser** — upgraded to full Tree-sitter AST extraction (functions, classes, calls, inheritance)
- **Import alias resolution** — `import { foo as bar }` now stores `foo` as the specifier, fixing cross-file call graph edges
- **Fuzzy symbol search** — case-insensitive (`toLower(s.name) CONTAINS query`)
- **`forget()` safety** — requires at least one filter; no longer silently deletes all observations
- **MCP `get_file_symbols`** — fixed: was returning an empty object (raw DB cursor)
- **Error resilience** — per-file parse errors no longer abort the entire indexing run
- **BigInt coercion** — KuzuDB `count()` results coerced to `Number`; `JSON.stringify` no longer throws on stats

</details>

---

## 🤝 Contributing

Contributions are welcome! Feel free to open an issue or submit a PR.

```bash
git clone https://github.com/slnquangtran/Graph-Hub.git
cd Graph-Hub && npm install

npm test                    # run 77 tests
npm run index -- ./src      # index GraphHub itself
```

---

## 🔒 Privacy

| | |
|--|--|
| **100% Local** | All data stays in `.graphhub/` in your project — nothing leaves your machine |
| **No External APIs** | Embeddings are generated locally with `@xenova/transformers` |
| **No Telemetry** | Zero network calls during indexing or querying |

---

## 📄 License

[ISC](LICENSE) © 2024

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=100&section=footer" width="100%" />

**If GraphHub saves you tokens, a ⭐ star helps others find it.**

[![Star on GitHub](https://img.shields.io/badge/⭐%20Star%20on%20GitHub-6C63FF?style=for-the-badge&logo=github&logoColor=white)](https://github.com/slnquangtran/Graph-Hub)

[Report Bug](https://github.com/slnquangtran/Graph-Hub/issues) · [Request Feature](https://github.com/slnquangtran/Graph-Hub/issues) · [Discussions](https://github.com/slnquangtran/Graph-Hub/discussions)

</div>
