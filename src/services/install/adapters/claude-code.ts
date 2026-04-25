import fs from 'fs';
import path from 'path';
import { ClientAdapter, InstallContext, InstallResult } from './types.ts';
import { buildGraphhubServerEntry, readJsonIfExists, writeJson, McpServerEntry } from './mcp-config.ts';
import { writeSlashCommands, removeSlashCommands } from './slash-commands.ts';

interface ClaudeSettings {
  mcpServers?: Record<string, McpServerEntry>;
  hooks?: Record<string, Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>>;
}

const PRE_HOOK_MARKER = 'graphhub-pre-hook';
const POST_HOOK_MARKER = 'graphhub-post-hook';

export class ClaudeCodeAdapter implements ClientAdapter {
  readonly name = 'claude-code';
  readonly description = 'Claude Code (.claude/settings.json + hooks)';

  private settingsPath(ctx: InstallContext): string {
    return path.join(ctx.home, '.claude', 'settings.json');
  }

  private preHookPath(ctx: InstallContext): string {
    return path.join(ctx.home, '.claude', 'graphhub-pre-hook.cjs');
  }

  private postHookPath(ctx: InstallContext): string {
    return path.join(ctx.home, '.claude', 'graphhub-post-hook.cjs');
  }

  async detect(ctx: InstallContext): Promise<boolean> {
    return fs.existsSync(path.join(ctx.home, '.claude'));
  }

  async install(ctx: InstallContext): Promise<InstallResult> {
    const settingsPath = this.settingsPath(ctx);
    const claudeDir = path.dirname(settingsPath);
    fs.mkdirSync(claudeDir, { recursive: true });

    const settings = readJsonIfExists<ClaudeSettings>(settingsPath);

    // 1. MCP server entry
    settings.mcpServers = { ...(settings.mcpServers ?? {}) };
    settings.mcpServers.graphhub = buildGraphhubServerEntry(ctx.graphhubDir);

    // 2. PreToolUse hook — fires before Glob/Grep/Read, reminds Claude to prefer
    //    GraphHub MCP tools over manual file search (saves ~94% tokens).
    const preHookPath = this.preHookPath(ctx);
    fs.writeFileSync(preHookPath, this.buildPreHookScript(ctx.graphhubDir), { mode: 0o755 });

    settings.hooks = settings.hooks ?? {};
    settings.hooks['PreToolUse'] = settings.hooks['PreToolUse'] ?? [];
    const preExists = settings.hooks['PreToolUse'].some(
      (h) => h.hooks.some((hk) => hk.command.includes(PRE_HOOK_MARKER)),
    );
    if (!preExists) {
      settings.hooks['PreToolUse'].push({
        matcher: 'Glob|Grep|Read',
        hooks: [{ type: 'command', command: `node "${preHookPath.replace(/\\/g, '/')}"` }],
      });
    }

    // 3. PostToolUse hook — fires after every Bash call, detects new git commits,
    //    and auto-reindexes the graph in the background so it stays fresh.
    const postHookPath = this.postHookPath(ctx);
    fs.writeFileSync(
      postHookPath,
      this.buildPostHookScript(ctx.graphhubDir),
      { mode: 0o755 },
    );

    settings.hooks['PostToolUse'] = settings.hooks['PostToolUse'] ?? [];
    const postExists = settings.hooks['PostToolUse'].some(
      (h) => h.hooks.some((hk) => hk.command.includes(POST_HOOK_MARKER)),
    );
    if (!postExists) {
      settings.hooks['PostToolUse'].push({
        matcher: 'Bash',
        hooks: [{ type: 'command', command: `node "${postHookPath.replace(/\\/g, '/')}"` }],
      });
    }

    writeJson(settingsPath, settings);
    const commandFiles = writeSlashCommands(ctx);
    return {
      client: this.name,
      installed: true,
      reason: 'configured',
      files: [settingsPath, preHookPath, postHookPath, ...commandFiles],
    };
  }

