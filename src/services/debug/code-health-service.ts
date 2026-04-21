import fs from 'fs';
import path from 'path';
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

export interface ArchRule {
  from: string;
  must_not_import: string;
  message?: string;
}

export interface ArchViolation {
  source: string;
  target: string;
  message: string;
}

export interface ArchRulesResult {
  rules_checked: number;
  violations: ArchViolation[];
  passed: boolean;
}

export interface SymbolCoverage {
  name: string;
  kind: string;
  file: string;
  covered: boolean;
  test_files: string[];
}

export interface TestCoverageResult {
  total: number;
  covered: number;
  uncovered: number;
  coverage_pct: number;
  symbols: SymbolCoverage[];
}

// Names that are almost always intentional entry points with no callers.
const ENTRY_POINT_RE = /^(main|index|default|constructor|setup|init|bootstrap|start|run|listen|on[A-Z]|handle[A-Z]|register|mount|export)/;

// Exhaustive set of symbol kinds written by the ingestion pipeline.
// Used to whitelist findDeadCode / getTestCoverage kind parameters so
// they cannot be used to inject arbitrary Cypher via string interpolation.
const VALID_SYMBOL_KINDS = new Set([
  'function', 'method', 'class', 'interface', 'import', 'variable', 'file_module',
]);

export function isLikelyEntryPoint(name: string): boolean {
  return ENTRY_POINT_RE.test(name);
}

export function isTestFile(filePath: string): boolean {
  return (
    filePath.includes('.test.') ||
    filePath.includes('.spec.') ||
    filePath.includes('__tests__') ||
    filePath.includes('/__test__/')
  );
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
    const kinds = (options.kinds ?? ['function', 'method', 'class'])
      .filter(k => VALID_SYMBOL_KINDS.has(k));
    const limit = Math.max(1, Math.min(Math.floor(Number(options.limit ?? 50)), 500));

    const result = await this.db.runCypher(
      `MATCH (f:File)-[:CONTAINS]->(s:Symbol)
       WHERE s.kind IN $kinds
       AND NOT ()-[:CALLS]->(s)
       RETURN s.name AS name, s.kind AS kind, f.path AS file
       ORDER BY s.kind, s.name
       LIMIT ${limit}`,
      { kinds },
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

    if (maxLength > 3) {
      throw new Error(
        `findCycles only supports max_length up to 3. ` +
        `Longer cycle detection requires recursive Cypher queries not yet implemented.`
      );
    }

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

  async checkArchRules(options: {
    rules?: ArchRule[];
    rules_file?: string;
    limit?: number;
  }): Promise<ArchRulesResult> {
    const limit = options.limit ?? 50;

    let rules: ArchRule[] = options.rules ?? [];

    if (rules.length === 0 && options.rules_file) {
      const rulesPath = path.resolve(options.rules_file);
      if (fs.existsSync(rulesPath)) {
        try {
          rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8')) as ArchRule[];
        } catch {
          // malformed file — fall through with no rules
        }
      }
    }

    // Also try the default location if still empty
    if (rules.length === 0) {
      const defaultPath = path.resolve('.graphhub', 'arch-rules.json');
      if (fs.existsSync(defaultPath)) {
        try {
          rules = JSON.parse(fs.readFileSync(defaultPath, 'utf-8')) as ArchRule[];
        } catch {
          // ignore
        }
      }
    }

    if (rules.length === 0) {
      return { rules_checked: 0, violations: [], passed: true };
    }

    const violations: ArchViolation[] = [];

    for (const rule of rules) {
      const result = await this.db.runCypher(
        `MATCH (a:File)-[:IMPORTS]->(b:File)
         WHERE a.path CONTAINS $from AND b.path CONTAINS $target
         RETURN a.path AS source, b.path AS target
         LIMIT ${limit}`,
        { from: rule.from, target: rule.must_not_import },
      );
      for (const row of await result.getAll()) {
        violations.push({
          source: row.source as string,
          target: row.target as string,
          message: rule.message ?? `"${rule.from}" must not import "${rule.must_not_import}"`,
        });
      }
    }

    return {
      rules_checked: rules.length,
      violations,
      passed: violations.length === 0,
    };
  }

  async getTestCoverage(options: {
    file?: string;
    symbol?: string;
    kinds?: string[];
    uncovered_only?: boolean;
    limit?: number;
  } = {}): Promise<TestCoverageResult> {
    const kinds = (options.kinds ?? ['function', 'method'])
      .filter(k => VALID_SYMBOL_KINDS.has(k));
    const limit = Math.max(1, Math.min(Math.floor(Number(options.limit ?? 200)), 1000));

    // Query 1 — all source symbols (non-test files)
    const fileFilter = options.file ? `AND f.path CONTAINS $filePath` : '';
    const symbolFilter = options.symbol ? `AND s.name = $symbolName` : '';
    const params: Record<string, any> = { kinds };
    if (options.file) params.filePath = options.file;
    if (options.symbol) params.symbolName = options.symbol;

    const sourceRes = await this.db.runCypher(
      `MATCH (f:File)-[:CONTAINS]->(s:Symbol)
       WHERE s.kind IN $kinds
       AND NOT f.path CONTAINS '.test.'
       AND NOT f.path CONTAINS '.spec.'
       AND NOT f.path CONTAINS '__tests__'
       ${fileFilter}
       ${symbolFilter}
       RETURN s.name AS name, s.kind AS kind, f.path AS file
       ORDER BY f.path, s.name
       LIMIT ${limit}`,
      params,
    );
    const sourceRows = (await sourceRes.getAll()) as Array<{ name: string; kind: string; file: string }>;

    if (sourceRows.length === 0) {
      return { total: 0, covered: 0, uncovered: 0, coverage_pct: 0, symbols: [] };
    }

    // Query 2 — which test files call which source symbols
    const symbolNames = Array.from(new Set(sourceRows.map((r) => r.name)));
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

    const symbols: SymbolCoverage[] = sourceRows.map((r) => {
      const testFiles = coverageMap.get(r.name) ?? [];
      return {
        name: r.name,
        kind: r.kind,
        file: r.file,
        covered: testFiles.length > 0,
        test_files: testFiles,
      };
    });

    const filtered = options.uncovered_only ? symbols.filter((s) => !s.covered) : symbols;
    const coveredCount = symbols.filter((s) => s.covered).length;
    const total = symbols.length;

    return {
      total,
      covered: coveredCount,
      uncovered: total - coveredCount,
      coverage_pct: total > 0 ? Math.round((coveredCount / total) * 100) : 0,
      symbols: filtered,
    };
  }
}
