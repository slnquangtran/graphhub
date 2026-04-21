import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { MultiInstaller } from '../services/install/multi-installer.ts';

function tmpDir(prefix: string): string {
  const dir = path.join(os.tmpdir(), `${prefix}-${crypto.randomUUID().slice(0, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('MultiInstaller', () => {
  let projectDir: string;
  let graphhubDir: string;
  let homeDir: string;
  let installer: MultiInstaller;

  beforeEach(() => {
    projectDir = tmpDir('gh-project');
    graphhubDir = tmpDir('gh-root');
    homeDir = tmpDir('gh-home');
    installer = new MultiInstaller();
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(graphhubDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it('lists the five built-in clients', () => {
    const names = installer.listClients().map((c) => c.name).sort();
    expect(names).toEqual(['antigravity', 'claude-code', 'gemini-cli', 'kilo-cli', 'opencode']);
  });

  it('detects nothing in a pristine home dir', async () => {
    const detections = await installer.detect({ projectDir, homeDir });
    expect(detections.every((d) => d.detected === false)).toBe(true);
  });

  it('detects Claude Code when ~/.claude exists', async () => {
    fs.mkdirSync(path.join(homeDir, '.claude'), { recursive: true });
    const detections = await installer.detect({ projectDir, homeDir });
    const claude = detections.find((d) => d.name === 'claude-code');
    expect(claude?.detected).toBe(true);
  });

  it('detects Gemini CLI when ~/.gemini exists', async () => {
    fs.mkdirSync(path.join(homeDir, '.gemini'), { recursive: true });
    const detections = await installer.detect({ projectDir, homeDir });
    const gemini = detections.find((d) => d.name === 'gemini-cli');
    expect(gemini?.detected).toBe(true);
  });

  it('detects Kilo CLI when ~/.config/kilo exists', async () => {
    fs.mkdirSync(path.join(homeDir, '.config', 'kilo'), { recursive: true });
    const detections = await installer.detect({ projectDir, homeDir });
    const kilo = detections.find((d) => d.name === 'kilo-cli');
    expect(kilo?.detected).toBe(true);
  });

  it('installAll on pristine home installs nothing', async () => {
    const results = await installer.installAll({ projectDir, graphhubDir, homeDir });
    expect(results).toEqual([]);
  });

  it('installAll with --force writes config for every adapter', async () => {
    const results = await installer.installAll({ projectDir, graphhubDir, homeDir, force: true });
    expect(results.length).toBe(5);
    expect(results.every((r) => r.installed)).toBe(true);
  });

  it('installAll with explicit clients writes only those', async () => {
    const results = await installer.installAll({
      projectDir,
      graphhubDir,
      homeDir,
      clients: ['claude-code', 'kilo-cli'],
    });
    expect(results.map((r) => r.client).sort()).toEqual(['claude-code', 'kilo-cli']);

    const claudeSettings = JSON.parse(
      fs.readFileSync(path.join(homeDir, '.claude', 'settings.json'), 'utf-8'),
    );
    expect(claudeSettings.mcpServers.graphhub.command).toBe('npx');

    const kiloCfg = JSON.parse(
      fs.readFileSync(path.join(homeDir, '.config', 'kilo', 'kilo.json'), 'utf-8'),
    );
    expect(kiloCfg.mcp.graphhub.type).toBe('local');
    expect(kiloCfg.mcp.graphhub.enabled).toBe(true);
  });

  it('opencode install writes to ~/.config/opencode/opencode.json', async () => {
    const results = await installer.installAll({
      projectDir,
      graphhubDir,
      homeDir,
      clients: ['opencode'],
    });
    expect(results[0].installed).toBe(true);
    const cfg = JSON.parse(
      fs.readFileSync(path.join(homeDir, '.config', 'opencode', 'opencode.json'), 'utf-8'),
    );
    expect(cfg.mcp.graphhub.type).toBe('local');
    expect(cfg.mcp.graphhub.enabled).toBe(true);
  });

  it('MCP server entry uses forward slashes even on Windows', async () => {
    const results = await installer.installAll({
      projectDir,
      graphhubDir,
      homeDir,
      clients: ['claude-code'],
    });
    expect(results[0].installed).toBe(true);
    const settings = JSON.parse(
      fs.readFileSync(path.join(homeDir, '.claude', 'settings.json'), 'utf-8'),
    );
    const entry = settings.mcpServers.graphhub.args[1] as string;
    expect(entry).not.toContain('\\');
  });

  it('preserves unrelated keys in existing settings files', async () => {
    const settingsPath = path.join(homeDir, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify({ theme: 'dark', mcpServers: { other: { command: 'x', args: [] } } }));
    await installer.installAll({ projectDir, graphhubDir, homeDir, clients: ['claude-code'] });
    const after = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(after.theme).toBe('dark');
    expect(after.mcpServers.other).toBeDefined();
    expect(after.mcpServers.graphhub).toBeDefined();
  });

  it('uninstallAll removes only the graphhub entry', async () => {
    await installer.installAll({ projectDir, graphhubDir, homeDir, clients: ['claude-code'] });
    const results = await installer.uninstallAll({ projectDir, graphhubDir, homeDir, clients: ['claude-code'] });
    expect(results[0].installed).toBe(false);
    const settings = JSON.parse(
      fs.readFileSync(path.join(homeDir, '.claude', 'settings.json'), 'utf-8'),
    );
    expect(settings.mcpServers?.graphhub).toBeUndefined();
  });

  it('rejects an unknown client name', async () => {
    await expect(
      installer.installAll({ projectDir, graphhubDir, homeDir, clients: ['nonexistent'] }),
    ).rejects.toThrow(/No adapters matched/);
  });

  it('claude-code install writes PreToolUse and PostToolUse hooks', async () => {
    await installer.installAll({ projectDir, graphhubDir, homeDir, clients: ['claude-code'] });
    const settings = JSON.parse(
      fs.readFileSync(path.join(homeDir, '.claude', 'settings.json'), 'utf-8'),
    );
    const pre: any[] = settings.hooks?.PreToolUse ?? [];
    const post: any[] = settings.hooks?.PostToolUse ?? [];
    expect(pre.some((h: any) => h.hooks.some((hk: any) => hk.command.includes('graphhub-pre-hook')))).toBe(true);
    expect(post.some((h: any) => h.hooks.some((hk: any) => hk.command.includes('graphhub-post-hook')))).toBe(true);
  });

  it('claude-code install writes hook shell scripts to ~/.claude/', async () => {
    await installer.installAll({ projectDir, graphhubDir, homeDir, clients: ['claude-code'] });
    const claudeDir = path.join(homeDir, '.claude');
    expect(fs.existsSync(path.join(claudeDir, 'graphhub-pre-hook.sh'))).toBe(true);
    expect(fs.existsSync(path.join(claudeDir, 'graphhub-post-hook.sh'))).toBe(true);
  });

  it('claude-code install is idempotent — does not duplicate hooks on re-run', async () => {
    await installer.installAll({ projectDir, graphhubDir, homeDir, clients: ['claude-code'] });
    await installer.installAll({ projectDir, graphhubDir, homeDir, clients: ['claude-code'] });
    const settings = JSON.parse(
      fs.readFileSync(path.join(homeDir, '.claude', 'settings.json'), 'utf-8'),
    );
    const pre: any[] = settings.hooks?.PreToolUse ?? [];
    const graphhubPre = pre.filter((h: any) => h.hooks.some((hk: any) => hk.command.includes('graphhub-pre-hook')));
    expect(graphhubPre.length).toBe(1);
  });

  it('opencode install injects GRAPHHUB_INSTRUCTIONS into config', async () => {
    const results = await installer.installAll({
      projectDir,
      graphhubDir,
      homeDir,
      clients: ['opencode'],
    });
    expect(results[0].installed).toBe(true);
    const cfg = JSON.parse(
      fs.readFileSync(path.join(homeDir, '.config', 'opencode', 'opencode.json'), 'utf-8'),
    );
    expect(cfg.instructions).toContain('graphhub-instructions');
    expect(cfg.instructions).toContain('semantic_search');
  });

  it('opencode install is idempotent — does not duplicate instructions on re-run', async () => {
    await installer.installAll({ projectDir, graphhubDir, homeDir, clients: ['opencode'] });
    await installer.installAll({ projectDir, graphhubDir, homeDir, clients: ['opencode'] });
    const cfg = JSON.parse(
      fs.readFileSync(path.join(homeDir, '.config', 'opencode', 'opencode.json'), 'utf-8'),
    );
    const count = (cfg.instructions as string).split('graphhub-instructions').length - 1;
    expect(count).toBe(1);
  });

  it('kilo-cli install injects GRAPHHUB_INSTRUCTIONS into config', async () => {
    const results = await installer.installAll({
      projectDir,
      graphhubDir,
      homeDir,
      clients: ['kilo-cli'],
    });
    expect(results[0].installed).toBe(true);
    const cfg = JSON.parse(
      fs.readFileSync(path.join(homeDir, '.config', 'kilo', 'kilo.json'), 'utf-8'),
    );
    expect(cfg.instructions).toContain('graphhub-instructions');
    expect(cfg.instructions).toContain('semantic_search');
  });

  it('antigravity install injects GRAPHHUB_INSTRUCTIONS into config', async () => {
    const results = await installer.installAll({
      projectDir,
      graphhubDir,
      homeDir,
      clients: ['antigravity'],
    });
    expect(results[0].installed).toBe(true);
    const cfg = JSON.parse(
      fs.readFileSync(path.join(homeDir, '.antigravity', 'mcp.json'), 'utf-8'),
    );
    expect(cfg.instructions).toContain('graphhub-instructions');
    expect(cfg.instructions).toContain('semantic_search');
  });

  it('uninstallAll removes instructions from opencode config', async () => {
    await installer.installAll({ projectDir, graphhubDir, homeDir, clients: ['opencode'] });
    await installer.uninstallAll({ projectDir, graphhubDir, homeDir, clients: ['opencode'] });
    const cfg = JSON.parse(
      fs.readFileSync(path.join(homeDir, '.config', 'opencode', 'opencode.json'), 'utf-8'),
    );
    expect(cfg.instructions ?? '').not.toContain('graphhub-instructions');
  });

  it('uninstallAll removes hooks and hook scripts', async () => {
    await installer.installAll({ projectDir, graphhubDir, homeDir, clients: ['claude-code'] });
    await installer.uninstallAll({ projectDir, graphhubDir, homeDir, clients: ['claude-code'] });
    const settings = JSON.parse(
      fs.readFileSync(path.join(homeDir, '.claude', 'settings.json'), 'utf-8'),
    );
    const pre: any[] = settings.hooks?.PreToolUse ?? [];
    const post: any[] = settings.hooks?.PostToolUse ?? [];
    expect(pre.some((h: any) => h.hooks.some((hk: any) => hk.command.includes('graphhub-pre-hook')))).toBe(false);
    expect(post.some((h: any) => h.hooks.some((hk: any) => hk.command.includes('graphhub-post-hook')))).toBe(false);
    expect(fs.existsSync(path.join(homeDir, '.claude', 'graphhub-pre-hook.sh'))).toBe(false);
    expect(fs.existsSync(path.join(homeDir, '.claude', 'graphhub-post-hook.sh'))).toBe(false);
  });
});
