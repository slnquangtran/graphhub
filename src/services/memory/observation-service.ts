import { GraphClient } from '../db/graph-client.ts';
import { EmbeddingService } from '../ai/embedding-service.ts';
import crypto from 'crypto';

export type ObservationType =
  | 'learning'    // Something learned about the codebase
  | 'decision'    // An architectural or design decision
  | 'finding'     // A discovery or insight
  | 'context'     // Background context for understanding
  | 'bugfix'      // A bug that was fixed and how
  | 'feature'     // A feature that was implemented
  | 'refactor'    // A refactoring that was done
  | 'discovery'   // Something unexpected found
  | 'change'      // A notable change made
  | 'warning'     // Something to watch out for
  | 'todo';       // Something to do later

export type ImportanceLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Observation {
  id: string;
  session_id: string;
  project?: string;
  timestamp: string;
  type: ObservationType;
  title?: string;
  content: string;
  importance: ImportanceLevel;
  related_symbols: string[];
  file_paths: string[];
  tags: string[];
  similarity?: number;
}

export interface TimelineEntry {
  id: string;
  timestamp: string;
  type: ObservationType;
  title?: string;
  content: string;
  project?: string;
  importance: ImportanceLevel;
}

export interface ObservationStats {
  total: number;
  byType: Record<string, number>;
  byProject: Record<string, number>;
  byImportance: Record<string, number>;
  recentCount: number; // Last 24 hours
}

export class ObservationService {
  private static instance: ObservationService;
  private db: GraphClient;
  private embeddings: EmbeddingService;
  private schemaInitialized = false;

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
    if (this.schemaInitialized) return;

