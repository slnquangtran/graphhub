import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GraphClient } from "../db/graph-client.ts";
import { RAGService, SearchMode } from "../ai/rag-service.ts";
import { ObservationService, ObservationType, ImportanceLevel } from "../memory/observation-service.ts";
import { DebugTraceService } from "../debug/trace-service.ts";
import { BatchContextService } from "../debug/batch-context-service.ts";

const OBSERVATION_TYPES = ['learning', 'decision', 'finding', 'context', 'bugfix', 'feature', 'refactor', 'discovery', 'change', 'warning', 'todo'];
const IMPORTANCE_LEVELS = ['low', 'medium', 'high', 'critical'];

export class GraphHubMCPServer {
  private server: Server;
  private db: GraphClient;
  private rag: RAGService;
  private observations: ObservationService;
  private debug: DebugTraceService;
  private batchContext: BatchContextService;

  constructor() {
    this.db = GraphClient.getInstance();
    this.rag = RAGService.getInstance();
    this.observations = ObservationService.getInstance();
    this.debug = DebugTraceService.getInstance();
    this.batchContext = BatchContextService.getInstance();
    this.server = new Server(
      {
        name: "graphhub",
        version: "1.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupTools();
  }

  private setupTools() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // === Code Graph Tools ===
        {
          name: "query_graph",
          description: "Run a direct Cypher query against the codebase graph database. Use this to find complex relationships.",
          inputSchema: {
            type: "object",
            properties: {
              cypher: { type: "string", description: "The Cypher query to execute" },
            },
            required: ["cypher"],
          },
        },
        {
          name: "get_file_symbols",
          description: "Retrieve all symbols (classes, functions, etc.) defined in a specific file.",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string", description: "The absolute path to the file" },
            },
            required: ["path"],
          },
        },
        {
          name: "semantic_search",
          description: "Search for code using natural language. Supports semantic (meaning-based), keyword, or hybrid search modes.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "The description of the logic to search for" },
              limit: { type: "number", description: "Maximum number of results to return (default 10)" },
              mode: {
                type: "string",
                enum: ["semantic", "keyword", "hybrid"],
                description: "Search mode: 'semantic' (meaning-based), 'keyword' (text matching), 'hybrid' (both combined, default)"
              },
              minScore: { type: "number", description: "Minimum relevance score threshold (0-1, default 0.1)" },
              includeContext: { type: "boolean", description: "Include callers/callees in results (default false)" },
              symbolKinds: {
                type: "array",
                items: { type: "string" },
                description: "Filter by symbol kinds (e.g., ['function', 'class', 'method'])"
              },
            },
            required: ["query"],
          },
        },
        {
          name: "search_by_name",
          description: "Search for symbols by their name. Supports exact or fuzzy matching.",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Symbol name to search for" },
              fuzzy: { type: "boolean", description: "Enable fuzzy matching (default false)" },
            },
            required: ["name"],
          },
        },
        {
          name: "search_grouped",
          description: "Search for code and group results by file. Useful for understanding which files are most relevant.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "The search query" },
              limit: { type: "number", description: "Maximum number of results (default 10)" },
              mode: {
                type: "string",
                enum: ["semantic", "keyword", "hybrid"],
                description: "Search mode (default 'hybrid')"
              },
            },
            required: ["query"],
          },
        },
        {
          name: "find_similar",
          description: "Find symbols that are semantically similar to a given symbol. Useful for finding related code.",
          inputSchema: {
            type: "object",
            properties: {
              symbolName: { type: "string", description: "The symbol name to find similar symbols for" },
              limit: { type: "number", description: "Maximum number of results (default 5)" },
            },
            required: ["symbolName"],
          },
        },
        {
          name: "explain_search",
          description: "Explain how a search query will be processed. Shows tokenization and search strategy.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "The search query to explain" },
            },
            required: ["query"],
          },
        },
        {
          name: "get_context",
          description: "Get all callers and callees of a symbol by name. Shows the full call graph context around a function or class.",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "The symbol name to look up (function, class, or method)" },
            },
            required: ["name"],
          },
        },
        {
          name: "impact_analysis",
          description: "Analyze all symbols that directly call or import a given symbol. Shows what would break if the symbol changes.",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "The symbol name to analyze" },
            },
            required: ["name"],
          },
        },

        // === Enhanced Memory Tools ===
        {
          name: "remember",
          description: "Save a learning, decision, finding, or other observation to persistent memory. Searchable via recall with semantic similarity.",
          inputSchema: {
            type: "object",
            properties: {
              content: { type: "string", description: "The content to remember" },
              type: {
                type: "string",
                enum: OBSERVATION_TYPES,
                description: "Type of observation: learning, decision, finding, context, bugfix, feature, refactor, discovery, change, warning, todo"
              },
              title: { type: "string", description: "Short title/summary (auto-generated if not provided)" },
              project: { type: "string", description: "Project name for filtering (default: 'default')" },
              importance: {
                type: "string",
                enum: IMPORTANCE_LEVELS,
                description: "Importance level: low, medium, high, critical (default: medium)"
              },
              session_id: { type: "string", description: "Session identifier for grouping" },
              related_symbols: {
                type: "array",
                items: { type: "string" },
                description: "Symbol names this observation relates to"
              },
              file_paths: {
                type: "array",
                items: { type: "string" },
                description: "File paths this observation relates to"
              },
              tags: {
                type: "array",
                items: { type: "string" },
                description: "Tags for categorization"
              },
            },
            required: ["content"],
          },
        },
        {
          name: "recall",
          description: "Search memory for past observations using natural language. Returns results ranked by semantic similarity.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Natural language query to search memories" },
              project: { type: "string", description: "Filter by project name" },
              type: {
                type: "string",
                enum: OBSERVATION_TYPES,
                description: "Filter by single observation type"
              },
              types: {
                type: "array",
                items: { type: "string", enum: OBSERVATION_TYPES },
                description: "Filter by multiple observation types"
              },
              importance: {
                type: "string",
                enum: IMPORTANCE_LEVELS,
                description: "Filter by importance level"
              },
              tags: {
                type: "array",
                items: { type: "string" },
                description: "Filter by tags (matches if any tag matches)"
              },
              session_id: { type: "string", description: "Filter to a specific session" },
              dateStart: { type: "string", description: "Filter observations after this ISO timestamp" },
              dateEnd: { type: "string", description: "Filter observations before this ISO timestamp" },
              limit: { type: "number", description: "Maximum results to return (default: 10)" },
            },
            required: ["query"],
          },
        },
        {
          name: "timeline",
          description: "View observations chronologically. Useful for reviewing what happened during a session or project.",
          inputSchema: {
            type: "object",
            properties: {
              project: { type: "string", description: "Filter by project name" },
              types: {
                type: "array",
                items: { type: "string", enum: OBSERVATION_TYPES },
                description: "Filter by observation types"
              },
              dateStart: { type: "string", description: "Start of time range (ISO timestamp)" },
              dateEnd: { type: "string", description: "End of time range (ISO timestamp)" },
              limit: { type: "number", description: "Maximum entries to return (default: 50)" },
              orderBy: {
                type: "string",
                enum: ["asc", "desc"],
                description: "Sort order by timestamp (default: desc = newest first)"
              },
            },
          },
        },
        {
          name: "memory_stats",
          description: "Get statistics about stored observations: totals, counts by type, by project, by importance.",
          inputSchema: {
            type: "object",
            properties: {
              project: { type: "string", description: "Filter stats to a specific project" },
            },
          },
        },
        {
          name: "get_observation",
          description: "Get a specific observation by its ID.",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string", description: "The observation ID" },
            },
            required: ["id"],
          },
        },
        {
          name: "update_observation",
          description: "Update an existing observation's content, title, importance, or tags.",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string", description: "The observation ID to update" },
              content: { type: "string", description: "New content (will regenerate embedding)" },
              title: { type: "string", description: "New title" },
              importance: {
                type: "string",
                enum: IMPORTANCE_LEVELS,
                description: "New importance level"
              },
              tags: {
                type: "array",
                items: { type: "string" },
                description: "New tags (replaces existing)"
              },
              file_paths: {
                type: "array",
                items: { type: "string" },
                description: "New file paths (replaces existing)"
              },
            },
            required: ["id"],
          },
        },
        {
          name: "forget",
          description: "Delete observations from memory. Can delete by ID, session, project, type, or date.",
          inputSchema: {
            type: "object",
            properties: {
              observation_id: { type: "string", description: "Specific observation ID to delete" },
              session_id: { type: "string", description: "Delete all observations from a session" },
              project: { type: "string", description: "Delete all observations from a project" },
              type: {
                type: "string",
                enum: OBSERVATION_TYPES,
                description: "Delete all observations of this type"
              },
              before: { type: "string", description: "Delete observations before this ISO timestamp" },
            },
          },
        },
        {
          name: "related_observations",
          description: "Get all observations that are linked to a specific code symbol.",
          inputSchema: {
            type: "object",
            properties: {
              symbol_name: { type: "string", description: "The symbol name to find related observations for" },
              limit: { type: "number", description: "Maximum results (default: 10)" },
            },
            required: ["symbol_name"],
          },
        },
        {
          name: "debug_trace",
          description: "One-shot debugging entry point. Given a bug description or error message, returns ranked candidate symbols enriched with callers, callees, and impact risk. Replaces the semantic_search → get_context → impact_analysis chain with a single call to save tokens.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Natural-language bug description, error message, or symptom" },
              top_k: { type: "number", description: "How many candidate symbols to investigate (default: 3)" },
              snippet_chars: { type: "number", description: "Max characters of code snippet per candidate (default: 200)" },
            },
            required: ["query"],
          },
        },
        {
          name: "batch_context",
          description: "Get definition + caller/callee counts for multiple symbols in one call. Replaces N get_context calls when an agent needs to look up several symbols at once. Default compact mode returns only counts; pass compact=false for full neighbor lists.",
          inputSchema: {
            type: "object",
            properties: {
              names: { type: "array", items: { type: "string" }, description: "List of symbol names to look up" },
              compact: { type: "boolean", description: "If true (default), return only callers_count/callees_count. If false, include full neighbor arrays." },
              max_neighbors: { type: "number", description: "Cap neighbors per entry when compact=false (default: 10)" },
            },
            required: ["names"],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // === Code Graph Tools ===
          case "query_graph": {
            const result = await this.db.runCypher(args?.cypher as string);
            const rows = await result.getAll();
            return {
              content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
            };
          }
          case "get_file_symbols": {
            const result = await this.db.runCypher(
              "MATCH (f:File {path: $path})-[:CONTAINS]->(s:Symbol) RETURN s.name, s.kind, s.range",
              { path: args?.path as string }
            );
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }
          case "semantic_search": {
            const result = await this.rag.advancedSearch(args?.query as string, {
              limit: args?.limit as number,
              mode: args?.mode as SearchMode,
              minScore: args?.minScore as number,
              includeContext: args?.includeContext as boolean,
              symbolKinds: args?.symbolKinds as string[],
            });
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }
          case "search_by_name": {
            const result = await this.rag.searchBySymbolName(
              args?.name as string,
              args?.fuzzy as boolean
            );
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }
          case "search_grouped": {
            const result = await this.rag.searchGroupedByFile(args?.query as string, {
              limit: args?.limit as number,
              mode: args?.mode as SearchMode,
            });
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }
          case "find_similar": {
            const result = await this.rag.findSimilarSymbols(
              args?.symbolName as string,
              args?.limit as number
            );
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }
          case "explain_search": {
            const result = await this.rag.explainSearch(args?.query as string);
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }
          case "get_context": {
            const symbolName = args?.name as string;
            const calleesResult = await this.db.runCypher(
              'MATCH (s:Symbol {name: $name})-[:CALLS]->(callee:Symbol) RETURN callee.name as name, callee.kind as kind',
              { name: symbolName }
            );
            const callersResult = await this.db.runCypher(
              'MATCH (caller:Symbol)-[:CALLS]->(s:Symbol {name: $name}) RETURN caller.name as name, caller.kind as kind',
              { name: symbolName }
            );
            const fileResult = await this.db.runCypher(
              'MATCH (f:File)-[:CONTAINS]->(s:Symbol {name: $name}) RETURN f.path as path, s.kind as kind, s.range as range',
              { name: symbolName }
            );
            const callees = await calleesResult.getAll();
            const callers = await callersResult.getAll();
            const fileInfo = await fileResult.getAll();
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ symbol: symbolName, definedIn: fileInfo, callers, callees }, null, 2)
              }],
            };
          }
          case "impact_analysis": {
            const symbolName = args?.name as string;
            const d1Result = await this.db.runCypher(
              'MATCH (caller:Symbol)-[:CALLS]->(s:Symbol {name: $name}) RETURN caller.name as name, caller.kind as kind',
              { name: symbolName }
            );
            const d1 = await d1Result.getAll();
            const d2 = [];
            for (const caller of d1) {
              const d2Result = await this.db.runCypher(
                'MATCH (grandCaller:Symbol)-[:CALLS]->(c:Symbol {name: $name}) RETURN grandCaller.name as name, grandCaller.kind as kind',
                { name: caller.name }
              );
              d2.push(...(await d2Result.getAll()));
            }
            const uniqueD2 = d2.filter((s, i, arr) => arr.findIndex(x => x.name === s.name) === i);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  target: symbolName,
                  risk: d1.length === 0 ? 'LOW' : d1.length <= 3 ? 'MEDIUM' : 'HIGH',
                  direct_callers: d1,
                  indirect_callers: uniqueD2
                }, null, 2)
              }],
            };
          }

          // === Enhanced Memory Tools ===
          case "remember": {
            const id = await this.observations.remember(args?.content as string, {
              type: args?.type as ObservationType,
              title: args?.title as string,
              project: args?.project as string,
              importance: args?.importance as ImportanceLevel,
              session_id: args?.session_id as string,
              related_symbols: args?.related_symbols as string[],
              file_paths: args?.file_paths as string[],
              tags: args?.tags as string[],
            });
            return {
              content: [{ type: "text", text: JSON.stringify({ success: true, observation_id: id }, null, 2) }],
            };
          }
          case "recall": {
            const results = await this.observations.recall(args?.query as string, {
              project: args?.project as string,
              type: args?.type as ObservationType,
              types: args?.types as ObservationType[],
              importance: args?.importance as ImportanceLevel,
              tags: args?.tags as string[],
              session_id: args?.session_id as string,
              dateStart: args?.dateStart as string,
              dateEnd: args?.dateEnd as string,
              limit: args?.limit as number,
            });
            return {
              content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
            };
          }
          case "timeline": {
            const entries = await this.observations.timeline({
              project: args?.project as string,
              types: args?.types as ObservationType[],
              dateStart: args?.dateStart as string,
              dateEnd: args?.dateEnd as string,
              limit: args?.limit as number,
              orderBy: args?.orderBy as 'asc' | 'desc',
            });
            return {
              content: [{ type: "text", text: JSON.stringify(entries, null, 2) }],
            };
          }
          case "memory_stats": {
            const stats = await this.observations.getStats(args?.project as string);
            return {
              content: [{ type: "text", text: JSON.stringify(stats, null, 2) }],
            };
          }
          case "get_observation": {
            const obs = await this.observations.getObservation(args?.id as string);
            if (!obs) {
              return {
                content: [{ type: "text", text: JSON.stringify({ error: "Observation not found" }) }],
              };
            }
            return {
              content: [{ type: "text", text: JSON.stringify(obs, null, 2) }],
            };
          }
          case "update_observation": {
            const success = await this.observations.updateObservation(args?.id as string, {
              content: args?.content as string,
              title: args?.title as string,
              importance: args?.importance as ImportanceLevel,
              tags: args?.tags as string[],
              file_paths: args?.file_paths as string[],
            });
            return {
              content: [{ type: "text", text: JSON.stringify({ success }) }],
            };
          }
          case "forget": {
            await this.observations.forget({
              observation_id: args?.observation_id as string,
              session_id: args?.session_id as string,
              project: args?.project as string,
              type: args?.type as ObservationType,
              before: args?.before as string,
            });
            return {
              content: [{ type: "text", text: JSON.stringify({ success: true }) }],
            };
          }
          case "related_observations": {
            const results = await this.observations.getRelatedObservations(
              args?.symbol_name as string,
              args?.limit as number
            );
            return {
              content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
            };
          }
          case "debug_trace": {
            const result = await this.debug.trace(args?.query as string, {
              top_k: args?.top_k as number | undefined,
              snippet_chars: args?.snippet_chars as number | undefined,
            });
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }
          case "batch_context": {
            const result = await this.batchContext.fetch(args?.names as string[], {
              compact: args?.compact as boolean | undefined,
              max_neighbors: args?.max_neighbors as number | undefined,
            });
            return {
              content: [{ type: "text", text: JSON.stringify(result) }],
            };
          }
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: error.message }],
        };
      }
    });
  }

  public async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("GraphHub MCP server running on stdio");
  }
}
