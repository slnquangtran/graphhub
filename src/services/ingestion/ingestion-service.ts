import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { CodeParser, SymbolDefinition } from './parser.ts';
import { GraphClient } from '../db/graph-client.ts';
import { EmbeddingService } from '../ai/embedding-service.ts';

export class IngestionService {
  private parser: CodeParser;
  private db: GraphClient;
  private embeddingService: EmbeddingService;

  constructor() {
    this.parser = new CodeParser();
    this.db = GraphClient.getInstance();
    this.embeddingService = EmbeddingService.getInstance();
  }

  public async initialize(): Promise<void> {
    await this.parser.initialize();
    await this.db.initializeSchema();
    await this.embeddingService.initialize();
    // Ensure file hash tracking table exists
    await this.db.runCypher(
      'CREATE NODE TABLE IF NOT EXISTS FileHash(path STRING, hash STRING, PRIMARY KEY (path))'
    ).catch(() => {});
  }

  private async getFileHash(content: string): Promise<string> {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private async isFileStale(absolutePath: string, content: string): Promise<boolean> {
    const hash = await this.getFileHash(content);
    try {
      const result = await this.db.runCypher(
        'MATCH (h:FileHash {path: $path}) RETURN h.hash as hash',
        { path: absolutePath }
      );
      const rows = await result.getAll();
      if (rows.length === 0) return true;
      return rows[0].hash !== hash;
    } catch {
      return true;
    }
  }

  private async markFileIndexed(absolutePath: string, content: string): Promise<void> {
    const hash = await this.getFileHash(content);
    await this.db.runCypher(
      'MERGE (h:FileHash {path: $path}) SET h.hash = $hash',
      { path: absolutePath, hash }
    ).catch(() => {});
  }

  public async indexFile(filePath: string, force = false): Promise<void> {
    const absolutePath = path.resolve(filePath);
    const content = await fs.readFile(absolutePath, 'utf8');

    if (!force && !(await this.isFileStale(absolutePath, content))) {
      return; // Skip unchanged file
    }

    const ext = path.extname(filePath).slice(1);

    let language = 'javascript';
    if (ext === 'ts') language = 'typescript';
    if (ext === 'tsx') language = 'tsx';

    const symbols = this.parser.parse(content, language);

    // 1. Add File Node
    await this.db.runCypher(
      'MERGE (f:File {path: $path}) ON CREATE SET f.language = $language',
      { path: absolutePath, language }
    );

    // 2. Add Symbols and CONTAINS relationship
    for (const sym of symbols) {
      const symId = `${absolutePath}:${sym.name}:${sym.kind}:${sym.range.start.row}`;
      
      await this.db.runCypher(
        'MERGE (s:Symbol {id: $id}) ' +
        'ON CREATE SET s.name = $name, s.kind = $kind, s.range = $range, s.calls = $calls, s.import_source = $importSource, s.import_specifiers = $importSpecifiers, s.inputs = $inputs, s.outputs = $outputs',
        {
          id: symId,
          name: sym.name,
          kind: sym.kind,
          range: JSON.stringify(sym.range),
          calls: sym.calls || [],
          importSource: sym.imports?.[0]?.source || '',
          importSpecifiers: sym.imports?.[0]?.specifiers || [],
          inputs: sym.inputs || [],
          outputs: sym.outputs || []
        }
      );

      await this.db.runCypher(
        'MATCH (f:File {path: $path}), (s:Symbol {id: $symId}) ' +
        'MERGE (f)-[:CONTAINS]->(s)',
        { path: absolutePath, symId }
      );

      // 3. Handle Docs & Chunks for RAG
      if (sym.doc && sym.doc.trim()) {
        const chunkId = `chunk:${symId}`;
        const embedding = await this.embeddingService.generateEmbedding(sym.doc);
        
        await this.db.runCypher(
          'MERGE (c:Chunk {id: $id}) ' +
          'SET c.text = $text, c.embedding = $embedding',
          { id: chunkId, text: sym.doc, embedding }
        );

        await this.db.runCypher(
          'MATCH (c:Chunk {id: $chunkId}), (s:Symbol {id: $symId}) ' +
          'MERGE (c)-[:DESCRIBES]->(s)',
          { chunkId, symId }
        );
      }
    }

    await this.markFileIndexed(absolutePath, content);
    console.log(`Indexed ${filePath} with ${symbols.length} symbols.`);
  }

  public async indexFileFallback(filePath: string, force = false): Promise<void> {
    const absolutePath = path.resolve(filePath);
    const content = await fs.readFile(absolutePath, 'utf8');

    if (!force && !(await this.isFileStale(absolutePath, content))) {
      return; // Skip unchanged file
    }

    const ext = path.extname(filePath).slice(1);

    // 1. Add File Node
    await this.db.runCypher(
      'MERGE (f:File {path: $path}) ON CREATE SET f.language = $language',
      { path: absolutePath, language: ext || 'text' }
    );

    // 2. Add a virtual Symbol representing the file context
    const symId = `${absolutePath}:__file__`;
    await this.db.runCypher(
      'MERGE (s:Symbol {id: $id}) ' +
      'ON CREATE SET s.name = $name, s.kind = $kind, s.calls = [], s.import_specifiers = []',
      { 
        id: symId, 
        name: path.basename(filePath), 
        kind: 'file_module'
      }
    );

    await this.db.runCypher(
      'MATCH (f:File {path: $path}), (s:Symbol {id: $symId}) MERGE (f)-[:CONTAINS]->(s)',
      { path: absolutePath, symId }
    );

    // 3. Chunk the document roughly for RAG
    const chunkSize = 1500;
    for (let i = 0; i < content.length; i += chunkSize) {
      const chunkText = content.substring(i, i + chunkSize);
      if (!chunkText.trim()) continue;

      const chunkId = `chunk:${symId}:part${i}`;
      const embedding = await this.embeddingService.generateEmbedding(chunkText);
      
      await this.db.runCypher(
        'MERGE (c:Chunk {id: $id}) SET c.text = $text, c.embedding = $embedding',
        { id: chunkId, text: chunkText, embedding }
      );

      await this.db.runCypher(
        'MATCH (c:Chunk {id: $chunkId}), (s:Symbol {id: $symId}) MERGE (c)-[:DESCRIBES]->(s)',
        { chunkId, symId }
      );
    }
    await this.markFileIndexed(absolutePath, content);
    console.log(`Indexed generic fallback file ${filePath}.`);
  }

  private async resolveImportPath(sourcePath: string, importSource: string): Promise<string | null> {
    if (!importSource.startsWith('.')) return null; // Skip non-relative for now

    const dir = path.dirname(sourcePath);
    const targetBase = path.resolve(dir, importSource);
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];

    for (const ext of extensions) {
      const candidate = ext.startsWith('/') ? targetBase + ext : targetBase + ext;
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        continue;
      }
    }
    return null;
  }

  public async resolveImports(): Promise<void> {
    console.log('Resolving imports across files...');
    const result = await this.db.runCypher(
      'MATCH (f:File)-[:CONTAINS]->(s:Symbol {kind: "import"}) RETURN f.path as source, s.import_source as target, s.import_specifiers as specifiers'
    );
    const imports = await result.getAll();

    for (const imp of imports) {
      const targetPath = await this.resolveImportPath(imp.source, imp.target);
      if (targetPath) {
        await this.db.runCypher(
          'MATCH (f1:File {path: $source}), (f2:File {path: $target}) ' +
          'MERGE (f1)-[r:IMPORTS]->(f2) ' +
          'SET r.specifiers = $specifiers',
          { source: imp.source, target: targetPath, specifiers: imp.specifiers }
        );
      }
    }
    console.log('Import resolution complete.');
  }

  public async resolveCalls(): Promise<void> {
    console.log('Resolving symbol calls across the graph...');
    try {
      // 1. Precise resolution: Using imports
      await this.db.runCypher(
        'MATCH (f1:File)-[r:IMPORTS]->(f2:File) ' +
        'UNWIND r.specifiers as symName ' +
        'MATCH (f1)-[:CONTAINS]->(caller:Symbol) ' +
        'WHERE symName IN caller.calls ' +
        'MATCH (f2)-[:CONTAINS]->(target:Symbol {name: symName}) ' +
        'MERGE (caller)-[:CALLS]->(target)'
      );

      // 2. Heuristic fallback: Same file or same name global
      await this.db.runCypher(
        'MATCH (s1:Symbol) ' +
        'UNWIND s1.calls AS targetName ' +
        'MATCH (s2:Symbol {name: targetName}) ' +
        'WHERE s1.id <> s2.id ' +
        'MERGE (s1)-[:CALLS]->(s2)'
      );
      console.log('Call resolution complete.');
    } catch (error) {
      console.error('Error during call resolution:', error);
    }
  }

  public async indexDirectory(dirPath: string): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.graphhub') continue;
        await this.indexDirectory(fullPath);
      } else {
        const ext = path.extname(entry.name);
        const codeExtensions = ['.ts', '.js', '.tsx', '.jsx'];
        const fallbackExtensions = ['.py', '.java', '.c', '.cpp', '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.md', '.txt', '.sh', '.ps1'];
        
        if (codeExtensions.includes(ext)) {
          await this.indexFile(fullPath);
        } else if (fallbackExtensions.includes(ext.toLowerCase())) {
          await this.indexFileFallback(fullPath);
        }
      }
    }
  }
}
