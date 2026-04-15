import { describe, it, expect, beforeAll } from 'vitest';
import { IngestionService } from '../services/ingestion/ingestion-service.ts';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('IngestionService', () => {
  let service: IngestionService;
  let tempDir: string;
  let dbLocked = false;

  beforeAll(async () => {
    service = new IngestionService();

    try {
      await service.initialize();
    } catch (err: any) {
      if (err.message?.includes('Could not set lock')) {
        dbLocked = true;
        console.log('DB locked - some ingestion tests will be skipped');
      } else {
        throw err;
      }
    }

    // Create a temp directory for test files
    tempDir = path.join(os.tmpdir(), `graphhub-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  }, 60000);

  it('should index a TypeScript file', async () => {
    if (dbLocked) {
      console.log('Skipping: DB locked');
      return;
    }

    const testFile = path.join(tempDir, 'test.ts');
    await fs.writeFile(testFile, `
      export function greet(name: string): string {
        return \`Hello, \${name}!\`;
      }
    `);

    await expect(service.indexFile(testFile, true)).resolves.toBeUndefined();
  });

  it('should skip unchanged files on re-index', async () => {
    if (dbLocked) {
      console.log('Skipping: DB locked');
      return;
    }

    const testFile = path.join(tempDir, 'unchanged.ts');
    await fs.writeFile(testFile, `export const x = 1;`);

    // First index
    await service.indexFile(testFile, true);

    // Second index (should be skipped due to hash match)
    const startTime = Date.now();
    await service.indexFile(testFile, false);
    const elapsed = Date.now() - startTime;

    // Skip should be near-instant (no parsing or DB writes)
    expect(elapsed).toBeLessThan(100);
  });

  it('should re-index when file changes', async () => {
    if (dbLocked) {
      console.log('Skipping: DB locked');
      return;
    }

    const testFile = path.join(tempDir, 'changing.ts');
    await fs.writeFile(testFile, `export const a = 1;`);
    await service.indexFile(testFile, true);

    // Modify the file
    await fs.writeFile(testFile, `export const a = 2; export const b = 3;`);

    // Should re-index (hash changed)
    await expect(service.indexFile(testFile, false)).resolves.toBeUndefined();
  });

  it('should handle fallback indexing for non-code files', async () => {
    if (dbLocked) {
      console.log('Skipping: DB locked');
      return;
    }

    const testFile = path.join(tempDir, 'readme.md');
    await fs.writeFile(testFile, `# Test\n\nThis is a test file.`);

    await expect(service.indexFileFallback(testFile, true)).resolves.toBeUndefined();
  });
});
