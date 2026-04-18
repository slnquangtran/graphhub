import { GraphClient } from '../db/graph-client.ts';
import { EmbeddingService } from './embedding-service.ts';

export type SearchMode = 'semantic' | 'keyword' | 'hybrid';

export interface SearchResult {
  symbolName: string;
  kind: string;
  text: string;
  score: number;
  filePath?: string;
  lineRange?: string;
  callers?: string[];
  callees?: string[];
  matchType: 'semantic' | 'keyword' | 'exact';
}

export interface GroupedSearchResult {
  filePath: string;
  symbols: SearchResult[];
  fileScore: number;
}

export interface SearchOptions {
  limit?: number;
  mode?: SearchMode;
  minScore?: number;
  includeContext?: boolean;
  groupByFile?: boolean;
  symbolKinds?: string[];
}

export class RAGService {
  private static instance: RAGService;
  private db: GraphClient;
  private embeddingService: EmbeddingService;

  private constructor() {
    this.db = GraphClient.getInstance();
    this.embeddingService = EmbeddingService.getInstance();
  }

  public static getInstance(): RAGService {
    if (!RAGService.instance) {
      RAGService.instance = new RAGService();
    }
    return RAGService.instance;
  }

  private cosineSimilarity(v1: number[], v2: number[]): number {
    if (!v1 || !v2 || v1.length !== v2.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < v1.length; i++) {
      dotProduct += v1[i] * v2[i];
      normA += v1[i] * v1[i];
      normB += v2[i] * v2[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dotProduct / denom;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }

  private camelCaseToWords(name: string): string[] {
    return name
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .toLowerCase()
      .split(/[\s_-]+/)
      .filter(w => w.length > 1);
  }

  private computeKeywordScore(query: string, text: string, symbolName: string): number {
    const queryTokens = new Set(this.tokenize(query));
    const textTokens = this.tokenize(text);
    const nameTokens = this.camelCaseToWords(symbolName);

    if (queryTokens.size === 0) return 0;

    let matches = 0;
    let nameMatches = 0;

    // Check text matches
    for (const token of textTokens) {
      if (queryTokens.has(token)) matches++;
    }

    // Check symbol name matches (weighted higher)
    for (const token of nameTokens) {
      if (queryTokens.has(token)) nameMatches++;
    }

    // Exact name match bonus
    const exactMatch = symbolName.toLowerCase().includes(query.toLowerCase()) ? 0.3 : 0;

    // Normalize: text matches + weighted name matches + exact bonus
    const textScore = Math.min(matches / queryTokens.size, 1) * 0.4;
    const nameScore = Math.min(nameMatches / queryTokens.size, 1) * 0.3;

    return textScore + nameScore + exactMatch;
  }

  public async search(query: string, limit: number = 5): Promise<SearchResult[]> {
    return this.advancedSearch(query, { limit, mode: 'hybrid' });
  }

  public async advancedSearch(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const {
      limit = 10,
      mode = 'hybrid',
      minScore = 0.1,
      includeContext = false,
      symbolKinds,
    } = options;

    // Build query with optional kind filter
    let cypher = 'MATCH (c:Chunk)-[:DESCRIBES]->(s:Symbol)<-[:CONTAINS]-(f:File)';
    const params: Record<string, any> = {};

    if (symbolKinds && symbolKinds.length > 0) {
      cypher += ' WHERE s.kind IN $kinds';
      params.kinds = symbolKinds;
    }

    cypher += ' RETURN s.name as name, s.kind as kind, s.range as range, c.text as text, c.embedding as embedding, f.path as filePath';

    const result = Object.keys(params).length > 0
      ? await this.db.runCypher(cypher, params)
      : await this.db.runCypher(cypher);
    const rows = await result.getAll();

    let ranked: SearchResult[];

    if (mode === 'keyword') {
      // Pure keyword search
      ranked = rows.map(row => {
        const keywordScore = this.computeKeywordScore(query, row.text as string, row.name as string);
        return {
          symbolName: row.name as string,
          kind: row.kind as string,
          text: row.text as string,
          score: keywordScore,
          filePath: row.filePath as string,
          lineRange: row.range as string,
          matchType: 'keyword' as const,
        };
      });
    } else if (mode === 'semantic') {
      // Pure semantic search
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      ranked = rows.map(row => {
        const semanticScore = this.cosineSimilarity(queryEmbedding, row.embedding as number[]);
        return {
          symbolName: row.name as string,
          kind: row.kind as string,
          text: row.text as string,
          score: semanticScore,
          filePath: row.filePath as string,
          lineRange: row.range as string,
          matchType: 'semantic' as const,
        };
      });
    } else {
      // Hybrid search - combine both
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      ranked = rows.map(row => {
        const semanticScore = this.cosineSimilarity(queryEmbedding, row.embedding as number[]);
        const keywordScore = this.computeKeywordScore(query, row.text as string, row.name as string);

        // Weighted combination: 60% semantic, 40% keyword
        const hybridScore = semanticScore * 0.6 + keywordScore * 0.4;

        // Determine primary match type
        const matchType = keywordScore > semanticScore ? 'keyword' : 'semantic';

        return {
          symbolName: row.name as string,
          kind: row.kind as string,
          text: row.text as string,
          score: hybridScore,
          filePath: row.filePath as string,
          lineRange: row.range as string,
          matchType: matchType as 'semantic' | 'keyword',
        };
      });
    }

    // Filter by minimum score
    ranked = ranked.filter(r => r.score >= minScore);

    // Sort and limit
    ranked.sort((a, b) => b.score - a.score);
    ranked = ranked.slice(0, limit);

    // Optionally include context (callers/callees)
    if (includeContext && ranked.length > 0) {
      ranked = await this.enrichWithContext(ranked);
    }

    return ranked;
  }

  private async enrichWithContext(results: SearchResult[]): Promise<SearchResult[]> {
    for (const result of results) {
      try {
        // Get callers
        const callersResult = await this.db.runCypher(
          'MATCH (caller:Symbol)-[:CALLS]->(s:Symbol {name: $name}) RETURN caller.name as name LIMIT 5',
          { name: result.symbolName }
        );
        const callers = await callersResult.getAll();
        result.callers = callers.map((r: any) => r.name as string);

        // Get callees
        const calleesResult = await this.db.runCypher(
          'MATCH (s:Symbol {name: $name})-[:CALLS]->(callee:Symbol) RETURN callee.name as name LIMIT 5',
          { name: result.symbolName }
        );
        const callees = await calleesResult.getAll();
        result.callees = callees.map((r: any) => r.name as string);
      } catch {
        // Skip context enrichment on error
      }
    }
    return results;
  }

  public async searchBySymbolName(name: string, fuzzy: boolean = false): Promise<SearchResult[]> {
    let cypher: string;
    const params: Record<string, any> = {};

    if (fuzzy) {
      // Fuzzy match using CONTAINS
      cypher = `
        MATCH (s:Symbol)<-[:CONTAINS]-(f:File)
        WHERE s.name CONTAINS $name
        OPTIONAL MATCH (c:Chunk)-[:DESCRIBES]->(s)
        RETURN s.name as name, s.kind as kind, s.range as range, c.text as text, f.path as filePath
        LIMIT 20
      `;
      params.name = name.toLowerCase();
    } else {
      // Exact match
      cypher = `
        MATCH (s:Symbol {name: $name})<-[:CONTAINS]-(f:File)
        OPTIONAL MATCH (c:Chunk)-[:DESCRIBES]->(s)
        RETURN s.name as name, s.kind as kind, s.range as range, c.text as text, f.path as filePath
      `;
      params.name = name;
    }

    const result = await this.db.runCypher(cypher, params);
    const rows = await result.getAll();

    return rows.map(row => ({
      symbolName: row.name as string,
      kind: row.kind as string,
      text: (row.text as string) || '',
      score: 1.0,
      filePath: row.filePath as string,
      lineRange: row.range as string,
      matchType: 'exact' as const,
    }));
  }

  public async searchGroupedByFile(query: string, options: SearchOptions = {}): Promise<GroupedSearchResult[]> {
    const results = await this.advancedSearch(query, { ...options, groupByFile: false });

    // Group by file
    const fileMap = new Map<string, SearchResult[]>();
    for (const result of results) {
      const path = result.filePath || 'unknown';
      if (!fileMap.has(path)) {
        fileMap.set(path, []);
      }
      fileMap.get(path)!.push(result);
    }

    // Convert to grouped results with file score (max of symbol scores)
    const grouped: GroupedSearchResult[] = [];
    for (const [filePath, symbols] of fileMap) {
      const fileScore = Math.max(...symbols.map(s => s.score));
      grouped.push({ filePath, symbols, fileScore });
    }

    // Sort by file score
    grouped.sort((a, b) => b.fileScore - a.fileScore);

    return grouped;
  }

  public async findSimilarSymbols(symbolName: string, limit: number = 5): Promise<SearchResult[]> {
    // Get the symbol's chunk embedding
    const result = await this.db.runCypher(
      `MATCH (c:Chunk)-[:DESCRIBES]->(s:Symbol {name: $name})
       RETURN c.embedding as embedding, c.text as text`,
      { name: symbolName }
    );
    const rows = await result.getAll();

    if (rows.length === 0) {
      return [];
    }

    const targetEmbedding = rows[0].embedding as number[];

    // Find similar chunks
    const allChunks = await this.db.runCypher(
      `MATCH (c:Chunk)-[:DESCRIBES]->(s:Symbol)<-[:CONTAINS]-(f:File)
       WHERE s.name <> $name
       RETURN s.name as name, s.kind as kind, c.text as text, c.embedding as embedding, f.path as filePath, s.range as range`,
      { name: symbolName }
    );
    const allRows = await allChunks.getAll();

    const ranked = allRows.map(row => {
      const score = this.cosineSimilarity(targetEmbedding, row.embedding as number[]);
      return {
        symbolName: row.name as string,
        kind: row.kind as string,
        text: row.text as string,
        score,
        filePath: row.filePath as string,
        lineRange: row.range as string,
        matchType: 'semantic' as const,
      };
    });

    ranked.sort((a, b) => b.score - a.score);
    return ranked.slice(0, limit);
  }

  public async explainSearch(query: string): Promise<{
    tokens: string[];
    expandedTerms: string[];
    searchStrategy: string;
  }> {
    const tokens = this.tokenize(query);
    const expandedTerms = new Set<string>();

    // Add camelCase expansions
    for (const token of tokens) {
      expandedTerms.add(token);
      // Common programming synonyms
      if (token === 'get') expandedTerms.add('fetch');
      if (token === 'set') expandedTerms.add('update');
      if (token === 'create') expandedTerms.add('new');
      if (token === 'delete') expandedTerms.add('remove');
      if (token === 'find') expandedTerms.add('search');
      if (token === 'parse') expandedTerms.add('process');
    }

    return {
      tokens,
      expandedTerms: Array.from(expandedTerms),
      searchStrategy: tokens.length <= 2 ? 'keyword-boosted' : 'semantic-primary',
    };
  }
}
