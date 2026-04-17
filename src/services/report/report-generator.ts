import { GraphClient } from '../db/graph-client.ts';
import fs from 'fs';
import path from 'path';

interface SymbolStats {
  name: string;
  kind: string;
  caller_count: number;
  callee_count: number;
  file: string;
}

export class ReportGenerator {
  private db: GraphClient;

  constructor() {
    this.db = GraphClient.getInstance();
  }

  public async generate(outputDir: string = '.graphhub'): Promise<string> {
    const files = await this.getFileCount();
    const symbols = await this.getSymbolCount();
    const godNodes = await this.getGodNodes(10);
    const leafNodes = await this.getLeafNodes(10);
    const clusters = await this.detectClusters();
    const recentObservations = await this.getRecentObservations(5);

    const report = this.formatReport({
      files,
      symbols,
      godNodes,
      leafNodes,
      clusters,
      recentObservations,
      generatedAt: new Date().toISOString(),
    });

    const outPath = path.join(outputDir, 'GRAPH_REPORT.md');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outPath, report);
    return outPath;
  }

  private async getFileCount(): Promise<number> {
    const result = await this.db.runCypher('MATCH (f:File) RETURN count(f) as cnt');
    const rows = await result.getAll();
    return rows[0]?.cnt || 0;
  }

  private async getSymbolCount(): Promise<number> {
    const result = await this.db.runCypher('MATCH (s:Symbol) RETURN count(s) as cnt');
    const rows = await result.getAll();
    return rows[0]?.cnt || 0;
  }

  private async getGodNodes(limit: number): Promise<SymbolStats[]> {
    const result = await this.db.runCypher(`
      MATCH (f:File)-[:CONTAINS]->(s:Symbol)
      OPTIONAL MATCH (caller:Symbol)-[:CALLS]->(s)
      OPTIONAL MATCH (s)-[:CALLS]->(callee:Symbol)
      RETURN s.name as name, s.kind as kind, f.path as file,
             count(DISTINCT caller) as caller_count,
             count(DISTINCT callee) as callee_count
      ORDER BY caller_count DESC
      LIMIT ${limit}
    `);
    const rows = await result.getAll();
    return rows.map((r: any) => ({
      name: r.name,
      kind: r.kind,
      file: r.file,
      caller_count: r.caller_count,
      callee_count: r.callee_count,
    }));
  }

  private async getLeafNodes(limit: number): Promise<SymbolStats[]> {
    const result = await this.db.runCypher(`
      MATCH (f:File)-[:CONTAINS]->(s:Symbol)
      WHERE NOT EXISTS { MATCH (s)-[:CALLS]->(:Symbol) }
      OPTIONAL MATCH (caller:Symbol)-[:CALLS]->(s)
      RETURN s.name as name, s.kind as kind, f.path as file,
             count(DISTINCT caller) as caller_count, 0 as callee_count
      ORDER BY caller_count DESC
      LIMIT ${limit}
    `);
    const rows = await result.getAll();
    return rows.map((r: any) => ({
      name: r.name,
      kind: r.kind,
      file: r.file,
      caller_count: r.caller_count,
      callee_count: 0,
    }));
  }

  private async detectClusters(): Promise<Map<string, string[]>> {
    const result = await this.db.runCypher(`
      MATCH (f:File)-[:CONTAINS]->(s:Symbol)
      RETURN f.path as file, collect(s.name) as symbols
    `);
    const rows = await result.getAll();
    const clusters = new Map<string, string[]>();

    for (const row of rows) {
      const dir = path.dirname(row.file);
      const existing = clusters.get(dir) || [];
      existing.push(...row.symbols);
      clusters.set(dir, existing);
    }
    return clusters;
  }

  private async getRecentObservations(limit: number): Promise<any[]> {
    try {
      const result = await this.db.runCypher(`
        MATCH (o:Observation)
        RETURN o.content as content, o.type as type, o.timestamp as timestamp
        ORDER BY o.timestamp DESC
        LIMIT ${limit}
      `);
      return await result.getAll();
    } catch {
      return [];
    }
  }

  private formatReport(data: {
    files: number;
    symbols: number;
    godNodes: SymbolStats[];
    leafNodes: SymbolStats[];
    clusters: Map<string, string[]>;
    recentObservations: any[];
    generatedAt: string;
  }): string {
    let md = `# GraphHub Knowledge Graph Report

> Generated: ${data.generatedAt}
> Files: ${data.files} | Symbols: ${data.symbols}

## God Nodes (Most Called)

These symbols are called by many others. Changes here have HIGH blast radius.

| Symbol | Kind | Callers | File |
|--------|------|---------|------|
`;

    for (const node of data.godNodes) {
      const risk = node.caller_count > 5 ? 'HIGH' : node.caller_count > 2 ? 'MEDIUM' : 'LOW';
      md += `| \`${node.name}\` | ${node.kind} | ${node.caller_count} (${risk}) | ${node.file} |\n`;
    }

    md += `
## Leaf Nodes (Entry Points / Utilities)

These symbols don't call other tracked symbols. Often entry points or pure utilities.

| Symbol | Kind | Called By | File |
|--------|------|-----------|------|
`;

    for (const node of data.leafNodes) {
      md += `| \`${node.name}\` | ${node.kind} | ${node.caller_count} | ${node.file} |\n`;
    }

    md += `
## Clusters (By Directory)

`;

    for (const [dir, symbols] of data.clusters) {
      if (symbols.length > 0) {
        md += `### ${dir}\n`;
        md += `${symbols.length} symbols: ${symbols.slice(0, 5).map(s => `\`${s}\``).join(', ')}${symbols.length > 5 ? ` ... +${symbols.length - 5} more` : ''}\n\n`;
      }
    }

    if (data.recentObservations.length > 0) {
      md += `## Recent Session Memory

`;
      for (const obs of data.recentObservations) {
        md += `- **[${obs.type}]** ${obs.content.substring(0, 100)}${obs.content.length > 100 ? '...' : ''}\n`;
      }
    }

    md += `
## How to Use This Report

1. **Before editing a god node**: Run \`impact_analysis\` MCP tool first
2. **Understanding architecture**: Start with clusters, then trace calls
3. **Finding entry points**: Look at leaf nodes with high caller count
4. **Session continuity**: Use \`remember\` to save learnings, \`recall\` to retrieve

---
*This report is auto-generated. Re-run \`npm run report\` after code changes.*
`;

    return md;
  }
}
