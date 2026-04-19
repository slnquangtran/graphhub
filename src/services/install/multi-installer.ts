import os from 'os';
import { ClientAdapter, InstallContext, InstallResult } from './adapters/types.ts';
import { ClaudeCodeAdapter } from './adapters/claude-code.ts';
import { OpencodeAdapter } from './adapters/opencode.ts';
import { GeminiCliAdapter } from './adapters/gemini-cli.ts';
import { AntigravityAdapter } from './adapters/antigravity.ts';

export interface MultiInstallOptions {
  projectDir?: string;
  graphhubDir?: string;
  clients?: string[];
  force?: boolean;
}

export class MultiInstaller {
  private adapters: ClientAdapter[];

  constructor(adapters?: ClientAdapter[]) {
    this.adapters = adapters ?? [
      new ClaudeCodeAdapter(),
      new OpencodeAdapter(),
      new GeminiCliAdapter(),
      new AntigravityAdapter(),
    ];
  }

  public listClients(): Array<{ name: string; description: string }> {
    return this.adapters.map((a) => ({ name: a.name, description: a.description }));
  }

  private buildCtx(options: MultiInstallOptions): InstallContext {
    return {
      projectDir: options.projectDir ?? process.cwd(),
      graphhubDir: options.graphhubDir ?? process.cwd(),
      home: os.homedir(),
    };
  }

  public async detect(options: MultiInstallOptions = {}): Promise<Array<{ name: string; detected: boolean }>> {
    const ctx = this.buildCtx(options);
    return Promise.all(
      this.adapters.map(async (a) => ({ name: a.name, detected: await a.detect(ctx) })),
    );
  }

  public async installAll(options: MultiInstallOptions = {}): Promise<InstallResult[]> {
    const ctx = this.buildCtx(options);
    const targets = await this.pickTargets(options, ctx);
    const results: InstallResult[] = [];
    for (const adapter of targets) {
      try {
        results.push(await adapter.install(ctx));
      } catch (err) {
        results.push({
          client: adapter.name,
          installed: false,
          reason: `error: ${(err as Error).message}`,
          files: [],
        });
      }
    }
    return results;
  }

  public async uninstallAll(options: MultiInstallOptions = {}): Promise<InstallResult[]> {
    const ctx = this.buildCtx(options);
    const targets = await this.pickTargets(options, ctx);
    const results: InstallResult[] = [];
    for (const adapter of targets) {
      try {
        results.push(await adapter.uninstall(ctx));
      } catch (err) {
        results.push({
          client: adapter.name,
          installed: false,
          reason: `error: ${(err as Error).message}`,
          files: [],
        });
      }
    }
    return results;
  }

  private async pickTargets(options: MultiInstallOptions, ctx: InstallContext): Promise<ClientAdapter[]> {
    if (options.clients && options.clients.length > 0) {
      const wanted = new Set(options.clients);
      const matched = this.adapters.filter((a) => wanted.has(a.name));
      if (matched.length === 0) {
        throw new Error(`No adapters matched: ${options.clients.join(', ')}`);
      }
      return matched;
    }
    if (options.force) return this.adapters;
    const detections = await Promise.all(
      this.adapters.map(async (a) => ({ adapter: a, detected: await a.detect(ctx) })),
    );
    return detections.filter((d) => d.detected).map((d) => d.adapter);
  }
}
