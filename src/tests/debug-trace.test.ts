import { describe, it, expect } from 'vitest';
import { DebugTraceService } from '../services/debug/trace-service.ts';

describe('DebugTraceService', () => {
  it('is a singleton', () => {
    const a = DebugTraceService.getInstance();
    const b = DebugTraceService.getInstance();
    expect(a).toBe(b);
  });

  it('exposes a trace method', () => {
    const svc = DebugTraceService.getInstance();
    expect(typeof svc.trace).toBe('function');
  });

  it('suggestNextSteps returns stale-index hint when no candidates', () => {
    const svc = DebugTraceService.getInstance() as any;
    const steps: string[] = svc.suggestNextSteps([]);
    expect(steps.length).toBe(1);
    expect(steps[0]).toMatch(/No candidates/);
  });

  it('suggestNextSteps flags HIGH risk candidates', () => {
    const svc = DebugTraceService.getInstance() as any;
    const steps: string[] = svc.suggestNextSteps([
      {
        symbol: 'runCypher',
        kind: 'method',
        score: 0.9,
        snippet: '',
        definedIn: { path: 'src/db.ts', range: '10-20' },
        callers: Array.from({ length: 5 }, (_, i) => ({ name: `c${i}`, kind: 'method' })),
        callees: [],
        impact: { risk: 'HIGH', direct_caller_count: 5, indirect_caller_count: 10 },
      },
    ]);
    expect(steps.some(s => s.includes('HIGH impact risk'))).toBe(true);
    expect(steps.some(s => s.includes('runCypher'))).toBe(true);
  });

  it('suggestNextSteps omits HIGH warning for LOW risk', () => {
    const svc = DebugTraceService.getInstance() as any;
    const steps: string[] = svc.suggestNextSteps([
      {
        symbol: 'foo',
        kind: 'function',
        score: 0.5,
        snippet: '',
        definedIn: null,
        callers: [],
        callees: [],
        impact: { risk: 'LOW', direct_caller_count: 0, indirect_caller_count: 0 },
      },
    ]);
    expect(steps.some(s => s.includes('HIGH impact risk'))).toBe(false);
  });
});
