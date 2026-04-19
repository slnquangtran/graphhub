import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { IngestionService } from './ingestion-service.ts';

const SUPPORTED_EXTS = new Set([
  '.ts', '.js', '.tsx', '.jsx', '.py',
  '.java', '.c', '.cpp', '.cs', '.go', '.rs', '.rb', '.php', '.swift',
  '.md', '.txt', '.sh', '.ps1',
]);

export interface WatchOptions {
  debounceMs?: number;
  onEvent?: (kind: 'indexed' | 'removed' | 'skipped' | 'unsupported', filePath: string) => void;
}

export class WatchService {
  private ingestion: IngestionService;
  private watcher: fs.FSWatcher | null = null;
  private pending = new Map<string, NodeJS.Timeout>();
  private writeQueue: Promise<void> = Promise.resolve();
  private root: string = '';
  private resolveTimer: NodeJS.Timeout | null = null;
  private resolveDirty = false;

  constructor(ingestion: IngestionService) {
    this.ingestion = ingestion;
  }

  public async start(rootDir: string, options: WatchOptions = {}): Promise<void> {
    const debounceMs = options.debounceMs ?? 150;
    this.root = path.resolve(rootDir);
    this.watcher = fs.watch(this.root, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const full = path.resolve(this.root, filename.toString());
      const ext = path.extname(full).toLowerCase();
      if (!SUPPORTED_EXTS.has(ext)) return;

      const existing = this.pending.get(full);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        this.pending.delete(full);
        this.enqueue(() => this.handleChange(full, options));
      }, debounceMs);
      this.pending.set(full, t);
    });
  }

  private enqueue(work: () => Promise<void>): void {
    this.writeQueue = this.writeQueue.then(work).catch((err) => {
      console.error('Watch queue error:', err);
    });
  }

  private async handleChange(filePath: string, options: WatchOptions): Promise<void> {
    if (await this.ingestion.isIgnored(filePath, this.root)) return;

    let exists = true;
    try {
      await fsp.access(filePath);
    } catch {
      exists = false;
    }
    if (!exists) {
      await this.ingestion.removeFileFromGraph(filePath);
      options.onEvent?.('removed', filePath);
      this.scheduleResolve(options);
      return;
    }
    const result = await this.ingestion.indexSingle(filePath);
    options.onEvent?.(result, filePath);
    if (result === 'indexed') this.scheduleResolve(options);
  }

  private scheduleResolve(options: WatchOptions): void {
    this.resolveDirty = true;
    if (this.resolveTimer) clearTimeout(this.resolveTimer);
    this.resolveTimer = setTimeout(() => {
      this.resolveTimer = null;
      if (!this.resolveDirty) return;
      this.resolveDirty = false;
      this.enqueue(async () => {
        await this.ingestion.resolveImports();
        await this.ingestion.resolveCalls();
        await this.ingestion.resolveInheritance();
        options.onEvent?.('indexed', '<call-resolution>');
      });
    }, 1000);
  }

  public async stop(): Promise<void> {
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
    if (this.resolveTimer) clearTimeout(this.resolveTimer);
    this.resolveTimer = null;
    this.watcher?.close();
    this.watcher = null;
    await this.writeQueue;
  }
}
