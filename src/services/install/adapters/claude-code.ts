import fs from 'fs';
import path from 'path';
import { ClientAdapter, InstallContext, InstallResult } from './types.ts';
import { buildGraphhubServerEntry, readJsonIfExists, writeJson, McpServerEntry } from './mcp-config.ts';

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
    return path.join(ctx.home, '.claude', 'graphhub-pre-hook.sh');
  }

  private postHookPath(ctx: InstallContext): string {
    return path.join(ctx.home, '.claude', 'graphhub-post-hook.sh');
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
    fs.writeFileSync(preHookPath, this.buildPreHookScript(), { mode: 0o755 });

    settings.hooks = settings.hooks ?? {};
    settings.hooks['PreToolUse'] = settings.hooks['PreToolUse'] ?? [];
    const preExists = settings.hooks['PreToolUse'].some(
      (h) => h.hooks.some((hk) => hk.command.includes(PRE_HOOK_MARKER)),
    );
    if (!preExists) {
      settings.hooks['PreToolUse'].push({
        matcher: 'Glob|Grep|Read',
        hooks: [{ type: 'command', command: `bash "${preHookPath.replace(/\\/g, '/')}"` }],
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
        hooks: [{ type: 'command', command: `bash "${postHookPath.replace(/\\/g, '/')}"` }],
      });
    }

    writeJson(settingsPath, settings);
    return {
      client: this.name,
      installed: true,
      reason: 'configured',
      files: [settingsPath, preHookPath, postHookPath],
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

    for (const p of [this.preHookPath(ctx), this.postHookPath(ctx)]) {
      try { fs.unlinkSync(p); } catch { /* already gone */ }
    }

    return { client: this.name, installed: false, reason: 'removed', files: [settingsPath] };
  }

  private buildPreHookScript(): string {
    // Outputs a reminder Claude sees before every Glob/Grep/Read call.
    // The message is intentionally short so it doesn't consume many tokens itself.
    return `#!/bin/bash
# GraphHub PreToolUse hook — auto-generated, do not edit manually.
# Fires before Glob, Grep, and Read to remind Claude to use the knowledge graph first.
[ -d ".graphhub" ] || exit 0
echo "GRAPHHUB: graph index found. Use MCP tools before searching files manually:"
echo "  semantic_search  — natural language (saves ~94% tokens vs file search)"
echo "  search_by_name   — exact or fuzzy symbol lookup"
echo "  get_context      — callers + callees of any function"
echo "  impact_analysis  — blast radius before editing a symbol"
echo "  debug_trace      — one-shot search + context + next steps"
`;
  }

  private buildPostHookScript(graphhubDir: string): string {
    const ghDir = graphhubDir.replace(/\\/g, '/');
    // Detects new git commits and triggers a background reindex so the graph
    // stays in sync without blocking Claude.
    return `#!/bin/bash
# GraphHub PostToolUse hook — auto-generated, do not edit manually.
# Fires after every Bash call and reindexes the graph when a new commit lands.
[ -d ".graphhub" ] || exit 0

GRAPHHUB_DIR="${ghDir}"
PROJECT_DIR="$(pwd -P)"
STAMP_FILE="$PROJECT_DIR/.graphhub/.last_index_commit"

CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null) || exit 0

if [ -f "$STAMP_FILE" ] && [ "$(cat "$STAMP_FILE" 2>/dev/null)" = "$CURRENT_COMMIT" ]; then
  exit 0
fi

echo "GRAPHHUB: new commit detected — reindexing in background..."
(
  cd "$GRAPHHUB_DIR" && \\
  npx tsx src/index.ts index "$PROJECT_DIR" > /dev/null 2>&1 && \\
  echo "$CURRENT_COMMIT" > "$STAMP_FILE"
) &
`;
  }
}
