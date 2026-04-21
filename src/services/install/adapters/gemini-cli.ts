import fs from 'fs';
import path from 'path';
import { ClientAdapter, InstallContext, InstallResult } from './types.ts';
import { buildGraphhubServerEntry, readJsonIfExists, writeJson, McpServerEntry } from './mcp-config.ts';
import {
  writeSharedHookScripts, removeSharedHookScripts,
  buildHooksConfig, hasGraphhubHook, stripGraphhubHooks,
  PRE_HOOK_MARKER, POST_HOOK_MARKER,
} from './shared-hooks.ts';

interface GeminiSettings {
  mcpServers?: Record<string, McpServerEntry>;
  hooks?: Record<string, Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>>;
}

export class GeminiCliAdapter implements ClientAdapter {
  readonly name = 'gemini-cli';
  readonly description = 'Gemini CLI (~/.gemini/settings.json + hooks)';

  private settingsPath(ctx: InstallContext): string {
    return path.join(ctx.home, '.gemini', 'settings.json');
  }

  async detect(ctx: InstallContext): Promise<boolean> {
    return fs.existsSync(path.join(ctx.home, '.gemini'));
  }

  async install(ctx: InstallContext): Promise<InstallResult> {
    const settingsPath = this.settingsPath(ctx);
    const settings = readJsonIfExists<GeminiSettings>(settingsPath);

    // 1. MCP server entry
    settings.mcpServers = { ...(settings.mcpServers ?? {}) };
    settings.mcpServers.graphhub = buildGraphhubServerEntry(ctx.graphhubDir);

    // 2. Hooks — Gemini CLI uses the same PreToolUse/PostToolUse format as Claude Code.
    const { pre, post } = writeSharedHookScripts(ctx);
    settings.hooks = settings.hooks ?? {};
    const hooksConfig = buildHooksConfig(pre, post);

    for (const [key, entries] of Object.entries(hooksConfig)) {
      settings.hooks[key] = settings.hooks[key] ?? [];
      if (!hasGraphhubHook(settings.hooks[key])) {
        settings.hooks[key].push(...entries);
      }
    }

    writeJson(settingsPath, settings);
    return { client: this.name, installed: true, reason: 'configured', files: [settingsPath, pre, post] };
  }

  async uninstall(ctx: InstallContext): Promise<InstallResult> {
    const settingsPath = this.settingsPath(ctx);
    if (!fs.existsSync(settingsPath)) {
      return { client: this.name, installed: false, reason: 'settings.json not found', files: [] };
    }
    const settings = readJsonIfExists<GeminiSettings>(settingsPath);
    if (settings.mcpServers?.graphhub) delete settings.mcpServers.graphhub;
    if (settings.hooks) settings.hooks = stripGraphhubHooks(settings.hooks);
    writeJson(settingsPath, settings);
    removeSharedHookScripts(ctx);
    return { client: this.name, installed: false, reason: 'removed', files: [settingsPath] };
  }
}
