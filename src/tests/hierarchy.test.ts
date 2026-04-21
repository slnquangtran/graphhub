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
    // New impl runs 2 queries per direction: one for INHERITS, one for IMPLEMENTS.
    // Return one ancestor from the INHERITS query and none from IMPLEMENTS.
    let callCount = 0;
    vi.spyOn(svc['db'], 'runCypher').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { getAll: async () => [{ name: 'BaseService', kind: 'class', file: 'src/base.ts' }] };
      }
      return { getAll: async () => [] };
    });

    const result = await svc.getHierarchy({ name: 'ChildService', direction: 'ancestors' });

    expect(result.name).toBe('ChildService');
    expect(result.ancestors).toHaveLength(1);
    expect(result.ancestors[0].name).toBe('BaseService');
    expect(result.ancestors[0].relation).toBe('inherits');
    expect(result.descendants).toHaveLength(0);
    expect(callCount).toBe(2); // INHERITS + IMPLEMENTS for ancestors-only
  });

  it('getHierarchy returns descendants when direction=descendants', async () => {
    const svc = HierarchyService.getInstance();
    // First query (INHERITS descendants): ConcreteA
    // Second query (IMPLEMENTS descendants): ConcreteB
    let callCount = 0;
    vi.spyOn(svc['db'], 'runCypher').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { getAll: async () => [{ name: 'ConcreteA', kind: 'class', file: 'src/a.ts' }] };
      }
      return { getAll: async () => [{ name: 'ConcreteB', kind: 'class', file: 'src/b.ts' }] };
    });

    const result = await svc.getHierarchy({ name: 'AbstractBase', direction: 'descendants' });

    expect(result.ancestors).toHaveLength(0);
    expect(result.descendants).toHaveLength(2);
    expect(result.descendants.map((d) => d.name)).toContain('ConcreteA');
    expect(result.descendants.map((d) => d.name)).toContain('ConcreteB');
  });

  it('getHierarchy queries both directions by default', async () => {
    const svc = HierarchyService.getInstance();
    let callCount = 0;
    vi.spyOn(svc['db'], 'runCypher').mockImplementation(async () => {
      callCount++;
      return { getAll: async () => [] };
    });

    await svc.getHierarchy({ name: 'MyClass' });
    // 2 queries per direction (INHERITS + IMPLEMENTS) × 2 directions = 4
    expect(callCount).toBe(4);
  });

  it('clamps depth to 1–5', async () => {
    const svc = HierarchyService.getInstance();
    const capturedQueries: string[] = [];
    vi.spyOn(svc['db'], 'runCypher').mockImplementation(async (query: string) => {
      capturedQueries.push(query);
      return { getAll: async () => [] };
    });

    await svc.getHierarchy({ name: 'X', depth: 99, direction: 'ancestors' });
    // Two queries for ancestors-only; both should have depth clamped to 5
    expect(capturedQueries[0]).toContain('*1..5');
    expect(capturedQueries[1]).toContain('*1..5');
  });
});
