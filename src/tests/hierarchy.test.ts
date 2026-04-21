import { describe, it, expect, vi, afterEach } from 'vitest';
import { HierarchyService } from '../services/debug/hierarchy-service.ts';

describe('HierarchyService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getInstance returns the same instance every time', () => {
    const a = HierarchyService.getInstance();
    const b = HierarchyService.getInstance();
    expect(a).toBe(b);
  });

  it('getHierarchy returns ancestors when direction=ancestors', async () => {
    const svc = HierarchyService.getInstance();
    const mockAncestors = [{ name: 'BaseService', kind: 'class', file: 'src/base.ts', relation: 'inherits' }];
    let callCount = 0;
    vi.spyOn(svc['db'], 'runCypher').mockImplementation(async (query: string) => {
      callCount++;
      // ancestors query fires; descendants should not
      return { getAll: async () => mockAncestors };
    });

    const result = await svc.getHierarchy({ name: 'ChildService', direction: 'ancestors' });

    expect(result.name).toBe('ChildService');
    expect(result.ancestors).toHaveLength(1);
    expect(result.ancestors[0].name).toBe('BaseService');
    expect(result.descendants).toHaveLength(0);
    expect(callCount).toBe(1); // only one query for ancestors-only
  });

  it('getHierarchy returns descendants when direction=descendants', async () => {
    const svc = HierarchyService.getInstance();
    const mockDescendants = [
      { name: 'ConcreteA', kind: 'class', file: 'src/a.ts', relation: 'inherits' },
      { name: 'ConcreteB', kind: 'class', file: 'src/b.ts', relation: 'implements' },
    ];
    vi.spyOn(svc['db'], 'runCypher').mockResolvedValue({ getAll: async () => mockDescendants });

    const result = await svc.getHierarchy({ name: 'AbstractBase', direction: 'descendants' });

    expect(result.ancestors).toHaveLength(0);
    expect(result.descendants).toHaveLength(2);
    expect(result.descendants.map((d) => d.name)).toContain('ConcreteA');
  });

  it('getHierarchy queries both directions by default', async () => {
    const svc = HierarchyService.getInstance();
    let callCount = 0;
    vi.spyOn(svc['db'], 'runCypher').mockImplementation(async () => {
      callCount++;
      return { getAll: async () => [] };
    });

    await svc.getHierarchy({ name: 'MyClass' });
    expect(callCount).toBe(2);
  });

  it('clamps depth to 1–5', async () => {
    const svc = HierarchyService.getInstance();
    const capturedQueries: string[] = [];
    vi.spyOn(svc['db'], 'runCypher').mockImplementation(async (query: string) => {
      capturedQueries.push(query);
      return { getAll: async () => [] };
    });

    await svc.getHierarchy({ name: 'X', depth: 99, direction: 'ancestors' });
    expect(capturedQueries[0]).toContain('*1..5');
  });
});
