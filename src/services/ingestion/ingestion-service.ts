import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import ignore, { Ignore } from 'ignore';
import { CodeParser, SymbolDefinition } from './parser.ts';
import { GraphClient } from '../db/graph-client.ts';
import { EmbeddingService } from '../ai/embedding-service.ts';

export interface IndexStats {
  indexed: number;
  skipped: number;
  removed: number;
  errors: number;
  elapsed_ms: number;
}

export class IngestionService {
  private parser: CodeParser;
  private db: GraphClient;
  private embeddingService: EmbeddingService;
  private gitignoreCache: Map<string, Ignore> = new Map();
  private runStats: { indexed: number; skipped: number; errors: number } = { indexed: 0, skipped: 0, errors: 0 };

  constructor() {
    this.parser = new CodeParser();
    this.db = GraphClient.getInstance();
    this.embeddingService = EmbeddingService.getInstance();
  }

  public resetStats(): void {
    this.runStats = { indexed: 0, skipped: 0, errors: 0 };
  }

  public getStats(): { indexed: number; skipped: number; errors: number } {
    return { ...this.runStats };
  }

  private async loadGitignore(rootDir: string): Promise<Ignore> {
    if (this.gitignoreCache.has(rootDir)) {
      return this.gitignoreCache.get(rootDir)!;
    }

    const ig = ignore();

    // Always ignore these directories regardless of .gitignore
    const defaultIgnores = [
      'node_modules', '.git', '.graphhub', '__pycache__', '.venv', 'venv',
      '.env', 'env', '.claude', '.gemini', '.gitnexus',
      'dist', 'build', 'out', '.next', '.nuxt', 'coverage', '.cache',
      'vendor', 'target', 'bin', 'obj', '.idea', '.vscode'
    ];
    ig.add(defaultIgnores);

    // Load .gitignore from root directory
    const gitignorePath = path.join(rootDir, '.gitignore');
    try {
      const content = await fs.readFile(gitignorePath, 'utf8');
      ig.add(content);
    } catch {
      // No .gitignore file, use defaults only
    }

    this.gitignoreCache.set(rootDir, ig);
    return ig;
  }

  public clearGitignoreCache(): void {
    this.gitignoreCache.clear();
  }

  public async isIgnored(absolutePath: string, rootDir: string): Promise<boolean> {
    const ig = await this.loadGitignore(rootDir);
    const rel = path.relative(rootDir, absolutePath).replace(/\\/g, '/');
    if (!rel || rel.startsWith('..')) return true;
    return ig.ignores(rel) || ig.ignores(rel + '/');
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
      this.runStats.skipped++;
      return; // Skip unchanged file
    }

    const ext = path.extname(filePath).slice(1).toLowerCase();

    let language = 'javascript';
    if (ext === 'ts') language = 'typescript';
    if (ext === 'tsx') language = 'tsx';
    // JSX uses the TSX grammar (tree-sitter-tsx.wasm) which is a superset of JSX
    // and handles JSX syntax correctly. The plain JS grammar does not support JSX.
    if (ext === 'jsx') language = 'tsx';
    if (ext === 'py') language = 'python';

    const symbols = this.parser.parse(content, language);

    // 1. Add/Update File Node
    await this.db.runCypher(
      'MERGE (f:File {path: $path}) SET f.language = $language',
      { path: absolutePath, language }
    );

    // 2. Cleanup stale symbols and chunks previously associated with this file
    // This removes duplicates if functions moved line numbers or were deleted
    await this.db.runCypher(
      'MATCH (f:File {path: $path})-[:CONTAINS]->(s:Symbol) ' +
      'OPTIONAL MATCH (c:Chunk)-[:DESCRIBES]->(s) ' +
      'DETACH DELETE s, c',
      { path: absolutePath }
    ).catch(() => {});

    // 3. Add Symbols and CONTAINS relationship
    const idCounts = new Map<string, number>();

    for (const sym of symbols) {
      // Generate a stable ID: path + name + kind
      // Use a counter for multiple occurrences of the same name+kind (e.g. anonymous functions)
      const baseKey = `${sym.name}:${sym.kind}`;
      const count = (idCounts.get(baseKey) || 0) + 1;
      idCounts.set(baseKey, count);
      
      const symId = `${absolutePath}:${sym.name}:${sym.kind}${count > 1 ? ':' + count : ''}`;
      
      await this.db.runCypher(
        'MERGE (s:Symbol {id: $id}) ' +
        'SET s.name = $name, s.kind = $kind, s.range = $range, s.calls = $calls, s.import_source = $importSource, s.import_specifiers = $importSpecifiers, s.inputs = $inputs, s.outputs = $outputs, s.extends = $extends, s.implements = $implements',
        {
          id: symId,
          name: sym.name,
          kind: sym.kind,
          range: JSON.stringify(sym.range),
          calls: sym.calls || [],
          importSource: sym.imports?.[0]?.source || '',
          importSpecifiers: sym.imports?.[0]?.specifiers || [],
          inputs: sym.inputs || [],
          outputs: sym.outputs || [],
          extends: sym.extends || '',
          implements: sym.implements || []
        }
      );

      await this.db.runCypher(
        'MATCH (f:File {path: $path}), (s:Symbol {id: $symId}) ' +
        'MERGE (f)-[:CONTAINS]->(s)',
        { path: absolutePath, symId }
      );

      // 4. Handle Docs & Chunks for RAG
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
    this.runStats.indexed++;
    console.log(`Indexed ${filePath} with ${symbols.length} symbols.`);
  }

