import { describe, it, expect, vi, afterEach } from 'vitest';
import { isLikelyEntryPoint, CodeHealthService, DeadSymbol } from '../services/debug/code-health-service.ts';

// ─── isLikelyEntryPoint ────────────────────────────────────────────────────

describe('isLikelyEntryPoint', () => {
  it('matches common entry-point names', () => {
    const entryPoints = [
      'main', 'index', 'setup', 'init', 'bootstrap',
      'start', 'run', 'listen', 'register', 'mount',
      'onMount', 'onDestroy', 'handleClick', 'handleSubmit',
      'exportDefault', 'constructor',
    ];
    for (const name of entryPoints) {
      expect(isLikelyEntryPoint(name), `expected "${name}" to be entry point`).toBe(true);
    }
  });

  it('does not match regular function names', () => {
    const regular = [
      'validateToken', 'parseBody', 'buildGraph',
      'cosineSimilarity', 'readJsonIfExists', 'findDeadCode',
      'getUserById', 'calculateScore',
    ];
    for (const name of regular) {
      expect(isLikelyEntryPoint(name), `expected "${name}" NOT to be entry point`).toBe(false);
    }
  });
});

// ─── CodeHealthService singleton ──────────────────────────────────────────

describe('CodeHealthService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getInstance returns the same instance every time', () => {
    const a = CodeHealthService.getInstance();
    const b = CodeHealthService.getInstance();
    expect(a).toBe(b);
  });

  // ─── findDeadCode ────────────────────────────────────────────────────────

  describe('findDeadCode', () => {
    it('filters out entry-point symbols by default', async () => {
      const svc = CodeHealthService.getInstance();

      const fakeRows: DeadSymbol[] = [
        { name: 'validateToken', kind: 'function', file: 'src/auth.ts' },
        { name: 'main', kind: 'function', file: 'src/index.ts' },
        { name: 'onMount', kind: 'function', file: 'src/component.ts' },
        { name: 'parseBody', kind: 'function', file: 'src/utils.ts' },
        { name: 'setup', kind: 'function', file: 'src/setup.ts' },
      ];

      // Mock the DB call to return controlled data
      const mockResult = { getAll: async () => fakeRows };
      vi.spyOn(svc['db'], 'runCypher').mockResolvedValue(mockResult as any);

      const result = await svc.findDeadCode();
      const names = result.map((r) => r.name);

      expect(names).toContain('validateToken');
      expect(names).toContain('parseBody');
      expect(names).not.toContain('main');
      expect(names).not.toContain('onMount');
      expect(names).not.toContain('setup');
    });

    it('includes entry points when include_entry_points=true', async () => {
      const svc = CodeHealthService.getInstance();

      const fakeRows: DeadSymbol[] = [
        { name: 'main', kind: 'function', file: 'src/index.ts' },
        { name: 'parseBody', kind: 'function', file: 'src/utils.ts' },
      ];

      const mockResult = { getAll: async () => fakeRows };
      vi.spyOn(svc['db'], 'runCypher').mockResolvedValue(mockResult as any);

      const result = await svc.findDeadCode({ include_entry_points: true });
      expect(result.map((r) => r.name)).toContain('main');
    });

    it('returns empty array when graph has no dead symbols', async () => {
      const svc = CodeHealthService.getInstance();
      const mockResult = { getAll: async () => [] };
      vi.spyOn(svc['db'], 'runCypher').mockResolvedValue(mockResult as any);

      const result = await svc.findDeadCode();
      expect(result).toEqual([]);
    });
  });

  // ─── findCycles ──────────────────────────────────────────────────────────

  describe('findCycles', () => {
    it('returns import and call cycles together when type=both', async () => {
      const svc = CodeHealthService.getInstance();

      let callCount = 0;
      vi.spyOn(svc['db'], 'runCypher').mockImplementation(async (query: string) => {
        callCount++;
        if (query.includes('IMPORTS') && !query.includes('c:File')) {
          return { getAll: async () => [{ a: 'src/a.ts', b: 'src/b.ts' }] } as any;
        }
        return { getAll: async () => [] } as any;
      });

      const result = await svc.findCycles({ type: 'both', max_length: 3 });
      const importCycles = result.filter((c) => c.type === 'import');
      expect(importCycles.length).toBeGreaterThan(0);
      expect(importCycles[0].nodes).toEqual(['src/a.ts', 'src/b.ts']);
      expect(importCycles[0].length).toBe(2);
    });

    it('returns only import cycles when type=import', async () => {
      const svc = CodeHealthService.getInstance();

      vi.spyOn(svc['db'], 'runCypher').mockResolvedValue({ getAll: async () => [] } as any);

      const result = await svc.findCycles({ type: 'import' });
      expect(result.every((c) => c.type === 'import')).toBe(true);
    });

    it('returns only call cycles when type=call', async () => {
      const svc = CodeHealthService.getInstance();

      vi.spyOn(svc['db'], 'runCypher').mockImplementation(async (query: string) => {
        if (query.includes('Symbol') && !query.includes('c:Symbol')) {
          return { getAll: async () => [{ a: 'foo', b: 'bar' }] } as any;
        }
        return { getAll: async () => [] } as any;
      });

      const result = await svc.findCycles({ type: 'call', max_length: 2 });
      expect(result.every((c) => c.type === 'call')).toBe(true);
      expect(result[0].nodes).toEqual(['foo', 'bar']);
    });

    it('skips 3-cycles when max_length=2', async () => {
      const svc = CodeHealthService.getInstance();
      const queriesMade: string[] = [];

      vi.spyOn(svc['db'], 'runCypher').mockImplementation(async (query: string) => {
        queriesMade.push(query);
        return { getAll: async () => [] } as any;
      });

      await svc.findCycles({ type: 'import', max_length: 2 });

      const threeChainQueries = queriesMade.filter((q) => q.includes('c:File'));
      expect(threeChainQueries).toHaveLength(0);
    });

    it('returns empty array when no cycles exist', async () => {
      const svc = CodeHealthService.getInstance();
      vi.spyOn(svc['db'], 'runCypher').mockResolvedValue({ getAll: async () => [] } as any);

      const result = await svc.findCycles();
      expect(result).toEqual([]);
    });
  });

  // ─── findDuplicates ──────────────────────────────────────────────────────

  describe('findDuplicates', () => {
    it('filters by min_similarity threshold', async () => {
      const svc = CodeHealthService.getInstance();

      vi.spyOn(svc['db'], 'runCypher').mockResolvedValue({ getAll: async () => [{ path: 'src/auth.ts' }] } as any);
      vi.spyOn(svc['rag'], 'findSimilarSymbols').mockResolvedValue([
        { symbolName: 'validateAuth', score: 0.95, filePath: 'src/other.ts', kind: 'function', text: '', lineRange: '', matchType: 'semantic' },
        { symbolName: 'checkToken', score: 0.70, filePath: 'src/tokens.ts', kind: 'function', text: '', lineRange: '', matchType: 'semantic' },
      ] as any);

      const result = await svc.findDuplicates({ name: 'validateToken', min_similarity: 0.85 });
      expect(result).toHaveLength(1);
      expect(result[0].similar_to).toBe('validateAuth');
      expect(result[0].similarity).toBe(0.95);
    });

    it('excludes same-file results when cross_file_only=true', async () => {
      const svc = CodeHealthService.getInstance();

      vi.spyOn(svc['db'], 'runCypher').mockResolvedValue({ getAll: async () => [{ path: 'src/auth.ts' }] } as any);
      vi.spyOn(svc['rag'], 'findSimilarSymbols').mockResolvedValue([
        { symbolName: 'sameFileFunc', score: 0.95, filePath: 'src/auth.ts', kind: 'function', text: '', lineRange: '', matchType: 'semantic' },
        { symbolName: 'otherFileFunc', score: 0.91, filePath: 'src/other.ts', kind: 'function', text: '', lineRange: '', matchType: 'semantic' },
      ] as any);

      const result = await svc.findDuplicates({ name: 'validateToken', cross_file_only: true });
      expect(result.map((r) => r.similar_to)).not.toContain('sameFileFunc');
      expect(result.map((r) => r.similar_to)).toContain('otherFileFunc');
    });

    it('returns empty array when no symbol has an embedding', async () => {
      const svc = CodeHealthService.getInstance();

      vi.spyOn(svc['db'], 'runCypher').mockResolvedValue({ getAll: async () => [] } as any);
      vi.spyOn(svc['rag'], 'findSimilarSymbols').mockResolvedValue([]);

      const result = await svc.findDuplicates({ name: 'unknownSymbol' });
      expect(result).toEqual([]);
    });
  });
});
