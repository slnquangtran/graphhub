import { GraphClient } from '../db/graph-client.ts';

export interface BatchContextEntry {
  symbol: string;
  found: boolean;
  definedIn: { path: string; range: string | null } | null;
  kind: string | null;
  callers_count: number;
  callees_count: number;
  callers?: Array<{ name: string; kind: string }>;
  callees?: Array<{ name: string; kind: string }>;
}

export interface BatchContextResult {
  entries: BatchContextEntry[];
  missing: string[];
}

export interface BatchContextOptions {
  compact?: boolean;
  max_neighbors?: number;
}

export class BatchContextService {
  private static instance: BatchContextService;
  private db: GraphClient;

  private constructor() {
    this.db = GraphClient.getInstance();
  }

  public static getInstance(): BatchContextService {
    if (!BatchContextService.instance) {
      BatchContextService.instance = new BatchContextService();
    }
    return BatchContextService.instance;
  }

  public async fetch(names: string[], options: BatchContextOptions = {}): Promise<BatchContextResult> {
    const compact = options.compact ?? true;
    const maxNeighbors = options.max_neighbors ?? 10;

    const unique = Array.from(new Set(names.filter((n) => typeof n === 'string' && n.length > 0)));
    if (unique.length === 0) {
      return { entries: [], missing: [] };
    }

    const [defsRes, callersRes, calleesRes] = await Promise.all([
      this.db.runCypher(
        'MATCH (f:File)-[:CONTAINS]->(s:Symbol) WHERE s.name IN $names RETURN s.name as name, s.kind as kind, f.path as path, s.range as range',
        { names: unique }
      ),
      this.db.runCypher(
        'MATCH (c:Symbol)-[:CALLS]->(s:Symbol) WHERE s.name IN $names RETURN s.name as target, c.name as name, c.kind as kind',
        { names: unique }
      ),
      this.db.runCypher(
        'MATCH (s:Symbol)-[:CALLS]->(c:Symbol) WHERE s.name IN $names RETURN s.name as source, c.name as name, c.kind as kind',
        { names: unique }
      ),
    ]);

    const defRows = (await defsRes.getAll()) as Array<{ name: string; kind: string; path: string; range: string | null }>;
    const callerRows = (await callersRes.getAll()) as Array<{ target: string; name: string; kind: string }>;
    const calleeRows = (await calleesRes.getAll()) as Array<{ source: string; name: string; kind: string }>;

    const defBy = new Map<string, { kind: string; path: string; range: string | null }>();
    for (const r of defRows) {
      if (!defBy.has(r.name)) defBy.set(r.name, { kind: r.kind, path: r.path, range: r.range });
    }

    const callersBy = new Map<string, Array<{ name: string; kind: string }>>();
    for (const r of callerRows) {
      if (!callersBy.has(r.target)) callersBy.set(r.target, []);
      callersBy.get(r.target)!.push({ name: r.name, kind: r.kind });
    }

    const calleesBy = new Map<string, Array<{ name: string; kind: string }>>();
    for (const r of calleeRows) {
      if (!calleesBy.has(r.source)) calleesBy.set(r.source, []);
      calleesBy.get(r.source)!.push({ name: r.name, kind: r.kind });
    }

    const missing: string[] = [];
    const entries: BatchContextEntry[] = [];

    for (const name of unique) {
      const def = defBy.get(name);
      const callers = callersBy.get(name) ?? [];
      const callees = calleesBy.get(name) ?? [];

      if (!def && callers.length === 0 && callees.length === 0) {
        missing.push(name);
        entries.push({
          symbol: name,
          found: false,
          definedIn: null,
          kind: null,
          callers_count: 0,
          callees_count: 0,
        });
        continue;
      }

      const entry: BatchContextEntry = {
        symbol: name,
        found: true,
        definedIn: def ? { path: def.path, range: def.range } : null,
        kind: def?.kind ?? null,
        callers_count: callers.length,
        callees_count: callees.length,
      };

      if (!compact) {
        entry.callers = callers.slice(0, maxNeighbors);
        entry.callees = callees.slice(0, maxNeighbors);
      }

      entries.push(entry);
    }

    return { entries, missing };
  }
}
