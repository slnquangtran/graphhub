import fs from 'fs';
import path from 'path';
import { ClientAdapter, InstallContext, InstallResult } from './types.ts';
import { buildGraphhubServerEntry, readJsonIfExists, writeJson, McpServerEntry } from './mcp-config.ts';

interface AntigravityConfig {
  mcpServers?: Record<string, McpServerEntry>;
}

export class AntigravityAdapter implements ClientAdapter {
  readonly name = 'antigravity';
  readonly description = 'Antigravity (.antigravity/mcp.json)';

  private configPath(ctx: InstallContext): string {
    return path.join(ctx.projectDir, '.antigravity', 'mcp.json');
  }

  async detect(ctx: InstallContext): Promise<boolean> {
    return fs.existsSync(path.join(ctx.projectDir, '.antigravity'));
  }

  async install(ctx: InstallContext): Promise<InstallResult> {
    const configPath = this.configPath(ctx);
    const config = readJsonIfExists<AntigravityConfig>(configPath);
    config.mcpServers = { ...(config.mcpServers ?? {}) };
    config.mcpServers.graphhub = buildGraphhubServerEntry(ctx.graphhubDir);
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
    writeJson(configPath, config);
    return { client: this.name, installed: false, reason: 'removed', files: [configPath] };
  }
}
