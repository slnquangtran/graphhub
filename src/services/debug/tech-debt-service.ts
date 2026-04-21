import { GraphClient } from '../db/graph-client.ts';

export interface TechDebtEntry {
  name: string;
  kind: string;
  file: string;
  range: string;
  markers: string[];
  status: string;
  caller_count: number;
  risk_score: number;
}

export interface TechDebtResult {
  total: number;
  entries: TechDebtEntry[];
}

const VALID_KINDS = new Set(['function', 'method', 'class', 'interface', 'variable']);
const VALID_MARKERS = new Set(['TODO', 'FIXME', 'HACK', 'OPTIMIZE', 'XXX']);

export class TechDebtService {
  private static instance: TechDebtService | undefined;
  private db: GraphClient;

  private constructor() {
    this.db = GraphClient.getInstance();
  }

  static getInstance(): TechDebtService {
    if (!TechDebtService.instance) {
      TechDebtService.instance = new TechDebtService();
    }
    return TechDebtService.instance;
  }

  async findTechDebt(options: {
    marker?: string;
    file?: string;
    kinds?: string[];
    min_callers?: number;
    limit?: number;
  } = {}): Promise<TechDebtResult> {
    const limit = Math.max(1, Math.min(Math.floor(Number(options.limit ?? 50)), 500));
    const kinds = (options.kinds ?? ['function', 'method', 'class']).filter((k) => VALID_KINDS.has(k));
    const minCallers = Math.max(0, Math.floor(Number(options.min_callers ?? 0)));

    const params: Record<string, any> = { kinds };
    let fileFilter = '';
    let markerFilter = '';

    if (options.file) {
      params.filePath = options.file;
      fileFilter = 'AND f.path CONTAINS $filePath';
    }
    if (options.marker && VALID_MARKERS.has(options.marker)) {
      // Filter markers list at JS level after fetch — KuzuDB has no array-contains function
    }

    const res = await this.db.runCypher(
      `MATCH (f:File)-[:CONTAINS]->(s:Symbol)
       WHERE s.kind IN $kinds
       AND size(s.technicalDebt) > 0
       ${fileFilter}
       ${markerFilter}
       OPTIONAL MATCH (caller:Symbol)-[:CALLS]->(s)
       WITH f, s, count(DISTINCT caller) AS caller_count
       WHERE caller_count >= ${minCallers}
       RETURN s.name AS name, s.kind AS kind, f.path AS file, s.range AS range,
              s.technicalDebt AS markers, s.status AS status,
              caller_count,
              size(s.technicalDebt) * (caller_count + 1) AS risk_score
       ORDER BY risk_score DESC
       LIMIT ${limit}`,
      params,
    );

    const rows = (await res.getAll()) as Array<{
      name: string; kind: string; file: string; range: string;
      markers: string[]; status: string;
      caller_count: number; risk_score: number;
    }>;

    const markerFilter2 = options.marker && VALID_MARKERS.has(options.marker) ? options.marker : null;
    const entries: TechDebtEntry[] = rows
      .filter((r) => !markerFilter2 || r.markers.some((m) => m.includes(markerFilter2)))
      .map((r) => ({
        name: r.name,
        kind: r.kind,
        file: r.file,
        range: r.range ?? '',
        markers: r.markers,
        status: r.status,
        caller_count: r.caller_count,
        risk_score: r.risk_score,
      }));

    return { total: entries.length, entries };
  }
}