  async uninstall(ctx: InstallContext): Promise<InstallResult> {
    const settingsPath = this.settingsPath(ctx);
    if (!fs.existsSync(settingsPath)) {
      return { client: this.name, installed: false, reason: 'settings.json not found', files: [] };
    }
    const settings = readJsonIfExists<ClaudeSettings>(settingsPath);

    if (settings.mcpServers?.graphhub) delete settings.mcpServers.graphhub;

    if (settings.hooks) {
      for (const key of Object.keys(settings.hooks)) {
        settings.hooks[key] = settings.hooks[key].filter(
          (h) => !h.hooks.some((hk) => hk.command.includes(PRE_HOOK_MARKER) || hk.command.includes(POST_HOOK_MARKER)),
        );
      }
    }

    writeJson(settingsPath, settings);

    const legacyPre = path.join(ctx.home, '.claude', 'graphhub-pre-hook.sh');
    const legacyPost = path.join(ctx.home, '.claude', 'graphhub-post-hook.sh');
    for (const p of [this.preHookPath(ctx), this.postHookPath(ctx), legacyPre, legacyPost]) {
      try { fs.unlinkSync(p); } catch { /* already gone */ }
    }
    removeSlashCommands(ctx);

    return { client: this.name, installed: false, reason: 'removed', files: [settingsPath] };
  }

  private buildPreHookScript(graphhubDir: string): string {
    const ghDir = graphhubDir.replace(/\\/g, '/');
    // Node.js CJS — works on Windows without bash. Outputs a JSON systemMessage
    // that Claude Code injects directly into Claude's context (not just the UI log).
    return `#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const GRAPHHUB_DIR = ${JSON.stringify(ghDir)};
// Only remind Claude if the graph has actually been indexed
if (!fs.existsSync(path.join(GRAPHHUB_DIR, '.graphhub', 'db'))) process.exit(0);
process.stdout.write(JSON.stringify({
  systemMessage: 'GRAPHHUB is available. Before using Glob/Grep/Read to search code, prefer these MCP tools (saves ~94% tokens):\\n  semantic_search  — natural language code search\\n  search_by_name   — exact or fuzzy symbol lookup\\n  get_context      — callers + callees of any function\\n  impact_analysis  — blast radius before editing a symbol\\n  debug_trace      — one-shot debug: ranked candidates with context'
}) + '\\n');
`;
  }

  private buildPostHookScript(graphhubDir: string): string {
    const ghDir = graphhubDir.replace(/\\/g, '/');
    // Node.js CJS — works on Windows without bash. Detects new git commits and
    // triggers a background reindex so the graph stays fresh without blocking Claude.
    // Stamp files live inside graphhubDir so we never need to mkdir in the project dir.
    return `#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const GRAPHHUB_DIR = ${JSON.stringify(ghDir)};
// Skip if the graph has never been indexed
if (!fs.existsSync(path.join(GRAPHHUB_DIR, '.graphhub'))) process.exit(0);
const projectDir = process.cwd();
// Skip if watch mode is already running in this project
const pidFile = path.join(projectDir, '.graphhub', '.watch.pid');
if (fs.existsSync(pidFile)) {
  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    process.kill(pid, 0);
    process.exit(0);
  } catch { /* process gone, fall through */ }
}
// Check for a new commit
let currentCommit;
try {
  currentCommit = execSync('git rev-parse HEAD', { cwd: projectDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch { process.exit(0); }
// Stamp lives in graphhubDir keyed by a hash of the project path
const stampDir = path.join(GRAPHHUB_DIR, '.graphhub', '.stamps');
const projectHash = Buffer.from(projectDir).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
const stampFile = path.join(stampDir, projectHash);
if (fs.existsSync(stampFile) && fs.readFileSync(stampFile, 'utf8').trim() === currentCommit) process.exit(0);
// Write stamp before spawning so a crash doesn't loop indefinitely
try { fs.mkdirSync(stampDir, { recursive: true }); fs.writeFileSync(stampFile, currentCommit); } catch { /* non-fatal */ }
process.stdout.write('GRAPHHUB: new commit detected — reindexing in background...\\n');
const isWin = process.platform === 'win32';
const cmd = isWin ? 'cmd' : 'npx';
const args = isWin
  ? ['/c', 'npx', 'tsx', path.join(GRAPHHUB_DIR, 'src', 'index.ts'), 'index', projectDir]
  : ['tsx', path.join(GRAPHHUB_DIR, 'src', 'index.ts'), 'index', projectDir];
const child = spawn(cmd, args, { detached: true, stdio: 'ignore', cwd: GRAPHHUB_DIR });
child.unref();
process.exit(0);
`;
  }
}
