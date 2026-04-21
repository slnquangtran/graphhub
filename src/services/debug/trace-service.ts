import { GraphClient } from '../db/graph-client.ts';
import { RAGService } from '../ai/rag-service.ts';

export interface DebugCandidate {
  symbol: string;
  kind: string;
  score: number;
  snippet: string;
  definedIn: { path: string; range: string } | null;
  callers: Array<{ name: string; kind: string }>;
  callees: Array<{ name: string; kind: string }>;
  impact: {
    risk: 'LOW' | 'MEDIUM' | 'HIGH';
    direct_caller_count: number;
    indirect_caller_count: number;
  };
}

export interface DebugTraceResult {
  query: string;
  candidates: DebugCandidate[];
  next_steps: string[];
}

export interface DebugTraceOptions {
  top_k?: number;
  snippet_chars?: number;
}

export class DebugTraceService {
  private static instance: DebugTraceService;
  private db: GraphClient;
  private rag: RAGService;

  private constructor() {
    this.db = GraphClient.getInstance();
    this.rag = RAGService.getInstance();
  }

  public static getInstance(): DebugTraceService {
    if (!DebugTraceService.instance) {
      DebugTraceService.instance = new DebugTraceService();
    }
    return DebugTraceService.instance;
  }

  public async trace(query: string, options: DebugTraceOptions = {}): Promise<DebugTraceResult> {
    const topK = options.top_k ?? 3;
    const snippetChars = options.snippet_chars ?? 200;

    const hits = await this.rag.search(query, topK);

    const candidates: DebugCandidate[] = [];
    const seen = new Set<string>();
    for (const hit of hits) {
      if (seen.has(hit.symbolName)) continue;
      seen.add(hit.symbolName);
      candidates.push(await this.enrich(hit, snippetChars));
    }

    return {
      query,
      candidates,
      next_steps: this.suggestNextSteps(candidates),
    };
  }

  private async enrich(
    hit: { symbolName: string; kind: string; text: string; score: number },
    snippetChars: number
  ): Promise<DebugCandidate> {
    const name = hit.symbolName;

    const [calleesRes, callersRes, fileRes] = await Promise.all([
      this.db.runCypher(
        'MATCH (s:Symbol {name: $name})-[:CALLS]->(c:Symbol) RETURN c.name as name, c.kind as kind',
        { name }
      ),
      this.db.runCypher(
        'MATCH (c:Symbol)-[:CALLS]->(s:Symbol {name: $name}) RETURN c.name as name, c.kind as kind',
        { name }
      ),
      this.db.runCypher(
        'MATCH (f:File)-[:CONTAINS]->(s:Symbol {name: $name}) RETURN f.path as path, s.range as range',
        { name }
      ),
    ]);
    const callees = (await calleesRes.getAll()) as Array<{ name: string; kind: string }>;
    const callers = (await callersRes.getAll()) as Array<{ name: string; kind: string }>;
    const files = (await fileRes.getAll()) as Array<{ path: string; range: string }>;

    // Single 2-hop query replaces the previous N+1 loop (one query per direct caller).
    const indirectRes = await this.db.runCypher(
      'MATCH (g:Symbol)-[:CALLS]->(:Symbol)-[:CALLS]->(s:Symbol {name: $name}) WHERE g.name <> $name RETURN DISTINCT g.name as name',
      { name }
    );
    const indirects = (await indirectRes.getAll()) as Array<{ name: string }>;
    const d2Set = new Set(indirects.map((r) => r.name));

    const d1 = callers.length;
    const risk: DebugCandidate['impact']['risk'] =
      d1 === 0 ? 'LOW' : d1 <= 3 ? 'MEDIUM' : 'HIGH';

    return {
      symbol: name,
      kind: hit.kind,
      score: hit.score,
      snippet: (hit.text ?? '').slice(0, snippetChars),
      definedIn: files[0] ? { path: files[0].path, range: files[0].range } : null,
      callers,
      callees,
      impact: {
        risk,
        direct_caller_count: d1,
        indirect_caller_count: d2Set.size,
      },
    };
  }

  private suggestNextSteps(candidates: DebugCandidate[]): string[] {
    if (candidates.length === 0) {
      return ['No candidates found — rephrase the query or run `npm run index` if the graph is stale.'];
    }
    const steps: string[] = [];
    const top = candidates[0];
    steps.push(`Inspect top candidate: ${top.symbol}${top.definedIn ? ` at ${top.definedIn.path}` : ''}`);
    if (top.callers.length > 0) {
      steps.push(`Trace ${top.callers.length} caller(s) upstream to find the source of bad input.`);
    }
    if (top.callees.length > 0) {
      steps.push(`Check ${top.callees.length} callee(s) for downstream failure modes.`);
    }
    if (top.impact.risk === 'HIGH') {
      steps.push(
        `HIGH impact risk (${top.impact.direct_caller_count} direct callers) — confirm fix scope before editing.`
      );
    }
    return steps;
  }
}
