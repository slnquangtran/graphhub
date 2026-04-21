import { describe, it, expect, vi, afterEach } from 'vitest';
import { TechDebtService } from '../services/debug/tech-debt-service.ts';

const makeRow = (overrides: Partial<{
  name: string; kind: string; file: string;
  markers: string[]; status: string; caller_count: number; risk_score: number;
}> = {}) => ({
  name: 'parseInput',
  kind: 'function',
  file: 'src/parser.ts',
  markers: ['TODO: handle edge case'],
  status: 'Incomplete',
  caller_count: 3,
  risk_score: 4,
  ...overrides,
});

describe('TechDebtService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getInstance returns the same instance every time', () => {
    const a = TechDebtService.getInstance();
    const b = TechDebtService.getInstance();
    expect(a).toBe(b);
  });

  it('returns entries from the graph', async () => {
    const svc = TechDebtService.getInstance();
    vi.spyOn(svc['db'], 'runCypher').mockResolvedValue({
      getAll: async () => [makeRow(), makeRow({ name: 'buildQuery', markers: ['FIXME: sql injection risk'], risk_score: 10 })],
    });

    const result = await svc.findTechDebt();
    expect(result.total).toBe(2);
    expect(result.entries[0].name).toBe('parseInput');
  });

  it('filters by marker type', async () => {
    const svc = TechDebtService.getInstance();
    vi.spyOn(svc['db'], 'runCypher').mockResolvedValue({
      getAll: async () => [
        makeRow({ markers: ['TODO: do this'] }),
        makeRow({ name: 'other', markers: ['FIXME: broken'] }),
      ],
    });

    const result = await svc.findTechDebt({ marker: 'TODO' });
    expect(result.total).toBe(1);
    expect(result.entries[0].markers[0]).toContain('TODO');
  });

  it('returns zero entries when graph has no tech debt', async () => {
    const svc = TechDebtService.getInstance();
    vi.spyOn(svc['db'], 'runCypher').mockResolvedValue({ getAll: async () => [] });

    const result = await svc.findTechDebt();
    expect(result.total).toBe(0);
    expect(result.entries).toHaveLength(0);
  });

  it('validates limit to 1–500', async () => {
    const svc = TechDebtService.getInstance();
    const capturedQueries: string[] = [];
    vi.spyOn(svc['db'], 'runCypher').mockImplementation(async (query: string) => {
      capturedQueries.push(query);
      return { getAll: async () => [] };
    });

    await svc.findTechDebt({ limit: 9999 });
    expect(capturedQueries[0]).toContain('LIMIT 500');

    await svc.findTechDebt({ limit: -5 });
    expect(capturedQueries[1]).toContain('LIMIT 1');
  });
});
