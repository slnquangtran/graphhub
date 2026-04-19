import fs from 'fs';
import path from 'path';
import { ClientAdapter, InstallContext, InstallResult } from './types.ts';
import { readJsonIfExists, writeJson } from './mcp-config.ts';

interface OpencodeMcpEntry {
  type: 'local';
  command: string[];
  enabled: boolean;
  cwd?: string;
}

interface OpencodeConfig {
  mcp?: Record<string, OpencodeMcpEntry>;
}

export class OpencodeAdapter implements ClientAdapter {
  readonly name = 'opencode';
  readonly description = 'OpenCode (opencode.json)';

  private configPath(ctx: InstallContext): string {
    return path.join(ctx.projectDir, 'opencode.json');
  }

  async detect(ctx: InstallContext): Promise<boolean> {
    return fs.existsSync(path.join(ctx.projectDir, 'opencode.json'));
  }

  async install(ctx: InstallContext): Promise<InstallResult> {
    const configPath = this.configPath(ctx);
    const config = readJsonIfExists<OpencodeConfig>(configPath);
    config.mcp = { ...(config.mcp ?? {}) };
    config.mcp.graphhub = {
      type: 'local',
      command: ['npx', 'tsx', path.join(ctx.graphhubDir, 'src', 'index.ts'), 'serve'],
      cwd: ctx.graphhubDir,
      enabled: true,
    };
    writeJson(configPath, config);
    return { client: this.name, installed: true, reason: 'configured', files: [configPath] };
  }

  async uninstall(ctx: InstallContext): Promise<InstallResult> {
    const configPath = this.configPath(ctx);
    if (!fs.existsSync(configPath)) {
      return { client: this.name, installed: false, reason: 'opencode.json not found', files: [] };
    }
    const config = readJsonIfExists<OpencodeConfig>(configPath);
    if (config.mcp?.graphhub) delete config.mcp.graphhub;
    writeJson(configPath, config);
    return { client: this.name, installed: false, reason: 'removed', files: [configPath] };
  }
}
