import { GraphClient } from './graph-client.ts';

export class GraphExporter {
  private db: GraphClient;

  constructor() {
    this.db = GraphClient.getInstance();
  }

  public async exportToMermaid(): Promise<string> {
    const symbolsResult = await this.db.runCypher(
      'MATCH (f:File)-[:CONTAINS]->(s:Symbol) RETURN f.path as filePath, s.id as id, s.name as name, s.kind as kind'
    );
    const symbols = await symbolsResult.getAll();

    const callsResult = await this.db.runCypher(
      'MATCH (s1:Symbol)-[:CALLS]->(s2:Symbol) RETURN s1.id as caller, s2.id as callee'
    );
    const calls = await callsResult.getAll();

    const importsResult = await this.db.runCypher(
      'MATCH (f1:File)-[:IMPORTS]->(f2:File) RETURN f1.path as source, f2.path as target'
    );
    const imports = await importsResult.getAll();

    // Build ID map for safe Mermaid IDs
    const idMap: Record<string, string> = {};
    symbols.forEach((s: any, index: number) => {
      idMap[s.id] = `node_${index}`;
    });

    // Group symbols by file
    const byFile = new Map<string, typeof symbols>();
    for (const s of symbols) {
      if (!byFile.has(s.filePath)) byFile.set(s.filePath, []);
      byFile.get(s.filePath)!.push(s);
    }

    let mermaid = 'graph TD\n';

    // Style classes per symbol kind
    mermaid += '  classDef file fill:#1e3a5f,stroke:#3b82f6,color:#fff\n';
    mermaid += '  classDef function fill:#14532d,stroke:#22c55e,color:#fff\n';
    mermaid += '  classDef method fill:#1a3a1a,stroke:#4ade80,color:#fff\n';
    mermaid += '  classDef class fill:#3b1d5e,stroke:#a855f7,color:#fff\n';
    mermaid += '  classDef interface fill:#1e3a5e,stroke:#60a5fa,color:#fff\n';
    mermaid += '  classDef variable fill:#3b2200,stroke:#f59e0b,color:#fff\n';
    mermaid += '  classDef import fill:#2a2a2a,stroke:#6b7280,color:#aaa\n';
    mermaid += '\n';

    // Subgraph per file
    let subgraphIndex = 0;
    for (const [filePath, fileSymbols] of byFile) {
      const shortPath = filePath.replace(/\\/g, '/').split('/src/').pop() || filePath;
      mermaid += `  subgraph sg_${subgraphIndex}["${shortPath}"]\n`;
      for (const s of fileSymbols) {
        const safeId = idMap[s.id];
        const label = s.name.length > 30 ? s.name.substring(0, 28) + '…' : s.name;
        mermaid += `    ${safeId}["${label}"]\n`;
        mermaid += `    class ${safeId} ${s.kind || 'function'}\n`;
      }
      mermaid += '  end\n';
      subgraphIndex++;
    }

    mermaid += '\n';

    // CALLS edges (green)
    for (const c of calls) {
      if (idMap[c.caller] && idMap[c.callee]) {
        mermaid += `  ${idMap[c.caller]} -->|calls| ${idMap[c.callee]}\n`;
      }
    }

    // IMPORTS edges between files (blue, dashed style via linkStyle isn't easy in Mermaid TD, use arrows)
    for (const imp of imports) {
      const srcSymbols = byFile.get(imp.source);
      const dstSymbols = byFile.get(imp.target);
      if (srcSymbols?.[0] && dstSymbols?.[0]) {
        mermaid += `  ${idMap[srcSymbols[0].id]} -.->|imports| ${idMap[dstSymbols[0].id]}\n`;
      }
    }

    return mermaid;
  }
}
