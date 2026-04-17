import { GraphClient } from '../db/graph-client.ts';
import { EmbeddingService } from '../ai/embedding-service.ts';
import crypto from 'crypto';

export interface Observation {
  id: string;
  session_id: string;
  timestamp: string;
  type: 'learning' | 'decision' | 'finding' | 'context';
  content: string;
  related_symbols: string[];
  tags: string[];
}

export class ObservationService {
  private static instance: ObservationService;
  private db: GraphClient;
  private embeddings: EmbeddingService;

  private constructor() {
    this.db = GraphClient.getInstance();
    this.embeddings = EmbeddingService.getInstance();
  }

  public static getInstance(): ObservationService {
    if (!ObservationService.instance) {
      ObservationService.instance = new ObservationService();
    }
    return ObservationService.instance;
  }

  public async initializeSchema(): Promise<void> {
    try {
      await this.db.runCypher(
        'CREATE NODE TABLE Observation(id STRING, session_id STRING, timestamp STRING, type STRING, content STRING, tags STRING[], embedding FLOAT[384], PRIMARY KEY (id))'
      );
      await this.db.runCypher('CREATE REL TABLE RELATES_TO(FROM Observation TO Symbol)');
      console.log('Observation schema initialized.');
    } catch (error: any) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }
  }

  public async remember(content: string, options: {
    session_id?: string;
    type?: 'learning' | 'decision' | 'finding' | 'context';
    related_symbols?: string[];
    tags?: string[];
  } = {}): Promise<string> {
    const id = crypto.randomUUID();
    const session_id = options.session_id || 'default';
    const type = options.type || 'learning';
    const tags = options.tags || [];
    const timestamp = new Date().toISOString();

    const embedding = await this.embeddings.embed(content);

    await this.db.runCypher(
      `CREATE (o:Observation {
        id: $id,
        session_id: $session_id,
        timestamp: $timestamp,
        type: $type,
        content: $content,
        tags: $tags,
        embedding: $embedding
      })`,
      { id, session_id, timestamp, type, content, tags, embedding }
    );

    if (options.related_symbols) {
      for (const symbolName of options.related_symbols) {
        try {
          await this.db.runCypher(
            `MATCH (o:Observation {id: $obs_id}), (s:Symbol {name: $symbol_name})
             CREATE (o)-[:RELATES_TO]->(s)`,
            { obs_id: id, symbol_name: symbolName }
          );
        } catch {
          // Symbol might not exist, skip
        }
      }
    }

    return id;
  }

  public async recall(query: string, options: {
    session_id?: string;
    type?: string;
    limit?: number;
  } = {}): Promise<Observation[]> {
    const limit = options.limit || 10;
    const queryEmbedding = await this.embeddings.embed(query);

    let cypher = 'MATCH (o:Observation)';
    const params: Record<string, any> = { limit };
    const conditions: string[] = [];

    if (options.session_id) {
      conditions.push('o.session_id = $session_id');
      params.session_id = options.session_id;
    }
    if (options.type) {
      conditions.push('o.type = $type');
      params.type = options.type;
    }

    if (conditions.length > 0) {
      cypher += ' WHERE ' + conditions.join(' AND ');
    }

    cypher += ' RETURN o.id, o.session_id, o.timestamp, o.type, o.content, o.tags, o.embedding';

    const result = await this.db.runCypher(cypher, params);
    const rows = await result.getAll();

    // Compute cosine similarity and rank
    const scored = rows.map((row: any) => {
      const embedding = row['o.embedding'] as number[];
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);
      return {
        id: row['o.id'],
        session_id: row['o.session_id'],
        timestamp: row['o.timestamp'],
        type: row['o.type'],
        content: row['o.content'],
        tags: row['o.tags'],
        related_symbols: [],
        similarity,
      };
    });

    scored.sort((a: any, b: any) => b.similarity - a.similarity);
    return scored.slice(0, limit);
  }

  public async forget(options: {
    session_id?: string;
    observation_id?: string;
    before?: string;
  } = {}): Promise<number> {
    let cypher = 'MATCH (o:Observation)';
    const conditions: string[] = [];
    const params: Record<string, any> = {};

    if (options.observation_id) {
      conditions.push('o.id = $id');
      params.id = options.observation_id;
    }
    if (options.session_id) {
      conditions.push('o.session_id = $session_id');
      params.session_id = options.session_id;
    }
    if (options.before) {
      conditions.push('o.timestamp < $before');
      params.before = options.before;
    }

    if (conditions.length > 0) {
      cypher += ' WHERE ' + conditions.join(' AND ');
    }

    cypher += ' DETACH DELETE o';
    await this.db.runCypher(cypher, params);
    return 1; // KuzuDB doesn't return delete count easily
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
