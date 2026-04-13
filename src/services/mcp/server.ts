import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GraphClient } from "../db/graph-client.ts";
import { RAGService } from "../ai/rag-service.ts";

export class GraphHubMCPServer {
  private server: Server;
  private db: GraphClient;
  private rag: RAGService;

  constructor() {
    this.db = GraphClient.getInstance();
    this.rag = RAGService.getInstance();
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
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "query_graph": {
            const result = await this.db.runCypher(args?.cypher as string);
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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
