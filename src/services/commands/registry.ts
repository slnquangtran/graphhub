import path from 'path';
import { SLASH_COMMAND_DEFS, CommandDef } from './defs.ts';
import { GraphClient } from '../db/graph-client.ts';
import { RAGService } from '../ai/rag-service.ts';
import { DebugTraceService } from '../debug/trace-service.ts';
import { DiffReviewService } from '../debug/diff-review-service.ts';
import { IngestionService } from '../ingestion/ingestion-service.ts';
import { ReportGenerator } from '../report/report-generator.ts';
import { ObservationService } from '../memory/observation-service.ts';

export interface CommandContext {
  cwd: string;
}

export interface SlashCommand extends CommandDef {
  run: (args: string[], ctx: CommandContext) => Promise<void>;
}

const runFns: Record<string, (args: string[], ctx: CommandContext) => Promise<void>> = {
  async index(args, ctx) {
    const targetDir = path.resolve(ctx.cwd, args[0] || './src');
    const service = new IngestionService();
    console.error(`Indexing ${targetDir} …`);
    await service.initialize();
    const stats = await service.indexDirectoryWithStats(targetDir, { clean: false });
    await service.resolveImports();
    await service.resolveCalls();
    await service.resolveInheritance();
    console.log(`Done. indexed=${stats.indexed} skipped=${stats.skipped} removed=${stats.removed} errors=${stats.errors} elapsed=${stats.elapsed_ms}ms`);
  },

  async find(args) {
    const name = args.join(' ').trim();
    if (!name) { console.error('Usage: /find <symbol-name>'); return; }
    const db = GraphClient.getInstance();
    const [calleesR, callersR, fileR] = await Promise.all([
      db.runCypher(
        `MATCH (s:Symbol {name: $name})-[:CALLS]->(callee:Symbol)
         OPTIONAL MATCH (f:File)-[:CONTAINS]->(callee)
         RETURN callee.name as name, callee.kind as kind,
                coalesce(f.path,'') as file, callee.range as range`,
        { name },
      ),
      db.runCypher(
        `MATCH (caller:Symbol)-[:CALLS]->(s:Symbol {name: $name})
         OPTIONAL MATCH (f:File)-[:CONTAINS]->(caller)
         RETURN caller.name as name, caller.kind as kind,
                coalesce(f.path,'') as file, caller.range as range`,
        { name },
      ),
      db.runCypher(
        'MATCH (f:File)-[:CONTAINS]->(s:Symbol {name: $name}) RETURN f.path as path, s.kind as kind, s.range as range',
        { name },
      ),
    ]);
    const [callees, callers, fileInfo] = await Promise.all([calleesR.getAll(), callersR.getAll(), fileR.getAll()]);
    console.log(JSON.stringify({ symbol: name, definedIn: fileInfo, callers, callees }, null, 2));
  },

  async search(args) {
    const query = args.join(' ').trim();
    if (!query) { console.error('Usage: /search <query>'); return; }
    const results = await RAGService.getInstance().advancedSearch(query, { mode: 'hybrid', limit: 10 });
    console.log(JSON.stringify(results, null, 2));
  },

  async impact(args) {
    const name = args.join(' ').trim();
    if (!name) { console.error('Usage: /impact <symbol-name>'); return; }
    const db = GraphClient.getInstance();
    const [d1R, d2R] = await Promise.all([
      db.runCypher(
        `MATCH (caller:Symbol)-[:CALLS]->(s:Symbol {name: $name})
         OPTIONAL MATCH (f:File)-[:CONTAINS]->(caller)
         RETURN DISTINCT caller.name as name, caller.kind as kind,
                coalesce(f.path,'') as file, caller.range as range`,
        { name },
      ),
      db.runCypher(
        `MATCH (gc:Symbol)-[:CALLS]->(:Symbol)-[:CALLS]->(s:Symbol {name: $name})
         WHERE gc.name <> $name
         OPTIONAL MATCH (f:File)-[:CONTAINS]->(gc)
         RETURN DISTINCT gc.name as name, gc.kind as kind,
                coalesce(f.path,'') as file, gc.range as range`,
        { name },
      ),
    ]);
    const [d1, d2] = await Promise.all([d1R.getAll(), d2R.getAll()]);
    const risk = d1.length === 0 ? 'LOW' : d1.length <= 3 ? 'MEDIUM' : 'HIGH';
    console.log(JSON.stringify({ target: name, risk, direct_callers: d1, indirect_callers: d2 }, null, 2));
  },

  async debug(args) {
    const query = args.join(' ').trim();
    if (!query) { console.error('Usage: /debug <bug description or error message>'); return; }
    const result = await DebugTraceService.getInstance().trace(query, {});
    console.log(JSON.stringify(result, null, 2));
  },

  async similar(args) {
    const symbol = args.join(' ').trim();
    if (!symbol) { console.error('Usage: /similar <symbol-name>'); return; }
    const results = await RAGService.getInstance().findSimilarSymbols(symbol, 10);
    console.log(JSON.stringify(results, null, 2));
  },

  async review(args) {
    const since = args[0];
    const report = await DiffReviewService.getInstance().review({ since });
    console.log(JSON.stringify(report, null, 2));
  },

  async report() {
    const service = new IngestionService();
    await service.initialize();
    await ObservationService.getInstance().initializeSchema();
    const generator = new ReportGenerator();
    console.error('Generating report …');
    const outPath = await generator.generate();
    console.log(`Report written to ${outPath}`);
  },
};

export const SLASH_COMMANDS: SlashCommand[] = SLASH_COMMAND_DEFS.map((def) => ({
  ...def,
  run: runFns[def.name],
}));
