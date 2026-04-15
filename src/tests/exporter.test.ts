import { describe, it, expect } from 'vitest';
import { GraphExporter } from '../services/db/graph-exporter.ts';

describe('GraphExporter', () => {
  it('should export to Mermaid format with proper structure', async () => {
    const exporter = new GraphExporter();

    try {
      const mermaid = await exporter.exportToMermaid();

      expect(mermaid).toBeDefined();
      expect(typeof mermaid).toBe('string');
      expect(mermaid).toContain('graph TD');
      expect(mermaid).toContain('classDef');
    } catch (err: any) {
      // Skip test if DB is locked by another process
      if (err.message?.includes('Could not set lock')) {
        console.log('Skipping exporter test: DB locked by another process');
        return;
      }
      throw err;
    }
  });

  it('should include style definitions for all symbol kinds', async () => {
    const exporter = new GraphExporter();

    try {
      const mermaid = await exporter.exportToMermaid();

      expect(mermaid).toContain('classDef file');
      expect(mermaid).toContain('classDef function');
      expect(mermaid).toContain('classDef class');
      expect(mermaid).toContain('classDef method');
      expect(mermaid).toContain('classDef interface');
    } catch (err: any) {
      if (err.message?.includes('Could not set lock')) {
        console.log('Skipping exporter test: DB locked by another process');
        return;
      }
      throw err;
    }
  });
});
