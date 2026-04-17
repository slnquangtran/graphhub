import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GraphClient } from "../db/graph-client.ts";
import { RAGService } from "../ai/rag-service.ts";
import { ObservationService } from "../memory/observation-service.ts";

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
        version: "1.0.0",
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
        {
          name: "remember",
          description: "Save a learning, decision, finding, or context to session memory. Persists across sessions and is searchable via recall.",
          inputSchema: {
            type: "object",
            properties: {
              content: { type: "string", description: "The content to remember" },
              type: { type: "string", enum: ["learning", "decision", "finding", "context"], description: "Type of observation (default: learning)" },
              session_id: { type: "string", description: "Optional session identifier for grouping" },
              related_symbols: { type: "array", items: { type: "string" }, description: "Symbol names this observation relates to" },
              tags: { type: "array", items: { type: "string" }, description: "Optional tags for categorization" },
            },
            required: ["content"],
          },
        },
        {
          name: "recall",
          description: "Search session memory for past learnings, decisions, or findings using natural language.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Natural language query to search memories" },
              session_id: { type: "string", description: "Filter to a specific session" },
              type: { type: "string", enum: ["learning", "decision", "finding", "context"], description: "Filter by observation type" },
              limit: { type: "number", description: "Maximum results to return (default: 10)" },
            },
            required: ["query"],
          },
        },
        {
          name: "forget",
          description: "Delete observations from session memory.",
          inputSchema: {
            type: "object",
            properties: {
              observation_id: { type: "string", description: "Specific observation ID to delete" },
              session_id: { type: "string", description: "Delete all observations from a session" },
              before: { type: "string", description: "Delete observations before this ISO timestamp" },
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
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
            // Depth-1 (direct callers) and depth-2 (their callers)
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
          case "remember": {
            const id = await this.observations.remember(args?.content as string, {
              type: args?.type as any,
              session_id: args?.session_id as string,
              related_symbols: args?.related_symbols as string[],
              tags: args?.tags as string[],
            });
            return {
              content: [{ type: "text", text: JSON.stringify({ success: true, observation_id: id }, null, 2) }],
            };
          }
          case "recall": {
            const results = await this.observations.recall(args?.query as string, {
              session_id: args?.session_id as string,
              type: args?.type as string,
              limit: args?.limit as number,
            });
            return {
              content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
            };
          }
          case "forget": {
            await this.observations.forget({
              observation_id: args?.observation_id as string,
              session_id: args?.session_id as string,
              before: args?.before as string,
            });
            return {
              content: [{ type: "text", text: JSON.stringify({ success: true }, null, 2) }],
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
