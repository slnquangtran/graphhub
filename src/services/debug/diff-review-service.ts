import { GraphClient } from '../db/graph-client.ts';
import { ChangedSymbolsService, ChangedSymbolsOptions } from './changed-symbols-service.ts';

export interface DiffReviewSymbol {
  name: string;
  kind: string;
  file: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  callers_count: number;
  test_files: string[];
}

export interface DiffReviewSummary {
  files_changed: number;
  symbols_changed: number;
  covered: number;
  uncovered: number;
  high_risk: number;
  medium_risk: number;
  low_risk: number;
  overall_risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface DiffReviewReport {
  scope: 'staged' | 'working' | 'since';
  base_ref: string | null;
  summary: DiffReviewSummary;
  symbols: DiffReviewSymbol[];
  not_in_graph: string[];
  recommendations: string[];
}

export interface DiffReviewOptions extends ChangedSymbolsOptions {
  // inherited: since?, staged?, cwd?
}

export function computeOverallRisk(
  symbols: DiffReviewSymbol[],
): DiffReviewSummary['overall_risk'] {
  const uncoveredHigh = symbols.filter((s) => s.risk === 'HIGH' && s.test_files.length === 0);
  if (uncoveredHigh.length >= 2) return 'CRITICAL';
  if (uncoveredHigh.length === 1) return 'HIGH';
  if (symbols.some((s) => s.risk === 'HIGH')) return 'MEDIUM';
  if (symbols.some((s) => s.risk === 'MEDIUM')) return 'LOW';
  return 'LOW';
}

export function buildRecommendations(symbols: DiffReviewSymbol[]): string[] {
  const recs: string[] = [];

  const uncoveredHigh = symbols.filter((s) => s.risk === 'HIGH' && s.test_files.length === 0);
  if (uncoveredHigh.length > 0) {
    recs.push(
      `${uncoveredHigh.length} high-risk symbol(s) have no test coverage — write tests before merging: ${uncoveredHigh.map((s) => s.name).join(', ')}`,
    );
  }

  const highRisk = symbols.filter((s) => s.risk === 'HIGH');
  if (highRisk.length > 0) {
    recs.push(
      `${highRisk.length} symbol(s) have 4+ callers — verify all callers still work: ${highRisk.map((s) => s.name).join(', ')}`,
    );
  }

  const uncovered = symbols.filter((s) => !s.test_files.length && s.risk !== 'LOW');
  if (uncovered.length > 0 && uncoveredHigh.length === 0) {
    recs.push(
      `${uncovered.length} medium-risk symbol(s) lack test coverage — consider adding tests.`,
    );
  }

  if (recs.length === 0) {
    recs.push('All changed symbols look well-covered. Safe to merge.');
  }

  return recs;
}

export class DiffReviewService {
  private static instance: DiffReviewService;
  private db: GraphClient;
  private changedSymbols: ChangedSymbolsService;

  private constructor() {
    this.db = GraphClient.getInstance();
    this.changedSymbols = ChangedSymbolsService.getInstance();
  }

  static getInstance(): DiffReviewService {
    if (!DiffReviewService.instance) {
      DiffReviewService.instance = new DiffReviewService();
    }
    return DiffReviewService.instance;
  }

  async review(options: DiffReviewOptions = {}): Promise<DiffReviewReport> {
    const changed = await this.changedSymbols.list(options);

    if (changed.entries.length === 0) {
      return {
        scope: changed.scope,
        base_ref: changed.base_ref,
        summary: {
          files_changed: changed.changed_files.length,
          symbols_changed: 0,
          covered: 0,
          uncovered: 0,
          high_risk: 0,
          medium_risk: 0,
          low_risk: 0,
          overall_risk: 'LOW',
        },
        symbols: [],
        not_in_graph: changed.not_in_graph,
        recommendations: ['No indexed symbols changed.'],
      };
    }

    // Look up test files for each changed symbol
    const symbolNames = Array.from(new Set(changed.entries.map((e) => e.symbol)));
    const covRes = await this.db.runCypher(
      `MATCH (tf:File)-[:CONTAINS]->(:Symbol)-[:CALLS]->(s:Symbol)
       WHERE s.name IN $names
       AND (tf.path CONTAINS '.test.' OR tf.path CONTAINS '.spec.' OR tf.path CONTAINS '__tests__')
       RETURN s.name AS name, collect(DISTINCT tf.path) AS test_files`,
      { names: symbolNames },
    );
    const covRows = (await covRes.getAll()) as Array<{ name: string; test_files: string[] }>;
    const coverageMap = new Map<string, string[]>();
    for (const row of covRows) {
      coverageMap.set(row.name, row.test_files);
    }

    const symbols: DiffReviewSymbol[] = changed.entries.map((e) => ({
      name: e.symbol,
      kind: e.kind,
      file: e.file,
      risk: e.risk,
      callers_count: e.direct_caller_count,
      test_files: coverageMap.get(e.symbol) ?? [],
    }));

    const summary: DiffReviewSummary = {
      files_changed: changed.changed_files.length,
      symbols_changed: symbols.length,
      covered: symbols.filter((s) => s.test_files.length > 0).length,
      uncovered: symbols.filter((s) => s.test_files.length === 0).length,
      high_risk: symbols.filter((s) => s.risk === 'HIGH').length,
      medium_risk: symbols.filter((s) => s.risk === 'MEDIUM').length,
      low_risk: symbols.filter((s) => s.risk === 'LOW').length,
      overall_risk: computeOverallRisk(symbols),
    };

    return {
      scope: changed.scope,
      base_ref: changed.base_ref,
      summary,
      symbols,
      not_in_graph: changed.not_in_graph,
      recommendations: buildRecommendations(symbols),
    };
  }
}
