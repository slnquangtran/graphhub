import { describe, it, expect, beforeAll } from 'vitest';
import { EmbeddingService } from '../services/ai/embedding-service.ts';

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  beforeAll(async () => {
    service = EmbeddingService.getInstance();
    await service.initialize();
  }, 30000); // Higher timeout for model download

  it('should generate a 384-dimensional embedding', async () => {
    const embedding = await service.generateEmbedding('Hello world');
    expect(embedding).toBeDefined();
    expect(embedding.length).toBe(384);
  });

  it('should generate different embeddings for different texts', async () => {
    const e1 = await service.generateEmbedding('Database initialization');
    const e2 = await service.generateEmbedding('Making a cup of coffee');
    
    // Check they aren't deep equal
    expect(e1).not.toEqual(e2);
  });
});
