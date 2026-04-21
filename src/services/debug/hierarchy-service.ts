import { GraphClient } from '../db/graph-client.ts';

export interface HierarchyNode {
  name: string;
  kind: string;
  file: string;
  relation: 'inherits' | 'implements';
}

export interface HierarchyResult {
  name: string;
  ancestors: HierarchyNode[];
  descendants: HierarchyNode[];
}

export class HierarchyService {
  private static instance: HierarchyService | undefined;
  private db: GraphClient;

  private constructor() {
    this.db = GraphClient.getInstance();
  }

  static getInstance(): HierarchyService {
    if (!HierarchyService.instance) {
      HierarchyService.instance = new HierarchyService();
    }
    return HierarchyService.instance;
  }

  async getHierarchy(options: {
    name: string;
    direction?: 'ancestors' | 'descendants' | 'both';
    depth?: number;
  }): Promise<HierarchyResult> {
    const direction = options.direction ?? 'both';
    const depth = Math.max(1, Math.min(Math.floor(Number(options.depth ?? 5)), 5));

    const ancestors: HierarchyNode[] = [];
    const descendants: HierarchyNode[] = [];

    if (direction === 'ancestors' || direction === 'both') {
      const res = await this.db.runCypher(
        `MATCH (s:Symbol {name: $name})-[r:INHERITS|IMPLEMENTS*1..${depth}]->(p:Symbol)
         OPTIONAL MATCH (f:File)-[:CONTAINS]->(p)
         RETURN DISTINCT p.name AS name, p.kind AS kind, coalesce(f.path, '') AS file,
           CASE WHEN type(r[-1]) = 'INHERITS' THEN 'inherits' ELSE 'implements' END AS relation`,
        { name: options.name },
      );
      const rows = (await res.getAll()) as Array<{ name: string; kind: string; file: string; relation: string }>;
      ancestors.push(...rows.map((r) => ({ name: r.name, kind: r.kind, file: r.file, relation: r.relation as HierarchyNode['relation'] })));
    }

    if (direction === 'descendants' || direction === 'both') {
      const res = await this.db.runCypher(
        `MATCH (c:Symbol)-[r:INHERITS|IMPLEMENTS*1..${depth}]->(s:Symbol {name: $name})
         OPTIONAL MATCH (f:File)-[:CONTAINS]->(c)
         RETURN DISTINCT c.name AS name, c.kind AS kind, coalesce(f.path, '') AS file,
           CASE WHEN type(r[-1]) = 'INHERITS' THEN 'inherits' ELSE 'implements' END AS relation`,
        { name: options.name },
      );
      const rows = (await res.getAll()) as Array<{ name: string; kind: string; file: string; relation: string }>;
      descendants.push(...rows.map((r) => ({ name: r.name, kind: r.kind, file: r.file, relation: r.relation as HierarchyNode['relation'] })));
    }

    return { name: options.name, ancestors, descendants };
  }
}