  public async indexFileFallback(filePath: string, force = false): Promise<void> {
    const absolutePath = path.resolve(filePath);
    const content = await fs.readFile(absolutePath, 'utf8');

    if (!force && !(await this.isFileStale(absolutePath, content))) {
      this.runStats.skipped++;
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

    // Delete stale chunks from previous index run to prevent orphaned nodes
    await this.db.runCypher(
      'MATCH (c:Chunk)-[:DESCRIBES]->(s:Symbol {id: $symId}) DETACH DELETE c',
      { symId }
    ).catch(() => {});

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
    this.runStats.indexed++;
    console.log(`Indexed generic fallback file ${filePath}.`);
  }

  public async removeFileFromGraph(absolutePath: string): Promise<void> {
    await this.db.runCypher(
      'MATCH (f:File {path: $path}) ' +
      'OPTIONAL MATCH (f)-[:CONTAINS]->(s:Symbol) ' +
      'OPTIONAL MATCH (c:Chunk)-[:DESCRIBES]->(s) ' +
      'DETACH DELETE s, c, f',
      { path: absolutePath },
    ).catch(() => {});
    await this.db.runCypher(
      'MATCH (h:FileHash {path: $path}) DELETE h',
      { path: absolutePath },
    ).catch(() => {});
  }

  public async removeOrphanedFiles(presentPaths: Set<string>): Promise<string[]> {
    const res = await this.db.runCypher('MATCH (f:File) RETURN f.path AS path');
    const rows = (await res.getAll()) as Array<{ path: string }>;
    const removed: string[] = [];
    for (const row of rows) {
      if (!presentPaths.has(row.path)) {
        await this.removeFileFromGraph(row.path);
        removed.push(row.path);
      }
    }
    return removed;
  }

  private async resolveImportPath(sourcePath: string, importSource: string): Promise<string | null> {
    if (!importSource.startsWith('.')) return null; // Skip non-relative for now

    const dir = path.dirname(sourcePath);
    const targetBase = path.resolve(dir, importSource);
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];

    for (const ext of extensions) {
      const candidate = targetBase + ext;
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

      // 2. High probability: Same file resolution
      await this.db.runCypher(
        'MATCH (f:File)-[:CONTAINS]->(s1:Symbol), (f)-[:CONTAINS]->(s2:Symbol) ' +
        'WHERE s1.id <> s2.id AND s2.name IN s1.calls ' +
        'MERGE (s1)-[:CALLS]->(s2)'
      );

      // 3. Heuristic fallback: Match globally ONLY if no CALLS relationship for this name exists yet
      // This prevents linking to every function named 'log' if we already found the specific one.
      await this.db.runCypher(
        'MATCH (s1:Symbol) ' +
        'UNWIND s1.calls AS targetName ' +
        'MATCH (s2:Symbol {name: targetName}) ' +
        'WHERE s1.id <> s2.id ' +
        'AND NOT EXISTS { MATCH (s1)-[:CALLS]->(target:Symbol) WHERE target.name = targetName } ' +
        'MERGE (s1)-[:CALLS]->(s2)'
      );
      console.log('Call resolution complete.');
    } catch (error) {
      console.error('Error during call resolution:', error);
    }
  }

