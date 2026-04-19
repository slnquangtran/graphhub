import { execFileSync } from 'child_process';
import path from 'path';
import { GraphClient } from '../db/graph-client.ts';

const GIT_REF_RE = /^[A-Za-z0-9_./@~^\-]+$/;

export interface ChangedSymbolEntry {
  symbol: string;
  kind: string;
  file: string;
  direct_caller_count: number;
  direct_callers?: Array<{ name: string; kind: string; file: string }>;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ChangedSymbolsResult {
  base_ref: string | null;
  scope: 'staged' | 'working' | 'since';
  changed_files: string[];
  entries: ChangedSymbolEntry[];
  not_in_graph: string[];
}

export interface ChangedSymbolsOptions {
  since?: string;
  staged?: boolean;
  cwd?: string;
  include_callers?: boolean;
  max_callers?: number;
}

export class ChangedSymbolsService {
  private static instance: ChangedSymbolsService;
  private db: GraphClient;

  private constructor() {
    this.db = GraphClient.getInstance();
  }

  public static getInstance(): ChangedSymbolsService {
    if (!ChangedSymbolsService.instance) {
      ChangedSymbolsService.instance = new ChangedSymbolsService();
    }
    return ChangedSymbolsService.instance;
  }

  public getChangedFiles(options: ChangedSymbolsOptions = {}): { files: string[]; base_ref: string | null; scope: 'staged' | 'working' | 'since' } {
    const cwd = options.cwd ?? process.cwd();
    let scope: 'staged' | 'working' | 'since' = 'working';
    let base_ref: string | null = null;
    let args: string[];
    if (options.since) {
      if (!GIT_REF_RE.test(options.since)) {
        return { files: [], base_ref: options.since, scope: 'since' };
      }
      args = ['diff', '--name-only', `${options.since}...HEAD`];
      base_ref = options.since;
      scope = 'since';
    } else if (options.staged) {
      args = ['diff', '--name-only', '--cached'];
      scope = 'staged';
    } else {
      args = ['diff', '--name-only', 'HEAD'];
      scope = 'working';
    }
    try {
      const out = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const files = out.split('\n').map((s) => s.trim()).filter(Boolean).map((p) => path.resolve(cwd, p));
      return { files, base_ref, scope };
    } catch {
      return { files: [], base_ref, scope };
    }
  }

  public async list(options: ChangedSymbolsOptions = {}): Promise<ChangedSymbolsResult> {
    const includeCallers = options.include_callers ?? false;
    const maxCallers = options.max_callers ?? 5;
    const { files, base_ref, scope } = this.getChangedFiles(options);

    if (files.length === 0) {
      return { base_ref, scope, changed_files: [], entries: [], not_in_graph: [] };
    }

    const res = await this.db.runCypher(
      `UNWIND $paths AS p
       OPTIONAL MATCH (f:File {path: p})-[:CONTAINS]->(s:Symbol)
       WITH p, s, f WHERE s IS NOT NULL
       OPTIONAL MATCH (caller:Symbol)-[:CALLS]->(s)
       RETURN p AS file, s.name AS symbol, s.kind AS kind, count(DISTINCT caller) AS direct_caller_count`,
      { paths: files },
    );
    const rows = (await res.getAll()) as Array<{ file: string; symbol: string; kind: string; direct_caller_count: number | bigint }>;

    const filesWithSymbols = new Set<string>();
    const entries: ChangedSymbolEntry[] = [];
    for (const r of rows) {
      filesWithSymbols.add(r.file);
      const count = Number(r.direct_caller_count);
      entries.push({
        symbol: r.symbol,
        kind: r.kind,
        file: r.file,
        direct_caller_count: count,
        risk: count === 0 ? 'LOW' : count <= 3 ? 'MEDIUM' : 'HIGH',
      });
    }

    if (includeCallers && entries.length > 0) {
      const uniqueNames = Array.from(new Set(entries.map((e) => e.symbol)));
      const byTarget = new Map<string, Array<{ name: string; kind: string; file: string }>>();
      for (const name of uniqueNames) {
        const callersRes = await this.db.runCypher(
          `MATCH (target:Symbol {name: $name})<-[:CALLS]-(caller:Symbol)<-[:CONTAINS]-(f:File)
           RETURN caller.name AS caller_name, caller.kind AS caller_kind, f.path AS caller_file
           LIMIT $lim`,
          { name, lim: maxCallers },
        );
        const rows = (await callersRes.getAll()) as Array<{ caller_name: string; caller_kind: string; caller_file: string }>;
        byTarget.set(name, rows.map((r) => ({ name: r.caller_name, kind: r.caller_kind, file: r.caller_file })));
      }
      for (const e of entries) {
        e.direct_callers = byTarget.get(e.symbol) ?? [];
      }
    }

    const not_in_graph = files.filter((f) => !filesWithSymbols.has(f));
    return { base_ref, scope, changed_files: files, entries, not_in_graph };
  }
}