    try {
      await this.db.runCypher(
        `CREATE NODE TABLE IF NOT EXISTS Observation(
          id STRING,
          session_id STRING,
          project STRING,
          timestamp STRING,
          type STRING,
          title STRING,
          content STRING,
          importance STRING,
          file_paths STRING[],
          tags STRING[],
          embedding FLOAT[384],
          PRIMARY KEY (id)
        )`
      );
      await this.db.runCypher('CREATE REL TABLE IF NOT EXISTS RELATES_TO(FROM Observation TO Symbol)');
      this.schemaInitialized = true;
      console.log('Observation schema initialized.');
    } catch (error: any) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
      this.schemaInitialized = true;
    }
  }

  public async remember(content: string, options: {
    session_id?: string;
    project?: string;
    type?: ObservationType;
    title?: string;
    importance?: ImportanceLevel;
    related_symbols?: string[];
    file_paths?: string[];
    tags?: string[];
  } = {}): Promise<string> {
    await this.initializeSchema();

    const id = crypto.randomUUID();
    const session_id = options.session_id || 'default';
    const project = options.project || 'default';
    const type = options.type || 'learning';
    const title = options.title || this.generateTitle(content, type);
    const importance = options.importance || 'medium';
    const file_paths = options.file_paths || [];
    const tags = options.tags || [];
    const timestamp = new Date().toISOString();

    const embedding = await this.embeddings.generateEmbedding(content);

    await this.db.runCypher(
      `CREATE (o:Observation {
        id: $id,
        session_id: $session_id,
        project: $project,
        timestamp: $timestamp,
        type: $type,
        title: $title,
        content: $content,
        importance: $importance,
        file_paths: $file_paths,
        tags: $tags,
        embedding: $embedding
      })`,
      { id, session_id, project, timestamp, type, title, content, importance, file_paths, tags, embedding }
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

  private generateTitle(content: string, type: ObservationType): string {
    // Generate a short title from content
    const firstLine = content.split('\n')[0].trim();
    const maxLen = 60;
    if (firstLine.length <= maxLen) return firstLine;
    return firstLine.substring(0, maxLen - 3) + '...';
  }

  public async recall(query: string, options: {
    session_id?: string;
    project?: string;
    type?: ObservationType;
    types?: ObservationType[];
    importance?: ImportanceLevel;
    tags?: string[];
    dateStart?: string;
    dateEnd?: string;
    limit?: number;
  } = {}): Promise<Observation[]> {
    await this.initializeSchema();

    const limit = options.limit || 10;
    const queryEmbedding = await this.embeddings.generateEmbedding(query);

    let cypher = 'MATCH (o:Observation)';
    const params: Record<string, any> = {};
    const conditions: string[] = [];

    if (options.session_id) {
      conditions.push('o.session_id = $session_id');
      params.session_id = options.session_id;
    }
    if (options.project) {
      conditions.push('o.project = $project');
      params.project = options.project;
    }
    if (options.type) {
      conditions.push('o.type = $type');
      params.type = options.type;
    }
    if (options.types && options.types.length > 0) {
      conditions.push('o.type IN $types');
      params.types = options.types;
    }
    if (options.importance) {
      conditions.push('o.importance = $importance');
      params.importance = options.importance;
    }
    if (options.dateStart) {
      conditions.push('o.timestamp >= $dateStart');
      params.dateStart = options.dateStart;
    }
    if (options.dateEnd) {
      conditions.push('o.timestamp <= $dateEnd');
      params.dateEnd = options.dateEnd;
    }

    if (conditions.length > 0) {
      cypher += ' WHERE ' + conditions.join(' AND ');
    }

    cypher += ' RETURN o.id, o.session_id, o.project, o.timestamp, o.type, o.title, o.content, o.importance, o.file_paths, o.tags, o.embedding';

    // Fetch at most 2000 rows. Ranking is done in JS via cosine similarity so we
    // overfetch relative to `limit`, but a hard cap prevents unbounded memory use
    // as the observation store grows.
    const fetchCap = Math.min(Math.max(limit * 20, 200), 2000);
    cypher += ` LIMIT ${fetchCap}`;

    const result = Object.keys(params).length > 0
      ? await this.db.runCypher(cypher, params)
      : await this.db.runCypher(cypher);
    const rows = await result.getAll();

    // Compute cosine similarity and rank
    const scored = rows.map((row: any) => {
      const embedding = row['o.embedding'] as number[];
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);
      return {
        id: row['o.id'],
        session_id: row['o.session_id'],
        project: row['o.project'],
        timestamp: row['o.timestamp'],
        type: row['o.type'] as ObservationType,
        title: row['o.title'],
        content: row['o.content'],
        importance: row['o.importance'] as ImportanceLevel,
        file_paths: row['o.file_paths'] || [],
        tags: row['o.tags'] || [],
        related_symbols: [],
        similarity,
      };
    });

    // Filter by tags if specified (post-query since Kuzu array contains is tricky)
    let filtered = scored;
    if (options.tags && options.tags.length > 0) {
      filtered = scored.filter(obs =>
        options.tags!.some(tag => obs.tags.includes(tag))
      );
    }

    filtered.sort((a, b) => b.similarity - a.similarity);
    return filtered.slice(0, limit);
  }

  public async timeline(options: {
    project?: string;
    types?: ObservationType[];
    dateStart?: string;
    dateEnd?: string;
    limit?: number;
    orderBy?: 'asc' | 'desc';
  } = {}): Promise<TimelineEntry[]> {
    await this.initializeSchema();

    const limit = Math.max(1, Math.min(Number(options.limit || 50), 1000));
    const orderBy = options.orderBy === 'asc' ? 'ASC' : 'DESC';

    let cypher = 'MATCH (o:Observation)';
    const params: Record<string, any> = {};
    const conditions: string[] = [];

    if (options.project) {
      conditions.push('o.project = $project');
      params.project = options.project;
    }
    if (options.types && options.types.length > 0) {
      conditions.push('o.type IN $types');
      params.types = options.types;
    }
    if (options.dateStart) {
      conditions.push('o.timestamp >= $dateStart');
      params.dateStart = options.dateStart;
    }
    if (options.dateEnd) {
      conditions.push('o.timestamp <= $dateEnd');
      params.dateEnd = options.dateEnd;
    }

    if (conditions.length > 0) {
      cypher += ' WHERE ' + conditions.join(' AND ');
    }

    cypher += ' RETURN o.id, o.timestamp, o.type, o.title, o.content, o.project, o.importance';
    cypher += ` ORDER BY o.timestamp ${orderBy}`;
    cypher += ` LIMIT ${limit}`;

    const result = Object.keys(params).length > 0
      ? await this.db.runCypher(cypher, params)
      : await this.db.runCypher(cypher);
    const rows = await result.getAll();

    return rows.map((row: any) => ({
      id: row['o.id'],
      timestamp: row['o.timestamp'],
      type: row['o.type'] as ObservationType,
      title: row['o.title'],
      content: row['o.content'],
      project: row['o.project'],
      importance: row['o.importance'] as ImportanceLevel,
    }));
  }

  public async getStats(project?: string): Promise<ObservationStats> {
    await this.initializeSchema();

    const projectFilter = project ? ' WHERE o.project = $project' : '';
    const params = project ? { project } : {};

    // Total count
    const totalResult = await this.db.runCypher(
      `MATCH (o:Observation)${projectFilter} RETURN count(o) as count`,
      params
    );
    const totalRows = await totalResult.getAll();
    const total = Number(totalRows[0]?.count || 0);

    // By type
    const byTypeResult = await this.db.runCypher(
      `MATCH (o:Observation)${projectFilter} RETURN o.type as type, count(o) as count`,
      params
    );
    const byTypeRows = await byTypeResult.getAll();
    const byType: Record<string, number> = {};
    for (const row of byTypeRows) {
      byType[row.type] = Number(row.count);
    }

    // By project (only if not filtered)
    const byProject: Record<string, number> = {};
    if (!project) {
      const byProjectResult = await this.db.runCypher(
        'MATCH (o:Observation) RETURN o.project as project, count(o) as count'
      );
      const byProjectRows = await byProjectResult.getAll();
      for (const row of byProjectRows) {
        byProject[row.project || 'default'] = Number(row.count);
      }
    }

    // By importance
    const byImportanceResult = await this.db.runCypher(
      `MATCH (o:Observation)${projectFilter} RETURN o.importance as importance, count(o) as count`,
      params
    );
    const byImportanceRows = await byImportanceResult.getAll();
    const byImportance: Record<string, number> = {};
    for (const row of byImportanceRows) {
      byImportance[row.importance || 'medium'] = Number(row.count);
    }

    // Recent (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentResult = await this.db.runCypher(
      `MATCH (o:Observation) WHERE o.timestamp >= $since${project ? ' AND o.project = $project' : ''} RETURN count(o) as count`,
      { since: oneDayAgo, ...(project ? { project } : {}) }
    );
    const recentRows = await recentResult.getAll();
    const recentCount = Number(recentRows[0]?.count || 0);

    return { total, byType, byProject, byImportance, recentCount };
  }

  public async getObservation(id: string): Promise<Observation | null> {
    await this.initializeSchema();

    const result = await this.db.runCypher(
      'MATCH (o:Observation {id: $id}) RETURN o.id, o.session_id, o.project, o.timestamp, o.type, o.title, o.content, o.importance, o.file_paths, o.tags',
      { id }
    );
    const rows = await result.getAll();

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: row['o.id'],
      session_id: row['o.session_id'],
      project: row['o.project'],
      timestamp: row['o.timestamp'],
      type: row['o.type'] as ObservationType,
      title: row['o.title'],
      content: row['o.content'],
      importance: row['o.importance'] as ImportanceLevel,
      file_paths: row['o.file_paths'] || [],
      tags: row['o.tags'] || [],
      related_symbols: [],
    };
  }

  public async updateObservation(id: string, updates: {
    content?: string;
    title?: string;
    importance?: ImportanceLevel;
    tags?: string[];
    file_paths?: string[];
  }): Promise<boolean> {
    await this.initializeSchema();

    const sets: string[] = [];
    const params: Record<string, any> = { id };

    if (updates.content !== undefined) {
      sets.push('o.content = $content');
      params.content = updates.content;
      // Re-generate embedding
      const embedding = await this.embeddings.generateEmbedding(updates.content);
      sets.push('o.embedding = $embedding');
      params.embedding = embedding;
    }
    if (updates.title !== undefined) {
      sets.push('o.title = $title');
      params.title = updates.title;
    }
    if (updates.importance !== undefined) {
      sets.push('o.importance = $importance');
      params.importance = updates.importance;
    }
    if (updates.tags !== undefined) {
      sets.push('o.tags = $tags');
      params.tags = updates.tags;
    }
    if (updates.file_paths !== undefined) {
      sets.push('o.file_paths = $file_paths');
      params.file_paths = updates.file_paths;
    }

    if (sets.length === 0) return false;

    await this.db.runCypher(
      `MATCH (o:Observation {id: $id}) SET ${sets.join(', ')}`,
      params
    );
    return true;
  }

  public async forget(options: {
    session_id?: string;
    project?: string;
    observation_id?: string;
    before?: string;
    type?: ObservationType;
  } = {}): Promise<number> {
    await this.initializeSchema();

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
    if (options.project) {
      conditions.push('o.project = $project');
      params.project = options.project;
    }
    if (options.before) {
      conditions.push('o.timestamp < $before');
      params.before = options.before;
    }
    if (options.type) {
      conditions.push('o.type = $type');
      params.type = options.type;
    }

    if (conditions.length === 0) {
      throw new Error('forget() requires at least one filter: observation_id, session_id, project, type, or before');
    }

    cypher += ' WHERE ' + conditions.join(' AND ');

    const countResult = await this.db.runCypher(
      cypher + ' RETURN count(o) as cnt',
      params
    );
    const countRows = await countResult.getAll();
    const deleted = Number(countRows[0]?.cnt || 0);

    await this.db.runCypher(cypher + ' DETACH DELETE o', params);
    return deleted;
  }

  public async getRelatedObservations(symbolName: string, limit = 10): Promise<Observation[]> {
    await this.initializeSchema();

    const safeLimit = Math.max(1, Math.min(Number(limit), 1000));
    const result = await this.db.runCypher(
      `MATCH (o:Observation)-[:RELATES_TO]->(s:Symbol {name: $name})
       RETURN o.id, o.session_id, o.project, o.timestamp, o.type, o.title, o.content, o.importance, o.file_paths, o.tags
       ORDER BY o.timestamp DESC
       LIMIT ${safeLimit}`,
      { name: symbolName }
    );
    const rows = await result.getAll();

    return rows.map((row: any) => ({
      id: row['o.id'],
      session_id: row['o.session_id'],
      project: row['o.project'],
      timestamp: row['o.timestamp'],
      type: row['o.type'] as ObservationType,
      title: row['o.title'],
      content: row['o.content'],
      importance: row['o.importance'] as ImportanceLevel,
      file_paths: row['o.file_paths'] || [],
      tags: row['o.tags'] || [],
      related_symbols: [symbolName],
    }));
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}
