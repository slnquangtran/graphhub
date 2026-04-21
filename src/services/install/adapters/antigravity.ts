import fs from 'fs';
import path from 'path';
import { ClientAdapter, InstallContext, InstallResult } from './types.ts';
import { buildGraphhubServerEntry, readJsonIfExists, writeJson, McpServerEntry } from './mcp-config.ts';
import { GRAPHHUB_INSTRUCTIONS } from './shared-hooks.ts';

interface AntigravityConfig {
  mcpServers?: Record<string, McpServerEntry>;
  instructions?: string;
}

const INSTRUCTIONS_MARKER = '# graphhub-instructions';

export class AntigravityAdapter implements ClientAdapter {
  readonly name = 'antigravity';
  readonly description = 'Antigravity (.antigravity/mcp.json + instructions)';

  private configPath(ctx: InstallContext): string {
    return path.join(ctx.home, '.antigravity', 'mcp.json');
  }

  async detect(ctx: InstallContext): Promise<boolean> {
    return fs.existsSync(path.join(ctx.home, '.antigravity'));
  }

  async install(ctx: InstallContext): Promise<InstallResult> {
    const configPath = this.configPath(ctx);
    const config = readJsonIfExists<AntigravityConfig>(configPath);
    config.mcpServers = { ...(config.mcpServers ?? {}) };
    config.mcpServers.graphhub = buildGraphhubServerEntry(ctx.graphhubDir);

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
      return { client: this.name, installed: false, reason: 'mcp.json not found', files: [] };
    }
    const config = readJsonIfExists<AntigravityConfig>(configPath);
    if (config.mcpServers?.graphhub) delete config.mcpServers.graphhub;
    if (config.instructions?.includes(INSTRUCTIONS_MARKER)) {
      config.instructions = config.instructions
        .replace(new RegExp(`\n*${INSTRUCTIONS_MARKER}\\n[\\s\\S]*$`), '')
        .trimEnd() || undefined;
    }
    writeJson(configPath, config);
    return { client: this.name, installed: false, reason: 'removed', files: [configPath] };
  }
}
