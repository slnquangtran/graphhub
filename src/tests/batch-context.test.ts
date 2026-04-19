import { describe, it, expect, beforeAll } from 'vitest';
import { BatchContextService } from '../services/debug/batch-context-service.ts';
import { GraphClient } from '../services/db/graph-client.ts';

describe('BatchContextService', () => {
  beforeAll(async () => {
    const db = GraphClient.getInstance();
    await db.initializeSchema();
  });

  it('is a singleton', () => {
    expect(BatchContextService.getInstance()).toBe(BatchContextService.getInstance());
  });

  it('exposes a fetch method', () => {
    expect(typeof BatchContextService.getInstance().fetch).toBe('function');
  });

  it('returns empty result for empty names array', async () => {
    const svc = BatchContextService.getInstance();
    const result = await svc.fetch([]);
    expect(result.entries).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it('returns empty result for all-empty-string names', async () => {
    const svc = BatchContextService.getInstance();
    const result = await svc.fetch(['', '']);
    expect(result.entries).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it('deduplicates duplicate names before querying', async () => {
    const svc = BatchContextService.getInstance();
    const result = await svc.fetch(['__definitely_missing_symbol__', '__definitely_missing_symbol__']);
    expect(result.entries.length).toBe(1);
    expect(result.missing.length).toBe(1);
  });

  it('flags unknown symbols as missing with found=false', async () => {
    const svc = BatchContextService.getInstance();
    const result = await svc.fetch(['__zzz_nope_symbol__']);
    expect(result.missing).toContain('__zzz_nope_symbol__');
    expect(result.entries[0].found).toBe(false);
    expect(result.entries[0].callers_count).toBe(0);
    expect(result.entries[0].callees_count).toBe(0);
  });

  it('omits neighbor arrays in compact mode (default)', async () => {
    const svc = BatchContextService.getInstance();
    const result = await svc.fetch(['__zzz_nope_symbol__']);
    expect(result.entries[0].callers).toBeUndefined();
    expect(result.entries[0].callees).toBeUndefined();
  });
});
