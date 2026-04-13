import { GraphClient } from '../db/graph-client.ts';
import { EmbeddingService } from './embedding-service.ts';

export interface SearchResult {
  symbolName: string;
  kind: string;
  text: string;
  score: number;
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
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < v1.length; i++) {
        dotProduct += v1[i] * v2[i];
        normA += v1[i] * v1[i];
        normB += v2[i] * v2[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  public async search(query: string, limit: number = 5): Promise<SearchResult[]> {
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);
    
    // For small codebases, a full scan is fine.
    // In larger ones, we would use Kuzu's ANN indices.
    const result = await this.db.runCypher(
      'MATCH (c:Chunk)-[:DESCRIBES]->(s:Symbol) ' +
      'RETURN s.name as name, s.kind as kind, c.text as text, c.embedding as embedding'
    );
    const rows = await result.getAll();

    const ranked = rows.map(row => {
      const score = this.cosineSimilarity(queryEmbedding, row.embedding as number[]);
      return {
        symbolName: row.name as string,
        kind: row.kind as string,
        text: row.text as string,
        score
      };
    });

    return ranked
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
