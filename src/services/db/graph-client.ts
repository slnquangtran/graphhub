import kuzu from 'kuzu';
import path from 'path';
import fs from 'fs';

export class GraphClient {
  private static instance: GraphClient;
  private db: kuzu.Database;
  private conn: kuzu.Connection;

  private constructor(dbPath: string = './.graphhub/db') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new kuzu.Database(dbPath);
    this.conn = new kuzu.Connection(this.db);
  }

  public static getInstance(): GraphClient {
    if (!GraphClient.instance) {
      GraphClient.instance = new GraphClient();
    }
    return GraphClient.instance;
  }

  public async initializeSchema(): Promise<void> {
    try {
      // Node Tables
      await this.runCypher('CREATE NODE TABLE File(path STRING, language STRING, PRIMARY KEY (path))');
      await this.runCypher('CREATE NODE TABLE Symbol(id STRING, name STRING, type STRING, kind STRING, range STRING, calls STRING[], import_source STRING, import_specifiers STRING[], purpose STRING, strategy STRING, inputs STRING[], outputs STRING[], PRIMARY KEY (id))');

      await this.runCypher('CREATE NODE TABLE Chunk(id STRING, text STRING, embedding FLOAT[384], PRIMARY KEY (id))');

      // Relationship Tables
      await this.runCypher('CREATE REL TABLE CONTAINS(FROM File TO Symbol)');
      await this.runCypher('CREATE REL TABLE CALLS(FROM Symbol TO Symbol)');
      await this.runCypher('CREATE REL TABLE IMPORTS(FROM File TO File, specifiers STRING[])');
      await this.runCypher('CREATE REL TABLE DESCRIBES(FROM Chunk TO Symbol)');
      
      console.log('KuzuDB Schema initialized successfully.');
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        console.log('KuzuDB Schema already exists, skipping initialization.');
      } else {
        console.error('Failed to initialize KuzuDB schema:', error);
        throw error;
      }
    }
  }

  public async runCypher(query: string, params: Record<string, any> = {}): Promise<any> {
    try {
      if (Object.keys(params).length === 0) {
        return await this.conn.query(query);
      } else {
        const preparedStatement = await this.conn.prepare(query);
        return await this.conn.execute(preparedStatement, params);
      }
    } catch (error) {
      console.error(`Cypher Query Error: ${query}`, error);
      throw error;
    }
  }

  public async close(): Promise<void> {
    // Kuzu node bindings handle cleanup, but we can explicitly nullify
    (this as any).conn = null;
    (this as any).db = null;
  }
}
