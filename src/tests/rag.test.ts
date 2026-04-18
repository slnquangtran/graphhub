import { describe, it, expect, beforeAll } from 'vitest';
import { RAGService } from '../services/ai/rag-service.ts';
import { EmbeddingService } from '../services/ai/embedding-service.ts';
import { IngestionService } from '../services/ingestion/ingestion-service.ts';

describe('RAGService', () => {
  let embeddingService: EmbeddingService;
  let ragService: RAGService;

  beforeAll(async () => {
    embeddingService = EmbeddingService.getInstance();
    await embeddingService.initialize();
    ragService = RAGService.getInstance();

    // Ensure some data is indexed for search tests
    const ingestion = new IngestionService();
    await ingestion.initialize();
  }, 60000);

  it('should be a singleton', () => {
    const s1 = RAGService.getInstance();
    const s2 = RAGService.getInstance();
    expect(s1).toBe(s2);
  });

  it('should have required methods', () => {
    const service = RAGService.getInstance();
    expect(typeof service.search).toBe('function');
    expect(typeof service.advancedSearch).toBe('function');
    expect(typeof service.searchBySymbolName).toBe('function');
    expect(typeof service.searchGroupedByFile).toBe('function');
    expect(typeof service.findSimilarSymbols).toBe('function');
    expect(typeof service.explainSearch).toBe('function');
  });

  it('cosineSimilarity should compute correctly', () => {
    const service = RAGService.getInstance() as any;

    // Identical vectors should have similarity 1.0
    const v1 = [1, 0, 0];
    const v2 = [1, 0, 0];
    expect(service.cosineSimilarity(v1, v2)).toBeCloseTo(1.0);

    // Orthogonal vectors should have similarity 0.0
    const v3 = [1, 0, 0];
    const v4 = [0, 1, 0];
    expect(service.cosineSimilarity(v3, v4)).toBeCloseTo(0.0);

    // Opposite vectors should have similarity -1.0
    const v5 = [1, 0, 0];
    const v6 = [-1, 0, 0];
    expect(service.cosineSimilarity(v5, v6)).toBeCloseTo(-1.0);

    // Handle null/undefined
    expect(service.cosineSimilarity(null, v1)).toBe(0);
    expect(service.cosineSimilarity(v1, null)).toBe(0);
  });

  it('tokenize should split text into lowercase tokens', () => {
    const service = RAGService.getInstance() as any;

    const tokens = service.tokenize('Hello World test function');
    expect(tokens).toContain('hello');
    expect(tokens).toContain('world');
    expect(tokens).toContain('test');
    expect(tokens).toContain('function');
  });

  it('camelCaseToWords should split camelCase names', () => {
    const service = RAGService.getInstance() as any;

    expect(service.camelCaseToWords('getUserById')).toEqual(['get', 'user', 'by', 'id']);
    expect(service.camelCaseToWords('parseJSONData')).toEqual(['parse', 'json', 'data']);
    expect(service.camelCaseToWords('XMLParser')).toEqual(['xml', 'parser']);
  });

  it('computeKeywordScore should score text relevance', () => {
    const service = RAGService.getInstance() as any;

    // Exact match in name should score high
    const score1 = service.computeKeywordScore('parse', 'Parses the input', 'parseInput');
    expect(score1).toBeGreaterThan(0.3);

    // No match should score low
    const score2 = service.computeKeywordScore('database', 'Handles HTTP requests', 'httpHandler');
    expect(score2).toBeLessThan(0.1);
  });

  it('explainSearch should return search explanation', async () => {
    const explanation = await ragService.explainSearch('parse json data');

    expect(explanation.tokens).toContain('parse');
    expect(explanation.tokens).toContain('json');
    expect(explanation.tokens).toContain('data');
    expect(explanation.expandedTerms).toBeDefined();
    expect(explanation.searchStrategy).toBeDefined();
  });

  it('advancedSearch should support different modes', async () => {
    // Test that all modes work without error
    const semanticResults = await ragService.advancedSearch('parse code', { mode: 'semantic', limit: 3 });
    expect(Array.isArray(semanticResults)).toBe(true);

    const keywordResults = await ragService.advancedSearch('parse code', { mode: 'keyword', limit: 3 });
    expect(Array.isArray(keywordResults)).toBe(true);

    const hybridResults = await ragService.advancedSearch('parse code', { mode: 'hybrid', limit: 3 });
    expect(Array.isArray(hybridResults)).toBe(true);
  });

  it('advancedSearch should filter by minScore', async () => {
    const highThreshold = await ragService.advancedSearch('xyz123nonexistent', {
      mode: 'hybrid',
      minScore: 0.9,
    });
    expect(highThreshold.length).toBe(0);
  });

  it('searchGroupedByFile should group results by file', async () => {
    const grouped = await ragService.searchGroupedByFile('function', { limit: 10 });

    expect(Array.isArray(grouped)).toBe(true);
    if (grouped.length > 0) {
      expect(grouped[0].filePath).toBeDefined();
      expect(grouped[0].symbols).toBeDefined();
      expect(grouped[0].fileScore).toBeDefined();
    }
  });

  it('search results should include matchType', async () => {
    const results = await ragService.advancedSearch('parse', { limit: 5 });

    for (const result of results) {
      expect(['semantic', 'keyword', 'exact']).toContain(result.matchType);
    }
  });
});
