import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';

export class EmbeddingService {
  private static instance: EmbeddingService;
  private pipe: FeatureExtractionPipeline | null = null;

  private constructor() {}

  public static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService();
    }
    return EmbeddingService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.pipe) return;
    
    console.error('Initializing local embedding model (Xenova/all-MiniLM-L6-v2)...');
    this.pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.error('Embedding model loaded.');
  }

  public async generateEmbedding(text: string): Promise<number[]> {
    if (!this.pipe) {
      await this.initialize();
    }

    const output = await this.pipe!(text, { 
      pooling: 'mean', 
      normalize: true 
    });

    return Array.from(output.data);
  }
}
