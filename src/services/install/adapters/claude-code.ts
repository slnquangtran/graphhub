import fs from 'fs';
import path from 'path';
import { ClientAdapter, InstallContext, InstallResult } from './types.ts';
import { buildGraphhubServerEntry, readJsonIfExists, writeJson, McpServerEntry } from './mcp-config.ts';

interface ClaudeSettings {
  mcpServers?: Record<string, McpServerEntry>;
  hooks?: Record<string, Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>>;
}

export class ClaudeCodeAdapter implements ClientAdapter {
  readonly name = 'claude-code';
  readonly description = 'Claude Code (.claude/settings.json + hooks)';

  private settingsPath(ctx: InstallContext): string {
    return path.join(ctx.projectDir, '.claude', 'settings.json');
  }

  async detect(ctx: InstallContext): Promise<boolean> {
    return fs.existsSync(path.join(ctx.projectDir, '.claude'));
  }

  async install(ctx: InstallContext): Promise<InstallResult> {
    const settingsPath = this.settingsPath(ctx);
    const settings = readJsonIfExists<ClaudeSettings>(settingsPath);
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
    const settings = readJsonIfExists<ClaudeSettings>(settingsPath);
    if (settings.mcpServers?.graphhub) delete settings.mcpServers.graphhub;
    writeJson(settingsPath, settings);
    return { client: this.name, installed: false, reason: 'removed', files: [settingsPath] };
  }
}
