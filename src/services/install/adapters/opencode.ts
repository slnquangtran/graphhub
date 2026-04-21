import fs from 'fs';
import path from 'path';
import { ClientAdapter, InstallContext, InstallResult } from './types.ts';
import { readJsonIfExists, writeJson } from './mcp-config.ts';
import { GRAPHHUB_INSTRUCTIONS } from './shared-hooks.ts';

interface OpencodeMcpEntry {
  type: 'local';
  command: string[];
  enabled: boolean;
  cwd?: string;
}

interface OpencodeConfig {
  mcp?: Record<string, OpencodeMcpEntry>;
  instructions?: string;
}

const INSTRUCTIONS_MARKER = '# graphhub-instructions';

export class OpencodeAdapter implements ClientAdapter {
  readonly name = 'opencode';
  readonly description = 'OpenCode (~/.config/opencode/opencode.json + instructions)';

  private configPath(ctx: InstallContext): string {
    return path.join(ctx.home, '.config', 'opencode', 'opencode.json');
  }

  async detect(ctx: InstallContext): Promise<boolean> {
    return fs.existsSync(path.join(ctx.home, '.config', 'opencode'));
  }

  async install(ctx: InstallContext): Promise<InstallResult> {
    const configPath = this.configPath(ctx);
    const config = readJsonIfExists<OpencodeConfig>(configPath);

    // 1. MCP server entry
    config.mcp = { ...(config.mcp ?? {}) };
    config.mcp.graphhub = {
      type: 'local',
      command: ['npx', 'tsx', path.join(ctx.graphhubDir, 'src', 'index.ts'), 'serve'],
      cwd: ctx.graphhubDir,
      enabled: true,
    };

    // 2. System instructions — OpenCode injects this into every conversation so the
    //    agent knows to prefer GraphHub tools before reaching for file search.
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
      return { client: this.name, installed: false, reason: 'opencode.json not found (run setup first)', files: [] };
    }
    const config = readJsonIfExists<OpencodeConfig>(configPath);
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
