import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GraphClient } from "../db/graph-client.ts";
import { RAGService } from "../ai/rag-service.ts";
import { ObservationService, ObservationType, ImportanceLevel } from "../memory/observation-service.ts";

const OBSERVATION_TYPES = ['learning', 'decision', 'finding', 'context', 'bugfix', 'feature', 'refactor', 'discovery', 'change', 'warning', 'todo'];
const IMPORTANCE_LEVELS = ['low', 'medium', 'high', 'critical'];

export class GraphHubMCPServer {
  private server: Server;
  private db: GraphClient;
  private rag: RAGService;
  private observations: ObservationService;

  constructor() {
    this.db = GraphClient.getInstance();
    this.rag = RAGService.getInstance();
    this.observations = ObservationService.getInstance();
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
          description: "Search for code logic or functionality using natural language descriptions (RAG).",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "The description of the logic to search for" },
              limit: { type: "number", description: "Maximum number of results to return (default 5)" },
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
            const result = await this.rag.search(args?.query as string, args?.limit as number);
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
