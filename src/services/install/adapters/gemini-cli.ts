import fs from 'fs';
import path from 'path';
import { ClientAdapter, InstallContext, InstallResult } from './types.ts';
import { buildGraphhubServerEntry, readJsonIfExists, writeJson, McpServerEntry } from './mcp-config.ts';

interface GeminiSettings {
  mcpServers?: Record<string, McpServerEntry>;
}

export class GeminiCliAdapter implements ClientAdapter {
  readonly name = 'gemini-cli';
  readonly description = 'Gemini CLI (~/.gemini/settings.json)';

  private settingsPath(ctx: InstallContext): string {
    return path.join(ctx.projectDir, '.gemini', 'settings.json');
  }

  async detect(ctx: InstallContext): Promise<boolean> {
    return fs.existsSync(path.join(ctx.projectDir, '.gemini'));
  }

  async install(ctx: InstallContext): Promise<InstallResult> {
    const settingsPath = this.settingsPath(ctx);
    const settings = readJsonIfExists<GeminiSettings>(settingsPath);
    settings.mcpServers = { ...(settings.mcpServers ?? {}) };
    settings.mcpServers.graphhub = buildGraphhubServerEntry(ctx.graphhubDir);
    writeJson(settingsPath, settings);
    return { client: this.name, installed: true, reason: 'configured', files: [settingsPath] };
  }

  async uninstall(ctx: InstallContext): Promise<InstallResult> {
    const settingsPath = this.settingsPath(ctx);
    if (!fs.existsSync(settingsPath)) {
      return { client: this.name, installed: false, reason: 'settings.json not found', files: [] };
    }
    const settings = readJsonIfExists<GeminiSettings>(settingsPath);
    if (settings.mcpServers?.graphhub) delete settings.mcpServers.graphhub;
    writeJson(settingsPath, settings);
    return { client: this.name, installed: false, reason: 'removed', files: [settingsPath] };
  }
}
