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
  let installer: MultiInstaller;

  beforeEach(() => {
    projectDir = tmpDir('gh-project');
    graphhubDir = tmpDir('gh-root');
    installer = new MultiInstaller();
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(graphhubDir, { recursive: true, force: true });
  });

  it('lists the four built-in clients', () => {
    const names = installer.listClients().map((c) => c.name).sort();
    expect(names).toEqual(['antigravity', 'claude-code', 'gemini-cli', 'opencode']);
  });

  it('detects nothing in a pristine project dir', async () => {
    const detections = await installer.detect({ projectDir });
    expect(detections.every((d) => d.detected === false)).toBe(true);
  });

  it('detects Claude Code when .claude exists', async () => {
    fs.mkdirSync(path.join(projectDir, '.claude'), { recursive: true });
    const detections = await installer.detect({ projectDir });
    const claude = detections.find((d) => d.name === 'claude-code');
    expect(claude?.detected).toBe(true);
  });

  it('installAll on pristine project installs nothing', async () => {
    const results = await installer.installAll({ projectDir, graphhubDir });
    expect(results).toEqual([]);
  });

  it('installAll with --force writes config for every adapter', async () => {
    const results = await installer.installAll({ projectDir, graphhubDir, force: true });
    expect(results.length).toBe(4);
    expect(results.every((r) => r.installed)).toBe(true);
  });

  it('installAll with explicit clients writes only those', async () => {
    const results = await installer.installAll({
      projectDir,
      graphhubDir,
      clients: ['claude-code', 'opencode'],
    });
    expect(results.map((r) => r.client).sort()).toEqual(['claude-code', 'opencode']);
    const claudeSettings = JSON.parse(
      fs.readFileSync(path.join(projectDir, '.claude', 'settings.json'), 'utf-8'),
    );
    expect(claudeSettings.mcpServers.graphhub.command).toBe('npx');
    const opencodeCfg = JSON.parse(
      fs.readFileSync(path.join(projectDir, 'opencode.json'), 'utf-8'),
    );
    expect(opencodeCfg.mcp.graphhub.type).toBe('local');
    expect(opencodeCfg.mcp.graphhub.enabled).toBe(true);
  });

  it('preserves unrelated keys in existing settings files', async () => {
    const settingsPath = path.join(projectDir, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify({ theme: 'dark', mcpServers: { other: { command: 'x', args: [] } } }));
    await installer.installAll({ projectDir, graphhubDir, clients: ['claude-code'] });
    const after = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(after.theme).toBe('dark');
    expect(after.mcpServers.other).toBeDefined();
    expect(after.mcpServers.graphhub).toBeDefined();
  });

  it('uninstallAll removes only the graphhub entry', async () => {
    await installer.installAll({ projectDir, graphhubDir, clients: ['claude-code'] });
    const results = await installer.uninstallAll({ projectDir, graphhubDir, clients: ['claude-code'] });
    expect(results[0].installed).toBe(false);
    const settings = JSON.parse(
      fs.readFileSync(path.join(projectDir, '.claude', 'settings.json'), 'utf-8'),
    );
    expect(settings.mcpServers?.graphhub).toBeUndefined();
  });

  it('rejects an unknown client name', async () => {
    await expect(
      installer.installAll({ projectDir, graphhubDir, clients: ['nonexistent'] }),
    ).rejects.toThrow(/No adapters matched/);
  });
});