  public async resolveInheritance(): Promise<void> {
    console.log('Resolving class inheritance relationships...');
    try {
      // 1. INHERITS: Class extends another class
      // First try same-file resolution (most common)
      await this.db.runCypher(
        'MATCH (f:File)-[:CONTAINS]->(child:Symbol {kind: "class"}) ' +
        'WHERE child.extends <> "" ' +
        'MATCH (f)-[:CONTAINS]->(parent:Symbol {kind: "class", name: child.extends}) ' +
        'MERGE (child)-[:INHERITS]->(parent)'
      );

      // Then try cross-file resolution via imports
      await this.db.runCypher(
        'MATCH (f1:File)-[r:IMPORTS]->(f2:File) ' +
        'MATCH (f1)-[:CONTAINS]->(child:Symbol {kind: "class"}) ' +
        'WHERE child.extends <> "" AND child.extends IN r.specifiers ' +
        'MATCH (f2)-[:CONTAINS]->(parent:Symbol {kind: "class", name: child.extends}) ' +
        'MERGE (child)-[:INHERITS]->(parent)'
      );

      // Global fallback for unresolved inheritance
      await this.db.runCypher(
        'MATCH (child:Symbol {kind: "class"}) ' +
        'WHERE child.extends <> "" ' +
        'AND NOT EXISTS { MATCH (child)-[:INHERITS]->() } ' +
        'MATCH (parent:Symbol {kind: "class", name: child.extends}) ' +
        'WHERE child.id <> parent.id ' +
        'MERGE (child)-[:INHERITS]->(parent)'
      );

      // 2. IMPLEMENTS: Class implements interface(s)
      // Same-file resolution
      await this.db.runCypher(
        'MATCH (f:File)-[:CONTAINS]->(cls:Symbol {kind: "class"}) ' +
        'WHERE size(cls.implements) > 0 ' +
        'UNWIND cls.implements AS ifaceName ' +
        'MATCH (f)-[:CONTAINS]->(iface:Symbol {kind: "interface", name: ifaceName}) ' +
        'MERGE (cls)-[:IMPLEMENTS]->(iface)'
      );

      // Cross-file resolution via imports
      await this.db.runCypher(
        'MATCH (f1:File)-[r:IMPORTS]->(f2:File) ' +
        'MATCH (f1)-[:CONTAINS]->(cls:Symbol {kind: "class"}) ' +
        'WHERE size(cls.implements) > 0 ' +
        'UNWIND cls.implements AS ifaceName ' +
        'WITH f2, cls, ifaceName, r ' +
        'WHERE ifaceName IN r.specifiers ' +
        'MATCH (f2)-[:CONTAINS]->(iface:Symbol {kind: "interface", name: ifaceName}) ' +
        'MERGE (cls)-[:IMPLEMENTS]->(iface)'
      );

      // Global fallback for unresolved implements
      await this.db.runCypher(
        'MATCH (cls:Symbol {kind: "class"}) ' +
        'WHERE size(cls.implements) > 0 ' +
        'UNWIND cls.implements AS ifaceName ' +
        'WITH cls, ifaceName ' +
        'WHERE NOT EXISTS { MATCH (cls)-[:IMPLEMENTS]->(i:Symbol {name: ifaceName}) } ' +
        'MATCH (iface:Symbol {kind: "interface", name: ifaceName}) ' +
        'MERGE (cls)-[:IMPLEMENTS]->(iface)'
      );

      console.log('Inheritance resolution complete.');
    } catch (error) {
      console.error('Error during inheritance resolution:', error);
    }
  }

  public async indexDirectory(dirPath: string, rootDir?: string, visited?: Set<string>): Promise<Set<string>> {
    const root = rootDir || dirPath;
    const seen = visited ?? new Set<string>();
    const ig = await this.loadGitignore(root);
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(root, fullPath).replace(/\\/g, '/');

      if (ig.ignores(relativePath) || ig.ignores(relativePath + '/')) continue;

      if (entry.isDirectory()) {
        await this.indexDirectory(fullPath, root, seen);
      } else {
        const ext = path.extname(entry.name);
        const parsedExtensions = ['.ts', '.js', '.tsx', '.jsx', '.py'];
        const fallbackExtensions = ['.java', '.c', '.cpp', '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.md', '.txt', '.sh', '.ps1'];

        if (parsedExtensions.includes(ext.toLowerCase())) {
          try {
            await this.indexFile(fullPath);
          } catch (err: any) {
            console.error(`Error indexing ${fullPath}: ${err.message}`);
            this.runStats.errors++;
          }
          seen.add(path.resolve(fullPath));
        } else if (fallbackExtensions.includes(ext.toLowerCase())) {
          try {
            await this.indexFileFallback(fullPath);
          } catch (err: any) {
            console.error(`Error indexing ${fullPath}: ${err.message}`);
            this.runStats.errors++;
          }
          seen.add(path.resolve(fullPath));
        }
      }
    }
    return seen;
  }

  public async indexDirectoryWithStats(dirPath: string, options: { clean?: boolean } = {}): Promise<IndexStats> {
    this.resetStats();
    const start = Date.now();
    const seen = await this.indexDirectory(dirPath);
    let removed = 0;
    if (options.clean) {
      const orphans = await this.removeOrphanedFiles(seen);
      removed = orphans.length;
    }
    const elapsed_ms = Date.now() - start;
    return { ...this.runStats, removed, elapsed_ms };
  }

  public async indexSingle(filePath: string, force = false): Promise<'indexed' | 'skipped' | 'unsupported'> {
    const ext = path.extname(filePath).toLowerCase();
    const parsedExtensions = ['.ts', '.js', '.tsx', '.jsx', '.py'];
    const fallbackExtensions = ['.java', '.c', '.cpp', '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.md', '.txt', '.sh', '.ps1'];
    const before = this.runStats.indexed;
    if (parsedExtensions.includes(ext)) await this.indexFile(filePath, force);
    else if (fallbackExtensions.includes(ext)) await this.indexFileFallback(filePath, force);
    else return 'unsupported';
    return this.runStats.indexed > before ? 'indexed' : 'skipped';
  }
}
