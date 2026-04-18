import { describe, it, expect, beforeAll } from 'vitest';
import { ObservationService } from '../services/memory/observation-service.ts';
import { EmbeddingService } from '../services/ai/embedding-service.ts';
import { GraphClient } from '../services/db/graph-client.ts';
import crypto from 'crypto';

describe('ObservationService', () => {
  let service: ObservationService;
  // Use unique project name per test run to avoid pollution from previous runs
  const testProject = `test-project-${crypto.randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    // Symbol table must exist before RELATES_TO edge can be created
    const graphClient = GraphClient.getInstance();
    await graphClient.initializeSchema();

    const embeddings = EmbeddingService.getInstance();
    await embeddings.initialize();
    service = ObservationService.getInstance();
    await service.initializeSchema();
  });

  it('should remember and recall observations', async () => {
    const id = await service.remember('Tree-sitter parses code into AST nodes', {
      type: 'learning',
      project: testProject,
      tags: ['parsing', 'ast'],
    });

    expect(id).toBeDefined();
    expect(typeof id).toBe('string');

    const results = await service.recall('how does code parsing work', {
      project: testProject,
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('Tree-sitter');
  });

  it('should support different observation types', async () => {
    await service.remember('Fixed null pointer in parser', {
      type: 'bugfix',
      project: testProject,
      importance: 'high',
    });

    await service.remember('Added support for Python parsing', {
      type: 'feature',
      project: testProject,
    });

    const bugfixes = await service.recall('bug fix', {
      project: testProject,
      type: 'bugfix',
    });

    expect(bugfixes.some(o => o.type === 'bugfix')).toBe(true);
  });

  it('should return timeline in chronological order', async () => {
    const timeline = await service.timeline({
      project: testProject,
      orderBy: 'desc',
      limit: 10,
    });

    expect(timeline.length).toBeGreaterThan(0);

    // Check that timestamps are in descending order
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i - 1].timestamp >= timeline[i].timestamp).toBe(true);
    }
  });

  it('should return stats', async () => {
    // Create some data first
    await service.remember('Stats test observation', {
      type: 'learning',
      project: testProject,
    });

    const stats = await service.getStats(testProject);

    expect(stats.total).toBeGreaterThan(0);
    expect(stats.byType).toBeDefined();
    expect(typeof stats.recentCount).toBe('number');
  });

  it('should get and update observations', async () => {
    const id = await service.remember('Original content', {
      type: 'learning',
      project: testProject,
    });

    const obs = await service.getObservation(id);
    expect(obs).not.toBeNull();
    expect(obs!.content).toBe('Original content');

    await service.updateObservation(id, {
      content: 'Updated content',
      importance: 'high',
    });

    const updated = await service.getObservation(id);
    expect(updated!.content).toBe('Updated content');
    expect(updated!.importance).toBe('high');
  });

  it('should filter by importance', async () => {
    await service.remember('Critical security issue found', {
      type: 'warning',
      project: testProject,
      importance: 'critical',
    });

    const critical = await service.recall('security', {
      project: testProject,
      importance: 'critical',
    });

    expect(critical.every(o => o.importance === 'critical')).toBe(true);
  });

  it('should filter by tags', async () => {
    await service.remember('Database migration completed', {
      type: 'change',
      project: testProject,
      tags: ['database', 'migration'],
    });

    const results = await service.recall('migration', {
      project: testProject,
      tags: ['database'],
    });

    expect(results.some(o => o.tags.includes('database'))).toBe(true);
  });

  it('should forget observations', async () => {
    const id = await service.remember('Temporary note', {
      type: 'context',
      project: testProject,
    });

    await service.forget({ observation_id: id });

    const obs = await service.getObservation(id);
    expect(obs).toBeNull();
  });
});
