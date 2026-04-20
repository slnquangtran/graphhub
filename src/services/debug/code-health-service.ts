import { GraphClient } from '../db/graph-client.ts';
import { RAGService } from '../ai/rag-service.ts';

export interface DeadSymbol {
  name: string;
  kind: string;
  file: string;
}

export interface DuplicatePair {
  name: string;
  file: string;
  similar_to: string;
  similar_file: string;
  similarity: number;
}

export interface Cycle {
  type: 'import' | 'call';
  length: number;
  nodes: string[];
}

// Names that are almost always intentional entry points with no callers.
const ENTRY_POINT_RE = /^(main|index|default|constructor|setup|init|bootstrap|start|run|listen|on[A-Z]|handle[A-Z]|register|mount|export)/;

export function isLikelyEntryPoint(name: string): boolean {
  return ENTRY_POINT_RE.test(name);
}

export class CodeHealthService {
  private static instance: CodeHealthService;
  private db: GraphClient;
  private rag: RAGService;

  private constructor() {
    this.db = GraphClient.getInstance();
    this.rag = RAGService.getInstance();
  }

  static getInstance(): CodeHealthService {
    if (!CodeHealthService.instance) {
      CodeHealthService.instance = new CodeHealthService();
    }
    return CodeHealthService.instance;
  }

  async findDeadCode(options: {
    kinds?: string[];
    include_entry_points?: boolean;
    limit?: number;
  } = {}): Promise<DeadSymbol[]> {
    const kinds = options.kinds ?? ['function', 'method', 'class'];
    const limit = options.limit ?? 50;
    const kindsLiteral = kinds.map((k) => `'${k}'`).join(', ');

    const result = await this.db.runCypher(
      `MATCH (f:File)-[:CONTAINS]->(s:Symbol)
       WHERE s.kind IN [${kindsLiteral}]
       AND NOT ()-[:CALLS]->(s)
       RETURN s.name AS name, s.kind AS kind, f.path AS file
       ORDER BY s.kind, s.name
       LIMIT ${limit}`,
    );
    const rows = await result.getAll();

    if (options.include_entry_points) return rows as DeadSymbol[];
    return (rows as DeadSymbol[]).filter((r) => !isLikelyEntryPoint(r.name));
  }

  async findDuplicates(options: {
    name: string;
    min_similarity?: number;
    limit?: number;
    cross_file_only?: boolean;
  }): Promise<DuplicatePair[]> {
    const minSimilarity = options.min_similarity ?? 0.85;
    const limit = options.limit ?? 10;

    const fileResult = await this.db.runCypher(
      `MATCH (f:File)-[:CONTAINS]->(s:Symbol {name: $name}) RETURN f.path AS path LIMIT 1`,
      { name: options.name },
    );
    const fileRows = await fileResult.getAll();
    const sourceFile = (fileRows[0]?.path as string) ?? 'unknown';

    const similar = await this.rag.findSimilarSymbols(options.name, limit + 10);

    return similar
      .filter((s) => {
        if (s.score < minSimilarity) return false;
        if (options.cross_file_only && s.filePath === sourceFile) return false;
        return true;
      })
      .slice(0, limit)
      .map((s) => ({
        name: options.name,
        file: sourceFile,
        similar_to: s.symbolName,
        similar_file: s.filePath ?? 'unknown',
        similarity: Math.round(s.score * 1000) / 1000,
      }));
  }

  async findCycles(options: {
    type?: 'import' | 'call' | 'both';
    max_length?: number;
    limit?: number;
  } = {}): Promise<Cycle[]> {
    const type = options.type ?? 'both';
    const maxLength = options.max_length ?? 3;
    const limit = options.limit ?? 20;
    const cycles: Cycle[] = [];

    if (type === 'import' || type === 'both') {
      const r2 = await this.db.runCypher(
        `MATCH (a:File)-[:IMPORTS]->(b:File)-[:IMPORTS]->(a)
         WHERE a.path < b.path
         RETURN a.path AS a, b.path AS b
         LIMIT ${limit}`,
      );
      for (const row of await r2.getAll()) {
        cycles.push({ type: 'import', length: 2, nodes: [row.a as string, row.b as string] });
      }

      if (maxLength >= 3) {
        const r3 = await this.db.runCypher(
          `MATCH (a:File)-[:IMPORTS]->(b:File)-[:IMPORTS]->(c:File)-[:IMPORTS]->(a)
           WHERE a.path < b.path AND a.path < c.path
           RETURN a.path AS a, b.path AS b, c.path AS c
           LIMIT ${limit}`,
        );
        for (const row of await r3.getAll()) {
          cycles.push({ type: 'import', length: 3, nodes: [row.a as string, row.b as string, row.c as string] });
        }
      }
    }

    if (type === 'call' || type === 'both') {
      const r2 = await this.db.runCypher(
        `MATCH (a:Symbol)-[:CALLS]->(b:Symbol)-[:CALLS]->(a)
         WHERE a.name < b.name
         RETURN a.name AS a, b.name AS b
         LIMIT ${limit}`,
      );
      for (const row of await r2.getAll()) {
        cycles.push({ type: 'call', length: 2, nodes: [row.a as string, row.b as string] });
      }

      if (maxLength >= 3) {
        const r3 = await this.db.runCypher(
          `MATCH (a:Symbol)-[:CALLS]->(b:Symbol)-[:CALLS]->(c:Symbol)-[:CALLS]->(a)
           WHERE a.name < b.name AND a.name < c.name
           RETURN a.name AS a, b.name AS b, c.name AS c
           LIMIT ${limit}`,
        );
        for (const row of await r3.getAll()) {
          cycles.push({ type: 'call', length: 3, nodes: [row.a as string, row.b as string, row.c as string] });
        }
      }
    }

    return cycles;
  }
}
