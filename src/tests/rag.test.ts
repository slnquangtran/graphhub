import { describe, it, expect, beforeAll } from 'vitest';
import { RAGService } from '../services/ai/rag-service.ts';
import { EmbeddingService } from '../services/ai/embedding-service.ts';

describe('RAGService', () => {
  let embeddingService: EmbeddingService;

  beforeAll(async () => {
    // Only initialize embedding service - don't touch DB
    embeddingService = EmbeddingService.getInstance();
    await embeddingService.initialize();
  }, 30000);

  it('should be a singleton', () => {
    const s1 = RAGService.getInstance();
    const s2 = RAGService.getInstance();
    expect(s1).toBe(s2);
  });

  it('should have required methods', () => {
    const service = RAGService.getInstance();
    expect(typeof service.search).toBe('function');
  });

  it('cosineSimilarity should compute correctly', () => {
    // Access the private method via prototype for unit testing
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
  });
});
