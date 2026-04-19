import { describe, it, expect, beforeAll } from 'vitest';
import { ChangedSymbolsService } from '../services/debug/changed-symbols-service.ts';
import { GraphClient } from '../services/db/graph-client.ts';

describe('ChangedSymbolsService', () => {
  beforeAll(async () => {
    const db = GraphClient.getInstance();
    await db.initializeSchema();
  });

  it('is a singleton', () => {
    expect(ChangedSymbolsService.getInstance()).toBe(ChangedSymbolsService.getInstance());
  });

  it('returns empty result when no files changed', async () => {
    const svc = ChangedSymbolsService.getInstance();
    const result = await svc.list({ cwd: '/definitely/not/a/repo' });
    expect(result.changed_files).toEqual([]);
    expect(result.entries).toEqual([]);
    expect(result.not_in_graph).toEqual([]);
  });

  it('reports scope=since when a since ref is provided', () => {
    const svc = ChangedSymbolsService.getInstance();
    const info = svc.getChangedFiles({ cwd: '/definitely/not/a/repo', since: 'master' });
    expect(info.scope).toBe('since');
    expect(info.base_ref).toBe('master');
    expect(info.files).toEqual([]);
  });

  it('reports scope=staged when staged=true', () => {
    const svc = ChangedSymbolsService.getInstance();
    const info = svc.getChangedFiles({ cwd: '/definitely/not/a/repo', staged: true });
    expect(info.scope).toBe('staged');
    expect(info.base_ref).toBeNull();
  });

  it('reports scope=working by default', () => {
    const svc = ChangedSymbolsService.getInstance();
    const info = svc.getChangedFiles({ cwd: '/definitely/not/a/repo' });
    expect(info.scope).toBe('working');
    expect(info.base_ref).toBeNull();
  });

  it('rejects malicious since refs without running git', () => {
    const svc = ChangedSymbolsService.getInstance();
    const malicious = 'master; echo pwned > /tmp/pwned';
    const info = svc.getChangedFiles({ cwd: process.cwd(), since: malicious });
    expect(info.files).toEqual([]);
    expect(info.base_ref).toBe(malicious);
    expect(info.scope).toBe('since');
  });
});
