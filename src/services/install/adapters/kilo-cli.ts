import fs from 'fs';
import path from 'path';
import { ClientAdapter, InstallContext, InstallResult } from './types.ts';
import { readJsonIfExists, writeJson } from './mcp-config.ts';
import { GRAPHHUB_INSTRUCTIONS } from './shared-hooks.ts';

interface KiloMcpEntry {
  type: 'local';
  command: string[];
  enabled: boolean;
  cwd?: string;
}

interface KiloConfig {
  mcp?: Record<string, KiloMcpEntry>;
  instructions?: string;
}

const INSTRUCTIONS_MARKER = '# graphhub-instructions';

export class KiloCliAdapter implements ClientAdapter {
  readonly name = 'kilo-cli';
  readonly description = 'Kilo CLI (~/.config/kilo/kilo.json + instructions)';

  private configPath(ctx: InstallContext): string {
    return path.join(ctx.home, '.config', 'kilo', 'kilo.json');
  }

  async detect(ctx: InstallContext): Promise<boolean> {
    return fs.existsSync(path.join(ctx.home, '.config', 'kilo'));
  }

  async install(ctx: InstallContext): Promise<InstallResult> {
    const configPath = this.configPath(ctx);
    const config = readJsonIfExists<KiloConfig>(configPath);
    config.mcp = { ...(config.mcp ?? {}) };
    config.mcp.graphhub = {
      type: 'local',
      command: ['npx', 'tsx', path.join(ctx.graphhubDir, 'src', 'index.ts').replace(/\\/g, '/'), 'serve'],
      cwd: ctx.graphhubDir.replace(/\\/g, '/'),
      enabled: true,
    };

    if (!config.instructions?.includes(INSTRUCTIONS_MARKER)) {
      const existing = config.instructions ? config.instructions.trimEnd() + '\n\n' : '';
      config.instructions = `${existing}${INSTRUCTIONS_MARKER}\n${GRAPHHUB_INSTRUCTIONS}`;
    }

    writeJson(configPath, config);
    return { client: this.name, installed: true, reason: 'configured', files: [configPath] };
  }

  async uninstall(ctx: InstallContext): Promise<InstallResult> {
    const configPath = this.configPath(ctx);
    if (!fs.existsSync(configPath)) {
      return { client: this.name, installed: false, reason: 'kilo.json not found', files: [] };
    }
    const config = readJsonIfExists<KiloConfig>(configPath);
    if (config.mcp?.graphhub) delete config.mcp.graphhub;
    if (config.instructions?.includes(INSTRUCTIONS_MARKER)) {
      config.instructions = config.instructions
        .replace(new RegExp(`\n*${INSTRUCTIONS_MARKER}\\n[\\s\\S]*$`), '')
        .trimEnd() || undefined;
    }
    writeJson(configPath, config);
    return { client: this.name, installed: false, reason: 'removed', files: [configPath] };
  }
}
