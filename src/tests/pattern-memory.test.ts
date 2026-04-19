import { describe, it, expect, beforeAll } from 'vitest';
import { PatternMemoryService } from '../services/memory/pattern-memory-service.ts';
import { ObservationService } from '../services/memory/observation-service.ts';
import { EmbeddingService } from '../services/ai/embedding-service.ts';
import { GraphClient } from '../services/db/graph-client.ts';
import crypto from 'crypto';

describe('PatternMemoryService', () => {
  const project = `pattern-test-${crypto.randomUUID().slice(0, 8)}`;
  let svc: PatternMemoryService;

  beforeAll(async () => {
    const db = GraphClient.getInstance();
    await db.initializeSchema();
    const emb = EmbeddingService.getInstance();
    await emb.initialize();
    const obs = ObservationService.getInstance();
    await obs.initializeSchema();
    svc = PatternMemoryService.getInstance();
  });

  it('is a singleton', () => {
    expect(PatternMemoryService.getInstance()).toBe(PatternMemoryService.getInstance());
  });

  it('formats bugfix content with SYMPTOM/ROOT CAUSE/FIX labels', () => {
    const c = svc.formatBugfixContent('NPE', 'undef user', 'default {}');
    expect(c).toContain('SYMPTOM: NPE');
    expect(c).toContain('ROOT CAUSE: undef user');
    expect(c).toContain('FIX: default {}');
  });

  it('parses bugfix content back into fields', () => {
    const c = svc.formatBugfixContent('NPE', 'undef user', 'default {}');
    const parsed = svc.parseBugfixContent(c);
    expect(parsed.symptom).toBe('NPE');
    expect(parsed.root_cause).toBe('undef user');
    expect(parsed.fix).toBe('default {}');
  });

  it('parses skill content back into fields', () => {
    const c = svc.formatSkillContent('refactor X', '.claude/skills/refactor/SKILL.md', 'success');
    const parsed = svc.parseSkillContent(c);
    expect(parsed.task_description).toBe('refactor X');
    expect(parsed.skill_path).toBe('.claude/skills/refactor/SKILL.md');
    expect(parsed.outcome).toBe('success');
  });

  it('defaults skill outcome to unknown when missing', () => {
    const parsed = svc.parseSkillContent('TASK: foo\nCHOSEN SKILL: bar\nOUTCOME: ');
    expect(parsed.outcome).toBe('unknown');
  });

  it('remembers and recalls a bugfix by symptom', async () => {
    await svc.rememberBugfix({
      symptom: 'TypeError: Cannot read property user of undefined',
      root_cause: 'req.session was null when called from /guest',
      fix: 'Added session guard at middleware entry',
      related_symbols: ['loginHandler'],
      project,
    });
    const hits = await svc.recallBugfix('undefined user property', { project, limit: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].symptom).toMatch(/TypeError/);
    expect(hits[0].root_cause).toMatch(/session/);
    expect(hits[0].fix).toMatch(/guard/);
    expect(hits[0].similarity).toBeGreaterThan(0);
  });

  it('remembers and recalls a skill choice by task', async () => {
    await svc.rememberSkillChoice({
      task_description: 'rename a function across the codebase safely',
      skill_path: '.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md',
      outcome: 'success',
      project,
    });
    const hits = await svc.recallSkillChoice('rename symbol in multiple files', { project, limit: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].skill_path).toContain('gitnexus-refactoring');
    expect(hits[0].outcome).toBe('success');
  });

  it('does not return skill choices when recalling bugfixes', async () => {
    await svc.rememberSkillChoice({
      task_description: 'debug an infinite loop',
      skill_path: '.claude/skills/gitnexus/gitnexus-debugging/SKILL.md',
      outcome: 'success',
      project,
    });
    const bugs = await svc.recallBugfix('infinite loop', { project, limit: 5 });
    for (const b of bugs) {
      expect(b.tags).toContain('bugfix-pattern');
      expect(b.tags).not.toContain('skill-routing');
    }
  });
});
