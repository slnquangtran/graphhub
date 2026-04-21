#!/usr/bin/env node
// GraphHub postinstall: auto-configures detected MCP clients (Claude Code, OpenCode,
// Gemini CLI, Antigravity). Skipped when:
//   - CI=true (any CI)
//   - GRAPHHUB_NO_INSTALL=1 (opt-out)
//   - npm_config_global=true (graphhub installed as a global CLI — nothing to configure yet)
// The actual work runs via `tsx src/index.ts setup` against INIT_CWD (the invoking project).

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.GRAPHHUB_NO_INSTALL === '1') {
  console.log('[graphhub] postinstall skipped (GRAPHHUB_NO_INSTALL=1)');
  process.exit(0);
}
if (process.env.CI === 'true' || process.env.CI === '1') {
  console.log('[graphhub] postinstall skipped (CI detected)');
  process.exit(0);
}
if (process.env.npm_config_global === 'true') {
  console.log('[graphhub] postinstall skipped (global install). Run `graphhub setup` in a project.');
  process.exit(0);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const graphhubRoot = path.resolve(here, '..');
const projectDir = process.env.INIT_CWD && process.env.INIT_CWD !== graphhubRoot
  ? process.env.INIT_CWD
  : graphhubRoot;

const entry = path.join(graphhubRoot, 'src', 'index.ts');
const result = spawnSync('npx', ['tsx', entry, 'setup', projectDir], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.signal !== null) {
  console.log('[graphhub] postinstall setup killed by signal', result.signal);
  console.log('[graphhub] run `npx graphhub setup` manually to retry.');
} else if (result.status !== 0) {
  console.log('[graphhub] postinstall setup exited with', result.status);
  console.log('[graphhub] run `npx graphhub setup` manually to retry.');
}
